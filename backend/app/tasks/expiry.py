"""Daily expiry sweep (Phase 5).

Flips renewal_status to 'expired' on any active PropertyAgreement
whose expiry_date is in the past. Idempotent: re-running the task
on the same data produces no new updates."""
import json
from datetime import date

from ..celery_app import celery
from ..extensions import db
from ..models import PropertyAgreement
from . import jobrun


@celery.task(name="app.tasks.expiry.daily_expiry_sweep")
def daily_expiry_sweep(today_iso: str | None = None):
    today = date.fromisoformat(today_iso) if today_iso else date.today()
    with jobrun("daily_expiry_sweep", {"today": today.isoformat()}) as run:
        rows = (
            PropertyAgreement.query
            .filter(PropertyAgreement.is_active.is_(True))
            .filter(PropertyAgreement.expiry_date < today)
            .filter(PropertyAgreement.renewal_status != "expired")
            .all()
        )
        flipped: list[int] = []
        for a in rows:
            a.renewal_status = "expired"
            flipped.append(a.id)
        if flipped:
            db.session.commit()
        result = {
            "today": today.isoformat(),
            "expired_count": len(flipped),
            "agreement_ids": flipped,
        }
        run.result = json.dumps(result)
        return result
