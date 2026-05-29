"""Landlord route schemas (Phase 4)."""
from apiflask import Schema
from apiflask.fields import Date, Float, Integer, String
from apiflask.validators import Length


class LandlordIn(Schema):
    """POST /landlords — only name is required."""
    name = String(required=True, validate=Length(min=1, max=120))
    code = String(required=False)
    qid_cr_number = String(required=False)
    mobile = String(required=False)
    email = String(required=False)
    address = String(required=False)
    contact_person = String(required=False)
    agreement_start_date = Date(required=False, allow_none=True)
    agreement_expiry_date = Date(required=False, allow_none=True)
    monthly_rent = Float(required=False, allow_none=True)
    reminder_days_before_expiry = Integer(required=False, load_default=90)
    bank_name = String(required=False)
    iban = String(required=False)
    status = String(required=False)
    remarks = String(required=False)


class LandlordUpdateIn(Schema):
    """PUT /landlords/<id> — all fields optional."""
    name = String(required=False, validate=Length(min=1, max=120))
    qid_cr_number = String(required=False, allow_none=True)
    mobile = String(required=False, allow_none=True)
    email = String(required=False, allow_none=True)
    address = String(required=False, allow_none=True)
    contact_person = String(required=False, allow_none=True)
    agreement_start_date = Date(required=False, allow_none=True)
    agreement_expiry_date = Date(required=False, allow_none=True)
    monthly_rent = Float(required=False, allow_none=True)
    reminder_days_before_expiry = Integer(required=False)
    bank_name = String(required=False, allow_none=True)
    iban = String(required=False, allow_none=True)
    status = String(required=False)
    remarks = String(required=False, allow_none=True)


class LandlordOut(Schema):
    id = Integer()
    code = String()
    name = String()
    qid_cr_number = String(allow_none=True)
    mobile = String(allow_none=True)
    email = String(allow_none=True)
    address = String(allow_none=True)
    contact_person = String(allow_none=True)
    agreement_start_date = Date(allow_none=True)
    agreement_expiry_date = Date(allow_none=True)
    monthly_rent = Float(allow_none=True)
    reminder_days_before_expiry = Integer(allow_none=True)
    status = String(allow_none=True)
