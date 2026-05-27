from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)

from ..extensions import db
from ..models import User
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

    claims = {"username": user.username, "is_super_user": user.is_super_user}
    access = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh = create_refresh_token(identity=str(user.id))

    return success_response(
        data={"access_token": access, "refresh_token": refresh, "user": user.to_dict()},
        message="Logged in",
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    user = User.query.get(int(identity)) if identity else None
    if user is None or not user.is_active:
        return error_response("User no longer active", 401)
    claims = {"username": user.username, "is_super_user": user.is_super_user}
    access = create_access_token(identity=str(user.id), additional_claims=claims)
    return success_response(data={"access_token": access})


@auth_bp.post("/logout")
@login_required
def logout():
    user = current_user()
    audit.record(user=user, action="logout", module="auth", entity_type="user", entity_id=user.id)
    db.session.commit()
    return success_response(message="Logged out")


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
    audit.record(user=user, action="change_password", module="auth", entity_type="user", entity_id=user.id)
    db.session.commit()
    return success_response(message="Password updated")
