"""Celery factory + beat schedule (Phase 5).

The Celery app is instantiated at import time so @celery.task decorators
on the per-domain modules in app/tasks/ have something to attach to.
init_celery(app) wires it to a Flask app: broker URL, result backend,
beat schedule, and a Task base class that opens a Flask app context for
each run so tasks can use SQLAlchemy / current_app like regular views.

Tests set CELERY_TASK_ALWAYS_EAGER=True so task.delay() runs inline
without needing a real broker."""
from celery import Celery
from celery.schedules import crontab


# Created without a broker so importing this module doesn't require
# Redis. init_celery() supplies broker/backend at app boot.
celery = Celery("pug_accommodation")


def init_celery(app) -> Celery:
    """Bind the Celery instance to a Flask app.

    Idempotent: calling twice with the same app re-applies the config
    (used in test_jobs which spins up fresh apps per test)."""
    redis_url = app.config.get("REDIS_URL") or "memory://"

    celery.conf.update(
        broker_url=redis_url,
        result_backend=redis_url if redis_url != "memory://" else "cache+memory://",
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_always_eager=app.config.get("CELERY_TASK_ALWAYS_EAGER", False),
        task_eager_propagates=True,
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

    # Run each task inside a Flask app context so tasks can use
    # SQLAlchemy + current_app exactly like a request handler.
    flask_app = app

    class ContextTask(celery.Task):
        abstract = True

        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask

    # Import task modules so their @celery.task decorators register.
    # Local import to avoid a cycle (app.tasks.* imports celery_app).
    from . import tasks  # noqa: F401

    app.extensions["celery"] = celery
    return celery
