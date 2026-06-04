# Fresh deploy on Proxmox LXC (git clone → public HTTPS)

Step-by-step recipe for a brand-new Proxmox LXC container hosting the
Employee Housing Control Portal. Targets a single unprivileged LXC with
PostgreSQL + Redis + the app + nginx all in one place.

For container-vs-host trade-offs, hardening details, and general Linux
ops, see `docs/BARE_METAL_LINUX.md` — this file is the LXC-specific
runbook.

---

## Phase 0 — Plan the container

| Field | Value (reference) |
|---|---|
| Template | `debian-12-standard` or `ubuntu-22.04-standard` |
| Type | **Unprivileged** (preferred) |
| CPU | 2 vCPU |
| RAM | 2 GB (4 GB if you ever load big imports) |
| Swap | 512 MB |
| Disk | 16 GB (`local-lvm` or whichever storage) |
| Network | Bridge `vmbr0`, DHCP or static |
| Nesting | Off (we don't need it) |
| Features | None special |
| Hostname | `housing` (matches the systemd `User=housing`) |

Pick a static IP on your LAN — you'll port-forward 80/443 to it from
the router later. Note it: e.g. `192.168.1.50`.

---

## Phase 1 — Create + enter the container

From the Proxmox host shell:

```bash
# Pull the template if you haven't already
pveam update
pveam available --section system | grep debian-12
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

# Create the container (adjust NEXTID, password, IP)
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
    --hostname housing \
    --cores 2 --memory 2048 --swap 512 \
    --rootfs local-lvm:16 \
    --net0 name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1 \
    --unprivileged 1 \
    --features nesting=0 \
    --onboot 1 \
    --password

pct start 200
pct enter 200
```

You're now root inside the container.

---

## Phase 2 — Install system prerequisites

```bash
apt-get update && apt-get -y upgrade
apt-get install -y \
    python3.11 python3.11-venv python3.11-dev \
    postgresql-17 redis-server nginx \
    libmagic1 build-essential pkg-config \
    curl git ca-certificates

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

systemctl enable --now postgresql redis-server
```

If `postgresql-17` isn't in the default apt sources (older Debian) add
the PGDG repo:

```bash
apt-get install -y lsb-release
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | tee /etc/apt/sources.list.d/pgdg.list
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
apt-get update && apt-get install -y postgresql-17
```

Sanity:

```bash
python3.11 --version    # → Python 3.11.x
node --version          # → v20.x
psql --version          # → psql (PostgreSQL) 17.x
redis-cli ping          # → PONG
```

---

## Phase 3 — Lay down the app

```bash
useradd --system --home /opt/housing --shell /usr/sbin/nologin housing
mkdir -p /opt/housing /var/lib/housing
chown -R housing:housing /opt/housing /var/lib/housing

sudo -u housing git clone \
    https://github.com/Shamseer1988/Employee-Housing-Control-Portal.git \
    /opt/housing/repo

ln -s /opt/housing/repo/backend  /opt/housing/backend
ln -s /opt/housing/repo/frontend /opt/housing/frontend

sudo -u housing bash /opt/housing/repo/scripts/install-linux.sh
```

The install script: creates `backend/.venv`, `pip install`s
requirements, runs `npm ci` + `npm run build`, and seeds
`backend/.env` from the example on first run. Expect 2–4 minutes.

---

## Phase 4 — Database + secrets

```bash
sudo -u postgres psql <<SQL
CREATE ROLE pug LOGIN PASSWORD 'pick-a-strong-password';
CREATE DATABASE pug_accommodation OWNER pug;
SQL
```

Edit `/opt/housing/backend/.env` (must do this AS root, then chown):

```bash
nano /opt/housing/backend/.env
chown housing:housing /opt/housing/backend/.env
chmod 600 /opt/housing/backend/.env
```

Set at minimum:

```ini
FLASK_ENV=production
POSTGRES_PASSWORD=<the one you just used>
SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
JWT_SECRET_KEY=<run that again — different value>
SUPERUSER_PASSWORD=<temporary admin password — change after first login>
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
JWT_COOKIE_SECURE=true
WAITRESS_LISTEN=127.0.0.1:5000
WAITRESS_THREADS=8
```

Bootstrap:

```bash
sudo -u housing bash /opt/housing/repo/scripts/bootstrap-db.sh
```

Expect output ending with `Done. Run scripts/start-all.sh next …`.

---

## Phase 5 — Register systemd services

```bash
cp /opt/housing/repo/deploy/systemd/housing-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now housing-backend housing-worker housing-beat housing-frontend

systemctl status housing-backend housing-worker housing-beat housing-frontend
```

Smoke test from inside the LXC:

```bash
curl http://127.0.0.1:5000/api/v1/health
curl -I http://127.0.0.1:3000
```

If the backend complains about `Insecure production configuration`,
your `SECRET_KEY` / `JWT_SECRET_KEY` are still dev defaults or shorter
than 32 bytes — regenerate.

---

## Phase 6 — nginx in front of it

Place a Cloudflare Origin Cert (15-year RSA) at:

- `/etc/ssl/housing/origin.pem`
- `/etc/ssl/housing/origin.key`  (chmod 600)

Drop in the site config:

```bash
cat > /etc/nginx/sites-available/housing <<'NGINX'
upstream housing_backend  { server 127.0.0.1:5000; keepalive 32; }
upstream housing_frontend { server 127.0.0.1:3000; keepalive 32; }

server {
    listen 443 ssl http2;
    server_name accommodation.parisunitedgroup.com;

    ssl_certificate     /etc/ssl/housing/origin.pem;
    ssl_certificate_key /etc/ssl/housing/origin.key;
    ssl_protocols TLSv1.2 TLSv1.3;

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
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/housing /etc/nginx/sites-enabled/housing
nginx -t && systemctl reload nginx
```

---

## Phase 7 — Make it public

Two paths — pick one:

### 7a. Cloudflare Tunnel (recommended — no port forwarding)

Inside the LXC:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
apt-get install -y /tmp/cloudflared.deb
cloudflared tunnel login              # opens a URL, paste into a browser
cloudflared tunnel create housing
cloudflared tunnel route dns housing accommodation.parisunitedgroup.com
```

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: housing
credentials-file: /root/.cloudflared/<UUID>.json
ingress:
  - hostname: accommodation.parisunitedgroup.com
    service: https://127.0.0.1:443
    originRequest:
      noTLSVerify: true        # we're using a CF Origin cert
  - service: http_status:404
```

Install the tunnel as a service:

```bash
cloudflared service install
systemctl status cloudflared
```

In the Cloudflare dashboard set SSL/TLS mode to **Full (Strict)**.

### 7b. Router port forward (old-school)

1. Router admin → port forward TCP 80 + 443 to the LXC's IP.
2. Cloudflare DNS → `A accommodation.parisunitedgroup.com` → your
   public IP, proxied (orange cloud).
3. SSL/TLS mode → **Full (Strict)**.

---

## Phase 8 — Verify from outside

From a phone on cellular (not your LAN):

```
https://accommodation.parisunitedgroup.com         → app loads
https://accommodation.parisunitedgroup.com/api/v1/health → {"ok":true,...}
```

Log in with the seeded super user (`SUPERUSER_USERNAME` from `.env`)
and immediately change the password.

---

## Phase 9 — Update workflow

```bash
systemctl stop housing-frontend housing-beat housing-worker housing-backend
sudo -u housing git -C /opt/housing/repo pull
sudo -u housing bash /opt/housing/repo/scripts/install-linux.sh
# Only if the release added migrations:
sudo -u housing bash /opt/housing/repo/scripts/bootstrap-db.sh
systemctl start housing-backend housing-worker housing-beat housing-frontend
```

Snapshot the LXC from the Proxmox UI before every update — rollback
is a single click if anything blows up.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `systemctl status housing-backend` shows `Insecure production configuration` | Regenerate `SECRET_KEY` + `JWT_SECRET_KEY` in `.env`, restart |
| `failed to find libmagic` at backend boot | `apt-get install -y libmagic1` |
| `psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed` | `systemctl start postgresql` |
| `redis.exceptions.ConnectionError` | `systemctl start redis-server` |
| Frontend 502 from nginx but backend OK | `systemctl restart housing-frontend`, check `journalctl -u housing-frontend` |
| nginx `bind() to 0.0.0.0:443 failed (98: Address already in use)` | Another process holds the port — `ss -tlnp \| grep :443` |
| Cloudflare 522 | Origin not reachable — check tunnel/forward + nginx is up |
| LXC reboot loses Cloudflare tunnel | `systemctl enable cloudflared` |
