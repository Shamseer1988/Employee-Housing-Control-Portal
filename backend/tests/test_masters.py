import io
from datetime import date, timedelta


def test_division_crud(client, auth_headers):
    resp = client.post(
        "/api/v1/divisions",
        headers=auth_headers,
        json={"name": "PUG Retail", "company_name": "Paris United Group", "division_type": "retail"},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    div = resp.get_json()["data"]
    assert div["code"].startswith("DIV-")

    listed = client.get("/api/v1/divisions", headers=auth_headers).get_json()
    assert listed["meta"]["count"] >= 1

    upd = client.put(f"/api/v1/divisions/{div['id']}", headers=auth_headers, json={"manager": "Ahmed"})
    assert upd.status_code == 200
    assert upd.get_json()["data"]["manager"] == "Ahmed"


def test_landlord_create(client, auth_headers):
    resp = client.post(
        "/api/v1/landlords",
        headers=auth_headers,
        json={"name": "Al Mansoor Holdings", "mobile": "+97455551234"},
    )
    assert resp.status_code == 201
    assert resp.get_json()["data"]["code"].startswith("LL-")


def test_property_with_agreement_and_expiry(client, auth_headers):
    landlord = client.post(
        "/api/v1/landlords", headers=auth_headers, json={"name": "Al Faris Properties"}
    ).get_json()["data"]

    prop = client.post(
        "/api/v1/properties",
        headers=auth_headers,
        json={
            "name": "Doha Building 12",
            "property_type": "full_building",
            "city": "Doha",
            "zone": "27",
            "total_floors": 4,
            "total_rooms": 24,
            "total_bed_capacity": 96,
        },
    )
    assert prop.status_code == 201, prop.get_data(as_text=True)
    p = prop.get_json()["data"]
    assert p["code"].startswith("PROP-")

    today = date.today()
    near_expiry = (today + timedelta(days=20)).isoformat()
    ag = client.post(
        f"/api/v1/properties/{p['id']}/agreements",
        headers=auth_headers,
        json={
            "landlord_id": landlord["id"],
            "start_date": (today - timedelta(days=300)).isoformat(),
            "expiry_date": near_expiry,
            "monthly_rent": 12000,
            "agreement_number": "AGR-2025-001",
        },
    )
    assert ag.status_code == 201, ag.get_data(as_text=True)

    # Renewal: posting a second active agreement archives the previous one
    new_expiry = (today + timedelta(days=400)).isoformat()
    ag2 = client.post(
        f"/api/v1/properties/{p['id']}/agreements",
        headers=auth_headers,
        json={
            "landlord_id": landlord["id"],
            "start_date": near_expiry,
            "expiry_date": new_expiry,
            "monthly_rent": 13000,
        },
    )
    assert ag2.status_code == 201
    all_agreements = client.get(
        f"/api/v1/properties/{p['id']}/agreements", headers=auth_headers
    ).get_json()["data"]
    active = [a for a in all_agreements if a["is_active"]]
    archived = [a for a in all_agreements if not a["is_active"]]
    assert len(active) == 1
    assert len(archived) == 1
    assert archived[0]["renewal_status"] == "renewed"

    # Detail view exposes active agreement
    detail = client.get(f"/api/v1/properties/{p['id']}", headers=auth_headers).get_json()["data"]
    assert detail["active_agreement"]["id"] == active[0]["id"]


def test_expiring_agreements_buckets(client, auth_headers):
    landlord = client.post("/api/v1/landlords", headers=auth_headers, json={"name": "Bucket LL"}).get_json()["data"]
    today = date.today()

    for name, days_from_now in [("near", 5), ("medium", 25), ("far", 80), ("expired", -3)]:
        prop = client.post(
            "/api/v1/properties",
            headers=auth_headers,
            json={"name": f"Bucket {name}", "property_type": "villa"},
        ).get_json()["data"]
        client.post(
            f"/api/v1/properties/{prop['id']}/agreements",
            headers=auth_headers,
            json={
                "landlord_id": landlord["id"],
                "start_date": (today - timedelta(days=200)).isoformat(),
                "expiry_date": (today + timedelta(days=days_from_now)).isoformat(),
            },
        )

    resp = client.get("/api/v1/properties/agreements/expiring?days=90", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    by_bucket = {row["bucket"] for row in body["data"]}
    assert "7" in by_bucket
    assert "30" in by_bucket
    assert "90" in by_bucket
    assert "expired" in by_bucket
    summary = body["meta"]["summary"]
    assert summary["expired"] >= 1


def test_attachment_upload_and_download(client, auth_headers):
    landlord = client.post("/api/v1/landlords", headers=auth_headers, json={"name": "Att LL"}).get_json()["data"]
    prop = client.post(
        "/api/v1/properties",
        headers=auth_headers,
        json={"name": "Attach P", "property_type": "apartment"},
    ).get_json()["data"]
    client.post(
        f"/api/v1/properties/{prop['id']}/agreements",
        headers=auth_headers,
        json={
            "landlord_id": landlord["id"],
            "start_date": date.today().isoformat(),
            "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
        },
    )

    data = {
        "entity_type": "property",
        "entity_id": str(prop["id"]),
        "category": "agreement",
        "file": (io.BytesIO(b"%PDF-1.4 test"), "agreement.pdf"),
    }
    resp = client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        data=data,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    att_id = resp.get_json()["data"]["id"]

    listed = client.get(
        f"/api/v1/attachments?entity_type=property&entity_id={prop['id']}",
        headers=auth_headers,
    ).get_json()
    assert listed["meta"]["count"] == 1

    dl = client.get(f"/api/v1/attachments/{att_id}/download", headers=auth_headers)
    assert dl.status_code == 200
    assert dl.data.startswith(b"%PDF")


def test_property_view_requires_permission(client):
    resp = client.get("/api/v1/properties")
    assert resp.status_code == 401
