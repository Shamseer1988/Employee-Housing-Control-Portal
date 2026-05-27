from flask import Blueprint, request

from ..extensions import db
from ..models import Landlord
from ..services import audit, codes
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

landlords_bp = Blueprint("landlords", __name__)

EDITABLE_FIELDS = {
    "name", "qid_cr_number", "mobile", "email", "address",
    "contact_person", "bank_name", "iban", "status", "remarks",
}


@landlords_bp.get("")
@require_permission("landlord.view")
def list_landlords():
    q = (request.args.get("q") or "").strip().lower()
    query = Landlord.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.func.lower(Landlord.code).like(like),
                db.func.lower(Landlord.name).like(like),
                db.func.lower(Landlord.qid_cr_number).like(like),
                db.func.lower(Landlord.mobile).like(like),
            )
        )
    rows = query.order_by(Landlord.name.asc()).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@landlords_bp.get("/<int:landlord_id>")
@require_permission("landlord.view")
def get_landlord(landlord_id: int):
    return success_response(data=Landlord.query.get_or_404(landlord_id).to_dict())


@landlords_bp.post("")
@require_permission("landlord.create")
def create_landlord():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error_response("Name is required", 400)
    actor = current_user()
    code = (payload.get("code") or "").strip() or codes.next_code(Landlord, "LL")
    if Landlord.query.filter(db.func.lower(Landlord.code) == code.lower()).first():
        return error_response("Code already exists", 409)
    ll = Landlord(code=code, name=name, created_by=actor.id, updated_by=actor.id)
    for k in EDITABLE_FIELDS:
        if k in payload and k != "name":
            setattr(ll, k, payload.get(k))
    db.session.add(ll)
    db.session.flush()
    audit.record(user=actor, action="create", module="landlord",
                 entity_type="landlord", entity_id=ll.id, new_value=ll.to_dict())
    db.session.commit()
    return success_response(data=ll.to_dict(), message="Landlord created", status=201)


@landlords_bp.put("/<int:landlord_id>")
@require_permission("landlord.edit")
def update_landlord(landlord_id: int):
    ll = Landlord.query.get_or_404(landlord_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = ll.to_dict()
    for k in EDITABLE_FIELDS:
        if k in payload:
            setattr(ll, k, payload[k])
    ll.updated_by = actor.id
    audit.record(user=actor, action="update", module="landlord",
                 entity_type="landlord", entity_id=ll.id, old_value=old, new_value=ll.to_dict())
    db.session.commit()
    return success_response(data=ll.to_dict(), message="Landlord updated")
