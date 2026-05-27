from sqlalchemy import func

from ..extensions import db
from ..models import Bed, Room


def bed_code(property_code: str, floor_number: str, room_number: str, bed_number: str) -> str:
    """Stable bed identifier: PROP-0001-F1-R101-B1."""
    return f"{property_code}-F{floor_number}-R{room_number}-B{bed_number}"


def bed_counts_for_property(property_id: int) -> dict:
    rows = (
        db.session.query(Bed.status, func.count(Bed.id))
        .filter(Bed.property_id == property_id)
        .group_by(Bed.status)
        .all()
    )
    counts = {"total": 0, "empty": 0, "occupied": 0, "reserved": 0, "maintenance": 0, "blocked": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
        counts["total"] += n
    counts["occupancy_percent"] = (
        round(counts["occupied"] * 100.0 / counts["total"], 1) if counts["total"] else 0.0
    )
    return counts


def room_counts_for_property(property_id: int) -> dict:
    rows = (
        db.session.query(Room.occupancy_status, func.count(Room.id))
        .filter(Room.property_id == property_id)
        .group_by(Room.occupancy_status)
        .all()
    )
    counts = {"total": 0, "empty": 0, "partially_occupied": 0, "full": 0, "maintenance": 0, "blocked": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
        counts["total"] += n
    return counts


def property_summary(property_id: int) -> dict:
    return {
        "beds": bed_counts_for_property(property_id),
        "rooms": room_counts_for_property(property_id),
    }
