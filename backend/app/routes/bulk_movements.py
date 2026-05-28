from flask import Blueprint, request, send_file
import io

from ..extensions import db
from ..models import ImportBatch, ImportError as ImportErrorRow
from ..services import audit, bulk_movements
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response


bulk_bp = Blueprint("bulk_movements", __name__)


@bulk_bp.get("/bulk-movements/template")
@require_permission("assignment.create")
def template():
    blob = bulk_movements.build_template_workbook()
    return send_file(
        io.BytesIO(blob),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="bulk-movements-template.xlsx",
    )


@bulk_bp.post("/bulk-movements/import")
@require_permission("assignment.create")
def import_bulk():
    if "file" not in request.files:
        return error_response("file is required", 400)
    file = request.files["file"]
    if not file.filename:
        return error_response("file is required", 400)
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        return error_response("Only .xlsx files are supported", 400)

    actor = current_user()
    try:
        batch, summary = bulk_movements.import_workbook(
            file_bytes=file.read(), filename=file.filename, actor_id=actor.id,
        )
    except ValueError as exc:
        return error_response(str(exc), 400)

    audit.record(
        user=actor, action="import", module="bulk_movement",
        entity_type="import_batch", entity_id=batch.id,
        new_value={
            "total": batch.total_rows,
            "success": batch.success_rows,
            "errors": batch.error_rows,
            **summary,
        },
        remarks=file.filename,
    )
    db.session.commit()

    return success_response(
        data={
            "batch": batch.to_dict(),
            "summary": summary,
            "errors": [
                {"row_number": e.row_number, "errors": e.errors}
                for e in ImportErrorRow.query
                    .filter_by(batch_id=batch.id)
                    .order_by(ImportErrorRow.row_number).all()
            ],
        },
        message=f"Bulk import {batch.status}",
        status=201 if batch.status == "completed" else 200,
    )


@bulk_bp.get("/bulk-movements/batches")
@require_permission("assignment.create")
def list_batches():
    rows = (
        ImportBatch.query.filter_by(module="bulk_movement")
        .order_by(ImportBatch.id.desc())
        .limit(50).all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@bulk_bp.get("/bulk-movements/batches/<int:batch_id>")
@require_permission("assignment.create")
def get_batch(batch_id: int):
    batch = ImportBatch.query.get_or_404(batch_id)
    errors = (
        ImportErrorRow.query.filter_by(batch_id=batch.id)
        .order_by(ImportErrorRow.row_number).all()
    )
    data = batch.to_dict()
    data["errors"] = [
        {"row_number": e.row_number, "errors": e.errors, "raw_data": e.raw_data}
        for e in errors
    ]
    return success_response(data=data)
