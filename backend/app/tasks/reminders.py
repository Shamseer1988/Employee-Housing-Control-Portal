"""Reminder-bucket recomputation task (Phase 5).

Daily job that re-tallies the bucket counts so the dashboard's
notification bell can read them from the latest JobRun.result rather
than scanning every active agreement on demand."""
import json

from ..celery_app import celery
from ..services import reminders as reminder_service
from . import jobrun


@celery.task(name="app.tasks.reminders.recompute_reminder_summary")
def recompute_reminder_summary():
    with jobrun("recompute_reminder_summary") as run:
        summary = reminder_service.reminder_summary()
        run.result = json.dumps(summary)
        return summary
