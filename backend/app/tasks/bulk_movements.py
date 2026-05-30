"""Async bulk-movement processing (Phase 5).

Wraps the existing synchronous services.bulk_movements.import_workbook
so a route can enqueue large files instead of blocking the request.
The route refactor (POST -> 202 with batch_id polling) is deferred —
this task is callable today via .delay() once the worker is running."""
import base64
import json

from ..celery_app import celery
from ..services import bulk_movements as bulk_service
from . import jobrun


@celery.task(name="app.tasks.bulk_movements.process_bulk_workbook")
def process_bulk_workbook(*, file_b64: str, filename: str, actor_id: int):
    """Decode a base64-encoded workbook and run the bulk importer.

    File bytes travel base64-encoded because Celery's JSON serializer
    can't carry raw bytes. The route should base64.b64encode(file_bytes)
    before enqueueing."""
    payload = {"filename": filename, "actor_id": actor_id, "size_b64": len(file_b64)}
    with jobrun("process_bulk_workbook", payload) as run:
        file_bytes = base64.b64decode(file_b64.encode("ascii"))
        batch, created = bulk_service.import_workbook(
            file_bytes=file_bytes,
            filename=filename,
            actor_id=actor_id,
        )
        result = {
            "batch_id": batch.id,
            "status": batch.status,
            "total": batch.total_rows,
            "success": batch.success_rows,
            "errors": batch.error_rows,
            "created_count": len(created),
        }
        run.result = json.dumps(result)
        return result
