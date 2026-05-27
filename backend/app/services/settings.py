"""System-settings service. Backed by the ``system_settings`` table."""
from __future__ import annotations

from typing import Any

from ..extensions import db
from ..models import SystemSetting


DEFAULTS: list[dict] = [
    # Approval workflow toggles (Phase 11)
    {"key": "approval.assignment.required", "value": False, "category": "approval",
     "description": "Require approval before a new accommodation assignment becomes active."},
    {"key": "approval.transfer.required", "value": False, "category": "approval",
     "description": "Require approval before a transfer is executed."},
    {"key": "approval.cancellation.required", "value": False, "category": "approval",
     "description": "Require approval before an accommodation cancellation is executed."},
    {"key": "approval.renewal.required", "value": False, "category": "approval",
     "description": "Require approval before a landlord renewal is executed."},
]


def seed_defaults() -> None:
    existing = {s.key for s in SystemSetting.query.all()}
    for d in DEFAULTS:
        if d["key"] in existing:
            continue
        db.session.add(SystemSetting(
            key=d["key"], value=d["value"], category=d["category"],
            description=d["description"],
        ))
    db.session.flush()


def get(key: str, default: Any = None) -> Any:
    row = SystemSetting.query.filter_by(key=key).first()
    if row is None:
        return default
    return row.value


def get_bool(key: str, default: bool = False) -> bool:
    val = get(key, default)
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes", "y", "on")
    return bool(val)


def set_value(key: str, value: Any, *, actor_id: int | None = None,
              category: str | None = None, description: str | None = None) -> SystemSetting:
    row = SystemSetting.query.filter_by(key=key).first()
    if row is None:
        row = SystemSetting(key=key, value=value, category=category, description=description,
                            created_by=actor_id, updated_by=actor_id)
        db.session.add(row)
    else:
        row.value = value
        if category is not None:
            row.category = category
        if description is not None:
            row.description = description
        row.updated_by = actor_id
    db.session.flush()
    return row


def all_by_category() -> dict[str, list[SystemSetting]]:
    out: dict[str, list[SystemSetting]] = {}
    for s in SystemSetting.query.order_by(SystemSetting.category, SystemSetting.key).all():
        out.setdefault(s.category or "general", []).append(s)
    return out
