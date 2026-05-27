from flask import Blueprint, request

from ..extensions import db
from ..models import AccommodationAssignment, Employee
from ..services import audit, assignments as assignment_service
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

assignments_bp = Blueprint("assignments", __name__)


@assignments_bp.get("/assignments")
@require_permission("assignment.view")
def list_assignments():
    employee_id = request.args.get("employee_id", type=int)
    property_id = request.args.get("property_id", type=int)
    status = request.args.get("status")
    limit = min(request.args.get("limit", default=200, type=int), 500)

    query = AccommodationAssignment.query
    if employee_id:
        query = query.filter_by(employee_id=employee_id)
    if property_id:
        query = query.filter_by(property_id=property_id)
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(AccommodationAssignment.id.desc()).limit(limit).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@assignments_bp.get("/assignments/<int:txn_id>")
@require_permission("assignment.view")
def get_assignment(txn_id: int):
    return success_response(data=AccommodationAssignment.query.get_or_404(txn_id).to_dict())


@assignments_bp.post("/assignments")
@require_permission("assignment.create")
def create_assignment():
    payload = request.get_json(silent=True) or {}
    employee_id = payload.get("employee_id")
    bed_id = payload.get("bed_id")
    if not employee_id or not bed_id:
        return error_response("employee_id and bed_id are required", 400)

    actor = current_user()
    try:
        txn = assignment_service.post_assignment(
            employee_id=int(employee_id),
            bed_id=int(bed_id),
            assignment_date=payload.get("assignment_date"),
            expected_stay_period=payload.get("expected_stay_period"),
            reason=payload.get("reason"),
            remarks=payload.get("remarks"),
            approved_by=payload.get("approved_by"),
            actor_id=actor.id,
        )
    except assignment_service.AssignmentError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)

    audit.record(
        user=actor, action="post", module="assignment",
        entity_type="accommodation_assignment", entity_id=txn.id,
        new_value=txn.to_dict(), remarks=txn.transaction_number,
    )
    db.session.commit()
    return success_response(data=txn.to_dict(), message="Assignment posted", status=201)


@assignments_bp.get("/beds/available")
@require_permission("bed.view")
def available_beds():
    property_id = request.args.get("property_id", type=int)
    floor_id = request.args.get("floor_id", type=int)
    room_id = request.args.get("room_id", type=int)
    gender = request.args.get("gender")
    employee_id = request.args.get("employee_id", type=int)

    # If an employee is supplied, default gender filter to theirs (still
    # overridable via the explicit query parameter).
    if employee_id and not gender:
        emp = Employee.query.get(employee_id)
        if emp and emp.gender:
            gender = emp.gender

    rows = assignment_service.list_available_beds(
        property_id=property_id, floor_id=floor_id, room_id=room_id, gender=gender,
    )
    payload = []
    for b in rows:
        d = b.to_dict()
        d["room"] = {
            "id": b.room.id,
            "room_number": b.room.room_number,
            "room_type": b.room.room_type,
            "allowed_gender": b.room.allowed_gender,
            "capacity": b.room.capacity,
            "has_bathroom": b.room.has_bathroom,
            "has_ac": b.room.has_ac,
        }
        d["floor"] = {"id": b.room.floor.id, "floor_number": b.room.floor.floor_number}
        d["property"] = {"id": b.room.property.id, "code": b.room.property.code, "name": b.room.property.name}
        payload.append(d)
    return success_response(data=payload, meta={"count": len(payload)})
