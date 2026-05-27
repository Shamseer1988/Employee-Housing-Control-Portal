from functools import wraps
from flask import g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from ..models import User
from .responses import error_response


def _load_user() -> User | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    user = User.query.get(int(identity))
    if user is None or not user.is_active:
        return None
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = _load_user()
        if user is None:
            return error_response("User no longer active", 401)
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def require_permission(*codes: str):
    """Require all listed permission codes. Super users always pass."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = _load_user()
            if user is None:
                return error_response("User no longer active", 401)
            if not user.is_super_user:
                missing = [c for c in codes if not user.has_permission(c)]
                if missing:
                    return error_response(
                        "Insufficient permissions",
                        403,
                        f"Missing: {', '.join(missing)}",
                    )
            g.current_user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def current_user() -> User | None:
    return getattr(g, "current_user", None)
