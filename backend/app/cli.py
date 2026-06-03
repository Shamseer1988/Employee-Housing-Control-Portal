import os
import click
from flask import Flask

from .extensions import db
from .models import User, Role, Permission
from .services.permissions import PERMISSION_CATALOG, ROLE_PRESETS, permission_code


def _seed_permissions() -> dict[str, Permission]:
    existing = {p.code: p for p in Permission.query.all()}
    for module, action, desc in PERMISSION_CATALOG:
        code = permission_code(module, action)
        if code in existing:
            p = existing[code]
            if p.description != desc:
                p.description = desc
            continue
        p = Permission(code=code, module=module, action=action, description=desc)
        db.session.add(p)
        existing[code] = p
    db.session.flush()
    return existing


def _seed_roles(perm_index: dict[str, Permission]) -> dict[str, Role]:
    existing = {r.code: r for r in Role.query.all()}
    all_perms = list(perm_index.values())
    for code, cfg in ROLE_PRESETS.items():
        role = existing.get(code)
        if role is None:
            role = Role(code=code, name=cfg["name"], description=cfg["description"],
                        is_system=True, is_active=True)
            db.session.add(role)
            existing[code] = role
        else:
            role.name = cfg["name"]
            role.description = cfg["description"]
            role.is_system = True
        codes = cfg["permissions"]
        if codes == ["*"]:
            role.permissions = all_perms
        else:
            role.permissions = [perm_index[c] for c in codes if c in perm_index]
    db.session.flush()
    return existing


def _seed_super_user(role_index: dict[str, Role]) -> User:
    username = (os.getenv("SUPERUSER_USERNAME") or "admin").lower()
    email = (os.getenv("SUPERUSER_EMAIL") or "admin@pugroup.local").lower()
    password = os.getenv("SUPERUSER_PASSWORD") or "ChangeMe123!"

    user = User.query.filter(db.func.lower(User.username) == username).first()
    if user is None:
        user = User(
            username=username,
            email=email,
            full_name="System Administrator",
            is_active=True,
            is_super_user=True,
        )
        user.set_password(password)
        user.roles = [role_index["super_user"]] if "super_user" in role_index else []
        db.session.add(user)
        click.echo(f"  → created super user '{username}' (password from SUPERUSER_PASSWORD or default 'ChangeMe123!')")
    else:
        user.is_super_user = True
        user.is_active = True
        click.echo(f"  → super user '{username}' already exists; ensured flags")
    return user


def register_commands(app: Flask) -> None:
    @app.cli.command("seed-demo")
    def seed_demo():
        """Populate the database with realistic demo data for testing.

        Creates 4 landlords (mixed expiry buckets), 6 divisions, 4 properties
        with floors/rooms/beds, 30 employees and ~18 active accommodation
        assignments. Idempotent: existing rows are left alone.
        """
        from .services.demo_data import seed_all
        click.echo("Seeding demo data...")
        counts = seed_all()
        for k, v in counts.items():
            click.echo(f"  → {k}: {v}")
        click.echo("Done. Sign in as admin and explore.")

    @app.cli.command("wait-for-db")
    @click.option("--timeout", default=60, show_default=True,
                  help="Seconds to keep retrying before giving up.")
    def wait_for_db(timeout):
        """Block until the database accepts a connection.

        Postgres may finish starting a few seconds after its service
        manager marks it Started. Calling SELECT 1 in a polling loop
        avoids the backend crash-looping on a transient connection
        refused while the DB is still warming up.
        """
        import time
        from sqlalchemy import text

        deadline = time.time() + timeout
        attempt = 0
        while True:
            attempt += 1
            try:
                with db.engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                click.echo(f"Database reachable (attempt {attempt}).")
                return
            except Exception as exc:  # noqa: BLE001 — any driver/DNS error retries
                if time.time() >= deadline:
                    click.echo(f"Database not reachable after {timeout}s: {exc}")
                    raise SystemExit(1)
                click.echo(f"  waiting for database (attempt {attempt})...")
                time.sleep(2)

    @app.cli.command("init-db")
    def init_db():
        """Create all tables from the SQLAlchemy models.

        Use this for fresh deployments (first-time install, CI tests) where
        no Alembic migration history exists. The command is idempotent: if
        a table is already present, SQLAlchemy leaves it alone. After
        running, switch to `flask db upgrade` for subsequent schema changes
        once you've initialised migrations.
        """
        click.echo("Creating any missing tables from models...")
        db.create_all()
        click.echo("Done. Run `flask --app wsgi seed` next.")

    @app.cli.command("run-job")
    @click.argument("name")
    def run_job(name: str):
        """Synchronously run a registered Celery task by short name
        (no broker required). Lets operators verify a task's logic
        without spinning up a worker. Examples:
            flask run-job daily_expiry_sweep
            flask run-job recompute_reminder_summary
        """
        from .celery_app import celery
        # Match either the bare function name or the full dotted task name.
        candidates = [t for tname, t in celery.tasks.items()
                      if tname.endswith("." + name) or tname == name]
        if not candidates:
            click.echo(f"Unknown task '{name}'. Available:")
            for tname in sorted(celery.tasks):
                if tname.startswith("app."):
                    click.echo(f"  {tname}")
            raise SystemExit(1)
        result = candidates[0].apply().get()
        click.echo(f"ok: {result}")

    @app.cli.command("dump-openapi")
    @click.option("--output", "-o", default="-",
                  help="Output file path; '-' (default) prints to stdout.")
    def dump_openapi(output: str):
        """Emit the OpenAPI 3 spec as JSON.

        Used by the frontend codegen script (`npm run gen-api-types`)
        to drive openapi-typescript without booting a full HTTP server.
        """
        import json
        spec = app.spec
        # apiflask.app.spec is already a dict in 2.x; older versions
        # returned a Spec object. Handle both defensively.
        if hasattr(spec, "to_dict"):
            spec = spec.to_dict()
        payload = json.dumps(spec, indent=2, sort_keys=True, default=str)
        if output == "-":
            click.echo(payload)
        else:
            with open(output, "w") as fh:
                fh.write(payload)
            click.echo(f"wrote {output}")

    @app.cli.command("migrate-phase8")
    def migrate_phase8():
        """Adds notifications table on existing DBs. Idempotent."""
        click.echo("Applying Phase 8 schema delta...")
        bind = db.engine
        with bind.begin() as conn:
            from sqlalchemy import inspect
            if not inspect(bind).has_table("notifications"):
                from .models import Notification
                Notification.__table__.create(bind=conn)
                click.echo("  → notifications created")
            else:
                click.echo("  → notifications already present")
        click.echo("Done.")

    @app.cli.command("migrate-phase5")
    def migrate_phase5():
        """One-shot schema upgrade for the Phase 5 background-jobs release.

        Creates the job_runs table on existing DBs. Idempotent."""
        click.echo("Applying Phase 5 schema delta...")
        bind = db.engine
        with bind.begin() as conn:
            from sqlalchemy import inspect
            if not inspect(bind).has_table("job_runs"):
                from .models import JobRun
                JobRun.__table__.create(bind=conn)
                click.echo("  → job_runs created")
            else:
                click.echo("  → job_runs already present")
        click.echo("Done.")

    @app.cli.command("migrate-all")
    def migrate_all():
        """Run every migrate-phaseN command in order, idempotently.

        Safe to invoke on every boot — each phase command is a no-op
        when its schema delta is already applied. Fresh installs see
        every check pass; upgraded installs catch up to head.
        """
        click.echo("Running all phase migrations idempotently...")
        bind = db.engine
        from sqlalchemy import inspect, text
        with bind.begin() as conn:
            insp = inspect(bind)

            # --- Phase 1: users.token_version + jwt_blocklist
            if insp.has_table("users"):
                user_cols = {c["name"] for c in insp.get_columns("users")}
                if "token_version" not in user_cols:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
                    ))
                    click.echo("  + users.token_version")
            if not insp.has_table("jwt_blocklist"):
                from .models import JWTBlocklist
                JWTBlocklist.__table__.create(bind=conn)
                click.echo("  + jwt_blocklist")

            # --- Phase 5: job_runs
            if not insp.has_table("job_runs"):
                from .models import JobRun
                JobRun.__table__.create(bind=conn)
                click.echo("  + job_runs")

            # --- Phase 8: notifications
            if not insp.has_table("notifications"):
                from .models import Notification
                Notification.__table__.create(bind=conn)
                click.echo("  + notifications")

            # --- Phase 6: drop unused property denormalisation columns.
            # _counts_for() (in routes/properties.py) is the single source
            # of truth now. The columns were nullable and never written.
            if insp.has_table("properties"):
                prop_cols = {c["name"] for c in insp.get_columns("properties")}
                dialect = bind.dialect.name
                for col in ("total_floors", "total_rooms", "total_bed_capacity"):
                    if col not in prop_cols:
                        continue
                    # SQLite ≥ 3.35 and Postgres both support DROP COLUMN.
                    # We avoid a batch_alter_table dance because the column
                    # has no constraints and no other table references it.
                    if dialect in ("sqlite", "postgresql"):
                        conn.execute(text(f"ALTER TABLE properties DROP COLUMN {col}"))
                        click.echo(f"  - properties.{col}")

        click.echo("Done.")

    @app.cli.command("migrate-phase1")
    def migrate_phase1():
        """One-shot schema upgrade for the Phase 1 cookie-auth release.

        Idempotent. Run once on existing DBs that were created before
        users.token_version + jwt_blocklist existed. Fresh installs get
        these via `init-db` automatically and don't need this command."""
        click.echo("Applying Phase 1 schema delta...")
        bind = db.engine
        with bind.begin() as conn:
            from sqlalchemy import text, inspect
            insp = inspect(bind)
            user_cols = {c["name"] for c in insp.get_columns("users")}
            if "token_version" not in user_cols:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
                ))
                click.echo("  → users.token_version added")
            else:
                click.echo("  → users.token_version already present")
            if not insp.has_table("jwt_blocklist"):
                # Lean on the model's CreateTable so dialect quirks are handled.
                from .models import JWTBlocklist
                JWTBlocklist.__table__.create(bind=conn)
                click.echo("  → jwt_blocklist created")
            else:
                click.echo("  → jwt_blocklist already present")
        click.echo("Done.")

    @app.cli.command("seed")
    def seed():
        """Seed permissions, roles, and the default super user."""
        click.echo("Seeding permissions...")
        perm_index = _seed_permissions()
        click.echo(f"  → {len(perm_index)} permissions present")

        click.echo("Seeding roles...")
        role_index = _seed_roles(perm_index)
        click.echo(f"  → {len(role_index)} roles present")

        click.echo("Seeding super user...")
        _seed_super_user(role_index)

        click.echo("Seeding system settings...")
        from .services import settings as settings_service
        settings_service.seed_defaults()

        db.session.commit()
        click.echo("Done.")
