from flask import Blueprint, request

from ..extensions import db
from ..models import Role, Permission
from ..services import audit
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

roles_bp = Blueprint("roles", __name__)


def _apply_permissions(role: Role, permission_ids: list[int] | None) -> None:
    if permission_ids is None:
        return
    perms = Permission.query.filter(Permission.id.in_(permission_ids)).all() if permission_ids else []
    role.permissions = perms


@roles_bp.get("")
@require_permission("role.view")
def list_roles():
    roles = Role.query.order_by(Role.name.asc()).all()
    return success_response(data=[r.to_dict() for r in roles], meta={"count": len(roles)})


@roles_bp.get("/<int:role_id>")
@require_permission("role.view")
def get_role(role_id: int):
    return success_response(data=Role.query.get_or_404(role_id).to_dict())


@roles_bp.post("")
@require_permission("role.manage")
def create_role():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().lower()
    name = (payload.get("name") or "").strip()
    if not code or not name:
        return error_response("code and name are required", 400)
    if Role.query.filter(db.func.lower(Role.code) == code).first():
        return error_response("Role code already exists", 409)
    actor = current_user()
    role = Role(
        code=code,
        name=name,
        description=payload.get("description"),
        is_active=bool(payload.get("is_active", True)),
        is_system=False,
        created_by=actor.id,
        updated_by=actor.id,
    )
    _apply_permissions(role, payload.get("permission_ids"))
    db.session.add(role)
    db.session.flush()
    audit.record(user=actor, action="create", module="role", entity_type="role", entity_id=role.id,
                 new_value=role.to_dict())
    db.session.commit()
    return success_response(data=role.to_dict(), message="Role created", status=201)


@roles_bp.put("/<int:role_id>")
@require_permission("role.manage")
def update_role(role_id: int):
    role = Role.query.get_or_404(role_id)
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    old = role.to_dict()
    if role.is_system and ("permission_ids" in payload or "code" in payload):
        if not actor.is_super_user:
            return error_response("System roles can only be modified by a super user", 403)
    if "name" in payload:
        role.name = (payload["name"] or "").strip() or role.name
    if "description" in payload:
        role.description = payload["description"]
    if "is_active" in payload and not role.is_system:
        role.is_active = bool(payload["is_active"])
    if "permission_ids" in payload:
        _apply_permissions(role, payload["permission_ids"])
    role.updated_by = actor.id
    audit.record(user=actor, action="update", module="role", entity_type="role", entity_id=role.id,
                 old_value=old, new_value=role.to_dict())
    db.session.commit()
    return success_response(data=role.to_dict(), message="Role updated")


@roles_bp.delete("/<int:role_id>")
@require_permission("role.manage")
def deactivate_role(role_id: int):
    role = Role.query.get_or_404(role_id)
    if role.is_system:
        return error_response("System roles cannot be deactivated", 403)
    actor = current_user()
    role.is_active = False
    role.updated_by = actor.id
    audit.record(user=actor, action="deactivate", module="role", entity_type="role", entity_id=role.id)
    db.session.commit()
    return success_response(message="Role deactivated")


@roles_bp.get("/permissions/catalog")
@require_permission("role.view")
def permission_catalog():
    perms = Permission.query.order_by(Permission.module.asc(), Permission.action.asc()).all()
    grouped: dict[str, list[dict]] = {}
    for p in perms:
        grouped.setdefault(p.module, []).append(
            {"id": p.id, "code": p.code, "action": p.action, "description": p.description}
        )
    return success_response(data={"modules": grouped, "count": len(perms)})
