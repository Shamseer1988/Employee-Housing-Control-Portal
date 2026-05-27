from sqlalchemy import Column, String, Text

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
    bank_name = Column(String(120), nullable=True)
    iban = Column(String(64), nullable=True)
    status = Column(String(16), default="active", nullable=False, index=True)
    remarks = Column(Text, nullable=True)
