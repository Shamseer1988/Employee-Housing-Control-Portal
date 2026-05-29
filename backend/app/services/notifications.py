"""Notification service (Phase 8b).

create_for() is the single insertion point — every other module
(assignments, renewals, maintenance, expiry tasks) routes through it
when they want to drop something into a user's bell. Keeping it in one
place means email/SSE fan-out can be added later without touching the
callers."""
from typing import Iterable

from ..extensions import db
from ..models import Notification, User


def create_for(
    *,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id, type=type, title=title, body=body, link=link,
    )
    db.session.add(n)
    db.session.flush()
    return n


def broadcast(
    *,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    only_role_codes: Iterable[str] | None = None,
) -> int:
    """Send the same notification to every active user (optionally
    restricted to users with one of `only_role_codes`). Returns the
    number of rows inserted."""
    q = User.query.filter(User.is_active.is_(True))
    if only_role_codes:
        codes = set(only_role_codes)
        users = [u for u in q.all() if any(r.code in codes for r in u.roles)]
    else:
        users = q.all()
    for u in users:
        db.session.add(Notification(user_id=u.id, type=type, title=title,
                                    body=body, link=link))
    db.session.flush()
    return len(users)
