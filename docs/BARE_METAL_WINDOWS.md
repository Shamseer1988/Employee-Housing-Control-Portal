# Bare-metal Windows deployment

This is the canonical install + operate guide now that we no longer
ship containers. Reference architecture:

```
            ┌────────────────────────────────────────────────┐
            │            Windows host (one PC)               │
            │                                                │
            │  PostgreSQL 17  ←──── Flask backend (waitress) │
            │      :5432              127.0.0.1:5000         │
            │                              ▲                 │
            │  Redis 7        ←──── Celery worker + beat     │
            │      :6379                                     │
            │                                                │
            │                         Next.js frontend       │
            │                         127.0.0.1:3000         │
            └──────────────────────┬─────────────────────────┘
                                   │
                                  443 (nginx for Windows)
                                   │
                              Cloudflare Tunnel
                                   │
                       accommodation.parisunitedgroup.com
```

Five Windows services (or four windows + nginx) make up the app.

## 1. System prerequisites

Install these on the host **before** running any project scripts.

### 1.1 PostgreSQL 17
- Download the official Windows installer: https://www.postgresql.org/download/windows/
- Install with the bundled `pgAdmin` if you want a GUI.
- Add `C:\Program Files\PostgreSQL\17\bin` to **System PATH**.
- Set a strong superuser (`postgres`) password during install — write it down.
- Verify: `psql --version` should print `psql (PostgreSQL) 17.x`.

### 1.2 Python 3.11
- Download: https://www.python.org/downloads/windows/
- Install with **"Add python.exe to PATH"** checked.
- Verify: `python --version` → `Python 3.11.x`.

### 1.3 Node.js 20 (LTS)
- Download: https://nodejs.org/en/download/ (Windows installer, LTS).
- Verify: `node --version` → `v20.x` and `npm --version` → `10.x`.

### 1.4 Redis (Windows doesn't ship a native one)

Pick ONE. Recommended: **Memurai Developer** (free for dev/non-prod) or
WSL2.

- **Memurai** — Windows-native, Redis-protocol-compatible.
  - https://www.memurai.com/get-memurai
  - Installs as a service, listens on `127.0.0.1:6379`.
  - Free Developer edition is fine for production unless you go enterprise.

- **WSL2 + Redis** — free, requires WSL2.
  - `wsl --install` (one-time, reboot)
  - In the Ubuntu shell: `sudo apt-get install redis-server`
  - Make it auto-start: `sudo systemctl enable redis-server`
  - From Windows, `localhost:6379` reaches it transparently.

- **Don't** use the old "Microsoft archived Redis 5.0" — abandoned, has
  unpatched CVEs.

Verify either choice: `redis-cli ping` → `PONG`.

### 1.5 nginx for Windows
- Download: https://nginx.org/en/download.html (Stable Windows zip).
- Unzip to `C:\nginx\`.
- See `C:\Apps\edge-proxy\` (the standalone edge proxy stack) for the
  full config recipe. That folder is separate from this repo.
- Confirm: `cd C:\nginx; .\nginx.exe -v` → `nginx/1.27.x`.

### 1.6 Git
- https://git-scm.com/downloads
- Verify: `git --version`.

## 2. First-time setup

```powershell
:: 2.1 Clone the repo
git clone https://github.com/Shamseer1988/Employee-Housing-Control-Portal.git C:\Apps\Employee-Housing-Control-Portal
cd C:\Apps\Employee-Housing-Control-Portal

:: 2.2 Run the install script (creates venv, installs deps, builds frontend)
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1

:: 2.3 Create the database role + database
psql -U postgres
```

In the `psql` prompt:

```sql
CREATE ROLE pug LOGIN PASSWORD 'pick-a-strong-password';
CREATE DATABASE pug_accommodation OWNER pug;
\q
```

Then edit `backend\.env`:

```ini
POSTGRES_PASSWORD=pick-a-strong-password
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(48))">
JWT_SECRET_KEY=<run that twice — different value each time>
SUPERUSER_PASSWORD=<temporary admin password>
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
```

Bootstrap the database (creates tables, runs phase migrations, seeds
permissions + roles + admin user):

```powershell
.\scripts\bootstrap-db.ps1
```

## 3. Start the app

```powershell
.\scripts\start-all.ps1
```

This opens four PowerShell windows — backend, worker, beat, frontend.
Watch each one for the startup banner; expect:

| Window | What "ready" looks like |
|---|---|
| `housing-backend` | `Serving on http://127.0.0.1:5000` from waitress |
| `housing-worker` | `celery@<host> ready.` |
| `housing-beat` | `beat: Starting...` |
| `housing-frontend` | `Ready in N ms` from Next.js |

Smoke test:

```powershell
curl http://127.0.0.1:5000/api/v1/health
curl http://127.0.0.1:3000
```

## 4. Stop the app

```powershell
.\scripts\stop-all.ps1
```

Closes the four windows + kills any orphaned waitress/celery/node
processes still bound to this repo.

## 5. Update workflow (pull a new release)

```powershell
.\scripts\stop-all.ps1
git pull
.\scripts\install-windows.ps1     :: re-runs pip install + npm ci + build
.\scripts\start-all.ps1
```

`install-windows.ps1` is idempotent — it only reinstalls deps when
requirements files have changed.

## 6. Daily ops

| Task | Command |
|---|---|
| Status — are processes alive? | `Get-Process waitress-serve, celery, node` |
| Postgres shell | `psql -U pug -d pug_accommodation` |
| Connect to Redis | `redis-cli` |
| Tail backend log (waitress writes to stderr) | the open `housing-backend` window |
| Restart backend only | `Stop-Process -Name waitress-serve -Force; cd backend; .venv\Scripts\waitress-serve --listen=127.0.0.1:5000 wsgi:app` |
| Manual backup | Use the **Settings → Backup → Backup now** button in the UI |
| Trigger a Flask CLI command | `cd backend; .venv\Scripts\flask --app wsgi <command>` |

## 7. Run as Windows Services (recommended for production)

Manual start scripts work, but a real prod install registers the four
processes as services so they start on boot and restart on crash. Use
NSSM (https://nssm.cc):

```powershell
:: One time per service
nssm install housing-backend  C:\Apps\Employee-Housing-Control-Portal\backend\.venv\Scripts\waitress-serve.exe
nssm set     housing-backend AppParameters "--listen=127.0.0.1:5000 --threads=8 wsgi:app"
nssm set     housing-backend AppDirectory  C:\Apps\Employee-Housing-Control-Portal\backend
nssm set     housing-backend Start         SERVICE_AUTO_START
nssm start   housing-backend

:: Repeat for worker, beat, frontend (adjust AppParameters/AppDirectory).
:: See nssm.cc/usage for full reference.
```

Once registered, manage via `services.msc` or:

```powershell
Restart-Service housing-backend
Get-Service housing-*
```

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend hangs on `wait-for-db` | Postgres service stopped | `Start-Service postgresql-x64-17` |
| `Cannot connect to redis://localhost:6379` | Memurai/WSL Redis stopped | `Start-Service Memurai` (or `wsl -d Ubuntu redis-cli ping`) |
| Frontend `EADDRINUSE :3000` | Old `node` process still running | `Stop-Process -Name node -Force` then restart |
| `flask seed` says "Insecure production configuration" | `.env` missing SECRET_KEY or it equals the dev default | Generate a 48-byte token; redo step 2.3 |
| 500s on `/api/v1/health` | Redis is down (rate limiter needs it) | Start Redis service |
| HTTPS gets `522` from Cloudflare | nginx (in the separate edge-proxy stack) is down or not bound to 443 | `cd C:\Apps\edge-proxy; nginx.exe -s reload` |

## 9. What changed since the Docker era

- **gunicorn** (Linux-only) → **waitress** (cross-platform). Same WSGI
  interface, fewer signal-handling tricks.
- **No more compose / dockerfiles** — install scripts under `scripts\`
  do what `docker compose up -d --build` used to.
- **Backup volume mount** → `BACKUP_FOLDER` env var (defaults to
  `..\backups`). Set it to an absolute path in production.
- **Container healthcheck** → polled manually (Settings → status panel)
  or via the open backend window.
- **nginx is external** — lives in `C:\Apps\edge-proxy\`, not in this
  repo.
