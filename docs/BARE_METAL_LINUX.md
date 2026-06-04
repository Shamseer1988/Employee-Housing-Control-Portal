# Bare-metal Linux deployment

Canonical install + operate guide for Debian/Ubuntu hosts (including
Proxmox LXC containers). Reference architecture:

```
            ┌────────────────────────────────────────────────┐
            │            Linux host / LXC                    │
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
                                  443 (nginx)
                                   │
                              Cloudflare Tunnel
                                   │
                       accommodation.parisunitedgroup.com
```

Four systemd services + PostgreSQL + Redis + nginx make up the app.

## 1. System prerequisites

```bash
sudo apt-get update
sudo apt-get install -y \
    python3.11 python3.11-venv python3.11-dev \
    postgresql-17 redis-server nginx \
    libmagic1 build-essential pkg-config \
    curl git
# Node.js 20 (LTS) — use NodeSource:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

If `python3.11` isn't in your distro's repo (Debian 11/older Ubuntus),
add the deadsnakes PPA first:

```bash
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
```

Verify:
- `python3.11 --version` → `Python 3.11.x`
- `node --version` → `v20.x`
- `psql --version` → `psql (PostgreSQL) 17.x`
- `redis-cli ping` → `PONG`

Enable services on boot:

```bash
sudo systemctl enable --now postgresql redis-server
```

## 2. First-time setup

```bash
sudo mkdir -p /opt/housing /var/lib/housing
sudo useradd --system --home /opt/housing --shell /usr/sbin/nologin housing
sudo chown -R housing:housing /opt/housing /var/lib/housing

# Clone as the housing user
sudo -u housing git clone \
    https://github.com/Shamseer1988/Employee-Housing-Control-Portal.git \
    /opt/housing/repo

# Symlink so the systemd units' /opt/housing/backend path works
sudo ln -s /opt/housing/repo/backend /opt/housing/backend
sudo ln -s /opt/housing/repo/frontend /opt/housing/frontend

# Install deps + build frontend
sudo -u housing bash /opt/housing/repo/scripts/install-linux.sh
```

Create the database role + database:

```bash
sudo -u postgres psql <<SQL
CREATE ROLE pug LOGIN PASSWORD 'pick-a-strong-password';
CREATE DATABASE pug_accommodation OWNER pug;
SQL
```

Edit `/opt/housing/backend/.env`:

```ini
FLASK_ENV=production
POSTGRES_PASSWORD=pick-a-strong-password
SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
JWT_SECRET_KEY=<run that again — different value>
SUPERUSER_PASSWORD=<temporary admin password>
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
JWT_COOKIE_SECURE=true
```

Bootstrap (creates tables, runs phase migrations, seeds
permissions + roles + admin user):

```bash
sudo -u housing bash /opt/housing/repo/scripts/bootstrap-db.sh
```

## 3. Run as systemd services (production)

The four units live in `deploy/systemd/`. Install them once:

```bash
sudo cp /opt/housing/repo/deploy/systemd/housing-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now housing-backend housing-worker housing-beat housing-frontend
```

Verify everything came up:

```bash
sudo systemctl status housing-backend housing-worker housing-beat housing-frontend
curl http://127.0.0.1:5000/api/v1/health
curl http://127.0.0.1:3000
```

Tail logs:

```bash
sudo journalctl -u housing-backend -f
```

## 4. Dev launcher (no systemd)

Useful for smoke-testing without registering services:

```bash
bash scripts/start-all.sh    # forks 4 processes, logs in /tmp/housing-*.log
bash scripts/stop-all.sh     # kill them
```

## 5. nginx in front

> **Skip this section** if you're running topology B — a separate
> edge-nginx CT fronts this host. In that case bind the app to
> `0.0.0.0` (set `WAITRESS_LISTEN=0.0.0.0:5000` in `backend/.env` and
> `HOSTNAME=0.0.0.0` in `frontend/.env.runtime`), then see
> [`FRESH_DEPLOY_LXC_EDGE.md`](FRESH_DEPLOY_LXC_EDGE.md).

A minimal HTTPS terminator (assumes Cloudflare Origin Cert on disk):

```nginx
upstream housing_backend  { server 127.0.0.1:5000; keepalive 32; }
upstream housing_frontend { server 127.0.0.1:3000; keepalive 32; }

server {
    listen 443 ssl http2;
    server_name accommodation.parisunitedgroup.com;

    ssl_certificate     /etc/ssl/housing/origin.pem;
    ssl_certificate_key /etc/ssl/housing/origin.key;

    client_max_body_size 30M;

    location /api/ {
        proxy_pass http://housing_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    location / {
        proxy_pass http://housing_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
server {
    listen 80;
    server_name accommodation.parisunitedgroup.com;
    return 301 https://$host$request_uri;
}
```

Save as `/etc/nginx/sites-available/housing`, then:

```bash
sudo ln -s /etc/nginx/sites-available/housing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

For Proxmox LXC specifics (container creation, Cloudflare Tunnel, etc.)
see `docs/FRESH_DEPLOY_LXC.md`.

## 6. Update workflow

```bash
sudo systemctl stop housing-frontend housing-beat housing-worker housing-backend
sudo -u housing git -C /opt/housing/repo pull
sudo -u housing bash /opt/housing/repo/scripts/install-linux.sh
# If migrations were added in this release:
sudo -u housing bash /opt/housing/repo/scripts/bootstrap-db.sh
sudo systemctl start housing-backend housing-worker housing-beat housing-frontend
```

## 7. Daily ops

| Task | Command |
|---|---|
| Status | `sudo systemctl status housing-*` |
| Postgres shell | `sudo -u postgres psql pug_accommodation` |
| Connect to Redis | `redis-cli` |
| Tail backend log | `sudo journalctl -u housing-backend -f` |
| Restart backend only | `sudo systemctl restart housing-backend` |
| Manual backup | Settings → Backup → Backup now (in the UI) |
| Flask CLI command | `sudo -u housing /opt/housing/backend/.venv/bin/flask --app wsgi <cmd>` |

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend hangs on `wait-for-db` | Postgres stopped | `sudo systemctl start postgresql` |
| `Cannot connect to redis://localhost:6379` | Redis stopped | `sudo systemctl start redis-server` |
| Frontend `EADDRINUSE :3000` | Old node process | `sudo systemctl restart housing-frontend` |
| `Insecure production configuration` on boot | `.env` missing SECRET_KEY or has dev defaults | Generate 48-byte token; redo step 2 |
| `failed to find libmagic` | libmagic1 not installed | `sudo apt-get install -y libmagic1` |
| 522 from Cloudflare | nginx down or not on 443 | `sudo systemctl status nginx` |
