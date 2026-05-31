"""Backup management API.

Endpoints (all require `backup.manage`):

    GET    /api/v1/backups                       — list .dump files on disk
    POST   /api/v1/backups                       — run a backup now (sync)
    GET    /api/v1/backups/<filename>/download   — download a backup file
    POST   /api/v1/backups/upload-restore        — upload a file and restore
    POST   /api/v1/backups/<filename>/restore    — restore an on-disk backup
    DELETE /api/v1/backups/<filename>            — delete a backup file
    GET    /api/v1/backups/info                  — folder path + free space

Backup *schedule* settings (cron / retention days) live in the existing
SystemSetting catalog under the "backup" category and are edited via the
normal Settings UI; the scheduled celery task in app.tasks.backup reads
them once per run.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

from flask import Blueprint, current_app, request, send_file
from werkzeug.utils import secure_filename

from ..services import audit, backup
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

backup_bp = Blueprint("backup", __name__)


@backup_bp.get("")
@require_permission("backup.manage")
def list_backups():
    rows = backup.list_backups()
    return success_response(
        data=[r.to_dict() for r in rows],
        meta={"count": len(rows)},
    )


@backup_bp.get("/info")
@require_permission("backup.manage")
def info():
    """Report the folder the backup service is actually using right
    now — so the Settings UI can show whether the operator's configured
    path is reachable and how much space is left."""
    try:
        folder = str(backup._backup_dir())  # honours the setting + env
    except Exception:
        folder = os.getenv("BACKUP_FOLDER", "/data/backups")
    try:
        usage = shutil.disk_usage(folder)
        space = {
            "free_bytes": usage.free,
            "total_bytes": usage.total,
        }
    except OSError:
        space = {"free_bytes": None, "total_bytes": None}
    return success_response(
        data={
            "folder": folder,
            "writable": os.access(folder, os.W_OK),
            **space,
        }
    )


@backup_bp.post("")
@require_permission("backup.manage")
def create_now():
    actor = current_user()
    try:
        rec = backup.create_backup()
    except backup.BackupError as exc:
        return error_response(str(exc), 500)
    audit.record(
        user=actor,
        action="create",
        module="backup",
        entity_type="backup",
        entity_id=rec.filename,
        new_value=rec.to_dict(),
    )
    from ..extensions import db
    db.session.commit()
    return success_response(
        data=rec.to_dict(),
        message=f"Backup {rec.filename} created",
        status=201,
    )


@backup_bp.get("/<path:filename>/download")
@require_permission("backup.manage")
def download(filename: str):
    try:
        path = backup.path_for(filename)
    except backup.BackupError as exc:
        return error_response(str(exc), 404)
    return send_file(
        path,
        as_attachment=True,
        download_name=path.name,
        mimetype="application/octet-stream",
    )


@backup_bp.delete("/<path:filename>")
@require_permission("backup.manage")
def delete(filename: str):
    actor = current_user()
    try:
        backup.delete_backup(filename)
    except backup.BackupError as exc:
        return error_response(str(exc), 404)
    audit.record(
        user=actor,
        action="delete",
        module="backup",
        entity_type="backup",
        entity_id=filename,
    )
    from ..extensions import db
    db.session.commit()
    return success_response(message=f"Backup {filename} deleted")


@backup_bp.post("/<path:filename>/restore")
@require_permission("backup.manage")
def restore_existing(filename: str):
    actor = current_user()
    try:
        path = backup.path_for(filename)
        backup.restore_backup(path)
    except backup.BackupError as exc:
        return error_response(str(exc), 400)
    audit.record(
        user=actor,
        action="restore",
        module="backup",
        entity_type="backup",
        entity_id=filename,
    )
    from ..extensions import db
    db.session.commit()
    return success_response(
        message=(
            f"Restored from {filename}. Restart the backend "
            "process to refresh pooled connections."
        )
    )


@backup_bp.post("/upload-restore")
@require_permission("backup.manage")
def upload_restore():
    """Restore from a file the operator uploads (a backup taken on
    another machine). Streams to a temp file under BACKUP_FOLDER, runs
    pg_restore, then keeps the file in the folder list."""
    actor = current_user()
    f = request.files.get("file")
    if f is None or not f.filename:
        return error_response("file is required", 400)

    safe_name = secure_filename(f.filename)
    if not safe_name.endswith(".dump"):
        return error_response("Only .dump files (custom pg_dump format) are accepted", 400)

    folder = Path(os.getenv("BACKUP_FOLDER", "/data/backups"))
    folder.mkdir(parents=True, exist_ok=True)

    # Save into the folder so the operator can re-download / verify
    # later. If the name collides, suffix with a timestamp.
    target = folder / safe_name
    if target.exists():
        from datetime import datetime, timezone
        stem = target.stem
        target = folder / f"{stem}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%SZ')}.dump"

    f.save(target)

    try:
        backup.restore_backup(target)
    except backup.BackupError as exc:
        return error_response(str(exc), 400)

    audit.record(
        user=actor,
        action="upload_restore",
        module="backup",
        entity_type="backup",
        entity_id=target.name,
        remarks=f"uploaded {f.filename}",
    )
    from ..extensions import db
    db.session.commit()
    return success_response(
        data={"filename": target.name},
        message=(
            f"Restored from uploaded {target.name}. Restart the backend "
            "process to refresh pooled connections."
        ),
    )
