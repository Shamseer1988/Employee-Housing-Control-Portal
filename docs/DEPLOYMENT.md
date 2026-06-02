# Deployment runbook

This document covers production deployment on an Ubuntu VM behind Cloudflare,
using Docker Compose for orchestration.

---

## 1. Architecture

```
                                Cloudflare (TLS, WAF, DNS)
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │   nginx :80      │  (reverse proxy)
                                 └────────┬─────────┘
                            ┌─────────────┴─────────────┐
                            ▼                           ▼
                  ┌────────────────────┐     ┌─────────────────────┐
                  │  Next.js :3000      │     │  Flask + gunicorn   │
                  │  (frontend)         │     │  :5000 (backend)    │
                  └────────────────────┘     └──────────┬──────────┘
                                                        ▼
                                              ┌──────────────────┐
                                              │  Postgres :5432  │
                                              └──────────────────┘
```

Volumes persisted on the host:
- `pug_pgdata` — Postgres data directory.
- `pug_uploads` — attachment files served by the backend.
- `./backups` (bind mount) — DB dumps written by `scripts/backup.sh`.

---

## 2. Prerequisites

- Ubuntu 22.04+ host (a 2 vCPU / 4 GB box is a comfortable start).
- Docker Engine 24+ with the Compose plugin (`docker compose` v2 command).
- A Cloudflare-fronted hostname pointing to the host IP (Cloudflare proxied,
  full TLS to origin). The nginx config trusts `CF-Connecting-IP`.

---

## 3. First-time setup

```bash
# As your deploy user:
sudo mkdir -p /opt/pug-accommodation
sudo chown "$USER":"$USER" /opt/pug-accommodation
cd /opt/pug-accommodation

git clone https://github.com/Shamseer1988/Employee-Housing-Control-Portal.git .
git checkout main          # or the release tag you're deploying

cp .env.example .env       # then edit:
#   - POSTGRES_PASSWORD             strong
#   - SECRET_KEY                    `openssl rand -hex 32`
#   - JWT_SECRET_KEY                `openssl rand -hex 32`
#   - SUPERUSER_PASSWORD            strong; change on first login
#   - PUBLIC_BASE_URL               e.g. https://accommodation.pugroup.com
#   - CORS_ORIGINS                  same as PUBLIC_BASE_URL

docker compose build
docker compose up -d
docker compose logs -f backend   # watch for "Running on http://0.0.0.0:5000"
```

The backend's `command:` runs `flask db upgrade` then `flask seed` on every
boot. Both are idempotent — only fresh data is added.

Verify:
- `curl http://localhost/api/v1/health` → `{ status: "healthy" }`
- Open `https://<your-host>/` and sign in as the configured super user.

---

## 4. Environment variables (full list)

Set in `/opt/pug-accommodation/.env`. After changes:
`docker compose up -d` (no rebuild needed).

| Variable | Where used | Notes |
| --- | --- | --- |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | db & backend | Backend constructs `DATABASE_URL` from these. |
| `SECRET_KEY` | backend Flask | Sessions / CSRF. 32+ random bytes. |
| `JWT_SECRET_KEY` | backend JWT | Access & refresh signing. **Min 32 bytes**. |
| `PUBLIC_BASE_URL` | frontend build + CORS | Baked into the Next.js bundle at build time. |
| `CORS_ORIGINS` | backend | Comma-separated list. Mirror `PUBLIC_BASE_URL`. |
| `SUPERUSER_USERNAME` / `SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` | backend seed | Created/refreshed on every boot. **Change password after first login.** |
| `HTTP_PORT` | nginx published port | Default 80. Leave at 80; let Cloudflare handle TLS. |
| `GUNICORN_WORKERS` | backend | Override the default `2 × cores + 1`. |

---

## 5. Upgrades

```bash
cd /opt/pug-accommodation
git fetch origin
git checkout <new-tag-or-sha>

# Take a backup first
scripts/backup.sh

docker compose build
docker compose up -d --remove-orphans
docker compose logs -f backend   # confirm migrations applied
```

Roll back by checking out the previous tag and repeating, optionally
restoring the pre-upgrade dump (`scripts/restore.sh`).

---

## 6. Database backup & restore

Manual backup (writes to `./backups/pug-YYYYMMDDTHHMMSSZ.sql.gz`):

```bash
scripts/backup.sh
```

Restore a dump (interactive confirmation required):

```bash
scripts/restore.sh backups/pug-20260101T030000Z.sql.gz
docker compose restart backend
```

Schedule daily backups at 03:00 UTC with cron:

```cron
0 3 * * * cd /opt/pug-accommodation && RETENTION_DAYS=30 ./scripts/backup.sh >> /var/log/pug-backup.log 2>&1
```

Off-site copy (recommended): pipe `./backups` to S3 / rsync.net with a
weekly job — e.g.

```bash
aws s3 sync ./backups/ s3://pug-backups/$(date -u +%Y/%m) --exclude "*" --include "pug-*.sql.gz"
```

---

## 7. Log rotation

All services log to stdout/stderr; Docker's `json-file` driver rotates
logs by default. To cap size, drop a `daemon.json` on the host:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
```

Then `sudo systemctl restart docker`.

The host-side `pug-backup.log` is rotated via `/etc/logrotate.d/pug-backup`:

```
/var/log/pug-backup.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
```

---

## 8. TLS via Cloudflare

- DNS: A record → host IP, **Proxy: ON** (orange cloud).
- SSL/TLS mode: **Full (strict)** if you also terminate TLS at nginx
  with a Cloudflare Origin Certificate; **Full** is acceptable with the
  default config above which speaks plain HTTP to Cloudflare.
- Page Rules / WAF: keep `/api/v1/auth/login` under stricter rate
  limiting (e.g. 30 requests / minute / IP).
- Cloudflare's `CF-Connecting-IP` header is trusted by the standalone
  edge proxy stack (lives outside this repo).

---

## 9. Health checks & alerts

Each container has a `HEALTHCHECK`:
- backend: `GET /api/v1/health` every 30s.
- frontend: HEAD `/` every 30s.
- nginx: `GET /health` (proxied to backend) every 30s.
- db: `pg_isready` every 10s.

Wire your monitoring (Uptime Kuma / BetterStack / Pingdom) against:
- `https://<host>/health`
- `https://<host>/api/v1/health/db`

---

## 10. Common operations

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f frontend

# Run a one-off Flask shell
docker compose exec backend flask --app wsgi shell

# Re-seed permissions / roles / settings (idempotent)
docker compose exec backend flask --app wsgi seed

# Apply pending migrations explicitly
docker compose exec backend flask --app wsgi db upgrade

# Rotate super user password
docker compose exec backend flask --app wsgi shell
>>> from app.models import User
>>> u = User.query.filter_by(username="admin").one()
>>> u.set_password("NewStrongPass!")
>>> from app.extensions import db; db.session.commit()
```

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Frontend renders but every API call 401s | `JWT_SECRET_KEY` changed between deploys | Force re-login (clears localStorage) or rotate users' tokens. |
| `flask db upgrade` errors `relation already exists` | Migration run against an existing DB without `alembic_version` | `flask db stamp head` once, then `flask db upgrade`. |
| Backend can't connect to db on boot | Race with `depends_on` | The compose file already gates backend on `db: service_healthy`; if you removed it, add it back. |
| Uploads disappear after redeploy | Volume wasn't declared | `pug_uploads` must be a named volume (see `docker-compose.yml`). |
| Bytes-on-disk for backups grow forever | `RETENTION_DAYS` too high or backups never pruned | Lower retention or add a cron prune step. |
