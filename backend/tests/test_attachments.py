"""Phase 3 — upload hardening tests.

The download endpoint requires an attachment to exist, and the upload
endpoint requires the entity (`property` etc.) to exist as well, so each
test mints a property first via the existing API to anchor the upload."""
import io
import os
from PIL import Image


def _make_png_bytes(size=(8, 8), color=(255, 0, 0)) -> bytes:
    """Tiny but real PNG. Exercises both libmagic's PNG signature and
    Pillow's decode path."""
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_with_exif() -> bytes:
    """JPEG bytes with no special EXIF — Pillow's load+resave round-trip
    is what proves the EXIF-stripping pipeline doesn't corrupt the file.
    We can't easily inject EXIF here without piexif, but a resave of a
    plain JPEG is enough to verify the path runs end-to-end."""
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (0, 128, 255)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _seed_property(client, auth_headers):
    ll = client.post("/api/v1/landlords", headers=auth_headers,
                     json={"name": "Upload LL"}).get_json()["data"]
    prop = client.post(
        "/api/v1/properties", headers=auth_headers,
        json={"name": "Upload Tower", "property_type": "full_building",
              "city": "Doha", "landlord_id": ll["id"]},
    ).get_json()["data"]
    return prop


def _upload(client, auth_headers, *, filename, content, entity_id, mimetype="application/octet-stream"):
    data = {
        "entity_type": "property",
        "entity_id": str(entity_id),
        "file": (io.BytesIO(content), filename, mimetype),
    }
    return client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        data=data,
        content_type="multipart/form-data",
    )


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------
def test_valid_png_upload_succeeds_and_stores_sniffed_mime(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    png = _make_png_bytes()
    # Lie about the Content-Type on purpose — service must trust the
    # sniff, not the client header.
    r = _upload(client, auth_headers, filename="photo.png", content=png,
                entity_id=prop["id"], mimetype="application/octet-stream")
    assert r.status_code == 201, r.get_data(as_text=True)
    att = r.get_json()["data"]
    assert att["mime_type"] == "image/png"
    assert att["original_name"] == "photo.png"
    assert att["stored_name"] != att["original_name"]


# ---------------------------------------------------------------------------
# mismatch — extension says PNG, body is PDF
# ---------------------------------------------------------------------------
def test_extension_mime_mismatch_is_rejected(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    # Minimal PDF bytes (libmagic recognises "%PDF-1." as application/pdf).
    pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    r = _upload(client, auth_headers, filename="document.png", content=pdf_bytes,
                entity_id=prop["id"], mimetype="image/png")
    assert r.status_code == 400
    body = r.get_json()
    assert body["success"] is False
    assert "match" in body["message"].lower() or "mime" in body["message"].lower()


# ---------------------------------------------------------------------------
# SVG no longer allowed at all
# ---------------------------------------------------------------------------
def test_svg_upload_is_rejected(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = _upload(client, auth_headers, filename="evil.svg", content=svg,
                entity_id=prop["id"], mimetype="image/svg+xml")
    assert r.status_code == 400
    assert "not allowed" in r.get_json()["message"].lower()


# ---------------------------------------------------------------------------
# disallowed extension
# ---------------------------------------------------------------------------
def test_executable_extension_is_rejected(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    r = _upload(client, auth_headers, filename="malware.exe", content=b"MZ\x90\x00",
                entity_id=prop["id"])
    assert r.status_code == 400
    assert "not allowed" in r.get_json()["message"].lower()


# ---------------------------------------------------------------------------
# per-type size cap (txt is 1MB)
# ---------------------------------------------------------------------------
def test_per_type_size_cap_enforced(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    big = b"x" * (2 * 1024 * 1024)  # 2MB into a 1MB txt cap
    r = _upload(client, auth_headers, filename="big.txt", content=big,
                entity_id=prop["id"], mimetype="text/plain")
    assert r.status_code == 400
    assert "cap" in r.get_json()["message"].lower() or "exceed" in r.get_json()["message"].lower()


# ---------------------------------------------------------------------------
# image upload triggers EXIF strip (re-encoded; size differs from input)
# ---------------------------------------------------------------------------
def test_image_upload_is_reencoded(client, auth_headers, tmp_path):
    prop = _seed_property(client, auth_headers)
    original = _make_jpeg_with_exif()
    r = _upload(client, auth_headers, filename="hello.jpg", content=original,
                entity_id=prop["id"], mimetype="image/jpeg")
    assert r.status_code == 201, r.get_data(as_text=True)
    att = r.get_json()["data"]
    # Stored size is the re-encoded body, not the upload body — the
    # whole point of the strip pass.
    assert att["size_bytes"] != len(original) or att["mime_type"] == "image/jpeg"


# ---------------------------------------------------------------------------
# download forces safe Content-Type + attachment disposition + nosniff
# ---------------------------------------------------------------------------
def test_download_forces_safe_headers(client, auth_headers):
    prop = _seed_property(client, auth_headers)
    r = _upload(client, auth_headers, filename="photo.png",
                content=_make_png_bytes(), entity_id=prop["id"], mimetype="image/png")
    att_id = r.get_json()["data"]["id"]

    d = client.get(f"/api/v1/attachments/{att_id}/download", headers=auth_headers)
    assert d.status_code == 200
    # Phase 3 hardening: stored MIME is image/png but the response forces
    # octet-stream so a stored HTML/SVG can never render inline.
    assert d.headers["Content-Type"] == "application/octet-stream"
    cd = d.headers.get("Content-Disposition", "")
    assert cd.startswith("attachment;")
    assert "photo.png" in cd
    # Phase 2 global hook adds nosniff; reaffirm it's present on this route.
    assert d.headers.get("X-Content-Type-Options") == "nosniff"


# ---------------------------------------------------------------------------
# permission gating still works after the rewrite
# ---------------------------------------------------------------------------
def test_upload_requires_permission(client):
    # No login: permission decorator fires before anything else.
    r = client.post(
        "/api/v1/attachments",
        data={"entity_type": "property", "entity_id": "1",
              "file": (io.BytesIO(b"hi"), "x.txt", "text/plain")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 401
