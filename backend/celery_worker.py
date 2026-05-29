"""Celery worker / beat entrypoint.

The `celery -A` flag points at the import path of the Celery instance.
Running it against `app.celery_app:celery` directly would skip the
@celery.task registration in app.tasks.* because nothing imports that
package. This entrypoint:

  1. Builds a real Flask app via create_app() so init_celery() runs
     (which imports app.tasks, which registers every task).
  2. Re-exports the configured Celery instance as `celery` so
     `celery -A celery_worker.celery` works.

Usage (matches docker-compose commands):

    celery -A celery_worker.celery worker --loglevel=info
    celery -A celery_worker.celery beat   --loglevel=info
"""
from app import create_app
from app.celery_app import celery, init_celery

flask_app = create_app()
init_celery(flask_app)
# `celery` is the same instance the rest of the codebase decorates
# tasks against — exporting it under this name lets the CLI find it.
