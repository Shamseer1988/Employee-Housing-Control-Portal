from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    Date,
    Numeric,
    ForeignKey,
    Text,
    Index,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class Property(BaseModel):
    __tablename__ = "properties"

    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    property_type = Column(String(32), nullable=False)  # full_building, villa, etc.

    building_number = Column(String(64), nullable=True)
    zone = Column(String(64), nullable=True)
    street = Column(String(120), nullable=True)
    area = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True, index=True)
    map_link = Column(Text, nullable=True)
    gps_lat = Column(Numeric(10, 7), nullable=True)
    gps_lng = Column(Numeric(10, 7), nullable=True)

    ownership_type = Column(String(16), default="rented", nullable=False)  # rented, company_owned, temporary
    status = Column(String(16), default="active", nullable=False, index=True)  # active, inactive, maintenance, vacated
    managed_by = Column(String(120), nullable=True)

    default_division_id = Column(Integer, ForeignKey("divisions.id", ondelete="SET NULL"), nullable=True)
    landlord_id = Column(Integer, ForeignKey("landlords.id", ondelete="SET NULL"), nullable=True, index=True)
    multi_division_allowed = Column(Boolean, default=True, nullable=False)

    total_floors = Column(Integer, nullable=True)
    total_rooms = Column(Integer, nullable=True)
    total_bed_capacity = Column(Integer, nullable=True)

    remarks = Column(Text, nullable=True)

    default_division = relationship("Division", lazy="joined")
    landlord = relationship("Landlord", lazy="joined")
    agreements = relationship(
        "PropertyAgreement", back_populates="property", lazy="select", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_properties_status_type", "status", "property_type"),
    )

    def active_agreement(self):
        return next((a for a in self.agreements if a.is_active), None)

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        if self.default_division is not None:
            data["default_division"] = {
                "id": self.default_division.id,
                "code": self.default_division.code,
                "name": self.default_division.name,
            }
        else:
            data["default_division"] = None
        # Decimal serialization
        for k in ("gps_lat", "gps_lng"):
            if data.get(k) is not None:
                data[k] = float(data[k])
        active = self.active_agreement()
        data["active_agreement"] = active.to_dict() if active else None

        if self.landlord is not None:
            data["landlord"] = {
                "id": self.landlord.id,
                "code": self.landlord.code,
                "name": self.landlord.name,
                "mobile": self.landlord.mobile,
                "agreement_start_date": (
                    self.landlord.agreement_start_date.isoformat()
                    if self.landlord.agreement_start_date else None
                ),
                "agreement_expiry_date": (
                    self.landlord.agreement_expiry_date.isoformat()
                    if self.landlord.agreement_expiry_date else None
                ),
                "monthly_rent": (
                    float(self.landlord.monthly_rent)
                    if self.landlord.monthly_rent is not None else None
                ),
            }
        else:
            data["landlord"] = None
        return data


class PropertyAgreement(BaseModel):
    __tablename__ = "property_agreements"

    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    landlord_id = Column(Integer, ForeignKey("landlords.id", ondelete="RESTRICT"), nullable=False, index=True)

    agreement_number = Column(String(64), nullable=True)
    start_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False, index=True)

    monthly_rent = Column(Numeric(12, 2), nullable=True)
    security_deposit = Column(Numeric(12, 2), nullable=True)
    payment_terms = Column(String(120), nullable=True)
    notice_period = Column(String(64), nullable=True)
    renewal_status = Column(String(16), default="pending", nullable=False)

    kahramaa_account = Column(String(64), nullable=True)
    municipality_ref = Column(String(64), nullable=True)

    reminder_days_before_expiry = Column(Integer, default=90, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    remarks = Column(Text, nullable=True)

    property = relationship("Property", back_populates="agreements")
    landlord = relationship("Landlord", lazy="joined")

    __table_args__ = (
        Index("ix_property_agreements_active_expiry", "is_active", "expiry_date"),
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        for k in ("monthly_rent", "security_deposit"):
            if data.get(k) is not None:
                data[k] = float(data[k])
        for k in ("start_date", "expiry_date"):
            if data.get(k) is not None and not isinstance(data[k], str):
                data[k] = data[k].isoformat()
        if self.landlord is not None:
            data["landlord"] = {
                "id": self.landlord.id,
                "code": self.landlord.code,
                "name": self.landlord.name,
            }
        return data
