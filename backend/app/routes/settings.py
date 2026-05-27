from flask import Blueprint, request

from ..extensions import db
from ..models import SystemSetting
from ..services import audit, settings as settings_service
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

settings_bp = Blueprint("settings", __name__)


@settings_bp.get("")
@require_permission("settings.view")
def list_settings():
    rows = SystemSetting.query.order_by(SystemSetting.category, SystemSetting.key).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@settings_bp.put("/<path:key>")
@require_permission("settings.manage")
def update_setting(key: str):
    payload = request.get_json(silent=True) or {}
    if "value" not in payload:
        return error_response("value is required", 400)
    actor = current_user()
    row = settings_service.set_value(key, payload["value"], actor_id=actor.id)
    audit.record(user=actor, action="update", module="settings",
                 entity_type="system_setting", entity_id=row.id,
                 new_value={"key": key, "value": payload["value"]})
    db.session.commit()
    return success_response(data=row.to_dict(), message="Setting updated")
