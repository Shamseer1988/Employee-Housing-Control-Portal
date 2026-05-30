"""Auth route schemas (Phase 4)."""
from apiflask import Schema
from apiflask.fields import Boolean, Email, Integer, List, Nested, String
from apiflask.validators import Length


class LoginIn(Schema):
    # Accept either username or email — the route lower-cases and looks
    # up both. Validation here just requires at least one to be present.
    username = String(required=False, load_default=None)
    email = String(required=False, load_default=None)
    password = String(required=True, validate=Length(min=1))


class ChangePasswordIn(Schema):
    old_password = String(required=True)
    new_password = String(required=True, validate=Length(min=8))


class _RoleOut(Schema):
    id = Integer()
    code = String()
    name = String()


class UserOut(Schema):
    id = Integer()
    username = String()
    email = Email()
    full_name = String()
    is_active = Boolean()
    is_super_user = Boolean()
    roles = List(Nested(_RoleOut))
    permissions = List(String())


class LoginOut(Schema):
    """Login body returns ONLY the user — JWTs ride in cookies."""
    user = Nested(UserOut)
