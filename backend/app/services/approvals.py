"""Approval workflow service.

Approvals are a thin layer over the existing transactions:
  - The transaction is created with ``status="pending_approval"`` and side
    effects (bed/employee/agreement updates) are deferred.
  - An ``ApprovalRequest`` row tracks who requested what.
  - On ``approve()`` the module-specific finalize_* helper runs the deferred
    side effects, exactly the same logic the synchronous path executes.
  - On ``reject()`` the transaction is marked ``status="rejected"`` and no
    state on the bed / employee / agreement changes.
"""
from __future__ import annotations

from datetime import date, datetime

from ..extensions import db
from ..models import (
    AccommodationAssignment, AccommodationTransfer, AccommodationCancellation,
    ApprovalRequest, LandlordRenewal,
)
from ..models.approval import APPROVAL_MODULES


class ApprovalError(ValueError):
    pass


# ----------------------------------------------------------------------
# Transaction-number generator (APPR-YYYYMM-NNNN)
# ----------------------------------------------------------------------

def _next_request_number() -> str:
    today = datetime.utcnow().date()
    month_key = today.strftime("%Y%m")
    like = f"APPR-{month_key}-%"
    last = (
        db.session.query(ApprovalRequest.transaction_number)
        .filter(ApprovalRequest.transaction_number.like(like))
        .order_by(ApprovalRequest.transaction_number.desc())
        .limit(1)
        .scalar()
    )
    seq = 1
    if last:
        try:
            seq = int(last.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            seq = 1
    return f"APPR-{month_key}-{seq:04d}"


_ENTITY_TYPE_BY_MODULE = {
    "assignment":   "accommodation_assignment",
    "transfer":     "accommodation_transfer",
    "cancellation": "accommodation_cancellation",
    "renewal":      "landlord_renewal",
}

_MODEL_BY_MODULE = {
    "assignment":   AccommodationAssignment,
    "transfer":     AccommodationTransfer,
    "cancellation": AccommodationCancellation,
    "renewal":      LandlordRenewal,
}


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

def create_request(*, module: str, entity, actor_id: int, summary: str | None = None) -> ApprovalRequest:
    if module not in APPROVAL_MODULES:
        raise ApprovalError(f"Unsupported module: {module}")
    req = ApprovalRequest(
        transaction_number=_next_request_number(),
        module=module,
        entity_type=_ENTITY_TYPE_BY_MODULE[module],
        entity_id=entity.id,
        entity_reference=getattr(entity, "transaction_number", None),
        requested_by=actor_id,
        status="pending",
        summary=summary,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(req)
    db.session.flush()
    return req


def list_requests(*, status: str | None = None, module: str | None = None) -> list[ApprovalRequest]:
    q = ApprovalRequest.query
    if status:
        q = q.filter_by(status=status)
    if module:
        q = q.filter_by(module=module)
    return q.order_by(ApprovalRequest.id.desc()).limit(500).all()


def approve(*, request_id: int, actor_id: int, remarks: str | None = None) -> ApprovalRequest:
    req = ApprovalRequest.query.get(request_id)
    if req is None:
        raise ApprovalError("Approval request not found")
    if req.status != "pending":
        raise ApprovalError(f"Request is already {req.status}")

    model = _MODEL_BY_MODULE.get(req.module)
    if model is None:
        raise ApprovalError(f"Unsupported module: {req.module}")
    record = model.query.get(req.entity_id)
    if record is None:
        raise ApprovalError("Underlying record is missing")

    # Dispatch to the module-specific finalizer (imported lazily to avoid
    # circular imports between approvals.py and the transaction services).
    if req.module == "assignment":
        from . import assignments as svc
        svc.finalize_pending_assignment(record, actor_id=actor_id)
    elif req.module == "transfer":
        from . import movements as svc
        svc.finalize_pending_transfer(record, actor_id=actor_id)
    elif req.module == "cancellation":
        from . import movements as svc
        svc.finalize_pending_cancellation(record, actor_id=actor_id)
    elif req.module == "renewal":
        from . import renewals as svc
        svc.finalize_pending_renewal(record, actor_id=actor_id)

    req.status = "approved"
    req.decided_by = actor_id
    req.decided_at = datetime.utcnow()
    req.decision_remarks = remarks
    db.session.flush()
    return req


def reject(*, request_id: int, actor_id: int, remarks: str | None = None) -> ApprovalRequest:
    req = ApprovalRequest.query.get(request_id)
    if req is None:
        raise ApprovalError("Approval request not found")
    if req.status != "pending":
        raise ApprovalError(f"Request is already {req.status}")

    model = _MODEL_BY_MODULE.get(req.module)
    record = model.query.get(req.entity_id) if model is not None else None
    if record is not None:
        record.status = "rejected"
        if hasattr(record, "updated_by"):
            record.updated_by = actor_id

    req.status = "rejected"
    req.decided_by = actor_id
    req.decided_at = datetime.utcnow()
    req.decision_remarks = remarks
    db.session.flush()
    return req


def pending_counts() -> dict:
    """Per-module counts of pending requests for dashboard/alert center."""
    from sqlalchemy import func as f
    rows = (
        db.session.query(ApprovalRequest.module, f.count(ApprovalRequest.id))
        .filter(ApprovalRequest.status == "pending")
        .group_by(ApprovalRequest.module)
        .all()
    )
    out = {m: 0 for m in APPROVAL_MODULES}
    out["total"] = 0
    for m, n in rows:
        out[m] = int(n)
        out["total"] += int(n)
    return out
