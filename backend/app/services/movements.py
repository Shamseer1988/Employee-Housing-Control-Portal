from datetime import date, datetime

from ..extensions import db
from ..models import (
    AccommodationAssignment, AccommodationTransfer, AccommodationCancellation,
    EmployeeVacation, Bed, Room, Property, Employee,
)
from ..models.movement import (
    CANCELLATION_REASONS, TRANSFER_REASONS, generate_txn_number,
)
from .assignments import AssignmentError, _parse_date, post_assignment


# Mapping cancellation reason -> employee.status side effect
_REASON_TO_STATUS = {
    "resigned": "resigned",
    "terminated": "terminated",
    "visa_cancelled": "visa_cancelled",
    # shifted_outside / vacation / other → leave status alone
}


def _active_assignment_for(employee: Employee) -> AccommodationAssignment | None:
    return (
        AccommodationAssignment.query
        .filter_by(employee_id=employee.id, status="active")
        .first()
    )


def post_transfer(
    *,
    employee_id: int,
    to_bed_id: int,
    transfer_date=None,
    reason: str | None = None,
    remarks: str | None = None,
    approved_by: int | None = None,
    actor_id: int,
) -> AccommodationTransfer:
    employee = Employee.query.get(employee_id)
    if employee is None:
        raise AssignmentError("Employee not found")

    active = _active_assignment_for(employee)
    if active is None:
        raise AssignmentError(
            "Employee has no active assignment to transfer from. Post an assignment instead."
        )

    if reason and reason not in TRANSFER_REASONS:
        raise AssignmentError(f"reason must be one of {sorted(TRANSFER_REASONS)}")

    to_bed = Bed.query.get(to_bed_id)
    if to_bed is None:
        raise AssignmentError("Target bed not found")
    if to_bed.id == active.bed_id:
        raise AssignmentError("Target bed is the same as the current bed")
    if to_bed.status != "empty":
        raise AssignmentError(
            f"Target bed {to_bed.bed_code} is {to_bed.status}; only empty beds accept transfers"
        )

    to_room: Room = to_bed.room
    if to_room.occupancy_status in ("maintenance", "blocked"):
        raise AssignmentError(f"Target room is {to_room.occupancy_status}; cannot transfer in")
    to_property: Property = to_room.property
    if to_property.status != "active":
        raise AssignmentError(f"Target property {to_property.code} is {to_property.status}")
    if to_room.allowed_gender and to_room.allowed_gender != "any":
        if not employee.gender or employee.gender != to_room.allowed_gender:
            raise AssignmentError(
                f"Target room only accepts {to_room.allowed_gender}; "
                f"employee gender is {employee.gender or 'unknown'}"
            )

    # ---- Close the old assignment & free the old bed ----
    from_bed = active.bed
    from_room = active.room
    old_bed_id = from_bed.id

    active.status = "transferred"
    active.cancelled_at = _parse_date(transfer_date, date.today())
    active.cancellation_reason = reason or "transfer"
    active.updated_by = actor_id

    from_bed.status = "empty"
    from_bed.current_employee_id = None
    from_bed.updated_by = actor_id
    from_room.recompute_status()

    # Clear employee.current_* so post_assignment's guards see a free employee
    employee.current_property_id = None
    employee.current_floor_id = None
    employee.current_room_id = None
    employee.current_bed_id = None
    db.session.flush()

    # ---- Post a brand new assignment for the destination ----
    new_assignment = post_assignment(
        employee_id=employee.id,
        bed_id=to_bed.id,
        assignment_date=transfer_date,
        reason=f"transfer:{reason}" if reason else "transfer",
        remarks=remarks,
        approved_by=approved_by,
        actor_id=actor_id,
    )

    transfer = AccommodationTransfer(
        transaction_number=generate_txn_number("TRANS"),
        employee_id=employee.id,
        from_assignment_id=active.id,
        to_assignment_id=new_assignment.id,
        from_bed_id=old_bed_id,
        to_bed_id=to_bed.id,
        transfer_date=_parse_date(transfer_date, date.today()),
        reason=reason,
        approved_by=approved_by,
        remarks=remarks,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(transfer)
    db.session.flush()
    return transfer


def post_cancellation(
    *,
    employee_id: int,
    reason: str,
    cancellation_date=None,
    new_employee_status: str | None = None,
    remarks: str | None = None,
    approved_by: int | None = None,
    actor_id: int,
) -> AccommodationCancellation:
    employee = Employee.query.get(employee_id)
    if employee is None:
        raise AssignmentError("Employee not found")
    if reason not in CANCELLATION_REASONS:
        raise AssignmentError(f"reason must be one of {sorted(CANCELLATION_REASONS)}")

    active = _active_assignment_for(employee)
    if active is None:
        raise AssignmentError("Employee has no active assignment to cancel")

    bed: Bed = active.bed
    room: Room = active.room
    when = _parse_date(cancellation_date, date.today())

    active.status = "cancelled"
    active.cancelled_at = when
    active.cancellation_reason = reason
    active.closing_remarks = remarks
    active.updated_by = actor_id

    bed.status = "empty"
    bed.current_employee_id = None
    bed.updated_by = actor_id
    room.recompute_status()

    employee.current_property_id = None
    employee.current_floor_id = None
    employee.current_room_id = None
    employee.current_bed_id = None
    new_status = new_employee_status or _REASON_TO_STATUS.get(reason)
    if new_status:
        employee.status = new_status
    employee.updated_by = actor_id

    cancellation = AccommodationCancellation(
        transaction_number=generate_txn_number("CANCEL"),
        employee_id=employee.id,
        assignment_id=active.id,
        bed_id=bed.id,
        cancellation_date=when,
        reason=reason,
        new_employee_status=new_status,
        approved_by=approved_by,
        remarks=remarks,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(cancellation)
    db.session.flush()
    return cancellation


def start_vacation(
    *,
    employee_id: int,
    vacation_start_date,
    vacation_end_date=None,
    keep_bed_reserved: bool = False,
    remarks: str | None = None,
    actor_id: int,
) -> EmployeeVacation:
    employee = Employee.query.get(employee_id)
    if employee is None:
        raise AssignmentError("Employee not found")

    already = (
        EmployeeVacation.query
        .filter_by(employee_id=employee.id, status="on_vacation")
        .first()
    )
    if already is not None:
        raise AssignmentError(
            f"Employee is already on vacation ({already.transaction_number})"
        )

    active = _active_assignment_for(employee)
    bed: Bed | None = active.bed if active else None
    when_start = _parse_date(vacation_start_date, date.today())
    when_end = _parse_date(vacation_end_date, None) if vacation_end_date else None

    if bed:
        if keep_bed_reserved:
            bed.status = "reserved"
        else:
            bed.status = "empty"
            bed.current_employee_id = None
            # Close the assignment because the bed is no longer held
            active.status = "cancelled"
            active.cancelled_at = when_start
            active.cancellation_reason = "vacation"
            active.updated_by = actor_id
            employee.current_property_id = None
            employee.current_floor_id = None
            employee.current_room_id = None
            employee.current_bed_id = None
        bed.updated_by = actor_id
        bed.room.recompute_status()

    employee.status = "on_vacation"
    employee.updated_by = actor_id

    vac = EmployeeVacation(
        transaction_number=generate_txn_number("VAC"),
        employee_id=employee.id,
        assignment_id=active.id if active else None,
        bed_id=bed.id if bed else None,
        vacation_start_date=when_start,
        vacation_end_date=when_end,
        keep_bed_reserved=bool(keep_bed_reserved),
        status="on_vacation",
        remarks=remarks,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(vac)
    db.session.flush()
    return vac


def return_from_vacation(
    *,
    vacation_id: int,
    return_date=None,
    actor_id: int,
) -> EmployeeVacation:
    vac = EmployeeVacation.query.get(vacation_id)
    if vac is None:
        raise AssignmentError("Vacation not found")
    if vac.status != "on_vacation":
        raise AssignmentError(f"Vacation is already {vac.status}")

    when = _parse_date(return_date, date.today())
    vac.return_date = when
    vac.status = "returned"
    vac.updated_by = actor_id

    employee = vac.employee
    if vac.keep_bed_reserved and vac.bed and vac.bed.status == "reserved":
        bed = vac.bed
        bed.status = "occupied"
        bed.current_employee_id = employee.id
        bed.updated_by = actor_id
        bed.room.recompute_status()
        employee.current_property_id = bed.property_id
        employee.current_floor_id = bed.floor_id
        employee.current_room_id = bed.room_id
        employee.current_bed_id = bed.id

    employee.status = "active"
    employee.updated_by = actor_id
    db.session.flush()
    return vac


def employee_movement_timeline(employee_id: int) -> list[dict]:
    """Combined chronological list of assignments / transfers / cancellations / vacations."""
    events: list[dict] = []

    for a in AccommodationAssignment.query.filter_by(employee_id=employee_id).all():
        events.append({
            "type": "assignment",
            "date": a.assignment_date.isoformat() if a.assignment_date else None,
            "transaction_number": a.transaction_number,
            "status": a.status,
            "bed_code": a.bed.bed_code if a.bed else None,
            "property": a.property.name if a.property else None,
            "reason": a.reason,
            "remarks": a.remarks,
            "closed_on": a.cancelled_at.isoformat() if a.cancelled_at else None,
            "closed_reason": a.cancellation_reason,
        })

    for t in AccommodationTransfer.query.filter_by(employee_id=employee_id).all():
        events.append({
            "type": "transfer",
            "date": t.transfer_date.isoformat() if t.transfer_date else None,
            "transaction_number": t.transaction_number,
            "from_bed_code": t.from_bed.bed_code if t.from_bed else None,
            "to_bed_code": t.to_bed.bed_code if t.to_bed else None,
            "reason": t.reason,
            "remarks": t.remarks,
        })

    for c in AccommodationCancellation.query.filter_by(employee_id=employee_id).all():
        events.append({
            "type": "cancellation",
            "date": c.cancellation_date.isoformat() if c.cancellation_date else None,
            "transaction_number": c.transaction_number,
            "bed_code": c.bed.bed_code if c.bed else None,
            "reason": c.reason,
            "new_employee_status": c.new_employee_status,
            "remarks": c.remarks,
        })

    for v in EmployeeVacation.query.filter_by(employee_id=employee_id).all():
        events.append({
            "type": "vacation",
            "date": v.vacation_start_date.isoformat() if v.vacation_start_date else None,
            "transaction_number": v.transaction_number,
            "bed_code": v.bed.bed_code if v.bed else None,
            "end_date": v.vacation_end_date.isoformat() if v.vacation_end_date else None,
            "return_date": v.return_date.isoformat() if v.return_date else None,
            "keep_bed_reserved": v.keep_bed_reserved,
            "status": v.status,
            "remarks": v.remarks,
        })

    events.sort(key=lambda e: (e["date"] or "", e["transaction_number"] or ""))
    return events
