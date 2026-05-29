"""JobRun — one row per Celery task invocation.

Lets the operator see when a background job last ran, what it produced,
and whether it errored — without having to scrape the worker logs. Used
by every @app.task in app/tasks/*.py via the with_jobrun(...) helper."""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from ..extensions import db


class JobRun(db.Model):
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True)
    task = Column(String(120), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="running", index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    # Stored as JSON text — sqlite-friendly and we don't need querying.
    payload = Column(Text, nullable=True)
    result = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "task": self.task,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "payload": self.payload,
            "result": self.result,
            "error": self.error,
        }
