from datetime import date, datetime
from flask import Blueprint, request

from ..extensions import db
from ..models import Property, PropertyAgreement, Landlord, Division, Floor, Room, Bed
from ..services import audit, codes, reminders, occupancy
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

properties_bp = Blueprint("properties", __name__)

PROPERTY_TYPES = {
    "full_building", "partial_building", "one_floor_only",
    "villa", "apartment", "labour_camp", "staff_flat",
    "shared_accommodation", "temporary_accommodation",
}
OWNERSHIP_TYPES = {"rented", "company_owned", "temporary"}
STATUSES = {"active", "inactive", "maintenance", "vacated"}

EDITABLE_FIELDS = {
    "name", "property_type", "building_number", "zone", "street", "area", "city",
    "map_link", "gps_lat", "gps_lng", "ownership_type", "status", "managed_by",
    "default_division_id", "landlord_id", "multi_division_allowed",
    "total_floors", "total_rooms", "total_bed_capacity", "remarks",
}


def _parse_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(value).date()


@properties_bp.get("")
@require_permission("property.view")
def list_properties():
    q = (request.args.get("q") or "").strip().lower()
    status = request.args.get("status")
    ptype = request.args.get("type")
    city = request.args.get("city")

    query = Property.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.func.lower(Property.code).like(like),
                db.func.lower(Property.name).like(like),
                db.func.lower(Property.area).like(like),
                db.func.lower(Property.city).like(like),
            )
        )
    if status:
        query = query.filter_by(status=status)
    if ptype:
        query = query.filter_by(property_type=ptype)
    if city:
        query = query.filter(db.func.lower(Property.city) == city.lower())

    rows = query.order_by(Property.name.asc()).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@properties_bp.get("/<int:prop_id>")
@require_permission("property.view")
def get_property(prop_id: int):
    prop = Property.query.get_or_404(prop_id)
    return success_response(data=prop.to_dict())


@properties_bp.post("")
@require_permission("property.create")
def create_property():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    ptype = (payload.get("property_type") or "").strip()
    if not name or not ptype:
        return error_response("name and property_type are required", 400)
    if ptype not in PROPERTY_TYPES:
        return error_response(f"property_type must be one of {sorted(PROPERTY_TYPES)}", 400)

    actor = current_user()
    code = (payload.get("code") or "").strip() or codes.next_code(Property, codes.prefix_for("property"))
    if Property.query.filter(db.func.lower(Property.code) == code.lower()).first():
        return error_response("Code already exists", 409)

    if payload.get("default_division_id"):
        if not Division.query.get(payload["default_division_id"]):
            return error_response("default_division_id not found", 400)
    if payload.get("landlord_id"):
        if not Landlord.query.get(payload["landlord_id"]):
            return error_response("landlord_id not found", 400)
    if payload.get("ownership_type") and payload["ownership_type"] not in OWNERSHIP_TYPES:
        return error_response("Invalid ownership_type", 400)
    if payload.get("status") and payload["status"] not in STATUSES:
        return error_response("Invalid status", 400)

    prop = Property(code=code, name=name, property_type=ptype,
                    created_by=actor.id, updated_by=actor.id)
    for k in EDITABLE_FIELDS:
        if k in payload and k not in {"name", "property_type"}:
            setattr(prop, k, payload[k])
    db.session.add(prop)
    db.session.flush()
    audit.record(user=actor, action="create", module="property",
                 entity_type="property", entity_id=prop.id, new_value=prop.to_dict())
    db.session.commit()
    return success_response(data=prop.to_dict(), message="Property created", status=201)


@properties_bp.put("/<int:prop_id>")
@require_permission("property.edit")
def update_property(prop_id: int):
    prop = Property.query.get_or_404(prop_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = prop.to_dict()

    if "property_type" in payload and payload["property_type"] not in PROPERTY_TYPES:
        return error_response("Invalid property_type", 400)
    if "ownership_type" in payload and payload["ownership_type"] not in OWNERSHIP_TYPES:
        return error_response("Invalid ownership_type", 400)
    if "status" in payload and payload["status"] not in STATUSES:
        return error_response("Invalid status", 400)
    if "default_division_id" in payload and payload["default_division_id"]:
        if not Division.query.get(payload["default_division_id"]):
            return error_response("default_division_id not found", 400)
    if "landlord_id" in payload and payload["landlord_id"]:
        if not Landlord.query.get(payload["landlord_id"]):
            return error_response("landlord_id not found", 400)

    for k in EDITABLE_FIELDS:
        if k in payload:
            setattr(prop, k, payload[k])
    prop.updated_by = actor.id
    audit.record(user=actor, action="update", module="property",
                 entity_type="property", entity_id=prop.id, old_value=old, new_value=prop.to_dict())
    db.session.commit()
    return success_response(data=prop.to_dict(), message="Property updated")


@properties_bp.delete("/<int:prop_id>")
@require_permission("property.deactivate")
def deactivate_property(prop_id: int):
    prop = Property.query.get_or_404(prop_id)
    actor = current_user()
    prop.status = "inactive"
    prop.updated_by = actor.id
    audit.record(user=actor, action="deactivate", module="property",
                 entity_type="property", entity_id=prop.id)
    db.session.commit()
    return success_response(message="Property deactivated")


# ---------- Agreements ----------

@properties_bp.get("/<int:prop_id>/agreements")
@require_permission("property.view")
def list_agreements(prop_id: int):
    Property.query.get_or_404(prop_id)
    rows = (
        PropertyAgreement.query
        .filter_by(property_id=prop_id)
        .order_by(PropertyAgreement.is_active.desc(), PropertyAgreement.expiry_date.desc())
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@properties_bp.post("/<int:prop_id>/agreements")
@require_permission("property.edit")
def create_agreement(prop_id: int):
    prop = Property.query.get_or_404(prop_id)
    payload = request.get_json(silent=True) or {}

    landlord_id = payload.get("landlord_id")
    if not landlord_id or not Landlord.query.get(landlord_id):
        return error_response("Valid landlord_id is required", 400)
    try:
        start = _parse_date(payload.get("start_date"))
        expiry = _parse_date(payload.get("expiry_date"))
    except ValueError:
        return error_response("Invalid date format (use YYYY-MM-DD)", 400)
    if not start or not expiry:
        return error_response("start_date and expiry_date are required", 400)
    if expiry < start:
        return error_response("expiry_date must be on or after start_date", 400)

    actor = current_user()

    # Archive previous active agreement
    previous = (
        PropertyAgreement.query.filter_by(property_id=prop_id, is_active=True).all()
    )
    for p in previous:
        p.is_active = False
        p.renewal_status = "renewed"
        p.updated_by = actor.id

    ag = PropertyAgreement(
        property_id=prop.id,
        landlord_id=landlord_id,
        agreement_number=payload.get("agreement_number"),
        start_date=start,
        expiry_date=expiry,
        monthly_rent=payload.get("monthly_rent"),
        security_deposit=payload.get("security_deposit"),
        payment_terms=payload.get("payment_terms"),
        notice_period=payload.get("notice_period"),
        renewal_status=payload.get("renewal_status") or "pending",
        kahramaa_account=payload.get("kahramaa_account"),
        municipality_ref=payload.get("municipality_ref"),
        reminder_days_before_expiry=int(payload.get("reminder_days_before_expiry") or 90),
        is_active=True,
        remarks=payload.get("remarks"),
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.session.add(ag)
    db.session.flush()
    audit.record(user=actor, action="create", module="agreement",
                 entity_type="property_agreement", entity_id=ag.id, new_value=ag.to_dict(),
                 remarks=f"property {prop.code}")
    db.session.commit()
    return success_response(data=ag.to_dict(), message="Agreement created", status=201)


@properties_bp.put("/<int:prop_id>/agreements/<int:ag_id>")
@require_permission("property.edit")
def update_agreement(prop_id: int, ag_id: int):
    ag = PropertyAgreement.query.filter_by(id=ag_id, property_id=prop_id).first_or_404()
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = ag.to_dict()
    if "start_date" in payload:
        ag.start_date = _parse_date(payload["start_date"])
    if "expiry_date" in payload:
        ag.expiry_date = _parse_date(payload["expiry_date"])
    for k in (
        "agreement_number", "monthly_rent", "security_deposit", "payment_terms",
        "notice_period", "renewal_status", "kahramaa_account", "municipality_ref",
        "reminder_days_before_expiry", "remarks",
    ):
        if k in payload:
            setattr(ag, k, payload[k])
    if "landlord_id" in payload and payload["landlord_id"]:
        if not Landlord.query.get(payload["landlord_id"]):
            return error_response("landlord_id not found", 400)
        ag.landlord_id = payload["landlord_id"]
    ag.updated_by = actor.id
    audit.record(user=actor, action="update", module="agreement",
                 entity_type="property_agreement", entity_id=ag.id,
                 old_value=old, new_value=ag.to_dict())
    db.session.commit()
    return success_response(data=ag.to_dict(), message="Agreement updated")


# ---------- Reminders ----------

@properties_bp.get("/<int:prop_id>/occupancy")
@require_permission("property.view")
def property_occupancy(prop_id: int):
    Property.query.get_or_404(prop_id)
    return success_response(data=occupancy.property_summary(prop_id))


@properties_bp.get("/<int:prop_id>/structure")
@require_permission("property.view")
def property_structure(prop_id: int):
    Property.query.get_or_404(prop_id)
    floors = (
        Floor.query.filter_by(property_id=prop_id)
        .order_by(Floor.floor_number.asc())
        .all()
    )
    out = []
    for f in floors:
        rooms = (
            Room.query.filter_by(floor_id=f.id)
            .order_by(Room.room_number.asc())
            .all()
        )
        room_list = []
        for r in rooms:
            beds = (
                Bed.query.filter_by(room_id=r.id)
                .order_by(Bed.bed_number.asc())
                .all()
            )
            r_dict = r.to_dict()
            r_dict["beds"] = [b.to_dict() for b in beds]
            room_list.append(r_dict)
        f_dict = f.to_dict()
        f_dict["rooms"] = room_list
        out.append(f_dict)
    return success_response(data=out, meta={"count": len(out)})


@properties_bp.get("/agreements/expiring")
@require_permission("property.view")
def expiring():
    days = request.args.get("days", default=90, type=int)
    rows = reminders.expiring_agreements(within_days=days)
    today = date.today()
    out = []
    for a in rows:
        d = a.to_dict()
        d["bucket"] = reminders.agreement_bucket(a.expiry_date, today)
        d["days_left"] = (a.expiry_date - today).days
        d["property"] = {"id": a.property.id, "code": a.property.code, "name": a.property.name}
        out.append(d)
    return success_response(data=out, meta={"count": len(out), "summary": reminders.reminder_summary(today)})
