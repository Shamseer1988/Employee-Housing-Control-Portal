from sqlalchemy import Column, String, Integer, Text, Index

from .base import BaseModel


class Division(BaseModel):
    __tablename__ = "divisions"

    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    company_name = Column(String(120), nullable=True)
    cr_number = Column(String(64), nullable=True)
    division_type = Column(String(32), nullable=True)
    location = Column(String(120), nullable=True)
    branch_count = Column(Integer, nullable=True)
    staff_count = Column(Integer, nullable=True)
    manager = Column(String(120), nullable=True)
    hr_responsible = Column(String(120), nullable=True)
    cost_center_code = Column(String(64), nullable=True)
    contact_number = Column(String(32), nullable=True)
    email = Column(String(120), nullable=True)
    status = Column(String(16), default="active", nullable=False, index=True)
    remarks = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_divisions_status_company", "status", "company_name"),
    )
