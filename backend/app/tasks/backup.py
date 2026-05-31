"""Scheduled database backups.

The beat schedule runs `scheduled_backup` daily (see app.celery_app
beat_schedule). The task itself reads `backup.schedule` from
SystemSetting and skips when:
  * schedule == "disabled"
  * schedule == "weekly" and today is not Monday
  * schedule == "monthly" and today is not the 1st

After a successful backup the task prunes anything older than
`backup.retention_days`.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..celery_app import celery
from ..services import backup as backup_service
from ..services import settings as settings_service


def _should_run_today(schedule: str, today: datetime) -> bool:
    s = (schedule or "").strip().lower()
    if s == "daily":
        return True
    if s == "weekly":
        return today.weekday() == 0  # Monday
    if s == "monthly":
        return today.day == 1
    return False  # "disabled" or unknown


@celery.task(name="app.tasks.backup.scheduled_backup")
def scheduled_backup() -> dict:
    """Daily entrypoint. Honors the operator's schedule setting."""
    schedule = (settings_service.get("backup.schedule") or "daily")
    today = datetime.now(timezone.utc)
    if not _should_run_today(str(schedule), today):
        return {"status": "skipped", "schedule": str(schedule)}

    try:
        rec = backup_service.create_backup()
    except backup_service.BackupError as exc:
        return {"status": "failed", "error": str(exc)}

    retention_raw = settings_service.get("backup.retention_days") or 30
    try:
        retention = int(retention_raw)
    except (TypeError, ValueError):
        retention = 30
    removed = backup_service.prune_old(retention)

    return {
        "status": "ok",
        "filename": rec.filename,
        "size_bytes": rec.size_bytes,
        "pruned": removed,
    }
