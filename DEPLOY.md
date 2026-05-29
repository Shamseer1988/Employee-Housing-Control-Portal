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

Throughout this doc, replace:

```
  housing.example.com       →  your real subdomain
  example.com               →  your apex domain
  <YOUR_STATIC_PUBLIC_IP>   →  your office static public IPv4
```

---

## 1. Mint the Cloudflare Origin Certificate

1.  Log in to the Cloudflare dashboard → select your zone (`example.com`)
    → **SSL/TLS** → **Origin Server** → **Create Certificate**.
2.  Settings:
    * Private key type: **RSA (2048)**
    * Hostnames: `housing.example.com` (add `*.example.com` if you'll
      want subdomain reuse later)
    * Certificate validity: **15 years** (longest Cloudflare offers)
3.  Copy the **Certificate** PEM into `deploy/ssl/origin.pem`.
    Copy the **Private Key** PEM into `deploy/ssl/origin.key`.
4.  Lock down the key on the host:

    ```bash
    chmod 644 deploy/ssl/origin.pem
    chmod 600 deploy/ssl/origin.key
    ```

⚠️  `.gitignore` already excludes `deploy/ssl/*` (except the README). If
you accidentally commit either file, **revoke the certificate** in
Cloudflare and mint a new one.

---

## 2. Cloudflare DNS + SSL/TLS settings

1.  **DNS** → add an A record:
    | Type | Name      | Content                   | Proxy status     |
    | ---- | --------- | ------------------------- | ---------------- |
    | A    | `housing` | `<YOUR_STATIC_PUBLIC_IP>` | **Proxied** (☁︎) |
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
git clone <repo> /opt/housing && cd /opt/housing
cp .env.example .env
$EDITOR .env
```

Required values (boot fails if any are missing or are dev defaults):

```dotenv
POSTGRES_PASSWORD=<random-strong-password>
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
SUPERUSER_PASSWORD=<initial-admin-password>
PUBLIC_BASE_URL=https://housing.example.com
CORS_ORIGINS=https://housing.example.com
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
# -rw-r--r--  origin.pem
# -rw-------  origin.key
```

---

## 5. Launch

```bash
docker compose up -d --build
docker compose ps
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
curl -I https://housing.example.com
# Expect:
#   HTTP/2 200
#   strict-transport-security: max-age=63072000; includeSubDomains; preload

# HTTP redirect (Cloudflare "Always Use HTTPS" + nginx 301)
curl -I http://housing.example.com
# Expect:
#   HTTP/1.1 301 Moved Permanently
#   location: https://housing.example.com/

# Direct-to-origin attempt: blocked
curl -Ik https://<YOUR_STATIC_PUBLIC_IP>
# Expect:
#   HTTP/1.1 403 Forbidden       ← nginx's allowlist refused
```

Confirm the real client IP is reaching the backend (not just nginx's
loopback) — open the browser to https://housing.example.com from any
external network, then on the host:

```bash
docker compose logs backend --tail 20 | grep "request"
# Look for the structlog JSON access line; the `remote_addr` field
# should be your external IP, not 172.x or 127.0.0.1.
```

If `remote_addr` looks like an internal Docker IP, the Cloudflare
ranges in `deploy/nginx.conf` have drifted — see the next section.

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
docker compose up -d --build nginx
```

---

## Backups

The default compose mounts:

* `pug_pgdata`   — Postgres data
* `pug_uploads`  — user-uploaded attachments

A quick nightly snapshot:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | \
  gzip > /var/backups/housing/db-$(date +%F).sql.gz
tar -czf /var/backups/housing/uploads-$(date +%F).tgz \
  -C /var/lib/docker/volumes/pug_uploads/_data .
```

Wire that into cron and you're done.

---

# FINAL HANDOFF CHECKLIST

Outside-the-repo actions an operator MUST take before go-live:

- [ ] Generate Cloudflare Origin Certificate (15-year RSA, hostnames
      include `housing.example.com`) and place
      `deploy/ssl/origin.pem` + `deploy/ssl/origin.key` on the host
      with `0600` on the key.
- [ ] Cloudflare DNS: A record `housing → <YOUR_STATIC_PUBLIC_IP>`,
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
- [ ] `docker compose up -d --build` ran cleanly; `docker compose ps`
      shows db, redis, backend, worker, beat, frontend, nginx all
      healthy.
- [ ] Three curl verifications above all return the expected output.
- [ ] Browser visit from an external network confirms the real client
      IP in `docker compose logs backend`.
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
