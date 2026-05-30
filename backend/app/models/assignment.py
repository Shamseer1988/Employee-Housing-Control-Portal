from datetime import datetime, date
from sqlalchemy import Column, String, Integer, Date, Text, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


ASSIGNMENT_STATUSES = {"active", "cancelled", "transferred"}


class AccommodationAssignment(BaseModel):
    __tablename__ = "accommodation_assignments"

    transaction_number = Column(String(40), unique=True, nullable=False, index=True)

    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="RESTRICT"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="RESTRICT"), nullable=False, index=True)
    bed_id = Column(Integer, ForeignKey("beds.id", ondelete="RESTRICT"), nullable=False, index=True)

    assignment_date = Column(Date, nullable=False, default=date.today)
    expected_stay_period = Column(String(64), nullable=True)
    reason = Column(String(120), nullable=True)
    approved_by = Column(Integer, nullable=True)

    status = Column(String(16), default="active", nullable=False, index=True)
    cancelled_at = Column(Date, nullable=True)
    cancellation_reason = Column(String(120), nullable=True)
    closing_remarks = Column(Text, nullable=True)

    remarks = Column(Text, nullable=True)

    employee = relationship("Employee", lazy="joined")
    property = relationship("Property", lazy="joined")
    room = relationship("Room", lazy="joined")
    bed = relationship("Bed", lazy="joined")

    __table_args__ = (
        Index("ix_assignments_employee_status", "employee_id", "status"),
        Index("ix_assignments_bed_status", "bed_id", "status"),
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        for k in ("assignment_date", "cancelled_at"):
            if data.get(k) and not isinstance(data[k], str):
                data[k] = data[k].isoformat()
        data["employee"] = {
            "id": self.employee.id, "code": self.employee.code,
            "full_name": self.employee.full_name, "qid_number": self.employee.qid_number,
        } if self.employee else None
        data["property"] = {
            "id": self.property.id, "code": self.property.code, "name": self.property.name,
        } if self.property else None
        data["room"] = {
            "id": self.room.id, "room_number": self.room.room_number,
        } if self.room else None
        data["bed"] = {
            "id": self.bed.id, "bed_code": self.bed.bed_code, "status": self.bed.status,
        } if self.bed else None
        return data


def generate_transaction_number(prefix: str = "ASSIGN") -> str:
    """ASSIGN-YYYYMM-NNNN. Must be called inside an active DB session."""
    from ..extensions import db

    today = datetime.utcnow().date()
    month_key = today.strftime("%Y%m")
    like = f"{prefix}-{month_key}-%"
    last = (
        db.session.query(AccommodationAssignment.transaction_number)
        .filter(AccommodationAssignment.transaction_number.like(like))
        .order_by(AccommodationAssignment.transaction_number.desc())
        .limit(1)
        .scalar()
    )
    if last:
        try:
            seq = int(last.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}-{month_key}-{seq:04d}"
