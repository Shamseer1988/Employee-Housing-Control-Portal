"""Permission catalog and role presets for the system.

Permission codes use dotted notation: "<module>.<action>".
Modules align with the application sidebar / blueprint modules.
"""

PERMISSION_CATALOG: list[tuple[str, str, str]] = [
    # (module, action, description)
    ("dashboard", "view", "View dashboard"),
    # Master setup
    ("property", "view", "View properties"),
    ("property", "create", "Create properties"),
    ("property", "edit", "Edit properties"),
    ("property", "deactivate", "Deactivate properties"),
    ("landlord", "view", "View landlords"),
    ("landlord", "create", "Create landlords"),
    ("landlord", "edit", "Edit landlords"),
    ("floor", "manage", "Manage floors"),
    ("room", "view", "View rooms"),
    ("room", "manage", "Create / edit / deactivate rooms"),
    ("bed", "view", "View beds"),
    ("bed", "manage", "Create / edit / deactivate beds"),
    ("division", "view", "View divisions"),
    ("division", "manage", "Manage divisions"),
    ("employee", "view", "View employees"),
    ("employee", "create", "Create employees"),
    ("employee", "edit", "Edit employees"),
    ("employee", "import", "Import employees from Excel"),
    # Transactions
    ("assignment", "view", "View accommodation assignments"),
    ("assignment", "create", "Create assignments"),
    ("transfer", "create", "Create transfers / room change / bed change"),
    ("cancellation", "create", "Cancel accommodation"),
    ("vacation", "create", "Record employee vacations"),
    ("renewal", "create", "Renew landlord agreement"),
    ("maintenance", "manage", "Manage maintenance records"),
    ("approval", "approve", "Approve transactions"),
    ("approval", "reject", "Reject transactions"),
    # Reports / export
    ("report", "view", "View reports"),
    ("report", "export", "Export reports to Excel / PDF"),
    # Attachments
    ("attachment", "upload", "Upload attachments"),
    ("attachment", "view", "View attachments"),
    # Administration
    ("user", "view", "View users"),
    ("user", "manage", "Manage users"),
    ("role", "view", "View roles"),
    ("role", "manage", "Manage roles and permissions"),
    ("audit", "view", "View audit log"),
    ("settings", "view", "View system settings"),
    ("settings", "manage", "Manage system settings"),
    ("backup", "manage", "Run, restore, and schedule database backups"),
]


def permission_code(module: str, action: str) -> str:
    return f"{module}.{action}"


def all_permission_codes() -> list[str]:
    return [permission_code(m, a) for m, a, _ in PERMISSION_CATALOG]


# Role -> list of permission codes ("*" means all).
ROLE_PRESETS: dict[str, dict] = {
    "super_user": {
        "name": "Super User",
        "description": "Full unrestricted access (managed via is_super_user flag).",
        "permissions": ["*"],
    },
    "admin": {
        "name": "Admin",
        "description": "System administrator with full operational access.",
        "permissions": all_permission_codes(),
    },
    "hr_executive": {
        "name": "HR Executive",
        "description": "HR operations: employees, assignments, transfers, cancellations.",
        "permissions": [
            "dashboard.view",
            "property.view", "landlord.view", "room.view", "bed.view",
            "division.view",
            "employee.view", "employee.create", "employee.edit", "employee.import",
            "assignment.view", "assignment.create",
            "transfer.create", "cancellation.create", "vacation.create",
            "report.view", "report.export",
            "attachment.upload", "attachment.view",
        ],
    },
    "accommodation_manager": {
        "name": "Accommodation Manager",
        "description": "Owns property/room/bed setup and allocation across the group.",
        "permissions": [
            "dashboard.view",
            "property.view", "property.create", "property.edit", "property.deactivate",
            "landlord.view", "landlord.create", "landlord.edit",
            "floor.manage", "room.view", "room.manage", "bed.view", "bed.manage",
            "division.view",
            "employee.view",
            "assignment.view", "assignment.create",
            "transfer.create", "cancellation.create", "vacation.create",
            "renewal.create", "maintenance.manage",
            "approval.approve", "approval.reject",
            "report.view", "report.export",
            "attachment.upload", "attachment.view",
        ],
    },
    "branch_manager": {
        "name": "Branch Manager",
        "description": "Branch-level view and approval rights.",
        "permissions": [
            "dashboard.view",
            "property.view", "room.view", "bed.view",
            "division.view", "employee.view",
            "assignment.view",
            "approval.approve", "approval.reject",
            "report.view", "report.export",
            "attachment.view",
        ],
    },
    "division_manager": {
        "name": "Division Manager",
        "description": "Division-level visibility and approval rights.",
        "permissions": [
            "dashboard.view",
            "property.view", "room.view", "bed.view",
            "division.view", "employee.view",
            "assignment.view",
            "approval.approve", "approval.reject",
            "report.view", "report.export",
            "attachment.view",
        ],
    },
    "supervisor": {
        "name": "Supervisor",
        "description": "View accommodation for own division/area.",
        "permissions": [
            "dashboard.view",
            "property.view", "room.view", "bed.view",
            "employee.view",
            "assignment.view",
            "report.view",
            "attachment.view",
        ],
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only access to dashboards and reports.",
        "permissions": [
            "dashboard.view",
            "property.view", "room.view", "bed.view",
            "division.view", "employee.view",
            "assignment.view",
            "report.view",
            "attachment.view",
        ],
    },
    "auditor": {
        "name": "Auditor",
        "description": "Read everything plus audit trail access.",
        "permissions": all_permission_codes(),
    },
}
