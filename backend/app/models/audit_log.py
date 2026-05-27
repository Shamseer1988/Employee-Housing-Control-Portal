from sqlalchemy import Column, String, Integer, Text, Index
from sqlalchemy.dialects.postgresql import JSONB

from ..extensions import db
from .base import BaseModel


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"

    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(64), nullable=True)
    action = Column(String(32), nullable=False, index=True)  # create, update, delete, login, logout, approve, etc.
    module = Column(String(48), nullable=False, index=True)
    entity_type = Column(String(48), nullable=True)
    entity_id = Column(String(64), nullable=True, index=True)
    old_value = Column(db.JSON().with_variant(JSONB, "postgresql"), nullable=True)
    new_value = Column(db.JSON().with_variant(JSONB, "postgresql"), nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    remarks = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_audit_logs_module_action", "module", "action"),
    )
