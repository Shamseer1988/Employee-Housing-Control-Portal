"""Celery factory + beat schedule (Phase 5).

The Celery app is instantiated at import time so @celery.task decorators
on the per-domain modules in app/tasks/ have something to attach to.
Broker + beat schedule are configured AT IMPORT TIME from REDIS_URL so
the standalone `celery -A app.celery_app.celery worker` entrypoint
(which never runs create_app) still talks to the right broker.

init_celery(app) layers on top: attaches a Flask app context wrapper
around each task so SQLAlchemy + current_app work, and flips the
task_always_eager flag in tests.

Tests set CELERY_TASK_ALWAYS_EAGER=True so task.delay() runs inline
without needing a real broker."""
import os

from celery import Celery
from celery.schedules import crontab


# Read REDIS_URL at module load — the worker / beat entrypoints
# `celery -A app.celery_app.celery worker` don't go through create_app,
# so init_celery() never runs in those processes. Without this default,
# Celery falls back to its amqp://guest@localhost which doesn't exist
# in our stack (we use Redis).
_REDIS_URL = os.getenv("REDIS_URL") or "memory://"
_RESULT_BACKEND = _REDIS_URL if _REDIS_URL != "memory://" else "cache+memory://"

celery = Celery(
    "pug_accommodation",
    broker=_REDIS_URL,
    backend=_RESULT_BACKEND,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    # Beat schedule for the recurring sweeps. Times are UTC.
    beat_schedule={
        "daily-expiry-sweep": {
            "task": "app.tasks.expiry.daily_expiry_sweep",
            "schedule": crontab(hour=2, minute=0),
        },
        "daily-reminder-recompute": {
            "task": "app.tasks.reminders.recompute_reminder_summary",
            "schedule": crontab(hour=2, minute=15),
        },
    },
)


def init_celery(app) -> Celery:
    """Bind the Celery instance to a Flask app.

    Called from create_app() — the worker / beat processes don't run
    this, but they don't need the Flask context wrapper either (they
    set it up themselves via the @celery.task decorator's default base
    class). What this DOES add: the request-cycle Flask app context so
    tasks running inside the gunicorn process (via .apply()) can use
    SQLAlchemy.
    """
    celery.conf.update(
        task_always_eager=app.config.get("CELERY_TASK_ALWAYS_EAGER", False),
        task_eager_propagates=True,
    )

    flask_app = app

    class ContextTask(celery.Task):
        abstract = True

        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask

    # Import task modules so their @celery.task decorators register.
    from . import tasks  # noqa: F401

    app.extensions["celery"] = celery
    return celery
