"""Employee route schemas (Phase 4)."""
from apiflask import Schema
from apiflask.fields import Boolean, Date, Integer, String
from apiflask.validators import Length, OneOf

from ..models.employee import EMPLOYEE_STATUSES, ACCOMMODATION_TYPES, GENDERS


class EmployeeIn(Schema):
    """POST /employees — only full_name is required; everything else is
    an optional refinement."""
    full_name = String(required=True, validate=Length(min=1, max=120))
    code = String(required=False)
    qid_number = String(required=False)
    passport_number = String(required=False)
    visa_company = String(required=False)
    division_id = Integer(required=False, allow_none=True)
    designation = String(required=False)
    department = String(required=False)
    nationality = String(required=False)
    gender = String(required=False, validate=OneOf(sorted(GENDERS)))
    mobile_number = String(required=False)
    joining_date = Date(required=False, allow_none=True)
    accommodation_required = Boolean(required=False)
    accommodation_type = String(required=False, validate=OneOf(sorted(ACCOMMODATION_TYPES)))
    status = String(required=False, validate=OneOf(sorted(EMPLOYEE_STATUSES)))
    emergency_contact = String(required=False)
    remarks = String(required=False)


class EmployeeUpdateIn(Schema):
    """PUT /employees/<id> — all fields optional (partial update)."""
    full_name = String(required=False, validate=Length(min=1, max=120))
    qid_number = String(required=False, allow_none=True)
    passport_number = String(required=False, allow_none=True)
    visa_company = String(required=False, allow_none=True)
    division_id = Integer(required=False, allow_none=True)
    designation = String(required=False, allow_none=True)
    department = String(required=False, allow_none=True)
    nationality = String(required=False, allow_none=True)
    gender = String(required=False, allow_none=True, validate=OneOf(sorted(GENDERS) + [""]))
    mobile_number = String(required=False, allow_none=True)
    joining_date = Date(required=False, allow_none=True)
    accommodation_required = Boolean(required=False)
    accommodation_type = String(
        required=False, allow_none=True,
        validate=OneOf(sorted(ACCOMMODATION_TYPES) + [""]),
    )
    status = String(required=False, validate=OneOf(sorted(EMPLOYEE_STATUSES)))
    emergency_contact = String(required=False, allow_none=True)
    remarks = String(required=False, allow_none=True)


class EmployeeOut(Schema):
    id = Integer()
    code = String()
    full_name = String()
    qid_number = String(allow_none=True)
    passport_number = String(allow_none=True)
    visa_company = String(allow_none=True)
    division_id = Integer(allow_none=True)
    designation = String(allow_none=True)
    department = String(allow_none=True)
    nationality = String(allow_none=True)
    gender = String(allow_none=True)
    mobile_number = String(allow_none=True)
    joining_date = Date(allow_none=True)
    accommodation_required = Boolean()
    accommodation_type = String(allow_none=True)
    status = String()
    emergency_contact = String(allow_none=True)
    remarks = String(allow_none=True)


class EmployeeListQuery(Schema):
    q = String(required=False)
    status = String(required=False, validate=OneOf(sorted(EMPLOYEE_STATUSES)))
    division_id = Integer(required=False)
    accommodation = String(required=False, validate=OneOf(["yes", "no"]))
