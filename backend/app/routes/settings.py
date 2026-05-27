from flask import Blueprint, request

from ..extensions import db
from ..models import SystemSetting
from ..services import audit, settings as settings_service
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

settings_bp = Blueprint("settings", __name__)


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
    """Tiny subset exposed without auth for the login page (company name,
    logo, etc.)."""
    out = {}
    for key in ("company.name", "company.logo_url"):
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
