from sqlalchemy import (
    Column, String, Integer, Boolean, Text, ForeignKey, Index, UniqueConstraint, Numeric,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


ROOM_TYPES = {
    "shared", "single", "executive", "supervisor", "family", "temporary",
}
GENDERS = {"any", "male", "female"}
ROOM_STATUSES = {"empty", "partially_occupied", "full", "maintenance", "blocked"}


class Room(BaseModel):
    __tablename__ = "rooms"

    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)

    room_number = Column(String(32), nullable=False)
    room_name = Column(String(80), nullable=True)
    room_type = Column(String(16), default="shared", nullable=False)
    capacity = Column(Integer, default=1, nullable=False)
    allowed_gender = Column(String(8), default="any", nullable=False)
    has_bathroom = Column(Boolean, default=False, nullable=False)
    has_ac = Column(Boolean, default=True, nullable=False)
    occupancy_status = Column(String(20), default="empty", nullable=False, index=True)
    monthly_rent = Column(Numeric(12, 2), nullable=True)
    remarks = Column(Text, nullable=True)

    floor = relationship("Floor", back_populates="rooms")
    property = relationship("Property")
    beds = relationship("Bed", back_populates="room", lazy="select", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("property_id", "floor_id", "room_number", name="uq_room_property_floor_number"),
        Index("ix_rooms_property_status", "property_id", "occupancy_status"),
    )

    def occupancy_counts(self) -> dict:
        beds = self.beds or []
        counts = {"total": len(beds), "occupied": 0, "empty": 0, "reserved": 0, "maintenance": 0, "blocked": 0}
        for b in beds:
            counts[b.status] = counts.get(b.status, 0) + 1
        return counts

    def recompute_status(self) -> None:
        if self.occupancy_status in ("maintenance", "blocked"):
            return
        c = self.occupancy_counts()
        if c["total"] == 0 or (c["empty"] + c["reserved"] + c["maintenance"] + c["blocked"]) == c["total"] and c["occupied"] == 0:
            self.occupancy_status = "empty"
        elif c["occupied"] == c["total"]:
            self.occupancy_status = "full"
        elif c["occupied"] > 0:
            self.occupancy_status = "partially_occupied"
        else:
            self.occupancy_status = "empty"

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        if data.get("monthly_rent") is not None:
            data["monthly_rent"] = float(data["monthly_rent"])
        data["bed_counts"] = self.occupancy_counts()
        return data
