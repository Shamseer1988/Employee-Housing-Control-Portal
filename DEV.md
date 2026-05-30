# Local development

The local stack runs **without nginx and without TLS**. The Next.js
frontend is the single entry point and reverse-proxies `/api/*` to the
backend over the Docker network, so the browser only ever talks to one
origin (first-party cookies, no CORS, no certs).

## Run it (Docker — recommended)

```bash
cp backend/.env.example backend/.env     # first time only
docker compose up -d --build
```

Open **http://localhost:8080** — login `admin` / `ChangeMe123!`.

All services (db, backend, worker, beat) read **`backend/.env`** via
`env_file`, so Postgres and the app share one credentials file. The
compose file only forces the network coordinates (`POSTGRES_HOST=db`,
`REDIS_URL`, `BACKEND_INTERNAL_URL`). Editing `backend/.env` and
re-running `docker compose up -d` is all you need to change secrets.
(The stack still boots on built-in defaults if you skip the copy —
`required: false`.)

Services and host ports:
- **frontend** → http://localhost:8080  ← the app
- **backend**  → http://localhost:5000  (direct API access for debugging)
- **db**       → localhost:5432 (Postgres)
- **redis**, **worker**, **beat** → internal only

Change the app port if 8080 is taken:
```bash
APP_PORT=9000 docker compose up -d
```

Stop: `docker compose down`  ·  Wipe data: `docker compose down -v`

### Why no nginx locally?
nginx is only needed to terminate TLS and enforce the Cloudflare edge
allowlist — both production concerns. Locally the frontend's built-in
proxy does the `/api` routing, so there's nothing for nginx to add and
one less moving part (no port 80 clash with IIS, no cert files).

Cookies are issued **without** the `Secure` flag locally
(`JWT_COOKIE_SECURE=false`) so the browser keeps them over plain HTTP —
the usual cause of "login succeeds then bounces back to /login".

## Run it (native, fastest iteration)

Backend:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
flask --app wsgi init-db && flask --app wsgi seed
flask --app wsgi run --debug --port 5000
```

Frontend:
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000, proxies /api to :5000
```

## Tests

```bash
cd backend  && pytest -q
cd frontend && npm run type-check && npm test && npm run build
```

> Run `npm run build` too — `tsc`/`vitest` accept some things the
> production `next build` rejects (e.g. stray named exports from a
> `page.tsx`), and the Docker image uses `next build`.

## Production

Live deployment (Cloudflare → nginx TLS → app) is a separate compose
file and is documented in **DEPLOY.md**:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
