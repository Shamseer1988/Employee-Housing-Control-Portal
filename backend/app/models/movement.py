from datetime import date, datetime
from sqlalchemy import Column, String, Integer, Date, Text, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


TRANSFER_REASONS = {"room_change", "bed_change", "property_change", "request", "other"}
CANCELLATION_REASONS = {"resigned", "terminated", "visa_cancelled", "shifted_outside", "vacation", "other"}
VACATION_STATUSES = {"on_vacation", "returned", "cancelled"}


class AccommodationTransfer(BaseModel):
    __tablename__ = "accommodation_transfers"

    transaction_number = Column(String(40), unique=True, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True)

    from_assignment_id = Column(Integer, ForeignKey("accommodation_assignments.id", ondelete="RESTRICT"), nullable=False)
    to_assignment_id = Column(Integer, ForeignKey("accommodation_assignments.id", ondelete="RESTRICT"), nullable=False)

    from_bed_id = Column(Integer, ForeignKey("beds.id", ondelete="RESTRICT"), nullable=False)
    to_bed_id = Column(Integer, ForeignKey("beds.id", ondelete="RESTRICT"), nullable=False)

    transfer_date = Column(Date, nullable=False, default=date.today)
    reason = Column(String(40), nullable=True)
    approved_by = Column(Integer, nullable=True)
    remarks = Column(Text, nullable=True)

    employee = relationship("Employee", lazy="joined")
    from_bed = relationship("Bed", foreign_keys=[from_bed_id], lazy="joined")
    to_bed = relationship("Bed", foreign_keys=[to_bed_id], lazy="joined")
    from_assignment = relationship(
        "AccommodationAssignment", foreign_keys=[from_assignment_id], lazy="joined"
    )
    to_assignment = relationship(
        "AccommodationAssignment", foreign_keys=[to_assignment_id], lazy="joined"
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        if data.get("transfer_date") and not isinstance(data["transfer_date"], str):
            data["transfer_date"] = data["transfer_date"].isoformat()
        data["employee"] = {
            "id": self.employee.id, "code": self.employee.code, "full_name": self.employee.full_name,
        } if self.employee else None
        data["from_bed"] = {"id": self.from_bed.id, "bed_code": self.from_bed.bed_code} if self.from_bed else None
        data["to_bed"] = {"id": self.to_bed.id, "bed_code": self.to_bed.bed_code} if self.to_bed else None
        return data


class AccommodationCancellation(BaseModel):
    __tablename__ = "accommodation_cancellations"

    transaction_number = Column(String(40), unique=True, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("accommodation_assignments.id", ondelete="RESTRICT"), nullable=False)
    bed_id = Column(Integer, ForeignKey("beds.id", ondelete="RESTRICT"), nullable=False)

    cancellation_date = Column(Date, nullable=False, default=date.today)
    reason = Column(String(32), nullable=False)
    new_employee_status = Column(String(16), nullable=True)
    approved_by = Column(Integer, nullable=True)
    remarks = Column(Text, nullable=True)

    employee = relationship("Employee", lazy="joined")
    bed = relationship("Bed", lazy="joined")
    assignment = relationship("AccommodationAssignment", lazy="joined")

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        if data.get("cancellation_date") and not isinstance(data["cancellation_date"], str):
            data["cancellation_date"] = data["cancellation_date"].isoformat()
        data["employee"] = {
            "id": self.employee.id, "code": self.employee.code, "full_name": self.employee.full_name,
        } if self.employee else None
        data["bed"] = {"id": self.bed.id, "bed_code": self.bed.bed_code} if self.bed else None
        return data


class EmployeeVacation(BaseModel):
    __tablename__ = "employee_vacations"

    transaction_number = Column(String(40), unique=True, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("accommodation_assignments.id", ondelete="SET NULL"), nullable=True)
    bed_id = Column(Integer, ForeignKey("beds.id", ondelete="SET NULL"), nullable=True)

    vacation_start_date = Column(Date, nullable=False)
    vacation_end_date = Column(Date, nullable=True)
    keep_bed_reserved = Column(Boolean, default=False, nullable=False)

    return_date = Column(Date, nullable=True)
    status = Column(String(16), default="on_vacation", nullable=False, index=True)
    remarks = Column(Text, nullable=True)

    employee = relationship("Employee", lazy="joined")
    bed = relationship("Bed", lazy="joined")
    assignment = relationship("AccommodationAssignment", lazy="joined")

    __table_args__ = (
        Index("ix_vacations_employee_status", "employee_id", "status"),
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        for k in ("vacation_start_date", "vacation_end_date", "return_date"):
            if data.get(k) and not isinstance(data[k], str):
                data[k] = data[k].isoformat()
        data["employee"] = {
            "id": self.employee.id, "code": self.employee.code, "full_name": self.employee.full_name,
        } if self.employee else None
        data["bed"] = {"id": self.bed.id, "bed_code": self.bed.bed_code} if self.bed else None
        return data


def generate_txn_number(prefix: str) -> str:
    from ..extensions import db

    today = datetime.utcnow().date()
    month_key = today.strftime("%Y%m")
    like = f"{prefix}-{month_key}-%"
    model_map = {
        "TRANS": AccommodationTransfer,
        "CANCEL": AccommodationCancellation,
        "VAC": EmployeeVacation,
    }
    model = model_map[prefix]
    last = (
        db.session.query(model.transaction_number)
        .filter(model.transaction_number.like(like))
        .order_by(model.transaction_number.desc())
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
