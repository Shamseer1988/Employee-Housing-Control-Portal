# Fresh deploy on Proxmox LXC — behind a shared edge-nginx CT

This is the **topology B** recipe: a separate Proxmox LXC runs nginx
and reverse-proxies *every* site you host. The app CT below carries
only the Flask backend, Celery worker/beat, Next.js frontend,
PostgreSQL, and Redis — **no nginx in this CT, no Cloudflare Tunnel
in this CT**. The edge CT reaches this one over the LAN; the
Cloudflare Tunnel terminates on the edge CT.

For the self-contained variant (one CT does everything including its
own nginx) read [`FRESH_DEPLOY_LXC.md`](FRESH_DEPLOY_LXC.md) instead.

```
                    ┌─── Cloudflare Tunnel ───┐
                    │                         │
                    ▼                         │
        ┌──────────────────────┐              │
        │ Edge nginx CT         │              │
        │ 192.168.100.50        │              │
        │  - terminates TLS     │              │
        │  - upstream:          │              │
        │      backend  → 52:5000              │
        │      frontend → 52:3000              │
        └──────┬────────────────┘              │
               │ LAN                            │
               ▼                                │
        ┌──────────────────────┐                │
        │ App CT                │                │
        │ 192.168.100.52        │                │
        │  - waitress 0.0.0.0:5000              │
        │  - next     0.0.0.0:3000              │
        │  - Postgres 17  (local)               │
        │  - Redis 7     (local)                │
        │  - Celery worker + beat               │
        └──────────────────────┘                │
                                                │
        DNS: accommodation.parisunitedgroup.com ┘
             points at the EDGE CT, not this one
```

IPs above are illustrative — use whatever your LAN actually allocates.

---

## Phase 0 — Plan the container

Same as topology A (`FRESH_DEPLOY_LXC.md` §0) with these differences:

| Field | Value |
|---|---|
| Hostname | `housing-app` (or similar — distinct from your edge CT) |
| Static IP | LAN-reachable, e.g. `192.168.100.52/24` |
| Open ports inbound | **5000 + 3000 from the edge CT only** — see Phase 7 |
| Internet exposure | **None directly.** Only the edge CT reaches Cloudflare. |

You also need an **edge nginx CT already up** (or plan to stand one up
alongside this). The exact edge stack is out of scope here, but its
nginx config needs two upstreams pointing at this CT:

```nginx
upstream housing_backend  { server 192.168.100.52:5000; keepalive 32; }
upstream housing_frontend { server 192.168.100.52:3000; keepalive 32; }
```

…and the same `location /api/` / `location /` blocks used in
`FRESH_DEPLOY_LXC.md` Phase 6.

---

## Phases 1–5 — Same as the self-contained recipe

Run **`FRESH_DEPLOY_LXC.md` Phases 1 through 5** verbatim:

- Phase 1: `pct create` + `pct enter`
- Phase 2: install python3.11 / node / postgresql-17 / redis-server /
  libmagic1 / **nginx** *(yes, still install it — it ships as part of
  the apt bundle; just don't enable or configure it)*. Actually
  simpler: drop `nginx` from the apt line entirely — you won't be
  using it on this CT.
- Phase 3: `useradd housing`, clone repo to `/opt/housing/repo`,
  `scripts/install-linux.sh`.
- Phase 4: create the `pug` Postgres role + db, edit
  `/opt/housing/backend/.env`, run `scripts/bootstrap-db.sh`.
- Phase 5: register systemd units, `systemctl enable --now
  housing-{backend,worker,beat,frontend}`.

The **single difference** is what you put in the env files for
backend bind and frontend bind — covered next.

---

## Phase 6 — Flip the binds to 0.0.0.0

Edit `/opt/housing/backend/.env`:

```ini
WAITRESS_LISTEN=0.0.0.0:5000
WAITRESS_THREADS=8
JWT_COOKIE_SECURE=true
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
```

Edit `/opt/housing/frontend/.env.runtime`:

```ini
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
```

Apply:

```bash
chown housing:housing /opt/housing/backend/.env /opt/housing/frontend/.env.runtime
chmod 600            /opt/housing/backend/.env /opt/housing/frontend/.env.runtime
systemctl restart housing-backend housing-frontend
ss -tlnp | grep -E ':5000|:3000'
```

You should see `0.0.0.0:5000` and `0.0.0.0:3000` listening.

> Why these knobs work: the systemd units in `deploy/systemd/` source
> these files via `EnvironmentFile=` and the `ExecStart` wraps a
> `/bin/sh -c` that applies `${WAITRESS_LISTEN:-127.0.0.1:5000}` and
> `${HOSTNAME:-127.0.0.1}` defaults. Leaving the var unset = topology
> A. Setting it = topology B. **No editing of the shipped unit files.**

---

## Phase 7 — Lock the app CT down

The whole point of topology B is that **only the edge CT** should be
able to reach :5000 and :3000. Anything else on the LAN talking to the
app directly is a misconfiguration at best, a probe at worst.

```bash
apt-get install -y nftables
systemctl enable --now nftables
```

Create `/etc/nftables.conf`:

```
flush ruleset
table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        iif lo accept
        ct state established,related accept
        # SSH from anywhere on LAN — adjust as you like
        tcp dport 22 accept
        # App ports: edge CT only
        ip saddr 192.168.100.50 tcp dport { 5000, 3000 } accept
        # Postgres + Redis stay loopback — don't open them
    }
    chain forward { type filter hook forward priority 0; policy drop; }
    chain output  { type filter hook output  priority 0; policy accept; }
}
```

Reload:

```bash
nft -f /etc/nftables.conf
nft list ruleset
```

Smoke check from the edge CT:

```bash
curl -fsS http://192.168.100.52:5000/api/v1/health
curl -I   http://192.168.100.52:3000
```

…and from any *other* LAN box, the same calls should hang/refuse.

---

## Phase 8 — Wire up the edge CT

On the **edge nginx CT** (the existing reverse-proxy stack — not this
repo), add the upstreams and server block. Bare minimum:

```nginx
upstream housing_backend  { server 192.168.100.52:5000; keepalive 32; }
upstream housing_frontend { server 192.168.100.52:3000; keepalive 32; }

server {
    listen 443 ssl http2;
    server_name accommodation.parisunitedgroup.com;

    ssl_certificate     /etc/ssl/edge/origin.pem;
    ssl_certificate_key /etc/ssl/edge/origin.key;

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
```

Reload nginx on the edge CT.

Point the Cloudflare Tunnel at the **edge CT** (not this one) and
verify the public hostname:

```
https://accommodation.parisunitedgroup.com         → app loads
https://accommodation.parisunitedgroup.com/api/v1/health → {"ok":true,...}
```

---

## Phase 9 — Update workflow (same as topology A)

```bash
systemctl stop housing-frontend housing-beat housing-worker housing-backend
sudo -u housing git -C /opt/housing/repo pull
sudo -u housing bash /opt/housing/repo/scripts/install-linux.sh
# Only when the release added migrations:
sudo -u housing bash /opt/housing/repo/scripts/bootstrap-db.sh
systemctl start housing-backend housing-worker housing-beat housing-frontend
```

Snapshot the LXC from the Proxmox UI before every update.

---

## Troubleshooting (topology B-specific)

| Symptom | Cause | Fix |
|---|---|---|
| Edge nginx → app: `502 Bad Gateway` | App is still listening on 127.0.0.1 | Confirm `WAITRESS_LISTEN=0.0.0.0:5000` in `.env`, `systemctl restart housing-backend`, re-check `ss -tlnp \| grep :5000` |
| Edge nginx → app: `connection refused` from a known-good upstream | nftables is blocking the edge CT | Check `saddr` in `/etc/nftables.conf` matches the edge CT's actual IP (`nft list ruleset`) |
| Backend boot fails: `Insecure production configuration: CORS_ORIGINS contains '*'` | Default `.env` still has dev CORS | Set `CORS_ORIGINS=https://accommodation.parisunitedgroup.com` |
| Frontend renders but `/api/...` calls return mixed-content errors | `JWT_COOKIE_SECURE=true` is missing while the edge serves HTTPS | Set `JWT_COOKIE_SECURE=true` in `.env`, restart backend |
| Topology A unit file still shows `Environment=WAITRESS_LISTEN=...` | You're on an old checkout | `git pull` — the unit files were de-hardcoded in [this PR] |
