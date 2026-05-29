# Local development quickstart

This is the **PC / laptop** runbook. Plain HTTP on port 80, no TLS, no
Cloudflare allowlist, dev secrets fine. Uses `docker-compose.yml`.

For the production deployment with Cloudflare TLS see [`DEPLOY.md`](./DEPLOY.md).

---

## 1. Boot the stack

```bash
docker compose up -d --build
```

That's it. No `.env` required — every var has a dev-safe default
(`pug-local-pass`, `dev-secret-key-padded-to-32-chars`, `ChangeMe123!` etc.).

First boot creates the schema (`flask init-db`), applies any pending
phase migrations (`flask migrate-all`), and seeds permissions + roles +
the super user. Worker and beat connect to Redis automatically.

Open <http://localhost> and log in:

|          |             |
| -------- | ----------- |
| Username | `admin`     |
| Password | `ChangeMe123!` |

## 2. What's running

```
http://localhost          → Next.js frontend (via nginx)
http://localhost/api/v1/* → Flask backend (via nginx)
http://localhost/docs     → Swagger UI (dev-only)
http://localhost:5000     → backend direct (skips nginx)
http://localhost:3000     → frontend direct (skips nginx)
localhost:5432            → Postgres (for psql / pgAdmin)
```

```bash
docker compose ps                  # all 7 services
docker compose logs -f backend     # tail (JSON when LOG_JSON=true)
docker compose logs -f worker beat
docker compose down                # stop, keep data
docker compose down -v             # stop + wipe Postgres + uploads
```

## 3. Useful one-shots

```bash
# Seed realistic demo data (landlords / properties / employees)
docker compose exec backend flask --app wsgi seed-demo

# Run a Celery task synchronously without a worker
docker compose exec backend flask --app wsgi run-job daily_expiry_sweep

# Drop into a Python REPL with the Flask app context
docker compose exec backend flask --app wsgi shell

# psql against the running Postgres
docker compose exec db psql -U pug -d pug_accommodation
```

## 4. Override defaults

Drop a `.env` next to `docker-compose.yml` with any overrides — see
`.env.example` for the full list. Common ones:

```dotenv
HTTP_PORT=8080                 # if port 80 is in use
POSTGRES_PORT=15432            # if you already run Postgres
SUPERUSER_PASSWORD=mybetterpw
```

## 5. Upgrading from an older volume

If `docker compose up` crashes with `column users.token_version does not
exist`, you have a pre-Phase-1 Postgres volume. The boot now runs
`flask migrate-all` automatically, which catches the volume up to head
on the next start. If it didn't (older image cached), just rebuild:

```bash
docker compose down
docker compose up -d --build backend
docker compose logs backend | tail -20    # should show "Running all phase migrations..."
```

To force a clean slate instead: `docker compose down -v` (deletes
Postgres data and uploaded files).

## 6. Tests

```bash
# Backend (inside the container — uses the same image as the running stack)
docker compose exec backend pytest -q

# Frontend
cd frontend && npm ci && npm test && npm run type-check

# Playwright E2E vs the local stack
cd frontend && npm run e2e:install && \
  E2E_BASE_URL=http://localhost npm run e2e
```
