import os
from flask import Blueprint, request, send_file, abort

from ..extensions import db
from ..models import Attachment
from ..services import audit, attachments as att_service
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

attachments_bp = Blueprint("attachments", __name__)

ALLOWED_ENTITIES = {
    "property", "property_agreement", "landlord",
    "employee", "transaction", "renewal",
}


@attachments_bp.post("")
@require_permission("attachment.upload")
def upload():
    entity_type = (request.form.get("entity_type") or "").strip()
    entity_id = (request.form.get("entity_id") or "").strip()
    category = request.form.get("category") or None
    remarks = request.form.get("remarks") or None

    if entity_type not in ALLOWED_ENTITIES:
        return error_response(f"Unsupported entity_type. Allowed: {sorted(ALLOWED_ENTITIES)}", 400)
    if not entity_id:
        return error_response("entity_id is required", 400)
    if "file" not in request.files:
        return error_response("file is required", 400)

    actor = current_user()
    try:
        att = att_service.store_file(
            file=request.files["file"],
            entity_type=entity_type,
            entity_id=entity_id,
            category=category,
            actor_id=actor.id,
            remarks=remarks,
        )
    except ValueError as exc:
        return error_response(str(exc), 400)

    audit.record(user=actor, action="upload", module="attachment",
                 entity_type=entity_type, entity_id=entity_id, new_value=att.to_dict(),
                 remarks=category)
    db.session.commit()
    return success_response(data=att.to_dict(), message="Uploaded", status=201)


@attachments_bp.get("")
@require_permission("attachment.view")
def list_attachments():
    entity_type = request.args.get("entity_type")
    entity_id = request.args.get("entity_id")
    if not entity_type or not entity_id:
        return error_response("entity_type and entity_id are required", 400)
    rows = (
        Attachment.query
        .filter_by(entity_type=entity_type, entity_id=str(entity_id))
        .order_by(Attachment.id.desc())
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@attachments_bp.get("/<int:att_id>/download")
@require_permission("attachment.view")
def download(att_id: int):
    att = Attachment.query.get_or_404(att_id)
    path = att_service.absolute_path(att)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=att.original_name)


@attachments_bp.delete("/<int:att_id>")
@require_permission("attachment.upload")
def delete(att_id: int):
    att = Attachment.query.get_or_404(att_id)
    actor = current_user()
    audit.record(user=actor, action="delete", module="attachment",
                 entity_type=att.entity_type, entity_id=att.entity_id,
                 old_value=att.to_dict())
    att_service.delete_file(att)
    db.session.commit()
    return success_response(message="Deleted")
