from datetime import datetime
from sqlalchemy import Column, DateTime, Integer
from sqlalchemy.orm import declared_attr

from ..extensions import db


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @declared_attr
    def created_by(cls):
        return Column(Integer, nullable=True)

    @declared_attr
    def updated_by(cls):
        return Column(Integer, nullable=True)


class BaseModel(db.Model, TimestampMixin):
    __abstract__ = True
    id = Column(Integer, primary_key=True)

    def to_dict(self, exclude: set[str] | None = None) -> dict:
        exclude = exclude or set()
        out = {}
        for col in self.__table__.columns:
            if col.name in exclude:
                continue
            val = getattr(self, col.name)
            if isinstance(val, datetime):
                val = val.isoformat()
            out[col.name] = val
        return out
