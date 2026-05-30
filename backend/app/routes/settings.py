import os

from flask import Blueprint, current_app, request, send_file

from ..extensions import db
from ..models import SystemSetting
from ..services import attachments as attachments_service
from ..services import audit, settings as settings_service
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

settings_bp = Blueprint("settings", __name__)

LOGO_ENTITY_TYPE = "company_logo"
LOGO_ENTITY_ID = "current"


def _mask_row(row: SystemSetting) -> dict:
    data = row.to_dict()
    if settings_service.is_secret(row.key):
        data["value"] = None
        data["is_set"] = bool(row.value)
        data["is_secret"] = True
    else:
        data["is_secret"] = False
    return data


@settings_bp.get("")
@require_permission("settings.view")
def list_settings():
    rows = SystemSetting.query.order_by(SystemSetting.category, SystemSetting.key).all()
    return success_response(data=[_mask_row(r) for r in rows], meta={"count": len(rows)})


@settings_bp.get("/catalog")
@require_permission("settings.view")
def catalog():
    return success_response(data=settings_service.catalog())


@settings_bp.get("/public")
def public_settings():
    """Tiny subset exposed without auth — branding + UI preferences so the
    login page and the initial theme render correctly before sign-in."""
    out = {}
    for key in (
        "company.name", "company.logo_url",
        "ui.accent_color", "ui.glassmorphism", "ui.compact_mode",
        "ui.sidebar_default_collapsed", "ui.table_density",
    ):
        out[key] = settings_service.get(key)
    return success_response(data=out)


@settings_bp.put("")
@require_permission("settings.manage")
def update_many():
    payload = request.get_json(silent=True) or {}
    updates = payload.get("settings")
    if not isinstance(updates, dict) or not updates:
        return error_response("Expected JSON: { settings: { key: value, ... } }", 400)
    actor = current_user()
    try:
        rows = settings_service.set_many(updates, actor_id=actor.id)
    except ValueError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(
        user=actor, action="bulk_update", module="settings",
        entity_type="system_setting", entity_id=None,
        new_value={
            k: (None if settings_service.is_secret(k) else v)
            for k, v in updates.items()
        },
    )
    db.session.commit()
    return success_response(
        data=[_mask_row(r) for r in rows],
        message=f"Updated {len(rows)} setting(s)",
    )


@settings_bp.put("/<path:key>")
@require_permission("settings.manage")
def update_setting(key: str):
    payload = request.get_json(silent=True) or {}
    if "value" not in payload:
        return error_response("value is required", 400)
    actor = current_user()
    try:
        row = settings_service.set_value(key, payload["value"], actor_id=actor.id)
    except ValueError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(
        user=actor, action="update", module="settings",
        entity_type="system_setting", entity_id=row.id,
        new_value={
            "key": key,
            "value": None if settings_service.is_secret(key) else payload["value"],
        },
    )
    db.session.commit()
    return success_response(data=_mask_row(row), message="Setting updated")


# ---------- Company logo upload ----------

from ..models import Attachment  # noqa: E402  (kept here to avoid circular import at module load)


def _logo_attachment():
    return (
        Attachment.query
        .filter_by(entity_type=LOGO_ENTITY_TYPE, entity_id=LOGO_ENTITY_ID)
        .order_by(Attachment.id.desc())
        .first()
    )


@settings_bp.post("/company-logo")
@require_permission("settings.manage")
def upload_company_logo():
    """Upload a new company logo. Replaces any previous one.

    Also updates the `company.logo_url` setting to point at the public
    download endpoint so the topbar and login screen pick it up
    automatically.
    """
    if "file" not in request.files:
        return error_response("file is required", 400)
    file = request.files["file"]
    if not file.filename:
        return error_response("file is required", 400)
    if not file.mimetype or not file.mimetype.startswith("image/"):
        return error_response("Logo must be an image (png / jpg / webp / svg)", 400)

    actor = current_user()

    # Replace any existing logo
    existing = _logo_attachment()
    if existing is not None:
        try:
            attachments_service.delete_file(existing)
        except Exception:  # noqa: BLE001
            pass

    try:
        att = attachments_service.store_file(
            file=file, entity_type=LOGO_ENTITY_TYPE, entity_id=LOGO_ENTITY_ID,
            category="logo", actor_id=actor.id,
        )
    except ValueError as exc:
        return error_response(str(exc), 400)

    # Update the public-facing URL so the topbar / login render the logo
    settings_service.set_value(
        "company.logo_url", "/api/v1/settings/company-logo", actor_id=actor.id,
    )

    audit.record(
        user=actor, action="upload", module="settings",
        entity_type=LOGO_ENTITY_TYPE, entity_id=att.id,
        new_value={"size": att.size_bytes, "mime": att.mime_type},
    )
    db.session.commit()
    return success_response(
        data={"url": "/api/v1/settings/company-logo", "filename": att.original_name},
        message="Logo updated",
    )


@settings_bp.delete("/company-logo")
@require_permission("settings.manage")
def delete_company_logo():
    actor = current_user()
    existing = _logo_attachment()
    if existing is not None:
        attachments_service.delete_file(existing)
    settings_service.set_value("company.logo_url", "", actor_id=actor.id)
    audit.record(user=actor, action="delete", module="settings",
                 entity_type=LOGO_ENTITY_TYPE, entity_id="logo")
    db.session.commit()
    return success_response(message="Logo removed")


@settings_bp.get("/company-logo")
def serve_company_logo():
    """Public endpoint — used by the unauthenticated login page header."""
    att = _logo_attachment()
    if att is None:
        return error_response("No logo uploaded", 404)
    path = attachments_service.absolute_path(att)
    if not os.path.exists(path):
        return error_response("Logo file missing", 404)
    return send_file(path, mimetype=att.mime_type or "application/octet-stream")
