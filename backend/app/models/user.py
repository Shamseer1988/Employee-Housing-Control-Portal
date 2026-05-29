import bcrypt
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index, UniqueConstraint, Integer
from sqlalchemy.orm import relationship

from ..extensions import db
from .base import BaseModel


user_roles = db.Table(
    "user_roles",
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = db.Table(
    "role_permissions",
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class User(BaseModel):
    __tablename__ = "users"

    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    full_name = Column(String(120), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_super_user = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    mobile = Column(String(32), nullable=True)
    remarks = Column(String(255), nullable=True)
    # Bumped on change-password (and any future "force logout all" action) to
    # invalidate every JWT currently in circulation for this user. Tokens
    # carry the value they were minted with as a "tv" claim; user_lookup
    # rejects any whose tv doesn't match.
    token_version = Column(Integer, default=0, nullable=False)

    roles = relationship("Role", secondary=user_roles, back_populates="users", lazy="joined")

    def set_password(self, password: str) -> None:
        self.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    def check_password(self, password: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode(), self.password_hash.encode())
        except (ValueError, AttributeError):
            return False

    def permission_codes(self) -> set[str]:
        if self.is_super_user:
            return {"*"}
        codes: set[str] = set()
        for role in self.roles:
            if not role.is_active:
                continue
            for perm in role.permissions:
                codes.add(perm.code)
        return codes

    def has_permission(self, code: str) -> bool:
        if self.is_super_user:
            return True
        codes = self.permission_codes()
        return code in codes or "*" in codes

    def to_dict(self, exclude: set[str] | None = None) -> dict:
        exclude = (exclude or set()) | {"password_hash"}
        data = super().to_dict(exclude=exclude)
        data["roles"] = [{"id": r.id, "code": r.code, "name": r.name} for r in self.roles]
        data["permissions"] = sorted(self.permission_codes())
        return data


class Role(BaseModel):
    __tablename__ = "roles"

    code = Column(String(48), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles", lazy="joined")

    def to_dict(self, exclude: set[str] | None = None) -> dict:
        data = super().to_dict(exclude=exclude)
        data["permissions"] = [{"id": p.id, "code": p.code, "module": p.module} for p in self.permissions]
        data["user_count"] = len(self.users)
        return data


class Permission(BaseModel):
    __tablename__ = "permissions"

    code = Column(String(64), unique=True, nullable=False, index=True)
    module = Column(String(48), nullable=False, index=True)
    action = Column(String(32), nullable=False)
    description = Column(String(255), nullable=True)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

    __table_args__ = (
        UniqueConstraint("module", "action", name="uq_permission_module_action"),
        Index("ix_permissions_module_action", "module", "action"),
    )
