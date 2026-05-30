"""Notifications (Phase 8b).

One row per delivered in-app notification. Email/SSE fan-out is layered
on top via services.notifications and tasks.notifications."""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String

from ..extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Short machine type (e.g. "agreement.expiring", "assignment.created")
    # so the bell can route by type if needed later.
    type = Column(String(64), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    body = Column(String(1000), nullable=True)
    # Optional deep-link the bell turns into a router.push().
    link = Column(String(500), nullable=True)
    is_read = Column(db.Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "title": self.title,
            "body": self.body,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
