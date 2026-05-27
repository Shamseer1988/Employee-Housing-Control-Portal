# PUG Accommodation Control System

Centralized, multi-company, multi-branch Employee Accommodation Management web application for **Paris United Group (PUG)** and its group companies. Head Office manages properties, rooms, beds, landlord agreements, and employee allocations from a single dashboard.

> Built phase-by-phase against the blueprint in `docs/BLUEPRINT.txt` and `docs/DEVELOPMENT_PROMPT.txt`.
> **Current status: Phase 5 — Employee master + Excel import complete.**

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
|  4 | Floor, room, bed setup + occupancy summary | ✅ Complete |
|  5 | Employee master + Excel import | ✅ Complete |
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

## What Phase 4 added

Backend
- Models: `Floor` (unique `floor_number` per property), `Room` (unique
  `room_number` per floor, capacity + room type + gender + bathroom/AC),
  `Bed` (globally unique `bed_code`, state machine status).
- Auto bed code: `<property_code>-F<floor>-R<room>-B<bed>` e.g.
  `PROP-0001-F1-R101-B1`. Regenerated when bed/room numbers change.
- Room state machine: `empty` / `partially_occupied` / `full` / `maintenance`
  / `blocked`. `recompute_status()` runs on every bed change; manual
  `maintenance` / `blocked` overrides are sticky until explicitly cleared.
- Bed state machine: `empty` / `occupied` / `reserved` / `maintenance` /
  `blocked`. Manual transitions only allow operator moves
  (`empty ↔ maintenance ↔ blocked`); `occupied` / `reserved` flips are
  reserved for the Phase 6/7 assignment & vacation transactions.
- Capacity guards:
  - Cannot add a bed that would exceed `room.capacity`.
  - Cannot shrink `room.capacity` below current bed count.
  - Cannot delete a floor with rooms, or a room with beds, or an occupied bed.
- Endpoints (all permission-gated):
  - `properties/<id>/floors` (list/create), `floors/<id>` (update/delete)
  - `floors/<id>/rooms` (list/create), `properties/<id>/rooms`,
    `rooms/<id>` (get/update/delete), `rooms/<id>/status` (manual override)
  - `rooms/<id>/beds` (list/create), `beds/<id>` (update/delete),
    `beds/<id>/status`
  - `properties/<id>/occupancy` — bed & room counts, plus occupancy %
  - `properties/<id>/structure` — nested floors → rooms → beds for the UI

Frontend
- Property detail "Floors" tab: list / create / edit / delete floors with
  status badges and live room counts.
- Property detail "Rooms & Beds" tab: floor switcher, room cards grouped by
  floor, expand a card to manage its beds. Inline form to add beds with
  capacity guard, one-click maintenance / block / clear / delete, status
  badges with tone, type & gender chips.
- Top-level `/rooms` overview: group-wide bed totals, occupancy %, and a
  responsive grid of property occupancy cards with progress bars linking
  into each property detail.
- All actions remain permission-gated via `<Can perm="…">`.

Tests
- `pytest -q` → **24 passed** (Phase 1–3 plus new floor/room/bed CRUD,
  capacity guard, bed state machine, room status auto-recompute, structure
  & occupancy endpoints, delete guards).

## What Phase 5 added

Backend
- Models: `Employee` (auto `EMP-NNNNN` code, unique QID & passport,
  accommodation status + current property/floor/room/bed FKs, status enum),
  `ImportBatch` and `ImportError` for traceable Excel imports.
- Endpoints under `/api/v1/employees`:
  - `GET /` — search by code/name/QID/passport/mobile; filter by division,
    status, accommodation-required.
  - `GET/POST/PUT/DELETE /<id>` — full CRUD (DELETE soft-terminates).
  - `GET /template` — downloads a styled `.xlsx` template with column hints
    and a sample row.
  - `POST /import` — multipart upload that validates the entire file first
    (required fields, gender/status/accommodation_type enums, division code
    lookup, duplicate QID / passport / employee_code against the DB *and*
    within the file). If any row fails, nothing is committed and every error
    row is returned with its line number.
  - `GET /import-batches` and `/import-batches/<id>` — batch history with
    captured error rows for audit / retry.
- Validation rules:
  - `full_name` required; `qid_number` & `passport_number` globally unique;
    `division_code` must resolve to a real Division.
  - Gender / accommodation_type / status restricted to canonical sets.
  - All-or-nothing import keeps the database consistent on every retry.
- Audit log captures create / update / deactivate / import (with totals).

Frontend
- `/employees` — list with search, division/status/accommodation filters,
  status tones, current-bed display, full create/edit dialog covering every
  blueprint field, and "Import" action.
- `/employees/[id]` — tabbed detail (Profile · Accommodation · Documents).
  Accommodation tab links into the assigned property and displays the bed
  code; Documents tab reuses the Phase 3 `AttachmentsTab` against
  `entity_type="employee"` for QID/passport/visa/contract files.
- Import dialog: template download, drag-to-pick file, single-shot import
  call, success summary (e.g. *"Imported 4 of 4 rows"*) or a scrollable
  error table keyed by row number for quick spreadsheet fixes.

Tests
- `pytest -q` → **31 passed** (Phases 1–4 plus 7 new for employee CRUD,
  validation, filters, template download, Excel happy-path,
  validation-blocks-commit, and in-file-duplicate detection).

## Next phase plan

**Phase 6 — Employee accommodation assignment transaction**

Backend
- `accommodation_assignments` model with transaction number, employee,
  property/floor/room/bed, dates, reason, status (`active`/`cancelled`),
  approval scaffolding for Phase 11.
- Assignment posting logic: empty-bed-only, employee cannot hold two active
  beds, updates `employee.current_*` and flips `bed.status` to `occupied`.
- Available-bed query (filterable by property, gender, accommodation type).

Frontend
- `/transactions/assignment` — wizard: pick employee → pick property → pick
  available bed → review → post.
- Employee accommodation tab gains the current assignment card with a
  cancel/transfer action stub for Phase 7.

---

## License

Internal — Paris United Group.
