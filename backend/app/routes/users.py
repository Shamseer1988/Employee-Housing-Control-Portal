from flask import Blueprint, request

from ..extensions import db
from ..models import User, Role
from ..services import audit
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

users_bp = Blueprint("users", __name__)


def _serialize(user: User) -> dict:
    return user.to_dict()


def _apply_roles(user: User, role_ids: list[int] | None) -> None:
    if role_ids is None:
        return
    roles = Role.query.filter(Role.id.in_(role_ids)).all() if role_ids else []
    user.roles = roles


@users_bp.get("")
@require_permission("user.view")
def list_users():
    q = (request.args.get("q") or "").strip().lower()
    status = request.args.get("status")
    query = User.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.func.lower(User.username).like(like),
                db.func.lower(User.email).like(like),
                db.func.lower(User.full_name).like(like),
            )
        )
    if status == "active":
        query = query.filter_by(is_active=True)
    elif status == "inactive":
        query = query.filter_by(is_active=False)
    users = query.order_by(User.username.asc()).all()
    return success_response(data=[_serialize(u) for u in users], meta={"count": len(users)})


@users_bp.get("/<int:user_id>")
@require_permission("user.view")
def get_user(user_id: int):
    user = User.query.get_or_404(user_id)
    return success_response(data=_serialize(user))


@users_bp.post("")
@require_permission("user.manage")
def create_user():
    payload = request.get_json(silent=True) or {}
    required = ["username", "email", "full_name", "password"]
    missing = [k for k in required if not (payload.get(k) or "").strip()]
    if missing:
        return error_response("Missing required fields", 400, ", ".join(missing))

    username = payload["username"].strip().lower()
    email = payload["email"].strip().lower()

    if User.query.filter(db.func.lower(User.username) == username).first():
        return error_response("Username already exists", 409)
    if User.query.filter(db.func.lower(User.email) == email).first():
        return error_response("Email already exists", 409)

    actor = current_user()
    user = User(
        username=username,
        email=email,
        full_name=payload["full_name"].strip(),
        mobile=payload.get("mobile"),
        remarks=payload.get("remarks"),
        is_active=bool(payload.get("is_active", True)),
        is_super_user=bool(payload.get("is_super_user", False)) and actor.is_super_user,
        created_by=actor.id,
        updated_by=actor.id,
    )
    user.set_password(payload["password"])
    _apply_roles(user, payload.get("role_ids"))
    db.session.add(user)
    db.session.flush()
    audit.record(
        user=actor, action="create", module="user", entity_type="user", entity_id=user.id,
        new_value=user.to_dict(),
    )
    db.session.commit()
    return success_response(data=_serialize(user), message="User created", status=201)


@users_bp.put("/<int:user_id>")
@require_permission("user.manage")
def update_user(user_id: int):
    user = User.query.get_or_404(user_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = user.to_dict()

    if "email" in payload:
        email = (payload["email"] or "").strip().lower()
        if email and email != user.email.lower():
            if User.query.filter(db.func.lower(User.email) == email).first():
                return error_response("Email already exists", 409)
            user.email = email
    if "full_name" in payload:
        user.full_name = (payload["full_name"] or "").strip() or user.full_name
    if "mobile" in payload:
        user.mobile = payload["mobile"]
    if "remarks" in payload:
        user.remarks = payload["remarks"]
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    if "is_super_user" in payload and actor.is_super_user:
        user.is_super_user = bool(payload["is_super_user"])
    if "password" in payload and payload["password"]:
        if len(payload["password"]) < 8:
            return error_response("Password must be at least 8 characters", 400)
        user.set_password(payload["password"])
    if "role_ids" in payload:
        _apply_roles(user, payload["role_ids"])

    user.updated_by = actor.id
    audit.record(
        user=actor, action="update", module="user", entity_type="user", entity_id=user.id,
        old_value=old, new_value=user.to_dict(),
    )
    db.session.commit()
    return success_response(data=_serialize(user), message="User updated")


@users_bp.delete("/<int:user_id>")
@require_permission("user.manage")
def deactivate_user(user_id: int):
    user = User.query.get_or_404(user_id)
    if user.is_super_user:
        return error_response("Cannot deactivate a super user", 403)
    actor = current_user()
    if actor.id == user.id:
        return error_response("You cannot deactivate your own account", 400)
    user.is_active = False
    user.updated_by = actor.id
    audit.record(
        user=actor, action="deactivate", module="user", entity_type="user", entity_id=user.id,
    )
    db.session.commit()
    return success_response(message="User deactivated")
