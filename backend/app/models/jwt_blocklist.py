"""Persistent JWT revocation list. Each row pins a single token jti as
revoked (set on logout); see app/__init__.py token_in_blocklist_loader."""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer

from ..extensions import db


class JWTBlocklist(db.Model):
    __tablename__ = "jwt_blocklist"

    id = Column(Integer, primary_key=True)
    jti = Column(String(36), unique=True, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    token_type = Column(String(16), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
