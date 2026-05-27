from flask import Blueprint, request

from ..extensions import db
from ..models import Room, Floor, Property
from ..models.room import ROOM_TYPES, GENDERS, ROOM_STATUSES
from ..services import audit
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

rooms_bp = Blueprint("rooms", __name__)

EDITABLE = {
    "room_number", "room_name", "room_type", "capacity", "allowed_gender",
    "has_bathroom", "has_ac", "monthly_rent", "remarks",
}


def _validate(payload: dict) -> str | None:
    if "room_type" in payload and payload["room_type"] not in ROOM_TYPES:
        return f"room_type must be one of {sorted(ROOM_TYPES)}"
    if "allowed_gender" in payload and payload["allowed_gender"] not in GENDERS:
        return f"allowed_gender must be one of {sorted(GENDERS)}"
    if "capacity" in payload and (payload["capacity"] is None or int(payload["capacity"]) < 1):
        return "capacity must be >= 1"
    return None


@rooms_bp.get("/floors/<int:floor_id>/rooms")
@require_permission("room.view")
def list_rooms_for_floor(floor_id: int):
    Floor.query.get_or_404(floor_id)
    rows = (
        Room.query.filter_by(floor_id=floor_id)
        .order_by(Room.room_number.asc())
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@rooms_bp.get("/properties/<int:prop_id>/rooms")
@require_permission("room.view")
def list_rooms_for_property(prop_id: int):
    Property.query.get_or_404(prop_id)
    rows = (
        Room.query.filter_by(property_id=prop_id)
        .order_by(Room.floor_id.asc(), Room.room_number.asc())
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@rooms_bp.get("/rooms/<int:room_id>")
@require_permission("room.view")
def get_room(room_id: int):
    return success_response(data=Room.query.get_or_404(room_id).to_dict())


@rooms_bp.post("/floors/<int:floor_id>/rooms")
@require_permission("room.manage")
def create_room(floor_id: int):
    floor = Floor.query.get_or_404(floor_id)
    payload = request.get_json(silent=True) or {}
    err = _validate(payload)
    if err:
        return error_response(err, 400)
    room_number = (payload.get("room_number") or "").strip()
    if not room_number:
        return error_response("room_number is required", 400)
    if Room.query.filter_by(property_id=floor.property_id, floor_id=floor.id, room_number=room_number).first():
        return error_response("Room number already exists on this floor", 409)

    actor = current_user()
    room = Room(
        property_id=floor.property_id,
        floor_id=floor.id,
        room_number=room_number,
        created_by=actor.id,
        updated_by=actor.id,
    )
    for k in EDITABLE:
        if k in payload and k != "room_number":
            setattr(room, k, payload[k])
    db.session.add(room)
    db.session.flush()
    audit.record(user=actor, action="create", module="room",
                 entity_type="room", entity_id=room.id, new_value=room.to_dict())
    db.session.commit()
    return success_response(data=room.to_dict(), message="Room created", status=201)


@rooms_bp.put("/rooms/<int:room_id>")
@require_permission("room.manage")
def update_room(room_id: int):
    room = Room.query.get_or_404(room_id)
    payload = request.get_json(silent=True) or {}
    err = _validate(payload)
    if err:
        return error_response(err, 400)

    if "capacity" in payload and int(payload["capacity"]) < len(room.beds or []):
        return error_response(
            f"Capacity cannot be less than current bed count ({len(room.beds)})", 400
        )

    actor = current_user()
    old = room.to_dict()
    if "room_number" in payload:
        new_no = (payload["room_number"] or "").strip()
        if new_no != room.room_number:
            if Room.query.filter_by(property_id=room.property_id, floor_id=room.floor_id, room_number=new_no).first():
                return error_response("Room number already exists on this floor", 409)
            room.room_number = new_no
    for k in EDITABLE:
        if k in payload and k != "room_number":
            setattr(room, k, payload[k])
    room.updated_by = actor.id
    audit.record(user=actor, action="update", module="room",
                 entity_type="room", entity_id=room.id, old_value=old, new_value=room.to_dict())
    db.session.commit()
    return success_response(data=room.to_dict(), message="Room updated")


@rooms_bp.post("/rooms/<int:room_id>/status")
@require_permission("room.manage")
def set_room_status(room_id: int):
    room = Room.query.get_or_404(room_id)
    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip()
    if status not in ROOM_STATUSES:
        return error_response(f"status must be one of {sorted(ROOM_STATUSES)}", 400)
    if status in ("empty", "partially_occupied", "full"):
        # Let auto recompute take over once unblocked
        room.occupancy_status = status
        room.recompute_status()
    else:
        room.occupancy_status = status
    actor = current_user()
    room.updated_by = actor.id
    audit.record(user=actor, action="update_status", module="room",
                 entity_type="room", entity_id=room.id, new_value={"status": room.occupancy_status})
    db.session.commit()
    return success_response(data=room.to_dict(), message="Room status updated")


@rooms_bp.delete("/rooms/<int:room_id>")
@require_permission("room.manage")
def delete_room(room_id: int):
    room = Room.query.get_or_404(room_id)
    if any(b.status == "occupied" for b in (room.beds or [])):
        return error_response("Cannot delete a room with occupied beds", 409)
    if room.beds:
        return error_response("Delete all beds before deleting the room", 409)
    actor = current_user()
    audit.record(user=actor, action="delete", module="room",
                 entity_type="room", entity_id=room.id, old_value=room.to_dict())
    db.session.delete(room)
    db.session.commit()
    return success_response(message="Room deleted")
