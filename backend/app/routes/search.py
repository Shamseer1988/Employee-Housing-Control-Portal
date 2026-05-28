"""Global search endpoint — Cmd-K style typeahead across the main
entities the operator interacts with. Permission-gated per entity type."""
from flask import Blueprint, request

from ..extensions import db
from ..models import Property, Room, Bed, Employee, Landlord
from ..utils.auth import login_required, current_user
from ..utils.responses import success_response


search_bp = Blueprint("search", __name__)

LIMIT_PER_GROUP = 5


def _can(user, code: str) -> bool:
    return user.is_super_user or user.has_permission(code)


@search_bp.get("/search")
@login_required
def search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return success_response(data={
            "properties": [], "rooms": [], "beds": [],
            "employees": [], "landlords": [],
        }, meta={"q": q, "min_chars": 2})

    user = current_user()
    like = f"%{q.lower()}%"

    properties: list[dict] = []
    if _can(user, "property.view"):
        rows = (
            Property.query
            .filter(
                db.or_(
                    db.func.lower(Property.code).like(like),
                    db.func.lower(Property.name).like(like),
                    db.func.lower(Property.area).like(like),
                    db.func.lower(Property.city).like(like),
                )
            )
            .order_by(Property.name.asc())
            .limit(LIMIT_PER_GROUP).all()
        )
        properties = [{
            "id": p.id, "code": p.code, "label": p.name,
            "sublabel": " · ".join(
                x for x in [p.code, (p.property_type or "").replace("_", " "),
                            ", ".join(y for y in [p.area, p.city] if y)] if x
            ),
            "href": f"/properties/{p.id}",
        } for p in rows]

    rooms: list[dict] = []
    if _can(user, "room.view"):
        rows = (
            db.session.query(Room).join(Property, Room.property_id == Property.id)
            .filter(db.func.lower(Room.room_number).like(like))
            .order_by(Property.name.asc(), Room.room_number.asc())
            .limit(LIMIT_PER_GROUP).all()
        )
        rooms = [{
            "id": r.id, "code": r.room_number,
            "label": f"Room {r.room_number}",
            "sublabel": f"{r.property.name if r.property else ''} · capacity {r.capacity or '—'}",
            "href": f"/properties/{r.property_id}",
        } for r in rows]

    beds: list[dict] = []
    if _can(user, "bed.view"):
        rows = (
            Bed.query
            .filter(db.func.lower(Bed.bed_code).like(like))
            .order_by(Bed.bed_code.asc())
            .limit(LIMIT_PER_GROUP).all()
        )
        beds = [{
            "id": b.id, "code": b.bed_code,
            "label": b.bed_code,
            "sublabel": f"status: {b.status}" + (
                f" · {b.room.property.name}" if b.room and b.room.property else ""
            ),
            "href": f"/properties/{b.property_id}",
        } for b in rows]

    employees: list[dict] = []
    if _can(user, "employee.view"):
        rows = (
            Employee.query
            .filter(
                db.or_(
                    db.func.lower(Employee.code).like(like),
                    db.func.lower(Employee.full_name).like(like),
                    db.func.lower(Employee.qid_number).like(like),
                    db.func.lower(Employee.mobile_number).like(like),
                )
            )
            .order_by(Employee.full_name.asc())
            .limit(LIMIT_PER_GROUP).all()
        )
        employees = [{
            "id": e.id, "code": e.code, "label": e.full_name,
            "sublabel": " · ".join(
                x for x in [e.code, e.designation, e.division.name if e.division else None] if x
            ),
            "href": f"/employees/{e.id}",
        } for e in rows]

    landlords: list[dict] = []
    if _can(user, "landlord.view"):
        rows = (
            Landlord.query
            .filter(
                db.or_(
                    db.func.lower(Landlord.code).like(like),
                    db.func.lower(Landlord.name).like(like),
                    db.func.lower(Landlord.qid_cr_number).like(like),
                )
            )
            .order_by(Landlord.name.asc())
            .limit(LIMIT_PER_GROUP).all()
        )
        landlords = [{
            "id": l.id, "code": l.code, "label": l.name,
            "sublabel": " · ".join(x for x in [l.code, l.qid_cr_number, l.mobile] if x),
            "href": "/landlords",  # no detail page; list with row highlight
        } for l in rows]

    total = sum(len(g) for g in (properties, rooms, beds, employees, landlords))
    return success_response(
        data={
            "properties": properties, "rooms": rooms, "beds": beds,
            "employees": employees, "landlords": landlords,
        },
        meta={"q": q, "total": total, "limit_per_group": LIMIT_PER_GROUP},
    )
