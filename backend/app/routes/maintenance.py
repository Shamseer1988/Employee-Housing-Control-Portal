from flask import Blueprint, request

from ..extensions import db
from ..models import MaintenanceRecord
from ..services import audit, maintenance
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

maintenance_bp = Blueprint("maintenance", __name__)


@maintenance_bp.get("/maintenance")
@require_permission("property.view")
def list_records():
    entity_type = request.args.get("entity_type")
    entity_id = request.args.get("entity_id", type=int)
    status = request.args.get("status")
    property_id = request.args.get("property_id", type=int)

    q = MaintenanceRecord.query
    if entity_type:
        q = q.filter_by(entity_type=entity_type)
    if entity_id is not None:
        q = q.filter_by(entity_id=entity_id)
    if status:
        q = q.filter_by(status=status)
    if property_id is not None:
        q = q.filter_by(property_id=property_id)
    rows = q.order_by(MaintenanceRecord.id.desc()).limit(200).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@maintenance_bp.post("/maintenance")
@require_permission("maintenance.manage")
def create_record():
    payload = request.get_json(silent=True) or {}
    if not payload.get("entity_type") or payload.get("entity_id") is None:
        return error_response("entity_type and entity_id are required", 400)
    actor = current_user()
    try:
        rec = maintenance.start_maintenance(
            entity_type=payload["entity_type"],
            entity_id=int(payload["entity_id"]),
            reason=payload.get("reason"),
            start_date=payload.get("start_date"),
            expected_end_date=payload.get("expected_end_date"),
            remarks=payload.get("remarks"),
            approved_by=payload.get("approved_by"),
            actor_id=actor.id,
        )
    except maintenance.MaintenanceError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)

    audit.record(user=actor, action="start", module="maintenance",
                 entity_type="maintenance_record", entity_id=rec.id,
                 new_value=rec.to_dict(), remarks=rec.transaction_number)
    db.session.commit()
    return success_response(data=rec.to_dict(), message="Maintenance started", status=201)


@maintenance_bp.post("/maintenance/<int:record_id>/complete")
@require_permission("maintenance.manage")
def complete_record(record_id: int):
    payload = request.get_json(silent=True) or {}
    actor = current_user()
    try:
        rec = maintenance.complete_maintenance(
            record_id=record_id,
            actual_end_date=payload.get("actual_end_date"),
            remarks=payload.get("remarks"),
            actor_id=actor.id,
        )
    except maintenance.MaintenanceError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="complete", module="maintenance",
                 entity_type="maintenance_record", entity_id=rec.id,
                 new_value=rec.to_dict(), remarks=rec.transaction_number)
    db.session.commit()
    return success_response(data=rec.to_dict(), message="Maintenance completed")


@maintenance_bp.post("/maintenance/<int:record_id>/cancel")
@require_permission("maintenance.manage")
def cancel_record(record_id: int):
    actor = current_user()
    try:
        rec = maintenance.cancel_maintenance(record_id=record_id, actor_id=actor.id)
    except maintenance.MaintenanceError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)
    audit.record(user=actor, action="cancel", module="maintenance",
                 entity_type="maintenance_record", entity_id=rec.id,
                 remarks=rec.transaction_number)
    db.session.commit()
    return success_response(data=rec.to_dict(), message="Maintenance cancelled")
