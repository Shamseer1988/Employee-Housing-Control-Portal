"""Database backup + restore service.

Wraps `pg_dump` / `pg_restore` so the operator can:
  * trigger an on-demand backup via the UI
  * download an existing backup as a single file
  * restore from a previously-downloaded backup (or one already on disk)
  * have backups run automatically on a schedule (see app.tasks.backup)

Storage:
  Backups live in BACKUP_FOLDER (defaults to ../backups, relative to
  the backend folder). Set the env var to point at a host-absolute
  path in production. Files are written with the
  custom pg_dump format (`-Fc`) — compact and friendly to pg_restore's
  selective options. Filename pattern:
      pug-accommodation-YYYYMMDD-HHMMSSZ.dump

Security:
  * pg_dump / pg_restore are invoked with the DB password injected via
    the PGPASSWORD env var so it never appears in `ps`.
  * Filenames coming back in over the API are validated against
    SAFE_FILENAME_RE — no path traversal, no shell metacharacters.
  * Restore is allowed only when the caller has `backup.manage`.
"""
from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from flask import current_app


SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]+\.dump$")
BACKUP_PREFIX = "pug-accommodation"
PG_DUMP = "pg_dump"
PG_RESTORE = "pg_restore"
PSQL = "psql"


class BackupError(RuntimeError):
    """Raised for any expected backup/restore failure that should
    surface as a clean 4xx/5xx instead of a stacktrace."""


@dataclass
class BackupFile:
    filename: str
    size_bytes: int
    created_at: datetime

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "size_human": _human_bytes(self.size_bytes),
            "created_at": self.created_at.isoformat(),
        }


def _backup_dir() -> Path:
    """Resolve the backup folder. Operator can override via the
    `backup.folder` setting in the Settings UI; falls back to the
    BACKUP_FOLDER env var, then to ../backups relative to the backend
    folder. Always `mkdir -p`s the resulting path so a fresh install
    just works."""
    from . import settings as settings_service
    try:
        configured = settings_service.get("backup.folder")
    except Exception:
        configured = None
    default = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "backups")
    )
    folder = (
        (configured or "").strip()
        or current_app.config.get("BACKUP_FOLDER")
        or os.getenv("BACKUP_FOLDER", default)
    )
    p = Path(folder)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _db_env() -> dict[str, str]:
    """Build a subprocess env with PG* vars wired from app config /
    POSTGRES_* env vars. Password goes through PGPASSWORD so it isn't
    visible in `ps`."""
    env = os.environ.copy()
    pw = os.getenv("POSTGRES_PASSWORD") or current_app.config.get("POSTGRES_PASSWORD")
    if pw:
        env["PGPASSWORD"] = pw
    return env


def _conn_args() -> list[str]:
    """Common -h / -U / -d / -p arguments for pg_dump and pg_restore."""
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "pug")
    db = os.getenv("POSTGRES_DB", "pug_accommodation")
    return ["-h", host, "-p", str(port), "-U", user, "-d", db]


def _safe_filename(name: str) -> str:
    """Validate that a caller-supplied filename is safe to join against
    BACKUP_FOLDER. Rejects path traversal, shell metacharacters, and
    anything that isn't a .dump."""
    name = (name or "").strip()
    if not SAFE_FILENAME_RE.fullmatch(name):
        raise BackupError("Invalid backup filename")
    return name


def _human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def list_backups() -> list[BackupFile]:
    """All .dump files currently in BACKUP_FOLDER, newest first."""
    out: list[BackupFile] = []
    for p in _backup_dir().iterdir():
        if not p.is_file() or not p.name.endswith(".dump"):
            continue
        stat = p.stat()
        out.append(
            BackupFile(
                filename=p.name,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            )
        )
    out.sort(key=lambda b: b.created_at, reverse=True)
    return out


def path_for(filename: str) -> Path:
    name = _safe_filename(filename)
    path = _backup_dir() / name
    if not path.exists():
        raise BackupError("Backup file not found")
    return path


def delete_backup(filename: str) -> None:
    path_for(filename).unlink()


def _require_pg_dump() -> None:
    if shutil.which(PG_DUMP) is None:
        raise BackupError(
            "pg_dump is not installed in this container. Rebuild the "
            "backend image so postgresql-client is present."
        )


def _require_pg_restore() -> None:
    if shutil.which(PG_RESTORE) is None or shutil.which(PSQL) is None:
        raise BackupError(
            "pg_restore / psql are not installed in this container. "
            "Rebuild the backend image so postgresql-client is present."
        )


def create_backup() -> BackupFile:
    """Run pg_dump and return the resulting BackupFile.

    Synchronous — for a small/medium DB this finishes in seconds. If you
    need it async, queue this through celery (see app.tasks.backup)."""
    _require_pg_dump()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    filename = f"{BACKUP_PREFIX}-{ts}.dump"
    target = _backup_dir() / filename

    cmd = [PG_DUMP, *_conn_args(), "-Fc", "--no-owner", "--no-privileges", "-f", str(target)]
    try:
        proc = subprocess.run(
            cmd,
            env=_db_env(),
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        target.unlink(missing_ok=True)
        raise BackupError("pg_dump timed out after 10 minutes")

    if proc.returncode != 0:
        target.unlink(missing_ok=True)
        # stderr from pg_dump tends to contain the actual reason on one
        # line — strip to keep the API response tidy.
        msg = (proc.stderr or "pg_dump failed").strip().splitlines()[-1]
        raise BackupError(f"pg_dump failed: {msg}")

    stat = target.stat()
    return BackupFile(
        filename=filename,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )


def _admin_psql(sql: str, *, timeout: int = 30, check: bool = True) -> subprocess.CompletedProcess:
    """Run a single SQL statement against the `postgres` admin database.

    We have to connect somewhere other than the app DB itself to drop /
    create it — Postgres refuses to drop a database while ANY connection
    (including yours) is on it. The `postgres` database always exists
    on a default cluster, so we use it for these maintenance commands.
    """
    _require_pg_restore()
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "pug")
    cmd = [PSQL, "-h", host, "-p", str(port), "-U", user, "-d", "postgres",
           "-v", "ON_ERROR_STOP=1", "-c", sql]
    proc = subprocess.run(
        cmd, env=_db_env(), capture_output=True, text=True,
        timeout=timeout, check=False,
    )
    if check and proc.returncode != 0:
        msg = (proc.stderr or "psql failed").strip().splitlines()[-1]
        raise BackupError(f"psql failed ({sql[:60]}…): {msg}")
    return proc


def restore_backup(source: Path) -> None:
    """Restore the database from a custom-format pg_dump file.

    Strategy: drop the app database and recreate it empty, then
    pg_restore into the fresh DB. We do NOT use pg_restore --clean
    because that issues per-table DROP TABLE statements which deadlock
    against other gunicorn workers / background tasks holding open
    sessions — the request appears to freeze indefinitely.

    Drop / create are issued against the `postgres` admin DB so we
    aren't connected to the database we're dropping. Before the drop
    we explicitly terminate any other backend connections (gunicorn
    siblings, celery worker, beat) — without that DROP DATABASE would
    block on the same locks pg_restore --clean used to block on.

    After the restore SQLAlchemy's engine pool is disposed; the next
    request will reconnect to the restored database. The route layer
    tells the operator their session may need a refresh.
    """
    _require_pg_restore()
    if not source.exists():
        raise BackupError("Backup file not found")

    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "pug")
    db_name = os.getenv("POSTGRES_DB", "pug_accommodation")
    env = _db_env()

    # 1. Release THIS worker's pooled connections so the terminate-and-
    #    drop below doesn't also have to fight us. dispose() flushes the
    #    pool; next session access creates a fresh connection (which
    #    will land on the restored DB).
    try:
        from ..extensions import db as _db
        _db.session.remove()
        _db.engine.dispose()
    except Exception:
        # If we somehow can't import the app db (unit test, CLI), keep
        # going — pg_terminate_backend below catches sibling workers.
        pass

    # 2. Kill every other connection to the target DB so DROP DATABASE
    #    won't block. ON_ERROR_STOP=0 here because pg_terminate_backend
    #    occasionally returns false when a pid has already exited.
    _admin_psql(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{db_name}' AND pid <> pg_backend_pid();",
        timeout=30,
        check=False,
    )

    # 3. Drop + recreate. Quoting the identifier so a hyphen / unusual
    #    char in the DB name still works.
    _admin_psql(f'DROP DATABASE IF EXISTS "{db_name}";', timeout=60)
    _admin_psql(f'CREATE DATABASE "{db_name}" OWNER "{user}";', timeout=30)

    # 4. pg_restore into the fresh, empty DB. No --clean needed —
    #    nothing to drop. --single-transaction so the entire restore
    #    rolls back atomically on the first error instead of leaving
    #    half-built schema in place.
    cmd = [
        PG_RESTORE,
        "-h", host, "-p", str(port), "-U", user, "-d", db_name,
        "--no-owner",
        "--no-privileges",
        "--single-transaction",
        "--exit-on-error",
        str(source),
    ]
    try:
        proc = subprocess.run(
            cmd, env=env, capture_output=True, text=True,
            timeout=900, check=False,
        )
    except subprocess.TimeoutExpired:
        raise BackupError("pg_restore timed out after 15 minutes")

    if proc.returncode != 0:
        msg = (proc.stderr or "pg_restore failed").strip().splitlines()[-1]
        raise BackupError(f"pg_restore failed: {msg}")


def prune_old(retention_days: int) -> int:
    """Delete backup files older than `retention_days`. Returns the
    number of files removed. Called from the scheduled task."""
    if retention_days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc).timestamp() - (retention_days * 86400)
    removed = 0
    for p in _backup_dir().iterdir():
        if not p.is_file() or not p.name.endswith(".dump"):
            continue
        if p.stat().st_mtime < cutoff:
            try:
                p.unlink()
                removed += 1
            except OSError:
                pass
    return removed
