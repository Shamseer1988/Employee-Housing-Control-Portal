"""Property structure generator.

Turns one create-property request into floors, rooms and beds in a
single transaction so the caller can roll everything back (the new
property included) if anything in the layout is invalid.

The generator reuses the same patterns as the per-entity create routes:
  * `occupancy.bed_code(...)` for bed identifiers,
  * `audit.record(...)` for every created entity plus one summary record,
  * the existing Floor/Room/Bed columns — no schema change.
"""

from ..extensions import db
from ..models import Property, Floor, Room, Bed
from ..models.room import ROOM_TYPES
from ..models.bed import BED_TYPES
from . import audit, occupancy


MAX_FLOORS = 50
MAX_ROOMS_PER_FLOOR = 100
MAX_BEDS_PER_ROOM = 12


class LayoutError(ValueError):
    """Raised for any caller-visible validation failure inside the generator."""


def _floor_specs(floors: int, floor_prefix: str, ground_floor: bool) -> list[tuple[str, str]]:
    """Return [(stored_floor_number, floor_seq_used_for_room_numbering), ...].

    `floor_seq` strips the prefix so room numbers stay short ("F1" -> "1",
    ground -> "G"). It is used purely to build room_number; the floor row
    is stored with the user-chosen prefix.
    """
    out: list[tuple[str, str]] = []
    if ground_floor:
        out.append((f"{floor_prefix}G", "G"))
        for i in range(1, floors):
            out.append((f"{floor_prefix}{i}", str(i)))
    else:
        for i in range(1, floors + 1):
            out.append((f"{floor_prefix}{i}", str(i)))
    return out


def generate_structure(
    property: Property,
    *,
    floors: int,
    rooms_per_floor: int,
    beds_per_room: int,
    floor_prefix: str = "",
    room_prefix: str = "",
    ground_floor: bool = False,
    default_room_type: str = "shared",
    default_bed_type: str = "single",
    actor,
) -> dict:
    """Create floors -> rooms -> beds for `property`.

    Caller owns the transaction: we flush so PKs are assigned and audit
    rows reference the right ids, but we do NOT commit. The caller's
    final `db.session.commit()` ships the new property AND its layout
    in one shot.

    Refuses with `LayoutError` if the property already has any floor —
    so the same property can't be double-built.
    """
    if not (1 <= floors <= MAX_FLOORS):
        raise LayoutError(f"floors must be between 1 and {MAX_FLOORS}")
    if not (1 <= rooms_per_floor <= MAX_ROOMS_PER_FLOOR):
        raise LayoutError(f"rooms_per_floor must be between 1 and {MAX_ROOMS_PER_FLOOR}")
    if not (1 <= beds_per_room <= MAX_BEDS_PER_ROOM):
        raise LayoutError(f"beds_per_room must be between 1 and {MAX_BEDS_PER_ROOM}")
    if default_room_type not in ROOM_TYPES:
        raise LayoutError(f"default_room_type must be one of {sorted(ROOM_TYPES)}")
    if default_bed_type not in BED_TYPES:
        raise LayoutError(f"default_bed_type must be one of {sorted(BED_TYPES)}")

    existing = (
        db.session.query(db.func.count(Floor.id))
        .filter(Floor.property_id == property.id)
        .scalar() or 0
    )
    if existing:
        raise LayoutError("Property already has floors; refusing to generate")

    room_pad = max(2, len(str(rooms_per_floor)))
    floor_specs = _floor_specs(floors, floor_prefix, ground_floor)

    counts = {"floors": 0, "rooms": 0, "beds": 0}

    for stored_floor_no, floor_seq in floor_specs:
        floor = Floor(
            property_id=property.id,
            floor_number=stored_floor_no,
            created_by=actor.id,
            updated_by=actor.id,
        )
        db.session.add(floor)
        db.session.flush()
        counts["floors"] += 1
        audit.record(
            user=actor, action="create", module="floor",
            entity_type="floor", entity_id=floor.id, new_value=floor.to_dict(),
        )

        for ridx in range(1, rooms_per_floor + 1):
            room_number = f"{room_prefix}{floor_seq}{ridx:0{room_pad}d}"
            room = Room(
                property_id=property.id,
                floor_id=floor.id,
                room_number=room_number,
                room_type=default_room_type,
                capacity=beds_per_room,
                created_by=actor.id,
                updated_by=actor.id,
            )
            db.session.add(room)
            db.session.flush()
            counts["rooms"] += 1
            audit.record(
                user=actor, action="create", module="room",
                entity_type="room", entity_id=room.id, new_value=room.to_dict(),
            )

            for bidx in range(1, beds_per_room + 1):
                bed_number = str(bidx)
                code = occupancy.bed_code(
                    property.code, stored_floor_no, room_number, bed_number,
                )
                bed = Bed(
                    property_id=property.id,
                    floor_id=floor.id,
                    room_id=room.id,
                    bed_number=bed_number,
                    bed_code=code,
                    bed_type=default_bed_type,
                    status="empty",
                    created_by=actor.id,
                    updated_by=actor.id,
                )
                db.session.add(bed)
                db.session.flush()
                counts["beds"] += 1
                audit.record(
                    user=actor, action="create", module="bed",
                    entity_type="bed", entity_id=bed.id, new_value=bed.to_dict(),
                )

            room.recompute_status()

    audit.record(
        user=actor, action="bulk_create", module="property",
        entity_type="property", entity_id=property.id,
        new_value={
            "summary": counts,
            "spec": {
                "floors": floors,
                "rooms_per_floor": rooms_per_floor,
                "beds_per_room": beds_per_room,
                "floor_prefix": floor_prefix,
                "room_prefix": room_prefix,
                "ground_floor": ground_floor,
                "default_room_type": default_room_type,
                "default_bed_type": default_bed_type,
            },
        },
        remarks=f"Auto-generated structure for {property.code}",
    )

    return counts
