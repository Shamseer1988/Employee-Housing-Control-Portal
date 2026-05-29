"""Cookie-based JWT auth (Phase 1).

Login plants two pairs of cookies via Flask-JWT-Extended:
  * access_token_cookie / csrf_access_token  (path = /api/v1)
  * refresh_token_cookie / csrf_refresh_token (path = /api/v1/auth/refresh)

The frontend never sees the JWTs themselves; it reads the csrf_* cookies
(intentionally not httpOnly) and echoes their value as X-CSRF-TOKEN on
mutating requests.

Logout revokes both tokens by jti (JWTBlocklist) and unsets the cookies.
change-password bumps user.token_version, which invalidates every JWT
currently in circulation for that user via the user_lookup_loader."""
from datetime import datetime

from flask import Blueprint, make_response, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt,
    get_jwt_identity,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
    verify_jwt_in_request,
)

from ..extensions import db
from ..models import User, JWTBlocklist
from ..services import audit
from ..utils.auth import login_required, current_user
from ..utils.responses import success_response, error_response

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    identifier = (payload.get("username") or payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not identifier or not password:
        return error_response("username/email and password are required", 400)

    user = User.query.filter(
        (db.func.lower(User.username) == identifier) | (db.func.lower(User.email) == identifier)
    ).first()

    if user is None or not user.check_password(password):
        return error_response("Invalid credentials", 401)
    if not user.is_active:
        return error_response("Account is disabled", 403)

    user.last_login_at = datetime.utcnow()
    audit.record(user=user, action="login", module="auth", entity_type="user", entity_id=user.id)
    db.session.commit()

    access = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))

    resp = make_response(success_response(data={"user": user.to_dict()}, message="Logged in"))
    set_access_cookies(resp, access)
    set_refresh_cookies(resp, refresh)
    return resp


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    user = User.query.get(int(identity)) if identity else None
    if user is None or not user.is_active:
        return error_response("User no longer active", 401)
    access = create_access_token(identity=str(user.id))
    resp = make_response(success_response(data={"user": user.to_dict()}))
    set_access_cookies(resp, access)
    return resp


@auth_bp.post("/logout")
def logout():
    """Revoke whichever tokens the caller presents and unset cookies.

    Not @login_required because we want logout to succeed even if the
    access token is already expired — the refresh cookie still gets
    cleared, and the user lands on the login screen cleanly."""
    user = None
    for token_type in ("access", "refresh"):
        try:
            verify_jwt_in_request(refresh=(token_type == "refresh"), optional=True)
            claims = get_jwt()
            if not claims:
                continue
            jti = claims.get("jti")
            if not jti:
                continue
            if not JWTBlocklist.query.filter_by(jti=jti).first():
                db.session.add(JWTBlocklist(
                    jti=jti,
                    user_id=int(claims.get("sub")) if claims.get("sub") else None,
                    token_type=token_type,
                ))
            if user is None:
                ident = claims.get("sub")
                if ident:
                    user = User.query.get(int(ident))
        except Exception:
            # Token absent / expired / malformed — nothing to revoke for
            # this slot; still clear the cookie below.
            continue

    if user is not None:
        audit.record(user=user, action="logout", module="auth",
                     entity_type="user", entity_id=user.id)
    db.session.commit()

    resp = make_response(success_response(message="Logged out"))
    unset_jwt_cookies(resp)
    return resp


@auth_bp.get("/me")
@login_required
def me():
    return success_response(data=current_user().to_dict())


@auth_bp.post("/change-password")
@login_required
def change_password():
    payload = request.get_json(silent=True) or {}
    old_password = payload.get("old_password") or ""
    new_password = payload.get("new_password") or ""
    if len(new_password) < 8:
        return error_response("New password must be at least 8 characters", 400)
    user = current_user()
    if not user.check_password(old_password):
        return error_response("Current password is incorrect", 400)
    user.set_password(new_password)
    user.token_version = (user.token_version or 0) + 1
    audit.record(user=user, action="change_password", module="auth", entity_type="user", entity_id=user.id)
    db.session.commit()
    # Existing cookies become invalid the moment token_version bumps. We
    # also clear them on this response so the current tab has to re-login.
    resp = make_response(success_response(message="Password updated"))
    unset_jwt_cookies(resp)
    return resp
