from datetime import date, timedelta

from ..models import PropertyAgreement

DEFAULT_BUCKETS = (90, 60, 30, 15, 7)


def agreement_bucket(expiry: date, today: date | None = None) -> str:
    """Categorize an agreement by how soon it expires.

    Returns one of: 'expired', '7', '15', '30', '60', '90', 'safe'.
    """
    today = today or date.today()
    if expiry < today:
        return "expired"
    days = (expiry - today).days
    for b in (7, 15, 30, 60, 90):
        if days <= b:
            return str(b)
    return "safe"


def expiring_agreements(within_days: int = 90, today: date | None = None) -> list[PropertyAgreement]:
    today = today or date.today()
    cutoff = today + timedelta(days=within_days)
    return (
        PropertyAgreement.query
        .filter(PropertyAgreement.is_active.is_(True))
        .filter(PropertyAgreement.expiry_date <= cutoff)
        .order_by(PropertyAgreement.expiry_date.asc())
        .all()
    )


def reminder_summary(today: date | None = None) -> dict:
    """Bucket counts of all active property agreements."""
    today = today or date.today()
    counts = {"expired": 0, "7": 0, "15": 0, "30": 0, "60": 0, "90": 0, "safe": 0}
    for a in PropertyAgreement.query.filter(PropertyAgreement.is_active.is_(True)).all():
        counts[agreement_bucket(a.expiry_date, today)] += 1
    return counts
