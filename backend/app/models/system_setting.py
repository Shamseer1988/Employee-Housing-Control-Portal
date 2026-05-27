from sqlalchemy import Column, String, Text, Index
from sqlalchemy.dialects.postgresql import JSONB

from ..extensions import db
from .base import BaseModel


class SystemSetting(BaseModel):
    """Key/value system settings. Values are stored as JSON to allow scalars,
    objects and lists without a schema change per-setting."""
    __tablename__ = "system_settings"

    key = Column(String(80), unique=True, nullable=False, index=True)
    value = Column(db.JSON().with_variant(JSONB, "postgresql"), nullable=True)
    category = Column(String(48), nullable=True, index=True)
    description = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_system_settings_category_key", "category", "key"),
    )
