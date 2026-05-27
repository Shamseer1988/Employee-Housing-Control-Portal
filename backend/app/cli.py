import os
import click
from flask import Flask

from .extensions import db
from .models import User, Role, Permission
from .services.permissions import PERMISSION_CATALOG, ROLE_PRESETS, permission_code


def _seed_permissions() -> dict[str, Permission]:
    existing = {p.code: p for p in Permission.query.all()}
    for module, action, desc in PERMISSION_CATALOG:
        code = permission_code(module, action)
        if code in existing:
            p = existing[code]
            if p.description != desc:
                p.description = desc
            continue
        p = Permission(code=code, module=module, action=action, description=desc)
        db.session.add(p)
        existing[code] = p
    db.session.flush()
    return existing


def _seed_roles(perm_index: dict[str, Permission]) -> dict[str, Role]:
    existing = {r.code: r for r in Role.query.all()}
    all_perms = list(perm_index.values())
    for code, cfg in ROLE_PRESETS.items():
        role = existing.get(code)
        if role is None:
            role = Role(code=code, name=cfg["name"], description=cfg["description"],
                        is_system=True, is_active=True)
            db.session.add(role)
            existing[code] = role
        else:
            role.name = cfg["name"]
            role.description = cfg["description"]
            role.is_system = True
        codes = cfg["permissions"]
        if codes == ["*"]:
            role.permissions = all_perms
        else:
            role.permissions = [perm_index[c] for c in codes if c in perm_index]
    db.session.flush()
    return existing


def _seed_super_user(role_index: dict[str, Role]) -> User:
    username = (os.getenv("SUPERUSER_USERNAME") or "admin").lower()
    email = (os.getenv("SUPERUSER_EMAIL") or "admin@pugroup.local").lower()
    password = os.getenv("SUPERUSER_PASSWORD") or "ChangeMe123!"

    user = User.query.filter(db.func.lower(User.username) == username).first()
    if user is None:
        user = User(
            username=username,
            email=email,
            full_name="System Administrator",
            is_active=True,
            is_super_user=True,
        )
        user.set_password(password)
        user.roles = [role_index["super_user"]] if "super_user" in role_index else []
        db.session.add(user)
        click.echo(f"  → created super user '{username}' (password from SUPERUSER_PASSWORD or default 'ChangeMe123!')")
    else:
        user.is_super_user = True
        user.is_active = True
        click.echo(f"  → super user '{username}' already exists; ensured flags")
    return user


def register_commands(app: Flask) -> None:
    @app.cli.command("seed")
    def seed():
        """Seed permissions, roles, and the default super user."""
        click.echo("Seeding permissions...")
        perm_index = _seed_permissions()
        click.echo(f"  → {len(perm_index)} permissions present")

        click.echo("Seeding roles...")
        role_index = _seed_roles(perm_index)
        click.echo(f"  → {len(role_index)} roles present")

        click.echo("Seeding super user...")
        _seed_super_user(role_index)

        click.echo("Seeding system settings...")
        from .services import settings as settings_service
        settings_service.seed_defaults()

        db.session.commit()
        click.echo("Done.")
