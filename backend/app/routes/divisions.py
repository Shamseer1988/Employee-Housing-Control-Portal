from flask import Blueprint, request

from ..extensions import db
from ..models import Division
from ..services import audit, codes
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

divisions_bp = Blueprint("divisions", __name__)

EDITABLE_FIELDS = {
    "name", "company_name", "cr_number", "division_type", "location",
    "branch_count", "staff_count", "manager", "hr_responsible",
    "cost_center_code", "contact_number", "email", "remarks", "status",
}


@divisions_bp.get("")
@require_permission("division.view")
def list_divisions():
    q = (request.args.get("q") or "").strip().lower()
    status = request.args.get("status")
    query = Division.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.func.lower(Division.code).like(like),
                db.func.lower(Division.name).like(like),
                db.func.lower(Division.company_name).like(like),
            )
        )
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(Division.name.asc()).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@divisions_bp.get("/<int:div_id>")
@require_permission("division.view")
def get_division(div_id: int):
    return success_response(data=Division.query.get_or_404(div_id).to_dict())


@divisions_bp.post("")
@require_permission("division.manage")
def create_division():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error_response("Name is required", 400)
    actor = current_user()
    code = (payload.get("code") or "").strip() or codes.next_code(Division, "DIV")
    if Division.query.filter(db.func.lower(Division.code) == code.lower()).first():
        return error_response("Code already exists", 409)
    div = Division(code=code, name=name, created_by=actor.id, updated_by=actor.id)
    for k in EDITABLE_FIELDS:
        if k in payload and k != "name":
            setattr(div, k, payload.get(k))
    div.name = name
    db.session.add(div)
    db.session.flush()
    audit.record(user=actor, action="create", module="division",
                 entity_type="division", entity_id=div.id, new_value=div.to_dict())
    db.session.commit()
    return success_response(data=div.to_dict(), message="Division created", status=201)


@divisions_bp.put("/<int:div_id>")
@require_permission("division.manage")
def update_division(div_id: int):
    div = Division.query.get_or_404(div_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = div.to_dict()
    for k in EDITABLE_FIELDS:
        if k in payload:
            setattr(div, k, payload[k])
    div.updated_by = actor.id
    audit.record(user=actor, action="update", module="division",
                 entity_type="division", entity_id=div.id, old_value=old, new_value=div.to_dict())
    db.session.commit()
    return success_response(data=div.to_dict(), message="Division updated")


@divisions_bp.delete("/<int:div_id>")
@require_permission("division.manage")
def deactivate_division(div_id: int):
    div = Division.query.get_or_404(div_id)
    actor = current_user()
    div.status = "inactive"
    div.updated_by = actor.id
    audit.record(user=actor, action="deactivate", module="division",
                 entity_type="division", entity_id=div.id)
    db.session.commit()
    return success_response(message="Division deactivated")
