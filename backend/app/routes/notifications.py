"""Notification feed routes (Phase 8b)."""
from flask import Blueprint, request

from ..extensions import db
from ..models import Notification
from ..utils.auth import login_required, current_user
from ..utils.responses import success_response, error_response

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("")
@login_required
def list_feed():
    """Paged feed of the caller's notifications (newest first).

    ?unread_only=1 narrows to unread. ?limit=N (max 100) caps the page."""
    user = current_user()
    only_unread = (request.args.get("unread_only") or "").lower() in ("1", "true", "yes")
    limit = min(request.args.get("limit", default=50, type=int), 100)

    q = Notification.query.filter_by(user_id=user.id)
    if only_unread:
        q = q.filter_by(is_read=False)
    rows = q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return success_response(
        data=[r.to_dict() for r in rows],
        meta={"count": len(rows), "unread": unread, "limit": limit},
    )


@notifications_bp.get("/unread-count")
@login_required
def unread_count():
    user = current_user()
    n = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return success_response(data={"unread": n})


@notifications_bp.post("/<int:notif_id>/read")
@login_required
def mark_read(notif_id: int):
    user = current_user()
    n = Notification.query.filter_by(id=notif_id, user_id=user.id).first()
    if n is None:
        return error_response("Notification not found", 404)
    if not n.is_read:
        n.is_read = True
        db.session.commit()
    return success_response(data=n.to_dict())


@notifications_bp.post("/read-all")
@login_required
def mark_all_read():
    user = current_user()
    updated = (
        Notification.query
        .filter_by(user_id=user.id, is_read=False)
        .update({"is_read": True}, synchronize_session=False)
    )
    db.session.commit()
    return success_response(data={"marked": updated})
