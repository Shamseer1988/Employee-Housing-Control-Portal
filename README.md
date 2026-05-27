# PUG Accommodation Control System

Centralized, multi-company, multi-branch Employee Accommodation Management web application for **Paris United Group (PUG)** and its group companies. Head Office manages properties, rooms, beds, landlord agreements, and employee allocations from a single dashboard.

> Built phase-by-phase against the blueprint in `docs/BLUEPRINT.txt` and `docs/DEVELOPMENT_PROMPT.txt`.
> **Current status: Phase 1 — Project Foundation complete.**

---

## Stack

- **Backend** — Python Flask · App Factory + Blueprints · SQLAlchemy · Flask-Migrate (Alembic) · Flask-JWT-Extended · Flask-CORS · Marshmallow · openpyxl/pandas
- **Database** — PostgreSQL 14+
- **Frontend** — Next.js 14 (App Router) · TypeScript · React 18 · Tailwind CSS · shadcn/ui primitives · Framer Motion · Lucide icons · Recharts · TanStack Table · React Hook Form · Zod · next-themes
- **Deploy target** — Ubuntu + Gunicorn + Nginx + Cloudflare

---

## Repository layout

```
backend/                 Flask API
  app/
    __init__.py          App factory + error handlers
    extensions.py        db, migrate, jwt singletons
    routes/health.py     /api/v1/health endpoints
    models/              SQLAlchemy models (phase 2+)
    schemas/             Marshmallow schemas
    services/            Business logic
    utils/responses.py   Standard JSON response helpers
  config.py              Dev / Testing / Production configs
  wsgi.py                Entry point (gunicorn-friendly)
  requirements.txt
  tests/                 pytest test suite
  .env.example
frontend/                Next.js TypeScript app
  src/
    app/
      layout.tsx         Root layout (theme provider)
      page.tsx           Redirects to /dashboard
      login/             Login placeholder
      (app)/             Authenticated shell (sidebar + topbar)
        layout.tsx
        dashboard/       Dashboard placeholder w/ glassmorphism cards
        properties|rooms|employees|divisions|transactions|reports|alerts|users|settings
    components/
      theme-provider.tsx · theme-toggle.tsx
      layout/sidebar.tsx · layout/topbar.tsx
      page-transition.tsx (Framer Motion)
      placeholder-page.tsx
    lib/utils.ts · lib/api.ts
  tailwind.config.ts · postcss.config.mjs
  next.config.mjs · tsconfig.json · package.json
  .env.example
docs/                    Blueprint + dev prompt
scripts/                 Utility scripts
uploads/                 Runtime attachments (gitignored)
backups/                 DB / file backups (gitignored)
```

---

## Local setup

### Prerequisites
- Python **3.11+**
- Node.js **20+**
- PostgreSQL **14+** running locally

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # adjust SECRET_KEY, DATABASE_URL, etc.

# One-time: create the database
createdb pug_accommodation

# One-time: initialize migration repository
flask --app wsgi db init
flask --app wsgi db migrate -m "init"
flask --app wsgi db upgrade

# Run the dev server
flask --app wsgi run --debug --port 5000
# or
python wsgi.py
```

**Health checks**
- `GET http://localhost:5000/` &nbsp;→&nbsp; `{ service, status }`
- `GET http://localhost:5000/api/v1/health` &nbsp;→&nbsp; liveness
- `GET http://localhost:5000/api/v1/health/db` &nbsp;→&nbsp; DB connectivity

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local        # NEXT_PUBLIC_API_URL → http://localhost:5000
npm install
npm run dev                       # http://localhost:3000
```

The Next.js app proxies `/api/*` to the Flask backend via `next.config.mjs` rewrites and reads `NEXT_PUBLIC_API_URL`.

### 3. Tests

```bash
cd backend
pip install pytest
pytest -q
```

---

## Phase plan

| Phase | Scope | Status |
|------:|-------|--------|
|  1 | Project foundation (Flask app factory, Next.js shell, theme, health checks) | ✅ Complete |
|  2 | Authentication, users, roles, permissions, audit log base | ⏳ Next |
|  3 | Division, landlord, property master + agreement | ⏳ |
|  4 | Floor, room, bed setup + occupancy summary | ⏳ |
|  5 | Employee master + Excel import | ⏳ |
|  6 | Employee room/bed assignment | ⏳ |
|  7 | Transfer, bed change, cancellation, vacation, visa cancellation | ⏳ |
|  8 | Landlord renewal + maintenance | ⏳ |
|  9 | Dashboard cards, charts, alerts | ⏳ |
| 10 | Reports + Excel/PDF export | ⏳ |
| 11 | Approval workflow | ⏳ |
| 12 | System settings | ⏳ |
| 13 | UI polish + responsive optimization | ⏳ |
| 14 | Testing + production deployment | ⏳ |

See `docs/DEVELOPMENT_PROMPT.txt` for the canonical phase plan.

---

## Phase 1 — Testing checklist

Backend
- [ ] `pip install -r backend/requirements.txt` succeeds
- [ ] `python backend/wsgi.py` starts the Flask app on port 5000
- [ ] `curl http://localhost:5000/` returns the service banner JSON
- [ ] `curl http://localhost:5000/api/v1/health` returns `{ success: true, data.status: "healthy" }`
- [ ] `curl http://localhost:5000/api/v1/health/db` reports DB status (`connected` once Postgres is running)
- [ ] `pytest -q` passes both health/root tests
- [ ] CORS responds for `Origin: http://localhost:3000`

Frontend
- [ ] `npm install` completes cleanly
- [ ] `npm run dev` serves http://localhost:3000
- [ ] `/` redirects to `/dashboard`
- [ ] Sidebar + topbar render; nav links open placeholder pages
- [ ] Dark/light/system theme toggle works without flash
- [ ] `/login` placeholder renders and routes to `/dashboard` on submit
- [ ] Page transitions animate via Framer Motion
- [ ] Layout is responsive on mobile, tablet, desktop

---

## Next phase plan

**Phase 2 — Authentication, Users, Roles, Permissions**

Backend
- `users`, `roles`, `permissions`, `role_permissions`, `user_roles` models + migrations
- bcrypt password hashing, JWT login/refresh/logout endpoints under `/api/v1/auth`
- `@require_permission("…")` decorator wrapping route blueprints
- `audit_logs` model + middleware capturing all critical actions
- Seed script for default Super User and starter roles (Admin, HR Executive, Accommodation Manager, Branch Manager, Division Manager, Supervisor, Viewer, Auditor)

Frontend
- `/login` wired to backend; persists access/refresh tokens in `localStorage` via the `axios` interceptor in `src/lib/api.ts`
- Auth context + Zustand store for the current user and permission set
- Protected `(app)` layout that redirects to `/login` when unauthenticated
- Permission-aware sidebar (hide items the user can't access) and action buttons
- User management screen (`/users`): list, create, edit, deactivate, assign roles
- Role management screen with the full permission matrix

---

## License

Internal — Paris United Group.
