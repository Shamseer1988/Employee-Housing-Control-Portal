from flask import Blueprint, request

from ..models import AuditLog
from ..utils.auth import require_permission
from ..utils.responses import success_response

audit_bp = Blueprint("audit", __name__)


@audit_bp.get("")
@require_permission("audit.view")
def list_audit():
    module = request.args.get("module")
    action = request.args.get("action")
    user_id = request.args.get("user_id", type=int)
    limit = min(request.args.get("limit", default=100, type=int), 500)

    query = AuditLog.query
    if module:
        query = query.filter_by(module=module)
    if action:
        query = query.filter_by(action=action)
    if user_id:
        query = query.filter_by(user_id=user_id)

    rows = query.order_by(AuditLog.id.desc()).limit(limit).all()
    return success_response(
        data=[r.to_dict() for r in rows],
        meta={"count": len(rows), "limit": limit},
    )
