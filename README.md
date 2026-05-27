# PUG Accommodation Control System

Centralized, multi-company, multi-branch Employee Accommodation Management web application for **Paris United Group (PUG)** and its group companies. Head Office manages properties, rooms, beds, landlord agreements, and employee allocations from a single dashboard.

> Built phase-by-phase against the blueprint in `docs/BLUEPRINT.txt` and `docs/DEVELOPMENT_PROMPT.txt`.
> **Current status: Phase 3 — Division, Landlord, Property masters + Agreement & Attachments complete.**

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
|  3 | Division, landlord, property master + agreement | ✅ Complete |
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

## What Phase 3 added

Backend
- Models: `Division`, `Landlord`, `Property`, `PropertyAgreement`, generic `Attachment`
  (`entity_type` + `entity_id`).
- Endpoints under `/api/v1`:
  * `divisions` — CRUD with status filter & search
  * `landlords` — CRUD with QID/CR/mobile search
  * `properties` — CRUD with type/status/city/text filters; auto-generated
    `PROP-NNNN` codes (likewise `DIV-NNNN` / `LL-NNNN` for divisions and
    landlords) via `services.codes.next_code`.
  * `properties/<id>/agreements` (list / post / put). Posting a new active
    agreement automatically archives the previous one (`renewal_status="renewed"`,
    `is_active=false`) so renewal history is preserved.
  * `properties/agreements/expiring?days=90` — returns expiring agreements with
    per-row bucket (`7`/`15`/`30`/`60`/`90`/`expired`) and a global summary
    suitable for the Phase 9 dashboard.
  * `attachments` — upload (`multipart/form-data`), list (`entity_type` +
    `entity_id`), download, delete. Files land in `uploads/<entity>/<id>/<yyyymm>/`
    with a random-hex stored name and MIME/size captured.
- Validates property type, ownership type, status, and division foreign keys.
- All create/update/deactivate/upload actions are audit-logged with old & new
  snapshots.

Frontend
- `/divisions` — list, search, create / edit dialog with all blueprint fields.
- `/landlords` — list, search, create / edit dialog (incl. IBAN, contact person).
- `/properties` — responsive card grid with type & status filters and live
  agreement-expiry tagging on each card.
- `/properties/[id]` — detail page with tabbed UI:
  * Overview (full property facts + active-agreement side card with days-left tone)
  * Agreement (renewal-aware history table + post-new dialog)
  * Floors / Rooms (placeholder noting Phase 4)
  * Attachments (drag-and-drop upload, list, download, delete) — reusable for
    every entity that gains attachments later.
- Sidebar gains a "Landlords" entry, all items remain permission-gated.

Tests
- `pytest -q` → **17 passed** (Phase 1 health, Phase 2 auth, Phase 3 masters/
  agreements/expiring buckets/attachment upload+download).

## Next phase plan

**Phase 4 — Floor, Room & Bed setup**

Backend
- `floors`, `rooms`, `beds` models with cascade rules and indexes
- Auto bed-code generator (`<property>-F<floor>-R<room>-B<bed>`)
- Room capacity guard, bed-status state machine
  (`empty` / `occupied` / `reserved` / `maintenance` / `blocked`)
- Property occupancy summary (occupied, empty, reserved, maintenance, %)

Frontend
- Property detail "Floors" tab — add/edit floors
- Property detail "Rooms" tab — rooms grouped by floor, capacity & status badges
- Bed grid view inside each room with one-click status changes
- Occupancy progress bars on the property cards / dashboard

---

## License

Internal — Paris United Group.
