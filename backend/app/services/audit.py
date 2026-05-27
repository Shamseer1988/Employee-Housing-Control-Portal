from flask import request

from ..extensions import db
from ..models import AuditLog


def record(
    *,
    user,
    action: str,
    module: str,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    remarks: str | None = None,
) -> AuditLog:
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        old_value=old_value,
        new_value=new_value,
        ip_address=request.remote_addr if request else None,
        user_agent=(request.headers.get("User-Agent") if request else None) or None,
        remarks=remarks,
    )
    db.session.add(log)
    return log
