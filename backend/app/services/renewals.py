from datetime import date, datetime

from ..extensions import db
from ..models import (
    Property, Landlord, PropertyAgreement, LandlordRenewal,
)
from ..models.renewal_maintenance import generate_renewal_or_maintenance_number


class RenewalError(ValueError):
    pass


def _parse_date(value, fallback: date | None = None) -> date | None:
    if value is None or value == "":
        return fallback
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(str(value)).date()


def post_renewal(
    *,
    property_id: int,
    landlord_id: int,
    new_start_date,
    new_expiry_date,
    new_monthly_rent=None,
    agreement_number: str | None = None,
    payment_terms: str | None = None,
    notice_period: str | None = None,
    reminder_days_before_expiry: int = 90,
    security_deposit=None,
    kahramaa_account: str | None = None,
    municipality_ref: str | None = None,
    remarks: str | None = None,
    approved_by: int | None = None,
    actor_id: int,
) -> LandlordRenewal:
    """Post a landlord agreement renewal.

    Archives any existing active agreement for the property and posts a new
    active agreement. Captures the renewal as a tracked transaction linking
    the old and new agreement rows.
    """
    prop = Property.query.get(property_id)
    if prop is None:
        raise RenewalError("Property not found")
    landlord = Landlord.query.get(landlord_id)
    if landlord is None:
        raise RenewalError("Landlord not found")

    start = _parse_date(new_start_date)
    expiry = _parse_date(new_expiry_date)
    if not start or not expiry:
        raise RenewalError("new_start_date and new_expiry_date are required")
    if expiry < start:
        raise RenewalError("new_expiry_date must be on or after new_start_date")

    # Archive any active agreement(s) for this property
    previous = (
        PropertyAgreement.query
        .filter_by(property_id=prop.id, is_active=True)
        .all()
    )
    old_agreement = previous[0] if previous else None
    for p in previous:
        p.is_active = False
        p.renewal_status = "renewed"
        p.updated_by = actor_id

    new_agreement = PropertyAgreement(
        property_id=prop.id,
        landlord_id=landlord.id,
        agreement_number=agreement_number,
        start_date=start,
        expiry_date=expiry,
        monthly_rent=new_monthly_rent,
        security_deposit=security_deposit,
        payment_terms=payment_terms,
        notice_period=notice_period,
        renewal_status="pending",
        kahramaa_account=kahramaa_account,
        municipality_ref=municipality_ref,
        reminder_days_before_expiry=int(reminder_days_before_expiry or 90),
        is_active=True,
        remarks=remarks,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(new_agreement)
    db.session.flush()

    renewal = LandlordRenewal(
        transaction_number=generate_renewal_or_maintenance_number("LRENEW"),
        property_id=prop.id,
        landlord_id=landlord.id,
        old_agreement_id=old_agreement.id if old_agreement else None,
        new_agreement_id=new_agreement.id,
        renewal_date=date.today(),
        old_expiry_date=old_agreement.expiry_date if old_agreement else None,
        new_start_date=start,
        new_expiry_date=expiry,
        old_monthly_rent=old_agreement.monthly_rent if old_agreement else None,
        new_monthly_rent=new_monthly_rent,
        remarks=remarks,
        approved_by=approved_by,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(renewal)
    db.session.flush()
    return renewal
