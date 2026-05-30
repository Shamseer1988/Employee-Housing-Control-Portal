from sqlalchemy import Column, String, Text, Date, Numeric, Integer

from .base import BaseModel


class Landlord(BaseModel):
    __tablename__ = "landlords"

    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False, index=True)
    qid_cr_number = Column(String(64), nullable=True)
    mobile = Column(String(32), nullable=True)
    email = Column(String(120), nullable=True)
    address = Column(Text, nullable=True)
    contact_person = Column(String(120), nullable=True)

    # Deprecated — retained as nullable columns for backwards compatibility,
    # hidden in the UI. New flows put the agreement directly on the landlord.
    bank_name = Column(String(120), nullable=True)
    iban = Column(String(64), nullable=True)

    # Simplified agreement model: one landlord = one current agreement.
    agreement_start_date = Column(Date, nullable=True)
    agreement_expiry_date = Column(Date, nullable=True, index=True)
    monthly_rent = Column(Numeric(12, 2), nullable=True)
    reminder_days_before_expiry = Column(Integer, default=90, nullable=False)

    status = Column(String(16), default="active", nullable=False, index=True)
    remarks = Column(Text, nullable=True)

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        for k in ("agreement_start_date", "agreement_expiry_date"):
            if data.get(k) and not isinstance(data[k], str):
                data[k] = data[k].isoformat()
        if data.get("monthly_rent") is not None:
            data["monthly_rent"] = float(data["monthly_rent"])
        return data
