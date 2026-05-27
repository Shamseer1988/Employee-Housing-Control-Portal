from sqlalchemy import Column, String, Integer, Text, Index

from .base import BaseModel


class Attachment(BaseModel):
    __tablename__ = "attachments"

    entity_type = Column(String(48), nullable=False, index=True)
    entity_id = Column(String(64), nullable=False, index=True)
    category = Column(String(48), nullable=True)  # e.g. agreement, qid, passport
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    mime_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    path = Column(Text, nullable=False)
    remarks = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_attachments_entity", "entity_type", "entity_id"),
    )
