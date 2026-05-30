from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, Index

from .base import BaseModel


APPROVAL_STATUSES = {"pending", "approved", "rejected"}

# Modules that participate in the approval workflow. Each entry maps to a
# transaction model and its `status` column. The values match the `module`
# column on the ApprovalRequest row.
APPROVAL_MODULES = {"assignment", "transfer", "cancellation", "renewal"}


class ApprovalRequest(BaseModel):
    __tablename__ = "approval_requests"

    transaction_number = Column(String(40), unique=True, nullable=False, index=True)

    module = Column(String(24), nullable=False, index=True)  # one of APPROVAL_MODULES
    entity_type = Column(String(48), nullable=False)         # accommodation_assignment, …
    entity_id = Column(Integer, nullable=False, index=True)
    entity_reference = Column(String(40), nullable=True)     # the txn number of the underlying record

    requested_by = Column(Integer, nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    status = Column(String(16), default="pending", nullable=False, index=True)
    decided_by = Column(Integer, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_remarks = Column(Text, nullable=True)

    summary = Column(Text, nullable=True)  # human-readable description
    remarks = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_approval_requests_module_status", "module", "status"),
        Index("ix_approval_requests_entity", "entity_type", "entity_id"),
    )

    def to_dict(self, exclude=None):
        data = super().to_dict(exclude=exclude)
        for k in ("requested_at", "decided_at"):
            if data.get(k) and not isinstance(data[k], str):
                data[k] = data[k].isoformat()
        return data
