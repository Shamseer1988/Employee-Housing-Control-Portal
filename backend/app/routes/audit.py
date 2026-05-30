from flask import Blueprint, request

from ..models import AuditLog
from ..utils.auth import require_permission
from ..utils.responses import success_response

audit_bp = Blueprint("audit", __name__)


# Fields stored on every entity that aren't part of the user's mental
# model of the row — hide them from the diff to reduce noise.
_DIFF_IGNORE = {"id", "created_at", "updated_at", "created_by", "updated_by"}


def _compute_diff(old, new) -> list[dict] | None:
    """Build a [{field, before, after}, ...] list of fields that actually
    changed. Returns None when there's nothing to compare (e.g. a
    create or delete row carrying only one side)."""
    if not isinstance(old, dict) or not isinstance(new, dict):
        return None
    diff: list[dict] = []
    keys = (set(old.keys()) | set(new.keys())) - _DIFF_IGNORE
    for k in sorted(keys):
        before = old.get(k)
        after = new.get(k)
        if before == after:
            continue
        diff.append({"field": k, "before": before, "after": after})
    return diff


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
    out: list[dict] = []
    for r in rows:
        d = r.to_dict()
        # 8d audit-diff viewer: compute changed-fields server-side so
        # every client renders the same set without diffing JSON in JS.
        if r.action == "update":
            d["diff"] = _compute_diff(r.old_value, r.new_value)
        out.append(d)
    return success_response(
        data=out,
        meta={"count": len(out), "limit": limit},
    )
