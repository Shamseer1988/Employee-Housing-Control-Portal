from sqlalchemy import (
    Column, String, Integer, Text, ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


BED_TYPES = {"single", "bunk_upper", "bunk_lower"}
BED_STATUSES = {"empty", "occupied", "reserved", "maintenance", "blocked"}


class Bed(BaseModel):
    __tablename__ = "beds"

    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)

    bed_number = Column(String(16), nullable=False)
    bed_code = Column(String(80), unique=True, nullable=False, index=True)
    bed_type = Column(String(16), default="single", nullable=False)
    status = Column(String(16), default="empty", nullable=False, index=True)

    # Employee assignment (model lands in Phase 5; column added now so the
    # bed -> assignment relationship is in place without another migration).
    current_employee_id = Column(Integer, nullable=True, index=True)

    remarks = Column(Text, nullable=True)

    room = relationship("Room", back_populates="beds")

    __table_args__ = (
        UniqueConstraint("room_id", "bed_number", name="uq_bed_room_number"),
        Index("ix_beds_status_room", "status", "room_id"),
    )
