# PUG Accommodation Control System

Centralized, multi-company, multi-branch Employee Accommodation Management web application for **Paris United Group (PUG)** and its group companies. Head Office manages properties, rooms, beds, landlord agreements, and employee allocations from a single dashboard.

> Built phase-by-phase against the blueprint in `docs/BLUEPRINT.txt` and `docs/DEVELOPMENT_PROMPT.txt`.
> **Current status: Phase 2 — Auth, Users, Roles, Permissions & Audit Log complete.**

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
flask --app wsgi db migrate -m "phase 2 - users roles permissions audit"
flask --app wsgi db upgrade

# Seed default permissions, roles, and the Super User
flask --app wsgi seed

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
|  2 | Authentication, users, roles, permissions, audit log base | ✅ Complete |
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

## What Phase 2 added

Backend
- `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs` models
- bcrypt password hashing; JWT access + refresh tokens (Flask-JWT-Extended)
- `/api/v1/auth/{login,refresh,logout,me,change-password}`
- `/api/v1/users` and `/api/v1/roles` CRUD with `@require_permission(...)` decorator
- `/api/v1/roles/permissions/catalog` returning permissions grouped by module
- `/api/v1/audit` list endpoint with module/action/user filters
- `flask --app wsgi seed` CLI: seeds the 36-permission catalog, 9 system roles
  (Super User, Admin, HR Executive, Accommodation Manager, Branch Manager,
  Division Manager, Supervisor, Viewer, Auditor) and the default admin user
- Audit log automatically records login / logout / user & role create / update / deactivate

Frontend
- `useAuth` Zustand store (persisted) holding the access/refresh tokens and current user
- axios client with bearer-token injection + 401 → refresh → retry interceptor
- `/login` wired to `/api/v1/auth/login`; redirects to `?next=` after sign-in
- `AuthGuard` wraps the `(app)` layout — unauthenticated users are bounced to `/login`
- Sidebar items filter themselves based on the current user's permission codes
- `<Can perm="…">` component for permission-gated UI controls
- Topbar user menu with sign-out (calls `/auth/logout`, clears tokens)
- `/users` — list, search, create, edit (incl. password reset), deactivate, assign roles
- `/users/roles` — role browser with a full permission matrix (per-module, per-permission, per-module-all)
- `/audit` — paginated audit log with module/action filters

## Next phase plan

**Phase 3 — Division, Landlord, Property Master + Agreement**

Backend
- `divisions`, `landlords`, `properties`, `property_agreements` models + migration
- Generic `attachments` table (`entity_type` + `entity_id`) and upload endpoint
- Property agreement expiry reminder scaffolding (used by Phase 9 dashboard)
- Property occupancy summary endpoint placeholder for Phase 4 wiring

Frontend
- `/divisions` master CRUD with company/branch fields
- `/properties` master list + detail page with tabs (Overview · Agreement · Floors · Rooms · Attachments)
- Landlord master and agreement management with file upload + version archive
- Permission-gated action buttons throughout

---

## License

Internal — Paris United Group.
