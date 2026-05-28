from datetime import date, timedelta

from ..models import Landlord, PropertyAgreement

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
    """Legacy property-agreement table — kept so old transactions still work."""
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
    """Bucket counts driven by landlord-level agreement dates (the simplified
    flow). Falls back to PropertyAgreement rows for any landlord that has
    no direct date set."""
    today = today or date.today()
    counts = {"expired": 0, "7": 0, "15": 0, "30": 0, "60": 0, "90": 0, "safe": 0}
    seen_landlord_ids: set[int] = set()
    for l in Landlord.query.filter(
        Landlord.agreement_expiry_date.isnot(None),
        Landlord.status == "active",
    ).all():
        counts[agreement_bucket(l.agreement_expiry_date, today)] += 1
        seen_landlord_ids.add(l.id)

    for a in PropertyAgreement.query.filter(PropertyAgreement.is_active.is_(True)).all():
        if a.landlord_id in seen_landlord_ids:
            continue
        counts[agreement_bucket(a.expiry_date, today)] += 1
    return counts
