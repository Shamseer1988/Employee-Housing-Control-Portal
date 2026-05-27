from flask import Blueprint, request

from ..extensions import db
from ..models import (
    AccommodationTransfer, AccommodationCancellation, EmployeeVacation,
)
from ..services import audit, movements
from ..services.assignments import AssignmentError
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

movements_bp = Blueprint("movements", __name__)


# ---------- Transfers ----------

@movements_bp.get("/transfers")
@require_permission("assignment.view")
def list_transfers():
    employee_id = request.args.get("employee_id", type=int)
    q = AccommodationTransfer.query
    if employee_id:
        q = q.filter_by(employee_id=employee_id)
    rows = q.order_by(AccommodationTransfer.id.desc()).limit(200).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@movements_bp.post("/transfers")
@require_permission("transfer.create")
def create_transfer():
    payload = request.get_json(silent=True) or {}
    employee_id = payload.get("employee_id")
    to_bed_id = payload.get("to_bed_id")
    if not employee_id or not to_bed_id:
        return error_response("employee_id and to_bed_id are required", 400)
    actor = current_user()
    try:
        txn = movements.post_transfer(
            employee_id=int(employee_id),
            to_bed_id=int(to_bed_id),
            transfer_date=payload.get("transfer_date"),
            reason=payload.get("reason"),
            remarks=payload.get("remarks"),
            approved_by=payload.get("approved_by"),
            actor_id=actor.id,
        )
    except AssignmentError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="post", module="transfer",
                 entity_type="accommodation_transfer", entity_id=txn.id,
                 new_value=txn.to_dict(), remarks=txn.transaction_number)
    db.session.commit()
    return success_response(data=txn.to_dict(), message="Transfer posted", status=201)


# ---------- Cancellations ----------

@movements_bp.get("/cancellations")
@require_permission("assignment.view")
def list_cancellations():
    employee_id = request.args.get("employee_id", type=int)
    q = AccommodationCancellation.query
    if employee_id:
        q = q.filter_by(employee_id=employee_id)
    rows = q.order_by(AccommodationCancellation.id.desc()).limit(200).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@movements_bp.post("/cancellations")
@require_permission("cancellation.create")
def create_cancellation():
    payload = request.get_json(silent=True) or {}
    employee_id = payload.get("employee_id")
    reason = (payload.get("reason") or "").strip()
    if not employee_id or not reason:
        return error_response("employee_id and reason are required", 400)

    actor = current_user()
    try:
        txn = movements.post_cancellation(
            employee_id=int(employee_id),
            reason=reason,
            cancellation_date=payload.get("cancellation_date"),
            new_employee_status=payload.get("new_employee_status"),
            remarks=payload.get("remarks"),
            approved_by=payload.get("approved_by"),
            actor_id=actor.id,
        )
    except AssignmentError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="post", module="cancellation",
                 entity_type="accommodation_cancellation", entity_id=txn.id,
                 new_value=txn.to_dict(), remarks=txn.transaction_number)
    db.session.commit()
    return success_response(data=txn.to_dict(), message="Cancellation posted", status=201)


# ---------- Vacations ----------

@movements_bp.get("/vacations")
@require_permission("assignment.view")
def list_vacations():
    employee_id = request.args.get("employee_id", type=int)
    status = request.args.get("status")
    q = EmployeeVacation.query
    if employee_id:
        q = q.filter_by(employee_id=employee_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(EmployeeVacation.id.desc()).limit(200).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@movements_bp.post("/vacations")
@require_permission("vacation.create")
def create_vacation():
    payload = request.get_json(silent=True) or {}
    if not payload.get("employee_id"):
        return error_response("employee_id is required", 400)
    if not payload.get("vacation_start_date"):
        return error_response("vacation_start_date is required", 400)
    actor = current_user()
    try:
        txn = movements.start_vacation(
            employee_id=int(payload["employee_id"]),
            vacation_start_date=payload["vacation_start_date"],
            vacation_end_date=payload.get("vacation_end_date"),
            keep_bed_reserved=bool(payload.get("keep_bed_reserved")),
            remarks=payload.get("remarks"),
            actor_id=actor.id,
        )
    except AssignmentError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="start", module="vacation",
                 entity_type="employee_vacation", entity_id=txn.id,
                 new_value=txn.to_dict(), remarks=txn.transaction_number)
    db.session.commit()
    return success_response(data=txn.to_dict(), message="Vacation recorded", status=201)


@movements_bp.post("/vacations/<int:vac_id>/return")
@require_permission("vacation.create")
def return_vacation(vac_id: int):
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    try:
        vac = movements.return_from_vacation(
            vacation_id=vac_id,
            return_date=payload.get("return_date"),
            actor_id=actor.id,
        )
    except AssignmentError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="return", module="vacation",
                 entity_type="employee_vacation", entity_id=vac.id,
                 new_value=vac.to_dict(), remarks=vac.transaction_number)
    db.session.commit()
    return success_response(data=vac.to_dict(), message="Return recorded")


# ---------- Employee timeline ----------

@movements_bp.get("/employees/<int:emp_id>/timeline")
@require_permission("employee.view")
def employee_timeline(emp_id: int):
    return success_response(data=movements.employee_movement_timeline(emp_id))
