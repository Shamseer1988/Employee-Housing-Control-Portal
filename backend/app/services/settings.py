"""System-settings service. Backed by the ``system_settings`` table.

Each entry in ``DEFAULTS`` describes one setting:
  - key, category, label, description, type
  - value: the default value used when seeding
  - options: list of {value, label} for ``select`` types
  - is_secret: don't return the value over the API, only "set"/"not set"
  - help: longer help text rendered under the field
"""
from __future__ import annotations

from typing import Any

from ..extensions import db
from ..models import SystemSetting


# Category ordering controls how tabs are sorted in the UI.
CATEGORY_ORDER = [
    "company", "property", "numbering", "approval", "alerts",
    "email", "ui", "import", "security", "backup", "audit",
]

CATEGORY_LABEL = {
    "company": "Company",
    "property": "Property",
    "numbering": "Numbering",
    "approval": "Approval workflow",
    "alerts": "Alerts & reminders",
    "email": "Email",
    "ui": "UI / Theme",
    "import": "Import / Export",
    "security": "Security",
    "backup": "Backup",
    "audit": "Audit",
}


DEFAULTS: list[dict] = [
    # ---------- Company ----------
    {"key": "company.name", "category": "company", "type": "string",
     "label": "Company name", "value": "Paris United Group",
     "description": "Displayed in the topbar and on every report header."},
    {"key": "company.legal_name", "category": "company", "type": "string",
     "label": "Legal name", "value": "",
     "description": "Full registered legal name used on contracts and PDFs."},
    {"key": "company.address", "category": "company", "type": "textarea",
     "label": "Head office address", "value": "",
     "description": "Address printed on official documents."},
    {"key": "company.contact_email", "category": "company", "type": "string",
     "label": "Contact email", "value": ""},
    {"key": "company.contact_phone", "category": "company", "type": "string",
     "label": "Contact phone", "value": ""},
    {"key": "company.logo_url", "category": "company", "type": "string",
     "label": "Logo URL", "value": "",
     "description": "Public URL to a square logo image; shown in the topbar."},

    # ---------- Property defaults ----------
    {"key": "property.default_ownership", "category": "property", "type": "select",
     "label": "Default ownership type", "value": "rented",
     "options": [
         {"value": "rented", "label": "Rented"},
         {"value": "company_owned", "label": "Company owned"},
         {"value": "temporary", "label": "Temporary"},
     ]},
    {"key": "property.default_multi_division", "category": "property", "type": "bool",
     "label": "Allow multi-division by default", "value": True,
     "description": "New properties default to allowing employees from multiple divisions."},

    # ---------- Numbering ----------
    {"key": "numbering.property.prefix", "category": "numbering", "type": "string",
     "label": "Property code prefix", "value": "PROP",
     "help": "Used for auto-generated property codes such as PROP-0001."},
    {"key": "numbering.landlord.prefix", "category": "numbering", "type": "string",
     "label": "Landlord code prefix", "value": "LL"},
    {"key": "numbering.division.prefix", "category": "numbering", "type": "string",
     "label": "Division code prefix", "value": "DIV"},
    {"key": "numbering.employee.prefix", "category": "numbering", "type": "string",
     "label": "Employee code prefix", "value": "EMP"},

    # ---------- Approval workflow (Phase 11) ----------
    {"key": "approval.assignment.required", "category": "approval", "type": "bool",
     "label": "Require approval — assignments", "value": False,
     "description": "New accommodation assignments are created as pending until approved."},
    {"key": "approval.transfer.required", "category": "approval", "type": "bool",
     "label": "Require approval — transfers", "value": False,
     "description": "Bed / room / property transfers require approval before execution."},
    {"key": "approval.cancellation.required", "category": "approval", "type": "bool",
     "label": "Require approval — cancellations", "value": False,
     "description": "Accommodation cancellations require approval before the bed is released."},
    {"key": "approval.renewal.required", "category": "approval", "type": "bool",
     "label": "Require approval — landlord renewals", "value": False,
     "description": "Landlord renewals are held until approved; old agreement is not archived early."},

    # ---------- Alerts ----------
    {"key": "alerts.reminder_days", "category": "alerts", "type": "string",
     "label": "Agreement-expiry reminder buckets", "value": "90,60,30,15,7",
     "description": "Comma-separated days before expiry to show reminders."},
    {"key": "alerts.email_enabled", "category": "alerts", "type": "bool",
     "label": "Email alerts enabled", "value": False,
     "description": "Send alert emails in addition to the dashboard notifications."},
    {"key": "alerts.dashboard_enabled", "category": "alerts", "type": "bool",
     "label": "Dashboard alerts enabled", "value": True},
    {"key": "alerts.daily_digest_enabled", "category": "alerts", "type": "bool",
     "label": "Daily digest email", "value": False},
    {"key": "alerts.escalation_users", "category": "alerts", "type": "string",
     "label": "Escalation users", "value": "",
     "description": "Comma-separated email addresses to copy on critical alerts."},

    # ---------- Email ----------
    {"key": "email.smtp_host", "category": "email", "type": "string",
     "label": "SMTP host", "value": ""},
    {"key": "email.smtp_port", "category": "email", "type": "int",
     "label": "SMTP port", "value": 587},
    {"key": "email.smtp_username", "category": "email", "type": "string",
     "label": "SMTP username", "value": ""},
    {"key": "email.smtp_password", "category": "email", "type": "password",
     "label": "SMTP password", "value": "", "is_secret": True,
     "description": "Stored encrypted at rest; never returned by the API."},
    {"key": "email.from_address", "category": "email", "type": "string",
     "label": "From address", "value": ""},
    {"key": "email.from_name", "category": "email", "type": "string",
     "label": "From name", "value": "PUG Accommodation"},
    {"key": "email.tls_enabled", "category": "email", "type": "bool",
     "label": "Use TLS", "value": True},

    # ---------- UI / Theme ----------
    {"key": "ui.accent_color", "category": "ui", "type": "select",
     "label": "Accent color", "value": "blue",
     "options": [
         {"value": "blue", "label": "Blue"},
         {"value": "emerald", "label": "Emerald"},
         {"value": "violet", "label": "Violet"},
         {"value": "amber", "label": "Amber"},
         {"value": "rose", "label": "Rose"},
     ]},
    {"key": "ui.glassmorphism", "category": "ui", "type": "bool",
     "label": "Enable glassmorphism", "value": True,
     "description": "Frosted-glass card style. Disable for higher contrast."},
    {"key": "ui.compact_mode", "category": "ui", "type": "bool",
     "label": "Compact mode", "value": False,
     "description": "Tighter padding across the app."},
    {"key": "ui.sidebar_default_collapsed", "category": "ui", "type": "bool",
     "label": "Sidebar collapsed by default", "value": False},
    {"key": "ui.table_density", "category": "ui", "type": "select",
     "label": "Table density", "value": "comfortable",
     "options": [
         {"value": "compact", "label": "Compact"},
         {"value": "comfortable", "label": "Comfortable"},
         {"value": "spacious", "label": "Spacious"},
     ]},

    # ---------- Import / Export ----------
    {"key": "import.max_rows", "category": "import", "type": "int",
     "label": "Max rows per Excel import", "value": 5000},
    {"key": "import.allow_partial_commit", "category": "import", "type": "bool",
     "label": "Allow partial import commit", "value": False,
     "description": "When OFF (default) any row error rejects the whole import."},
    {"key": "export.default_format", "category": "import", "type": "select",
     "label": "Default report export format", "value": "xlsx",
     "options": [
         {"value": "xlsx", "label": "Excel (.xlsx)"},
         {"value": "csv", "label": "CSV"},
     ]},

    # ---------- Security ----------
    {"key": "security.password_min_length", "category": "security", "type": "int",
     "label": "Minimum password length", "value": 8},
    {"key": "security.session_timeout_minutes", "category": "security", "type": "int",
     "label": "Session timeout (minutes)", "value": 480,
     "description": "How long an access token stays valid before requiring re-login."},
    {"key": "security.lockout_attempts", "category": "security", "type": "int",
     "label": "Failed login lockout threshold", "value": 5},
    {"key": "security.require_2fa", "category": "security", "type": "bool",
     "label": "Require 2FA", "value": False,
     "description": "Placeholder — 2FA enrolment is on the roadmap."},

    # ---------- Backup ----------
    {"key": "backup.folder", "category": "backup", "type": "string",
     "label": "Backup folder path", "value": "",
     "description": "Absolute path on the host where pg_dump .dump files are written. "
                    "Leave empty to use BACKUP_FOLDER env var, which itself defaults to "
                    "a `backups/` folder next to the repo root. The path must exist and "
                    "be writable by the user running the backend process.",
     "help": "e.g. C:\\Apps\\housing-backups   or   /var/lib/housing/backups"},
    {"key": "backup.schedule", "category": "backup", "type": "select",
     "label": "Automatic backup schedule", "value": "daily",
     "options": [
         {"value": "disabled", "label": "Disabled"},
         {"value": "daily", "label": "Daily"},
         {"value": "weekly", "label": "Weekly"},
         {"value": "monthly", "label": "Monthly"},
     ]},
    {"key": "backup.retention_days", "category": "backup", "type": "int",
     "label": "Retain backups for (days)", "value": 30},

    # ---------- Audit ----------
    {"key": "audit.retention_days", "category": "audit", "type": "int",
     "label": "Audit log retention (days)", "value": 365,
     "description": "How long audit rows are kept before pruning."},
    {"key": "audit.log_read_actions", "category": "audit", "type": "bool",
     "label": "Log read actions", "value": False,
     "description": "Capture GET requests in the audit log too. Verbose; off by default."},
]


# In-memory metadata indexed by key, for quick masking / typing checks.
META_BY_KEY: dict[str, dict] = {d["key"]: d for d in DEFAULTS}


def _metadata_for(key: str) -> dict:
    return META_BY_KEY.get(key, {})


def is_secret(key: str) -> bool:
    return bool(_metadata_for(key).get("is_secret"))


def seed_defaults() -> None:
    """Insert any missing settings rows; never overwrite existing values.

    Description / category are refreshed from the catalog so docstring edits
    in code take effect on the next seed run.
    """
    existing = {s.key: s for s in SystemSetting.query.all()}
    for d in DEFAULTS:
        row = existing.get(d["key"])
        if row is None:
            db.session.add(SystemSetting(
                key=d["key"], value=d.get("value"), category=d["category"],
                description=d.get("description"),
            ))
        else:
            # Keep value, refresh metadata
            row.category = d["category"]
            if d.get("description") is not None:
                row.description = d["description"]
    db.session.flush()


def _coerce_value(key: str, value: Any) -> Any:
    """Coerce incoming values to the type declared in the catalog."""
    meta = _metadata_for(key)
    typ = meta.get("type", "string")
    if value is None or value == "":
        if typ in ("bool",):
            return False
        if typ in ("int",):
            return None
        return ""
    if typ == "bool":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("true", "1", "yes", "y", "on")
    if typ == "int":
        return int(value)
    if typ == "select":
        allowed = {o["value"] for o in meta.get("options", [])}
        if allowed and str(value) not in allowed:
            raise ValueError(f"{key} must be one of {sorted(allowed)}")
        return str(value)
    return value


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
    coerced = _coerce_value(key, value)
    row = SystemSetting.query.filter_by(key=key).first()
    if row is None:
        meta = _metadata_for(key)
        row = SystemSetting(
            key=key,
            value=coerced,
            category=category or meta.get("category"),
            description=description or meta.get("description"),
            created_by=actor_id, updated_by=actor_id,
        )
        db.session.add(row)
    else:
        row.value = coerced
        if category is not None:
            row.category = category
        if description is not None:
            row.description = description
        row.updated_by = actor_id
    db.session.flush()
    return row


def set_many(updates: dict, *, actor_id: int | None = None) -> list[SystemSetting]:
    rows = []
    for key, value in updates.items():
        rows.append(set_value(key, value, actor_id=actor_id))
    return rows


def all_by_category() -> dict[str, list[SystemSetting]]:
    out: dict[str, list[SystemSetting]] = {}
    for s in SystemSetting.query.order_by(SystemSetting.category, SystemSetting.key).all():
        out.setdefault(s.category or "general", []).append(s)
    return out


def catalog() -> dict:
    """Catalog of all known settings grouped by category, with metadata.

    Secret values are masked to a boolean ``"is_set"`` flag.
    """
    by_key = {s.key: s for s in SystemSetting.query.all()}
    sections: list[dict] = []
    grouped: dict[str, list[dict]] = {}

    for d in DEFAULTS:
        row = by_key.get(d["key"])
        value: Any = row.value if row is not None else d.get("value")
        entry = {
            "key": d["key"],
            "label": d.get("label", d["key"]),
            "type": d.get("type", "string"),
            "description": d.get("description"),
            "help": d.get("help"),
            "options": d.get("options"),
            "is_secret": bool(d.get("is_secret")),
        }
        if entry["is_secret"]:
            entry["value"] = None
            entry["is_set"] = bool(value)
        else:
            entry["value"] = value
        grouped.setdefault(d["category"], []).append(entry)

    for category in CATEGORY_ORDER:
        if category not in grouped:
            continue
        sections.append({
            "category": category,
            "label": CATEGORY_LABEL.get(category, category.title()),
            "settings": grouped[category],
        })
    # Catch any orphan categories (e.g. legacy)
    for category, items in grouped.items():
        if category in CATEGORY_ORDER:
            continue
        sections.append({
            "category": category,
            "label": CATEGORY_LABEL.get(category, category.title()),
            "settings": items,
        })

    return {"sections": sections, "count": len(DEFAULTS)}
