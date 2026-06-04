# Fresh deploy from scratch — bare-metal Windows

This is the canonical step-by-step from `git clone` to a public site
on `https://accommodation.parisunitedgroup.com`. No Docker. The host
runs every service as a native Windows process behind the standalone
nginx that lives at `C:\Apps\edge-proxy\`.

> **Time budget:** ~60 min on a fresh PC if you have the installers
> downloaded already. ~15 min on a PC where the prerequisites are
> already installed.

---

## Phase 0 — One-time host prerequisites

Skip this phase if PostgreSQL 17, Python 3.11, Node 20, Memurai and
nginx are already installed and verified. Detailed install notes
are in [`docs/BARE_METAL_WINDOWS.md`](BARE_METAL_WINDOWS.md) §1.

| Tool | Get | Verify |
|---|---|---|
| **Git** | https://git-scm.com/downloads | `git --version` |
| **PostgreSQL 17** | https://www.postgresql.org/download/windows/ | `psql --version` (add `C:\Program Files\PostgreSQL\17\bin` to PATH if needed) |
| **Python 3.11** | https://www.python.org/downloads/windows/ — check "Add python.exe to PATH" **and** "py launcher" | `py -3.11 --version` |
| **Node 20 LTS** | https://nodejs.org/en/download/ | `node --version` and `npm --version` |
| **Memurai Developer** (Redis on Windows) | https://www.memurai.com/get-memurai | `redis-cli ping` → `PONG` |
| **nginx for Windows** | https://nginx.org/en/download.html (Stable) — unzip to `C:\nginx\` | `cd C:\nginx; .\nginx.exe -v` |
| **NSSM** (run things as Windows services) | https://nssm.cc/download | `nssm version` (drop `nssm.exe` somewhere on PATH or use full path) |

> **Microsoft Store Python trap.** On a fresh Windows install, the
> `python` first on PATH may be the Microsoft Store launcher stub —
> prints "Python was not found" and exits. Always verify with
> `py -3.11 --version`; if `py` works, the install script will use it
> automatically. If `py` is missing, re-run the official Python
> installer with **"py launcher"** ticked.

---

## Phase 1 — Clone and install the app

### 1.1 Clone the repo

```powershell
:: Move to a sane parent folder
cd C:\Apps

:: Clone
git clone https://github.com/Shamseer1988/Employee-Housing-Control-Portal.git
cd Employee-Housing-Control-Portal

:: Sit on the branch with the bare-metal refactor.
:: After PR #43 merges this becomes `git checkout main`.
git checkout claude/dreamy-fermat-JqZ1O
```

### 1.2 Install dependencies (creates venv + builds frontend)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```

You should see four sections in order: **Resolving Python 3.11**,
**Other prereqs**, **Backend venv**, **Frontend build**, **backend\.env**.
Anything that errors will say exactly why and how to fix it.

When it finishes:

```
Done. Next steps:
  1. Edit backend\.env (secrets, DB password).
  2. Create the Postgres database + role …
  3. Run: .\scripts\bootstrap-db.ps1
  4. Run: .\scripts\start-all.ps1
```

### 1.3 Create the Postgres role + database

```powershell
psql -U postgres
```

Inside the `psql` prompt — pick a strong, random password for `pug`:

```sql
CREATE ROLE pug LOGIN PASSWORD 'use-a-strong-random-password';
CREATE DATABASE pug_accommodation OWNER pug;
\q
```

### 1.4 Fill in `backend\.env`

Open `backend\.env` and edit the following at minimum:

```ini
SECRET_KEY=<run: py -3.11 -c "import secrets; print(secrets.token_urlsafe(48))">
JWT_SECRET_KEY=<run the line above again — a SECOND, different token>
POSTGRES_PASSWORD=use-a-strong-random-password    ;; must match the role you created in 1.3
SUPERUSER_PASSWORD=<a temporary admin password — you'll change it after first login>
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
FLASK_ENV=production
JWT_COOKIE_SECURE=true
JWT_COOKIE_SAMESITE=Lax
```

Leave everything else at defaults for now.

### 1.5 Bootstrap the database

```powershell
.\scripts\bootstrap-db.ps1
```

This runs `flask wait-for-db → init-db → migrate-all → seed`. Expect:

```
Database reachable (attempt 1).
Creating any missing tables from models...
Running all phase migrations idempotently...
Seeding permissions...   → 40 permissions present
Seeding roles...         → 9 roles present
Seeding super user...    → created super user 'admin'
Seeding system settings...
Done.
```

### 1.6 Smoke-start the app

```powershell
.\scripts\start-all.ps1
```

Four PowerShell windows open. Wait ~10 seconds, then verify:

```powershell
curl http://127.0.0.1:5000/api/v1/health
curl http://127.0.0.1:3000
```

Expect a `200` JSON from the backend and an HTML page from Next.js.

If either fails, close the four windows (Ctrl-C each, or
`.\scripts\stop-all.ps1`), check the error in the corresponding
window, fix, and re-run.

---

## Phase 2 — Stand up nginx (the edge proxy)

Your edge proxy folder (`C:\Apps\edge-proxy\`) currently contains a
Docker stack. With Docker gone, the same `nginx.conf` runs natively
on Windows with two small upstream changes.

### 2.1 Edit the upstreams in `C:\Apps\edge-proxy\nginx.conf`

Replace these two blocks:

```nginx
upstream housing_backend {
    server housing-backend:5000;
    keepalive 32;
}
upstream housing_frontend {
    server housing-frontend:3000;
    keepalive 32;
}
```

With these:

```nginx
upstream housing_backend {
    server 127.0.0.1:5000;
    keepalive 32;
}
upstream housing_frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}
```

(Docker compose's DNS used the service alias; native nginx talks to
the waitress + Next processes over loopback.)

### 2.2 Wire the configs into nginx for Windows

```powershell
:: Copy the edge-proxy configs into the nginx install
Copy-Item C:\Apps\edge-proxy\nginx.conf C:\nginx\conf\conf.d\housing.conf -Force
New-Item -ItemType Directory -Path C:\nginx\conf\snippets -Force | Out-Null
Copy-Item C:\Apps\edge-proxy\snippets\* C:\nginx\conf\snippets\ -Force

:: Origin cert files — paste into the SSL folder once, never commit them
New-Item -ItemType Directory -Path C:\nginx\ssl -Force | Out-Null
Copy-Item C:\Apps\edge-proxy\ssl\origin.crt C:\nginx\ssl\origin.crt -Force
Copy-Item C:\Apps\edge-proxy\ssl\origin.key C:\nginx\ssl\origin.key -Force
```

Update the snippet that references the cert paths so they match the
Windows folder:

```powershell
notepad C:\nginx\conf\snippets\ssl-common.conf
```

Change the two paths to:

```nginx
ssl_certificate     C:/nginx/ssl/origin.crt;
ssl_certificate_key C:/nginx/ssl/origin.key;
```

(Forward slashes — nginx on Windows handles both, but `/` avoids
escape-quoting headaches.)

The same applies to every `include /etc/nginx/snippets/...` line in
`housing.conf` — change them to forward slashes pointing at
`C:/nginx/conf/snippets/`:

```powershell
:: One-liner to fix every include path in housing.conf
(Get-Content C:\nginx\conf\housing.conf) `
    -replace '/etc/nginx/snippets/', 'C:/nginx/conf/snippets/' `
    -replace '/etc/nginx/ssl/', 'C:/nginx/ssl/' `
    | Set-Content C:\nginx\conf\housing.conf
```

### 2.3 Tell the main nginx.conf to include `housing.conf`

`C:\nginx\conf\nginx.conf` (the default one that shipped with the
nginx zip) — open it and inside the `http { }` block at the bottom
add:

```nginx
include C:/nginx/conf/conf.d/*.conf;
```

(If a default `server { listen 80; ... }` block exists in there,
comment it out — `housing.conf` provides its own.)

### 2.4 Test the config and start nginx

```powershell
cd C:\nginx
.\nginx.exe -t

:: Expect:
:: nginx: the configuration file C:\nginx/conf/nginx.conf syntax is ok
:: nginx: configuration file C:\nginx/conf/nginx.conf test is successful

.\nginx.exe
```

Nothing prints on a successful start — nginx forks into the background.
Verify it's listening:

```powershell
Get-NetTCPConnection -LocalPort 80, 443 | Format-Table LocalAddress, LocalPort, State
```

Both 80 and 443 should appear as `Listen`.

### 2.5 Loopback smoke test

```powershell
:: 80 → 301 redirect
curl http://127.0.0.1/health

:: 443 with Host header (skip cert validation since cert is for the real domain)
curl --resolve accommodation.parisunitedgroup.com:443:127.0.0.1 ^
     -k https://accommodation.parisunitedgroup.com/health
```

The second call should return the `{"status":"healthy"...}` JSON.

---

## Phase 3 — Open the office network and verify external

### 3.1 Windows Firewall

```powershell
New-NetFirewallRule -DisplayName "HTTP-in"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "HTTPS-in" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

### 3.2 Office router port forwarding

In the router admin page:

| External port | Internal IP | Internal port | Protocol |
|---|---|---|---|
| 80 | <host LAN IP> | 80 | TCP |
| 443 | <host LAN IP> | 443 | TCP |

Find your LAN IP with `ipconfig | findstr IPv4`.

### 3.3 Verify Cloudflare DNS

Cloudflare → `parisunitedgroup.com` zone → DNS → confirm:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `accommodation` | <office public IP> | **Proxied** (orange cloud) |

And under SSL/TLS → Overview: mode must be **Full (Strict)**.

### 3.4 Verify from outside

From a phone on cellular (not office Wi-Fi):

```bash
curl -I https://accommodation.parisunitedgroup.com/health
```

Expect:

```
HTTP/2 200
cf-ray: ...
```

Open `https://accommodation.parisunitedgroup.com` in a browser. Log in
as `admin` with the password you set in `backend\.env`. Change the
password immediately via Users & Roles.

---

## Phase 4 — Make it survive a reboot (Windows services via NSSM)

Right now everything dies when you close the PowerShell windows.
Register the five processes as Windows services so they boot with
the PC and restart on crash.

> Logs need a folder — create it once:
> ```powershell
> New-Item -ItemType Directory -Path C:\Apps\housing-logs -Force | Out-Null
> ```

### 4.1 backend

```powershell
nssm install housing-backend  C:\Apps\Employee-Housing-Control-Portal\backend\.venv\Scripts\waitress-serve.exe
nssm set     housing-backend AppParameters "--listen=127.0.0.1:5000 --threads=8 wsgi:app"
nssm set     housing-backend AppDirectory  C:\Apps\Employee-Housing-Control-Portal\backend
nssm set     housing-backend AppStdout     C:\Apps\housing-logs\backend.log
nssm set     housing-backend AppStderr     C:\Apps\housing-logs\backend.log
nssm set     housing-backend AppStdoutCreationDisposition  4
nssm set     housing-backend AppStderrCreationDisposition  4
nssm set     housing-backend AppRotateFiles 1
nssm set     housing-backend AppRotateBytes 10485760
nssm set     housing-backend Start         SERVICE_AUTO_START
nssm start   housing-backend
```

### 4.2 worker

```powershell
nssm install housing-worker  C:\Apps\Employee-Housing-Control-Portal\backend\.venv\Scripts\celery.exe
nssm set     housing-worker AppParameters "-A celery_worker.celery worker --pool=solo --loglevel=info"
nssm set     housing-worker AppDirectory  C:\Apps\Employee-Housing-Control-Portal\backend
nssm set     housing-worker AppStdout     C:\Apps\housing-logs\worker.log
nssm set     housing-worker AppStderr     C:\Apps\housing-logs\worker.log
nssm set     housing-worker Start         SERVICE_AUTO_START
nssm start   housing-worker
```

### 4.3 beat

```powershell
nssm install housing-beat  C:\Apps\Employee-Housing-Control-Portal\backend\.venv\Scripts\celery.exe
nssm set     housing-beat AppParameters "-A celery_worker.celery beat --loglevel=info --schedule=C:\Apps\housing-logs\celerybeat-schedule"
nssm set     housing-beat AppDirectory  C:\Apps\Employee-Housing-Control-Portal\backend
nssm set     housing-beat AppStdout     C:\Apps\housing-logs\beat.log
nssm set     housing-beat AppStderr     C:\Apps\housing-logs\beat.log
nssm set     housing-beat Start         SERVICE_AUTO_START
nssm start   housing-beat
```

### 4.4 frontend

```powershell
nssm install housing-frontend  C:\Program Files\nodejs\npm.cmd
nssm set     housing-frontend AppParameters "start"
nssm set     housing-frontend AppDirectory  C:\Apps\Employee-Housing-Control-Portal\frontend
nssm set     housing-frontend AppStdout     C:\Apps\housing-logs\frontend.log
nssm set     housing-frontend AppStderr     C:\Apps\housing-logs\frontend.log
nssm set     housing-frontend Start         SERVICE_AUTO_START
nssm start   housing-frontend
```

### 4.5 nginx

```powershell
nssm install housing-nginx  C:\nginx\nginx.exe
nssm set     housing-nginx AppDirectory  C:\nginx
nssm set     housing-nginx AppStdout     C:\Apps\housing-logs\nginx.log
nssm set     housing-nginx AppStderr     C:\Apps\housing-logs\nginx.log
nssm set     housing-nginx Start         SERVICE_AUTO_START
nssm start   housing-nginx
```

### 4.6 Verify all five services + dependencies

```powershell
Get-Service postgresql-x64-17, Memurai, housing-* | Format-Table Name, Status, StartType
```

Expect **Running** + **Automatic** on every row.

### 4.7 Reboot test (optional but recommended)

```powershell
Restart-Computer
```

When the PC comes back up, open a browser to
`https://accommodation.parisunitedgroup.com` — site should be live
without any manual start.

---

## Phase 5 — Future updates (daily op)

When new code is pushed to `claude/dreamy-fermat-JqZ1O` (or `main`
after PR #43 merges):

```powershell
cd C:\Apps\Employee-Housing-Control-Portal

:: Stop the app (leave Postgres + Redis + nginx running)
Stop-Service housing-backend, housing-worker, housing-beat, housing-frontend

:: Pull and re-install
git pull
.\scripts\install-windows.ps1

:: Restart
Start-Service housing-backend, housing-worker, housing-beat, housing-frontend
```

Typical downtime: ~30 seconds. If nginx config changed (rare), also:

```powershell
Stop-Service housing-nginx
:: copy new edge-proxy/nginx.conf changes into C:\nginx\conf\ as per Phase 2
Start-Service housing-nginx
```

---

## Troubleshooting quick references

| Symptom | Probable cause | Fix |
|---|---|---|
| `python : ...\WindowsApps\python.exe` then "Python was not found" | Microsoft Store Python stub on PATH | `$env:PYTHON_EXE = 'C:\Users\<you>\AppData\Local\Programs\Python\Python311\python.exe'` then re-run, or install the py launcher |
| `psql` not on PATH | PG installer didn't add it | Add `C:\Program Files\PostgreSQL\17\bin` to System PATH, open a NEW PowerShell |
| Backend hangs at `wait-for-db` | Postgres service stopped | `Start-Service postgresql-x64-17` |
| `Cannot connect to redis://localhost:6379` | Memurai stopped | `Start-Service Memurai` |
| 500 on `/api/v1/health` | Redis is down (rate limiter needs it) | Same as above |
| `flask seed` errors with "Insecure production configuration" | `backend\.env` missing secrets or still on defaults | Generate strong secrets, redo §1.4 |
| Cloudflare returns 522 | nginx not running / wrong port forward | `Get-Service housing-nginx` then check router NAT entries |
| Cloudflare returns 525 / 526 | TLS handshake at origin failed | `C:\nginx\ssl\origin.crt` + `origin.key` missing or wrong; cert must cover hostname; CF zone must be Full (Strict) |
| Cloudflare returns 521 / 522 from public, but `curl https://127.0.0.1` works | Office firewall / router NAT is wrong | Re-do §3.1 and §3.2 |

Full operational cheatsheet — restart, logs, backups, DB shell —
in [`docs/OPERATIONS_CHEATSHEET.txt`](OPERATIONS_CHEATSHEET.txt).

---

## You're live

After Phase 4, the office PC will:

- ✅ start every service automatically on boot
- ✅ restart any service that crashes (NSSM's `AppRestartDelay` default)
- ✅ rotate backend logs at 10 MB to keep disk usage bounded
- ✅ terminate TLS at nginx, validate against Cloudflare's Origin Cert
- ✅ block direct-IP probes that bypass Cloudflare (the `cf_edge` allowlist)
- ✅ stream realtime SSE updates to the dashboard via waitress threads
- ✅ run the scheduled backup at 03:00 UTC daily
- ✅ accept browser traffic on `https://accommodation.parisunitedgroup.com`

Next read: [`docs/OPERATIONS_CHEATSHEET.txt`](OPERATIONS_CHEATSHEET.txt)
for the daily-ops command list.
