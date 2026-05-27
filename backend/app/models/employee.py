from sqlalchemy import (
    Column, String, Integer, Boolean, Date, Text, ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


EMPLOYEE_STATUSES = {
    "active", "on_vacation", "transferred", "visa_cancelled", "resigned", "terminated",
}
ACCOMMODATION_TYPES = {
    "shared_room", "single_room", "supervisor_room", "executive_room", "temporary", "family",
}
GENDERS = {"male", "female", "other"}


class Employee(BaseModel):
    __tablename__ = "employees"

    code = Column(String(32), unique=True, nullable=False, index=True)
    full_name = Column(String(160), nullable=False, index=True)
    qid_number = Column(String(32), unique=True, nullable=True, index=True)
    passport_number = Column(String(32), unique=True, nullable=True, index=True)
    visa_company = Column(String(120), nullable=True)

    division_id = Column(Integer, ForeignKey("divisions.id", ondelete="SET NULL"), nullable=True, index=True)
    designation = Column(String(120), nullable=True)
    department = Column(String(120), nullable=True)
    nationality = Column(String(80), nullable=True)
    gender = Column(String(8), nullable=True)
    mobile_number = Column(String(32), nullable=True)
    joining_date = Column(Date, nullable=True)

    accommodation_required = Column(Boolean, default=True, nullable=False)
    accommodation_type = Column(String(24), nullable=True)

    current_property_id = Column(Integer, ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True)
    current_floor_id = Column(Integer, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    current_room_id = Column(Integer, ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    current_bed_id = Column(Integer, ForeignKey("beds.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(16), default="active", nullable=False, index=True)
    emergency_contact = Column(String(160), nullable=True)
    remarks = Column(Text, nullable=True)

    division = relationship("Division", lazy="joined")
    current_property = relationship("Property", foreign_keys=[current_property_id], lazy="joined")
    current_room = relationship("Room", foreign_keys=[current_room_id], lazy="joined")
    current_bed = relationship("Bed", foreign_keys=[current_bed_id], lazy="joined")

    __table_args__ = (
        Index("ix_employees_status_division", "status", "division_id"),
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        if data.get("joining_date") and not isinstance(data["joining_date"], str):
            data["joining_date"] = data["joining_date"].isoformat()
        data["division"] = {"id": self.division.id, "code": self.division.code, "name": self.division.name} if self.division else None
        if self.current_property:
            data["current_property"] = {"id": self.current_property.id, "code": self.current_property.code, "name": self.current_property.name}
        else:
            data["current_property"] = None
        if self.current_room:
            data["current_room"] = {"id": self.current_room.id, "room_number": self.current_room.room_number}
        else:
            data["current_room"] = None
        if self.current_bed:
            data["current_bed"] = {"id": self.current_bed.id, "bed_code": self.current_bed.bed_code}
        else:
            data["current_bed"] = None
        return data


class ImportBatch(BaseModel):
    __tablename__ = "import_batches"

    module = Column(String(32), nullable=False, index=True)  # "employee"
    filename = Column(String(255), nullable=True)
    total_rows = Column(Integer, default=0, nullable=False)
    success_rows = Column(Integer, default=0, nullable=False)
    error_rows = Column(Integer, default=0, nullable=False)
    status = Column(String(16), default="pending", nullable=False)  # pending, completed, failed
    remarks = Column(Text, nullable=True)

    errors = relationship("ImportError", back_populates="batch", lazy="select", cascade="all, delete-orphan")

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        data["error_count"] = len(self.errors) if self.errors is not None else 0
        return data


class ImportError(BaseModel):
    __tablename__ = "import_errors"

    batch_id = Column(Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)
    errors = Column(Text, nullable=False)  # comma-joined or JSON-encoded
    raw_data = Column(Text, nullable=True)  # JSON dump

    batch = relationship("ImportBatch", back_populates="errors")
