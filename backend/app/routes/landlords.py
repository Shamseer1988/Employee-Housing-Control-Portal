from datetime import date, datetime

from apiflask import APIBlueprint
from flask import request

from ..extensions import db
from ..models import Landlord
from ..schemas.common import envelope
from ..schemas.landlord import LandlordIn, LandlordUpdateIn, LandlordOut
from ..services import audit, codes
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

landlords_bp = APIBlueprint("landlords", __name__)

EDITABLE_FIELDS = {
    "name", "qid_cr_number", "mobile", "email", "address", "contact_person",
    # Agreement-on-landlord fields (Phase 15)
    "agreement_start_date", "agreement_expiry_date", "monthly_rent",
    "reminder_days_before_expiry",
    # Legacy / hidden in UI but still settable via API for migration use
    "bank_name", "iban",
    "status", "remarks",
}

DATE_FIELDS = {"agreement_start_date", "agreement_expiry_date"}


def _coerce_payload(payload: dict) -> dict:
    """Parse date strings and numeric fields before persisting."""
    out = dict(payload)
    for key in DATE_FIELDS:
        v = out.get(key)
        if v is None or v == "":
            out[key] = None
        elif isinstance(v, str):
            out[key] = datetime.fromisoformat(v).date()
        elif isinstance(v, datetime):
            out[key] = v.date()
        elif isinstance(v, date):
            out[key] = v
    if "monthly_rent" in out:
        rent = out["monthly_rent"]
        out["monthly_rent"] = float(rent) if rent not in (None, "") else None
    if "reminder_days_before_expiry" in out:
        rd = out["reminder_days_before_expiry"]
        out["reminder_days_before_expiry"] = int(rd) if rd not in (None, "") else 90
    return out


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
@landlords_bp.input(LandlordIn)
def create_landlord(json_data):
    name = json_data["name"].strip()
    actor = current_user()
    code = (json_data.get("code") or "").strip() or codes.next_code(
        Landlord, codes.prefix_for("landlord"),
    )
    if Landlord.query.filter(db.func.lower(Landlord.code) == code.lower()).first():
        return error_response("Code already exists", 409)
    ll = Landlord(code=code, name=name, created_by=actor.id, updated_by=actor.id)
    for k in EDITABLE_FIELDS:
        if k in json_data and k != "name":
            setattr(ll, k, json_data[k])
    db.session.add(ll)
    db.session.flush()
    audit.record(user=actor, action="create", module="landlord",
                 entity_type="landlord", entity_id=ll.id, new_value=ll.to_dict())
    db.session.commit()
    return success_response(data=ll.to_dict(), message="Landlord created", status=201)


@landlords_bp.put("/<int:landlord_id>")
@require_permission("landlord.edit")
@landlords_bp.input(LandlordUpdateIn)
def update_landlord(landlord_id: int, json_data):
    ll = Landlord.query.get_or_404(landlord_id)
    actor = current_user()
    old = ll.to_dict()
    for k in EDITABLE_FIELDS:
        if k in json_data:
            setattr(ll, k, json_data[k])
    ll.updated_by = actor.id
    audit.record(user=actor, action="update", module="landlord",
                 entity_type="landlord", entity_id=ll.id, old_value=old, new_value=ll.to_dict())
    db.session.commit()
    return success_response(data=ll.to_dict(), message="Landlord updated")
