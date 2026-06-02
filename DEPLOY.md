# Production deployment — Cloudflare Full (Strict)

Target architecture:

```
   browser ──https──▶  Cloudflare edge  ──https──▶  your-office:443
                          (proxied A)             (nginx)  ──http──▶  backend:5000
                                                                 ──http──▶  frontend:3000
                                                                 ──tcp──▶   postgres / redis
```

* TLS mode at Cloudflare: **Full (Strict)**.
* Origin certificate: Cloudflare-minted, RSA, 15-year, terminated at our
  nginx.
* Anyone trying to reach the static IP directly (bypassing Cloudflare)
  gets a 403 from nginx's edge allowlist.

Live configuration:

```
  Subdomain                :  accommodation.parisunitedgroup.com
  Apex domain              :  parisunitedgroup.com
  <YOUR_STATIC_PUBLIC_IP>  →  your office static public IPv4
```

The Windows-Docker-specific bits (path syntax, line endings, file
permissions, firewall) are called out at the bottom of this doc in
the dedicated section.

---

## 1. Mint the Cloudflare Origin Certificate

1.  Log in to the Cloudflare dashboard → select your zone
    (`parisunitedgroup.com`) → **SSL/TLS** → **Origin Server** →
    **Create Certificate**.
2.  Settings:
    * Private key type: **RSA (2048)**
    * Hostnames:
        - `accommodation.parisunitedgroup.com`
        - (optional) `*.parisunitedgroup.com` if you'll want other
          subdomains under the same cert later
    * Certificate validity: **15 years** (longest Cloudflare offers)
3.  Cloudflare will show two PEM blocks **once**. Save them now:
    * The **Origin Certificate** block →  `deploy/ssl/origin.crt`
    * The **Private key** block        →  `deploy/ssl/origin.key`

    The dashboard never shows the private key again. If you close the
    page without saving it, you must revoke the cert and mint a new
    one.

    Each file must start with `-----BEGIN ...-----` and end with
    `-----END ...-----`, no extra blank lines outside the markers.
    Layout reference: `deploy/ssl/origin.crt.example`,
    `deploy/ssl/origin.key.example`.

4.  Lock down the key on the host:

    ```bash
    # Linux / macOS
    chmod 644 deploy/ssl/origin.crt
    chmod 600 deploy/ssl/origin.key
    ```

    On Windows see the dedicated section below — chmod is a no-op on
    NTFS; use Properties → Security to restrict origin.key to your
    user account.

⚠️  `.gitignore` already excludes `deploy/ssl/*` (except the README
and the `.example` templates). If
you accidentally commit either file, **revoke the certificate** in
Cloudflare and mint a new one.

---

## 2. Cloudflare DNS + SSL/TLS settings

1.  **DNS** → add an A record:
    | Type | Name      | Content                   | Proxy status     |
    | ---- | --------- | ------------------------- | ---------------- |
    | A    | `accommodation` | `<YOUR_STATIC_PUBLIC_IP>` | **Proxied** (☁︎) |
2.  **SSL/TLS** → **Overview** → mode: **Full (strict)**.
3.  **SSL/TLS** → **Edge Certificates** →
    * **Always Use HTTPS**: On
    * **Minimum TLS Version**: TLS 1.2
    * **Automatic HTTPS Rewrites**: On
    * **HSTS**: Enable, max-age 12 months, includeSubDomains, preload
      (nginx also sets this; Cloudflare echoing it is belt-and-braces)

---

## 3. Office firewall

Forward TCP ports **80** and **443** from your static public IP to the
host running docker.

Optional but recommended: restrict inbound **443** to Cloudflare's IP
ranges only at the firewall, so direct probes never even reach nginx.
The lists are at:

* <https://www.cloudflare.com/ips-v4>
* <https://www.cloudflare.com/ips-v6>

(If you skip the firewall ACL, nginx's `geo`-backed allowlist still
returns 403 to direct hits — see `deploy/nginx.conf`.)

---

## 4. Host setup + secrets

```bash
git clone <repo> /opt/accommodation && cd /opt/accommodation
cp .env.example .env
$EDITOR .env
```

Required values (boot fails if any are missing or are dev defaults):

```dotenv
POSTGRES_PASSWORD=<random-strong-password>
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
SUPERUSER_PASSWORD=<initial-admin-password>
PUBLIC_BASE_URL=https://accommodation.parisunitedgroup.com
CORS_ORIGINS=https://accommodation.parisunitedgroup.com
REDIS_URL=redis://redis:6379/0
```

Optional but recommended:

```dotenv
SENTRY_DSN=<your sentry dsn>
NEXT_PUBLIC_SENTRY_DSN=<browser sentry dsn>
METRICS_TOKEN=<random secret if /metrics is publicly reachable>
```

Place the Cloudflare cert (from step 1) into `deploy/ssl/` and confirm
permissions:

```bash
ls -l deploy/ssl/
# -rw-r--r--  origin.crt
# -rw-------  origin.key
```

---

## 5. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

First boot will run `flask init-db` (creates every table from models)
followed by `flask seed` (permissions, roles, super user, settings).
Subsequent boots reuse the existing schema.

The `worker` and `beat` services start automatically — Celery jobs
(daily expiry sweep, reminder recompute, async bulk import) run with
no extra steps.

---

## 6. Verify

```bash
# Public HTTPS through Cloudflare
curl -I https://accommodation.parisunitedgroup.com
# Expect:
#   HTTP/2 200
#   strict-transport-security: max-age=63072000; includeSubDomains; preload

# HTTP redirect (Cloudflare "Always Use HTTPS" + nginx 301)
curl -I http://accommodation.parisunitedgroup.com
# Expect:
#   HTTP/1.1 301 Moved Permanently
#   location: https://accommodation.parisunitedgroup.com/

# Direct-to-origin attempt: blocked
curl -Ik https://<YOUR_STATIC_PUBLIC_IP>
# Expect:
#   HTTP/1.1 403 Forbidden       ← nginx's allowlist refused
```

Confirm the real client IP is reaching the backend (not just nginx's
loopback) — open the browser to https://accommodation.parisunitedgroup.com from any
external network, then on the host:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail 20 | grep "request"
# Look for the structlog JSON access line; the `remote_addr` field
# should be your external IP, not 172.x or 127.0.0.1.
```

If `remote_addr` looks like an internal Docker IP, the Cloudflare
ranges in `deploy/nginx.conf` have drifted — see the next section.

---

## Windows Docker host (Docker Desktop / WSL2)

This deployment is supported on Windows with Docker Desktop. A few
things differ from a Linux host — none of them require code changes,
just runbook awareness.

### 1. Path syntax in commands

All `docker compose` commands work identically in **PowerShell**,
**Command Prompt**, and **Git Bash**. The repo path itself can live
on either NTFS (`C:\Users\You\Documents\Employee-Housing-Control-Portal`)
or inside WSL2 (`\\wsl$\Ubuntu\home\you\...`). WSL2 is faster for I/O
heavy operations (DB volumes, builds) but either works.

The bind-mount path `./deploy/ssl` is relative to the compose file,
so it resolves correctly regardless of host OS.

### 2. Cert file permissions

Linux's `chmod 600 origin.key` doesn't have an exact equivalent on
NTFS, and Docker Desktop ignores POSIX permission bits on bind-mounts
from NTFS anyway. Instead:

1. Right-click `deploy\ssl\origin.key` → **Properties** → **Security**.
2. Click **Advanced** → **Disable inheritance** → **Remove all
   inherited permissions**.
3. Add yourself with **Full control**.
4. Add `Administrators` with **Full control**.
5. (Optional) Add the local `SYSTEM` account if you run Docker as a
   service.

The runtime guarantee — that the container reads the key read-only —
holds because the compose bind-mount uses `:ro`. The Windows ACL is
defence in depth on the host filesystem.

### 3. Line endings

The Cloudflare dashboard ships PEM blocks with LF endings. If you
paste them through Windows Notepad they may get saved as CRLF.
Modern nginx (which we ship) tolerates CRLF in cert files, but some
openssl pipelines don't. To be safe, save as **UTF-8 with LF**:

- **VS Code**: bottom-right status bar → click `CRLF` → choose `LF`
  → File → Save.
- **Notepad++**: Edit → EOL Conversion → Unix (LF) → Save.
- **PowerShell** one-liner to fix a file already saved as CRLF:
  ```powershell
  (Get-Content deploy\ssl\origin.crt -Raw).Replace("`r`n", "`n") |
    Set-Content deploy\ssl\origin.crt -NoNewline
  ```

### 4. Firewall

Windows Defender Firewall blocks inbound 80/443 by default. Docker
Desktop adds rules for ports you publish in compose, but if traffic
from your office router never reaches the container, manually allow:

- **Settings** → **Privacy & security** → **Windows Security** →
  **Firewall & network protection** → **Advanced settings** →
  **Inbound Rules** → **New Rule** → **Port** → TCP **80, 443** →
  **Allow** → all profiles → name it `cloudflare-origin`.

If your office NAT forwards `<YOUR_STATIC_PUBLIC_IP>:80,443` →
`<DOCKER_HOST_LAN_IP>:80,443`, the LAN IP must be reachable on the
host's primary adapter. WSL2 binds Docker-Desktop-published ports to
`0.0.0.0` on the Windows host automatically; you don't need to bridge
the WSL VM separately.

### 5. Docker Desktop resources

For the full prod stack (Postgres + Redis + backend + worker + beat +
frontend + nginx) plan on:

| Resource     | Minimum   | Recommended |
| ------------ | --------- | ----------- |
| CPU          | 2 vCPU    | 4+ vCPU     |
| RAM          | 4 GB      | 8 GB        |
| Disk         | 10 GB     | 50 GB+      |

Set these in Docker Desktop → **Settings** → **Resources**.

### 6. Service / startup

Docker Desktop runs in your user session by default. For an
unattended server install (boots without an interactive login), use
the **Docker Engine** service shipped via the Docker Desktop installer
("Use the WSL 2 based engine" + sign in to Docker once, then enable
"Start Docker Desktop when you log in"), or switch to a Windows
Server box running Docker Engine for Windows directly.

A typical office setup:
1. Set the Windows account that owns Docker Desktop to auto-login
   (`netplwiz` → uncheck the password requirement → confirm with a
   real password).
2. Enable Docker Desktop's "Start at login".
3. Put `docker compose -f docker-compose.prod.yml up -d` into Task
   Scheduler with a `On startup` trigger as a belt-and-braces fallback.

The whole stack auto-restarts within the Docker Desktop engine (every
service has `restart: unless-stopped`), so once Docker is up, the
app is up.

---

## Updating Cloudflare ranges

Cloudflare adds new edge ranges occasionally. To refresh the lists in
`deploy/nginx.conf`:

```bash
curl -s https://www.cloudflare.com/ips-v4
curl -s https://www.cloudflare.com/ips-v6
```

Edit the two range blocks at the top of `deploy/nginx.conf` (both
`set_real_ip_from` and `geo $cf_edge`), then:

```bash
docker compose -f docker-compose.prod.yml up -d --build nginx
```

---

## Backups

The default compose mounts:

* `pug_pgdata`   — Postgres data
* `pug_uploads`  — user-uploaded attachments

A quick nightly snapshot:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | \
  gzip > /var/backups/accommodation/db-$(date +%F).sql.gz
tar -czf /var/backups/accommodation/uploads-$(date +%F).tgz \
  -C /var/lib/docker/volumes/pug_uploads/_data .
```

Wire that into cron and you're done.

---

# FINAL HANDOFF CHECKLIST

Outside-the-repo actions an operator MUST take before go-live:

- [ ] Generate Cloudflare Origin Certificate (15-year RSA, hostnames
      include `accommodation.parisunitedgroup.com`) and place
      `deploy/ssl/origin.crt` + `deploy/ssl/origin.key` on the host
      with `0600` on the key.
- [ ] Cloudflare DNS: A record `accommodation → <YOUR_STATIC_PUBLIC_IP>`,
      **Proxied** (orange cloud).
- [ ] Cloudflare SSL/TLS: mode **Full (Strict)**, **Always Use HTTPS**
      on, **Minimum TLS Version 1.2**, HSTS enabled (12 mo, subdomains,
      preload).
- [ ] Office firewall: forward TCP 80 + 443 from
      `<YOUR_STATIC_PUBLIC_IP>` to the docker host. (Optional: restrict
      443 to Cloudflare ranges.)
- [ ] `.env` filled in with `POSTGRES_PASSWORD`, `SECRET_KEY`,
      `JWT_SECRET_KEY`, `SUPERUSER_PASSWORD`, `PUBLIC_BASE_URL`,
      `CORS_ORIGINS`, `REDIS_URL`. No dev defaults (boot guard rejects
      them).
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` ran cleanly; `docker compose -f docker-compose.prod.yml ps`
      shows db, redis, backend, worker, beat, frontend, nginx all
      healthy.
- [ ] Three curl verifications above all return the expected output.
- [ ] Browser visit from an external network confirms the real client
      IP in `docker compose -f docker-compose.prod.yml logs backend`.
- [ ] (Recommended) Sign up for a Sentry account, set `SENTRY_DSN` +
      `NEXT_PUBLIC_SENTRY_DSN`, redeploy.
- [ ] (Recommended) Nightly cron for `pg_dump` + the uploads tarball.
- [ ] (Recommended) Change the super-user password immediately after
      first login: top-right menu → **Change password**.

## Items deferred (not blocking go-live)

- **gunicorn worker class still `sync`.** SSE long-lived connections
  pin a worker each. Internal user count makes this fine for launch;
  switch to `gthread` in `gunicorn.conf.py` when concurrent SSE
  subscribers > workers × 0.5.
- **Audit / Trivy CI jobs are report-only.** Next 14.2.10 has high
  advisories that need a major bump; Dependabot will surface it.
  Flip the `continue-on-error` flags off once the baseline is clean.
- **20 backend routes still hand-validate** (see
  `backend/app/schemas/TODO_PHASE_4.md`). They work, but they're not
  in the OpenAPI spec until migrated.
- **12 frontend pages still hand-rolled** (see bottom of
  `frontend/src/lib/query-keys.ts`). Each is a copy-paste of the
  TanStack Query pattern.
- **Notifications page not built** — only the bell shows the feed.
  API is in place.
- **No Alembic baseline.** Schema bootstraps via `db.create_all()`
  (`flask init-db`); per-phase `migrate-phaseN` CLI commands cover
  in-place upgrades. A real Alembic baseline is its own follow-up.
- **Source-map upload to Sentry** not configured; minified traces
  only. Worth doing once Sentry is connected.

---

## Multi-site hosting on the same box

This compose stack runs three independent sites behind one nginx
container (`deploy/nginx.conf`):

| Hostname                              | App                                | Status today      |
|---------------------------------------|------------------------------------|-------------------|
| `accommodation.parisunitedgroup.com`  | Employee Housing Control Portal    | Live              |
| `pugfin.parisunitedgroup.com`         | PUG Finance app                    | Planned (stubbed) |
| `parisunitedgroup.com` + `www.`       | PUG corporate marketing site       | Planned (stubbed) |

Each is its own `server` block in `deploy/nginx.conf` with its own
upstreams and CSP. The Cloudflare edge allowlist, real-IP block, TLS
session cache, and gzip rules are defined once at the top and apply
everywhere. An explicit catch-all `server` block on `:443` returns
`444` (close without response) for any unknown SNI, so a probe of an
unrelated hostname can't accidentally hit a real vhost.

### Cloudflare Origin Certificate — must be a wildcard

Until now the Origin Cert was minted for
`accommodation.parisunitedgroup.com` only. Before bringing the other
two sites online, **re-mint the cert** to cover all three:

1. Cloudflare dashboard → **parisunitedgroup.com** → SSL/TLS →
   **Origin Server** → **Create Certificate**.
2. Key type: **RSA (2048)**. Validity: **15 years**.
3. Hostnames: enter both lines:
   ```
   *.parisunitedgroup.com
   parisunitedgroup.com
   ```
4. Save the new "Origin Certificate" block to
   `deploy/ssl/origin.crt` and the "Private key" block to
   `deploy/ssl/origin.key` (overwriting the previous single-host
   files).
5. Bounce nginx so it picks up the new cert:
   ```
   docker compose -f docker-compose.prod.yml restart nginx
   ```

Without the wildcard, the TLS handshake for `pugfin.*` and the apex
`parisunitedgroup.com` will fail with a hostname mismatch (or
Cloudflare's Full-Strict mode will refuse to talk to the origin).

### Cloudflare DNS — one A record per hostname

Each hostname needs its own DNS record pointing at the same office IP
(or DDNS-managed IP — see `docs/LIVE_DEPLOYMENT_GUIDE.html` §8):

| Type | Name             | Content                          | Proxy   |
|------|------------------|----------------------------------|---------|
| A    | `accommodation`  | office public IP                 | Proxied |
| A    | `pugfin`         | office public IP                 | Proxied |
| A    | `@` (apex)       | office public IP                 | Proxied |
| CNAME| `www`            | `parisunitedgroup.com`           | Proxied |

All four must be **orange-cloud Proxied** — the nginx allowlist drops
direct hits.

### Cloudflare Tunnel — one ingress rule per hostname (if you use it)

If the office sits behind CGNAT and you switched to Cloudflare Tunnel
instead of port-forwarding (Troubleshooting §12.6 of the deployment
guide), the tunnel's ingress rules file needs an entry per hostname,
all pointing at the same loopback `https://localhost:443`:

```yaml
# ~/.cloudflared/config.yml
tunnel: <your-tunnel-id>
credentials-file: /etc/cloudflared/<your-tunnel-id>.json
ingress:
  - hostname: accommodation.parisunitedgroup.com
    service: https://localhost:443
    originRequest:
      originServerName: accommodation.parisunitedgroup.com
  - hostname: pugfin.parisunitedgroup.com
    service: https://localhost:443
    originRequest:
      originServerName: pugfin.parisunitedgroup.com
  - hostname: parisunitedgroup.com
    service: https://localhost:443
    originRequest:
      originServerName: parisunitedgroup.com
  - hostname: www.parisunitedgroup.com
    service: https://localhost:443
    originRequest:
      originServerName: www.parisunitedgroup.com
  - service: http_status:404
```

The `originServerName` forces the right SNI so nginx routes each
request to its matching vhost.

### Bringing host #2 or #3 online

1. Uncomment the corresponding stub block in
   `docker-compose.prod.yml` (under the `# TODO: enable when …`
   comment near the nginx service) and supply a real `image:` or
   `build:` for each container.
2. For host #3 only, also uncomment the `pugweb_uploads` external
   volume + the `nginx` service's commented bind line, then create the
   external volume once:
   ```
   docker volume create pugweb_uploads
   ```
3. Verify the nginx config still parses:
   ```
   docker compose -f docker-compose.prod.yml exec nginx nginx -t
   ```
4. Reload nginx in place (no downtime for hosts already live):
   ```
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```
