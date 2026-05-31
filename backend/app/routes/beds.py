from flask import Blueprint, request

from ..extensions import db
from ..models import Bed, Room
from ..models.bed import BED_TYPES, BED_STATUSES
from ..services import audit, occupancy
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

beds_bp = Blueprint("beds", __name__)


def _publish_occupancy(event: dict) -> None:
    """Best-effort SSE publish so the floor-plan / dashboard re-fetch.

    Mirrors the assignment service: failures here must never roll back
    the surrounding mutation.
    """
    try:
        from ..services import events as event_service
        event_service.publish("occupancy", event)
    except Exception:
        pass


EDITABLE = {"bed_number", "bed_type", "remarks"}

# Transitions a manual operator can drive in Phase 4. Assignment / vacation
# transitions (empty <-> occupied / reserved) belong to Phases 6 & 7.
MANUAL_TRANSITIONS: dict[str, set[str]] = {
    "empty": {"maintenance", "blocked"},
    "maintenance": {"empty", "blocked"},
    "blocked": {"empty", "maintenance"},
    # occupied / reserved beds cannot be changed without a transaction
    "occupied": set(),
    "reserved": set(),
}


@beds_bp.get("/rooms/<int:room_id>/beds")
@require_permission("bed.view")
def list_beds(room_id: int):
    Room.query.get_or_404(room_id)
    rows = (
        Bed.query.filter_by(room_id=room_id)
        .order_by(Bed.bed_number.asc())
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@beds_bp.post("/rooms/<int:room_id>/beds")
@require_permission("bed.manage")
def create_bed(room_id: int):
    room = Room.query.get_or_404(room_id)
    payload = request.get_json(silent=True) or {}
    bed_number = (payload.get("bed_number") or "").strip()
    if not bed_number:
        return error_response("bed_number is required", 400)
    # bed_number is stored in a VARCHAR(16). Guard here so an over-long
    # value (e.g. a full bed_code pasted by mistake) returns a clean 400
    # instead of crashing the INSERT with a 500.
    if len(bed_number) > 16:
        return error_response("bed_number must be 16 characters or fewer", 400)

    if Bed.query.filter_by(room_id=room_id, bed_number=bed_number).first():
        return error_response("Bed number already exists in this room", 409)

    current = len(room.beds or [])
    if current + 1 > (room.capacity or 0):
        return error_response(
            f"Adding this bed would exceed room capacity ({room.capacity}). "
            f"Increase capacity first.",
            400,
        )

    bed_type = payload.get("bed_type") or "single"
    if bed_type not in BED_TYPES:
        return error_response(f"bed_type must be one of {sorted(BED_TYPES)}", 400)

    code = occupancy.bed_code(
        room.property.code, room.floor.floor_number, room.room_number, bed_number
    )
    if Bed.query.filter_by(bed_code=code).first():
        return error_response(f"Bed code {code} already exists", 409)

    actor = current_user()
    bed = Bed(
        property_id=room.property_id,
        floor_id=room.floor_id,
        room_id=room.id,
        bed_number=bed_number,
        bed_code=code,
        bed_type=bed_type,
        status="empty",
        remarks=payload.get("remarks"),
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.session.add(bed)
    db.session.flush()
    room.recompute_status()
    audit.record(user=actor, action="create", module="bed",
                 entity_type="bed", entity_id=bed.id, new_value=bed.to_dict())
    db.session.commit()
    _publish_occupancy({
        "type": "bed.created",
        "property_id": bed.property_id, "room_id": bed.room_id,
        "bed_id": bed.id, "bed_code": bed.bed_code,
    })
    return success_response(data=bed.to_dict(), message="Bed created", status=201)


@beds_bp.put("/beds/<int:bed_id>")
@require_permission("bed.manage")
def update_bed(bed_id: int):
    bed = Bed.query.get_or_404(bed_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = bed.to_dict()

    if "bed_type" in payload:
        if payload["bed_type"] not in BED_TYPES:
            return error_response(f"bed_type must be one of {sorted(BED_TYPES)}", 400)
        bed.bed_type = payload["bed_type"]
    if "bed_number" in payload:
        new_no = (payload["bed_number"] or "").strip()
        if new_no != bed.bed_number:
            if Bed.query.filter_by(room_id=bed.room_id, bed_number=new_no).first():
                return error_response("Bed number already exists in this room", 409)
            bed.bed_number = new_no
            bed.bed_code = occupancy.bed_code(
                bed.room.property.code, bed.room.floor.floor_number,
                bed.room.room_number, new_no,
            )
    if "remarks" in payload:
        bed.remarks = payload["remarks"]
    bed.updated_by = actor.id
    audit.record(user=actor, action="update", module="bed",
                 entity_type="bed", entity_id=bed.id, old_value=old, new_value=bed.to_dict())
    db.session.commit()
    return success_response(data=bed.to_dict(), message="Bed updated")


UNIT_TYPES = {"single", "bunk"}
MAX_BULK_UNITS = 50


@beds_bp.post("/rooms/<int:room_id>/beds/bulk")
@require_permission("bed.manage")
def create_beds_bulk(room_id: int):
    """Create several beds in one atomic transaction.

    Accepts ``{"units": [{"type": "single"|"bunk"}, ...]}``. A single
    unit becomes one ``bed_type="single"`` row numbered ``"{i}"``; a
    bunk unit becomes two rows ``"{i}L"`` and ``"{i}U"`` with bed_types
    ``bunk_lower`` and ``bunk_upper`` — keeping the bed_code human-
    readable (e.g. ``PROP-F1-R101-B1L``).

    Reuses every guard from create_bed (room capacity, bed_number /
    bed_code uniqueness, BED_TYPES); rolls back the whole call on the
    first failure so partial bulk creation never happens.
    """
    room = Room.query.get_or_404(room_id)
    payload = request.get_json(silent=True) or {}
    units = payload.get("units")
    if not isinstance(units, list) or not units:
        return error_response("units must be a non-empty array", 400)
    if len(units) > MAX_BULK_UNITS:
        return error_response(f"Too many units in one call (max {MAX_BULK_UNITS})", 400)

    specs: list[tuple[str, str]] = []  # (bed_number, bed_type)
    for idx, u in enumerate(units, start=1):
        if not isinstance(u, dict):
            return error_response(f"units[{idx - 1}] must be an object", 400)
        utype = (u.get("type") or "single").strip()
        if utype not in UNIT_TYPES:
            return error_response(
                f"units[{idx - 1}].type must be one of {sorted(UNIT_TYPES)}", 400
            )
        if utype == "single":
            specs.append((str(idx), "single"))
        else:
            specs.append((f"{idx}L", "bunk_lower"))
            specs.append((f"{idx}U", "bunk_upper"))

    current = len(room.beds or [])
    if current + len(specs) > (room.capacity or 0):
        return error_response(
            f"Adding {len(specs)} bed(s) would exceed room capacity "
            f"({room.capacity}). Increase capacity first.",
            400,
        )

    existing_numbers = {b.bed_number for b in (room.beds or [])}
    seen: set[str] = set()
    for num, _ in specs:
        if num in seen or num in existing_numbers:
            return error_response(
                f"Bed number {num!r} would conflict with an existing bed", 409
            )
        seen.add(num)

    actor = current_user()
    created = []
    for bed_number, bed_type in specs:
        code = occupancy.bed_code(
            room.property.code, room.floor.floor_number, room.room_number, bed_number,
        )
        if Bed.query.filter_by(bed_code=code).first():
            db.session.rollback()
            return error_response(f"Bed code {code} already exists", 409)
        bed = Bed(
            property_id=room.property_id,
            floor_id=room.floor_id,
            room_id=room.id,
            bed_number=bed_number,
            bed_code=code,
            bed_type=bed_type,
            status="empty",
            created_by=actor.id,
            updated_by=actor.id,
        )
        db.session.add(bed)
        db.session.flush()
        created.append(bed)
        audit.record(
            user=actor, action="create", module="bed",
            entity_type="bed", entity_id=bed.id, new_value=bed.to_dict(),
        )

    room.recompute_status()
    audit.record(
        user=actor, action="bulk_create", module="bed",
        entity_type="room", entity_id=room.id,
        new_value={"count": len(created), "units": units},
        remarks=f"Bulk-added {len(created)} bed(s) to room {room.room_number}",
    )
    db.session.commit()
    _publish_occupancy({
        "type": "bed.bulk_created",
        "property_id": room.property_id, "room_id": room.id,
        "count": len(created),
    })
    return success_response(
        data={"beds": [b.to_dict() for b in created], "count": len(created)},
        message=f"{len(created)} bed(s) created",
        status=201,
    )


@beds_bp.post("/beds/<int:bed_id>/status")
@require_permission("bed.manage")
def set_bed_status(bed_id: int):
    bed = Bed.query.get_or_404(bed_id)
    payload = request.get_json(silent=True) or {}
    new_status = (payload.get("status") or "").strip()
    if new_status not in BED_STATUSES:
        return error_response(f"status must be one of {sorted(BED_STATUSES)}", 400)
    if new_status not in MANUAL_TRANSITIONS.get(bed.status, set()):
        return error_response(
            f"Cannot change bed status from {bed.status!r} to {new_status!r} manually. "
            "Use the assignment / vacation / cancellation transactions instead.",
            400,
        )
    actor = current_user()
    old_status = bed.status
    bed.status = new_status
    bed.updated_by = actor.id
    bed.room.recompute_status()
    audit.record(user=actor, action="update_status", module="bed",
                 entity_type="bed", entity_id=bed.id,
                 old_value={"status": old_status}, new_value={"status": new_status},
                 remarks=payload.get("remarks"))
    db.session.commit()
    _publish_occupancy({
        "type": "bed.status_changed",
        "property_id": bed.property_id, "room_id": bed.room_id,
        "bed_id": bed.id, "bed_code": bed.bed_code,
        "old_status": old_status, "status": new_status,
    })
    return success_response(data=bed.to_dict(), message="Bed status updated")


@beds_bp.delete("/beds/<int:bed_id>")
@require_permission("bed.manage")
def delete_bed(bed_id: int):
    bed = Bed.query.get_or_404(bed_id)
    if bed.status == "occupied":
        return error_response("Cannot delete an occupied bed; release it first", 409)
    room = bed.room
    bed_id_snap, bed_code_snap, prop_id_snap, room_id_snap = bed.id, bed.bed_code, bed.property_id, bed.room_id
    actor = current_user()
    audit.record(user=actor, action="delete", module="bed",
                 entity_type="bed", entity_id=bed.id, old_value=bed.to_dict())
    db.session.delete(bed)
    db.session.flush()
    room.recompute_status()
    db.session.commit()
    _publish_occupancy({
        "type": "bed.deleted",
        "property_id": prop_id_snap, "room_id": room_id_snap,
        "bed_id": bed_id_snap, "bed_code": bed_code_snap,
    })
    return success_response(message="Bed deleted")
