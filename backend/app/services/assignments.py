from datetime import date, datetime
from typing import Optional

from ..extensions import db
from ..models import (
    AccommodationAssignment, Bed, Room, Floor, Property, Employee,
)
from ..models.assignment import generate_transaction_number


class AssignmentError(ValueError):
    pass


def _parse_date(value, fallback: date) -> date:
    if value is None or value == "":
        return fallback
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(str(value)).date()


def post_assignment(
    *,
    employee_id: int,
    bed_id: int,
    assignment_date=None,
    expected_stay_period: str | None = None,
    reason: str | None = None,
    remarks: str | None = None,
    approved_by: int | None = None,
    actor_id: int,
) -> AccommodationAssignment:
    """Post an accommodation assignment with full business-rule enforcement.

    Caller is responsible for committing the session afterwards.
    """
    employee = Employee.query.get(employee_id)
    if employee is None:
        raise AssignmentError("Employee not found")
    if employee.status in ("resigned", "terminated", "visa_cancelled"):
        raise AssignmentError(f"Cannot assign accommodation to a {employee.status} employee")
    if not employee.accommodation_required:
        raise AssignmentError("Employee is flagged as not requiring accommodation")

    bed = Bed.query.get(bed_id)
    if bed is None:
        raise AssignmentError("Bed not found")
    if bed.status != "empty":
        raise AssignmentError(f"Bed {bed.bed_code} is {bed.status}; only empty beds can be assigned")

    room: Room = bed.room
    if room.occupancy_status in ("maintenance", "blocked"):
        raise AssignmentError(f"Room {room.room_number} is {room.occupancy_status}; cannot assign")

    property_: Property = room.property
    if property_.status != "active":
        raise AssignmentError(f"Property {property_.code} is {property_.status}; cannot assign")

    if room.allowed_gender and room.allowed_gender != "any":
        if not employee.gender:
            raise AssignmentError(
                f"Room {room.room_number} only accepts {room.allowed_gender} occupants; employee gender is unknown"
            )
        if employee.gender != room.allowed_gender:
            raise AssignmentError(
                f"Room {room.room_number} only accepts {room.allowed_gender}; employee is {employee.gender}"
            )

    active = (
        AccommodationAssignment.query
        .filter_by(employee_id=employee.id, status="active")
        .first()
    )
    if active is not None:
        raise AssignmentError(
            f"Employee already has an active assignment ({active.transaction_number} → bed {active.bed.bed_code}). "
            "Use a transfer or cancel the existing assignment first."
        )

    txn = AccommodationAssignment(
        transaction_number=generate_transaction_number(),
        employee_id=employee.id,
        property_id=property_.id,
        floor_id=room.floor_id,
        room_id=room.id,
        bed_id=bed.id,
        assignment_date=_parse_date(assignment_date, date.today()),
        expected_stay_period=expected_stay_period,
        reason=reason,
        approved_by=approved_by,
        remarks=remarks,
        status="active",
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(txn)

    bed.status = "occupied"
    bed.current_employee_id = employee.id
    bed.updated_by = actor_id

    employee.current_property_id = property_.id
    employee.current_floor_id = room.floor_id
    employee.current_room_id = room.id
    employee.current_bed_id = bed.id
    if employee.status in ("on_vacation", "transferred"):
        employee.status = "active"
    employee.updated_by = actor_id

    room.recompute_status()

    db.session.flush()
    return txn


def list_available_beds(
    *,
    property_id: int | None = None,
    floor_id: int | None = None,
    room_id: int | None = None,
    gender: str | None = None,
    limit: int = 200,
) -> list[Bed]:
    """Empty beds in active properties / rooms, optionally filtered by gender."""
    q = (
        db.session.query(Bed)
        .join(Bed.room)
        .join(Room.property)
        .filter(Bed.status == "empty")
        .filter(Property.status == "active")
        .filter(~Room.occupancy_status.in_(("maintenance", "blocked")))
    )
    if property_id is not None:
        q = q.filter(Bed.property_id == property_id)
    if floor_id is not None:
        q = q.filter(Bed.floor_id == floor_id)
    if room_id is not None:
        q = q.filter(Bed.room_id == room_id)
    if gender and gender != "any":
        q = q.filter(Room.allowed_gender.in_(("any", gender)))
    return q.order_by(Bed.property_id, Bed.floor_id, Bed.room_id, Bed.bed_number).limit(limit).all()
