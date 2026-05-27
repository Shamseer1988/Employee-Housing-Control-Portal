# PUG Accommodation Control System

Centralized, multi-company, multi-branch Employee Accommodation Management web application for **Paris United Group (PUG)** and its group companies. Head Office manages properties, rooms, beds, landlord agreements, and employee allocations from a single dashboard.

> Built phase-by-phase against the blueprint in `docs/BLUEPRINT.txt` and `docs/DEVELOPMENT_PROMPT.txt`.
> **Current status: Phase 14 — Testing & production deployment complete. 🎉 All 14 phases shipped.**

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
|  6 | Employee room/bed assignment | ✅ Complete |
|  7 | Transfer, bed change, cancellation, vacation, visa cancellation | ✅ Complete |
|  8 | Landlord renewal & maintenance | ✅ Complete |
|  9 | Dashboard cards, charts, alerts | ✅ Complete |
| 10 | Reports + Excel/PDF export | ✅ Complete |
| 11 | Approval workflow | ✅ Complete |
| 12 | System settings | ✅ Complete |
| 13 | UI polish + responsive optimization | ✅ Complete |
| 14 | Testing + production deployment | ✅ Complete |

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

## What Phase 6 added

Backend
- `AccommodationAssignment` model with auto transaction number
  `ASSIGN-YYYYMM-NNNN`, FKs to employee / property / floor / room / bed,
  status (`active` / `cancelled` / `transferred`), reason, expected stay
  period, approval slot for Phase 11, and an indexed `(employee_id, status)`
  pair so duplicate-active-bed lookups stay O(1).
- `services/assignments.py` (`post_assignment`) — single source of truth for
  the posting rules. Every guard fires before any state change:
  - employee must exist, be `accommodation_required`, and not in a closed
    status (`resigned` / `terminated` / `visa_cancelled`)
  - bed must be `empty` (not `occupied` / `reserved` / `maintenance` / `blocked`)
  - parent room cannot be `maintenance` / `blocked`
  - parent property must be `active`
  - room gender filter (`any` / `male` / `female`) must match the employee
  - employee cannot already hold an active assignment
  After validation, the service flips `bed.status → occupied`, sets
  `bed.current_employee_id`, fills `employee.current_property_id / floor_id /
  room_id / bed_id`, clears `on_vacation` / `transferred` employee statuses,
  and triggers `room.recompute_status()` so cards update on the next read.
- Endpoints under `/api/v1`:
  - `GET /assignments` — list with `employee_id` / `property_id` / `status`
    filters
  - `GET /assignments/<id>` — full transaction with employee / property /
    room / bed snapshots
  - `POST /assignments` — post a new assignment (the route is a thin shell
    around the service; failures roll back cleanly)
  - `GET /beds/available` — empty beds, filterable by property / floor /
    room / gender. If `employee_id` is supplied and no explicit gender, the
    employee's gender is used automatically so the picker never shows
    incompatible rooms.
- Audit log captures every post with the full transaction snapshot.

Frontend
- `/transactions` — hub of operational actions. Cards for assignment
  (active), transfer / cancellation / vacation (Phase 7), renewal /
  maintenance / bulk (Phase 8); each card is permission-gated and shows
  "Phase 7/8" badges for upcoming items.
- `/transactions/assignments` — list of every posted assignment with status
  tone, employee / property / bed quick-links, and a status filter.
- `/transactions/assignments/new` — 3-step wizard:
  1. **Employee** — searchable list of unassigned, non-terminated employees
     that need accommodation
  2. **Bed** — available-bed grid (auto-filtered by the employee's gender),
     property filter, capacity / type / amenity chips on every card
  3. **Confirm** — review card, assignment date, reason picker, stay
     period, remarks, post button
- Sidebar phase tag bumped to v0.6.0.

Tests
- `pytest -q` → **40 passed** (9 new for available beds, happy-path posting,
  duplicate-employee guard, occupied-bed guard, gender restriction, no-
  accommodation guard, maintenance-bed guard, room status transitioning to
  `full` when both beds are taken, and assignment list filters).

## What Phase 7 added

Backend
- New models: `AccommodationTransfer`, `AccommodationCancellation`,
  `EmployeeVacation` — each with its own monthly-sequenced transaction
  number (`TRANS-YYYYMM-NNNN`, `CANCEL-YYYYMM-NNNN`, `VAC-YYYYMM-NNNN`).
- `services/movements.py` — single source of truth for the three flows.
  Every state change happens inside the service so audit / DB / cache
  invariants stay locked together.
- **Transfer** — runs every Phase-6 guard against the target bed (empty,
  property active, room not blocked, gender match) and refuses same-bed
  transfers. On success it closes the active assignment
  (`status="transferred"`), empties the old bed, calls back into
  `post_assignment()` for the new bed, and links the two assignments
  through the transfer row.
- **Cancellation** — closes the active assignment (`status="cancelled"`),
  empties the bed, clears employee `current_*`, and rewrites
  `employee.status` for closed reasons (`resigned` / `terminated` /
  `visa_cancelled`); reason validated against a canonical set.
- **Vacation** — `keep_bed_reserved=true` flips the bed to `reserved` and
  keeps the assignment alive so a returning employee snaps back into the
  same bed; `keep_bed_reserved=false` releases the bed (assignment closes
  with reason `"vacation"`) and clears `current_*`. Employee status moves
  to `on_vacation`.
- **Return from vacation** — restores `bed.status` to `occupied` and
  employee.status to `active` when the bed was held; otherwise the
  employee comes back as `active` with no current bed and needs a fresh
  assignment.
- Endpoints under `/api/v1`:
  - `GET/POST /transfers` (with `employee_id` filter on list)
  - `GET/POST /cancellations`
  - `GET/POST /vacations`, `POST /vacations/<id>/return`
  - `GET /employees/<id>/timeline` — chronological union of assignments,
    transfers, cancellations and vacations (powers the detail tab).
- Audit log captures every post / return with the full transaction snapshot.

Frontend
- New list pages: `/transactions/transfers`, `/transactions/cancellations`,
  `/transactions/vacations` (status filter + "Mark returned" action).
- New wizards:
  - `/transactions/transfers/new` — Employee → New bed (auto-filtered by
    gender, hides current bed) → Confirm.
  - `/transactions/cancellations/new` — Employee → reason / date / remarks.
  - `/transactions/vacations/new` — Employee → start/end dates and a
    "Keep bed reserved" toggle that explains both branches.
- Reusable `<EmployeePicker>` component (drives all three wizards).
- Employee detail **Accommodation tab** now shows a glassmorphism movement
  timeline (assignment / transfer / cancellation / vacation) with status
  tones and per-event details.
- Sidebar phase tag bumped to v0.7.0.

Tests
- `pytest -q` → **51 passed** (11 new for transfer happy-path & guards,
  cancellation flow + status mapping + reason validation, vacation with
  reserved bed (round-trip), vacation that releases the bed, vacation
  without an assignment, and employee timeline aggregation).

## What Phase 8 added

Backend
- New models:
  - `LandlordRenewal` (`LRENEW-YYYYMM-NNNN`) — captures the renewal event
    with FKs to the old + new `property_agreements` row, snapshots of
    old/new expiry & rent, renewal date and approver. Both agreement
    columns serialize to nested dicts in `to_dict`, so a single GET
    /renewals call gives the UI everything it needs.
  - `MaintenanceRecord` (`MAINT-YYYYMM-NNNN`) — generic record over
    property / room / bed, with `entity_type` + `entity_id`,
    `prior_status` (so completion can restore), planned and actual end
    dates, reason, status (`in_progress` / `completed` / `cancelled`),
    indexed (`entity_type`, `entity_id`) and (`status`, `entity_type`).
- `services/renewals.py` — single-call renewal that archives every
  existing active agreement for the property (sets `is_active=false`,
  `renewal_status="renewed"`), inserts the new agreement and writes the
  linking `LandlordRenewal` row. Validates inverted dates.
- `services/maintenance.py` — `start_maintenance`, `complete_maintenance`,
  `cancel_maintenance`. Refuses to start when:
  - bed is `occupied` or `reserved`,
  - room has any occupied bed (operator must transfer/release first),
  - a record is already in progress for the same entity.
  On start it captures the prior status; on completion it restores —
  rooms recompute from current bed states so derived statuses
  (`partially_occupied` / `full`) are correct.
- Endpoints under `/api/v1`:
  - `GET/POST /renewals` (filter by `property_id` / `landlord_id`)
  - `GET/POST /maintenance` (filter by `entity_type`, `entity_id`,
    `property_id`, `status`)
  - `POST /maintenance/<id>/complete`, `POST /maintenance/<id>/cancel`
- Phase-6 assignment service already refuses `maintenance` beds, so the
  guards compose cleanly with no additional code.
- Audit log captures every renewal / maintenance start / complete /
  cancel with the full transaction snapshot.

Frontend
- `/transactions/renewals` — table of every renewal with old → new rent,
  old expiry → new expiry, links into the property.
- `/transactions/renewals/new` — picks a property, surfaces its active
  agreement (landlord, expiry, rent, terms) and pre-fills the landlord /
  rent / terms for the new agreement, with a warning that the current
  agreement will be archived on submit.
- `/transactions/maintenance` — list with entity-type and status filters,
  semantic status tones, inline **Complete** and **Cancel** actions on
  in-progress rows.
- `/transactions/maintenance/new` — pick target type (property/room/bed),
  cascading selectors (property → room → bed) using
  `/properties/<id>/structure`, with bed options disabled when occupied
  or reserved.
- Sidebar phase tag bumped to v0.8.0.

Tests
- `pytest -q` → **61 passed** (10 new for renewal archiving + transaction
  capture, no-prior-agreement, inverted-date guard, bed maintenance ⇄
  assignment guard, occupied-bed/room rejection, room-recompute on
  completion, duplicate-open-record guard, property maintenance
  round-trip, list filters).

## What Phase 9 added

Backend
- New `services/dashboard.py` with grouped aggregate queries (using
  `case + sum` for portable per-status counts):
  - `summary()` — KPIs for properties, rooms, beds (incl. occupancy %),
    employees by status, agreements expiry bucket summary, maintenance counts.
  - `recent_activity()` — chronological union of assignments, transfers,
    cancellations, vacations, renewals, maintenance with employee /
    property snapshots.
  - `alerts()` — grouped by **critical** (expired agreements, expiring
    within 7d, over-capacity rooms), **warning** (expiring within 30d,
    unassigned employees needing accommodation), **info** (expiring
    within 90d, maintenance in progress). Returns counts per severity
    for the notification badge.
  - Chart endpoints: `occupancy_by_property()` (per-property bed totals
    + status breakdown), `occupancy_by_division()`,
    `monthly_movement(months=6)` (per-month assignments / transfers /
    cancellations / vacations using SQLite `strftime`, with a Postgres
    `to_char` fallback for production).
- Endpoints under `/api/v1/dashboard`: `/summary`, `/activity`, `/alerts`,
  `/charts/occupancy-by-property`, `/charts/occupancy-by-division`,
  `/charts/monthly-movement`. All gated by `dashboard.view`.

Frontend
- `/dashboard` — replaces the Phase 1 placeholder with eight live KPI
  cards (properties, beds, occupied, employees assigned, on vacation,
  maintenance, agreements, pending), each clickable through to the
  relevant list page. Charts: stacked bar of occupancy by property
  (top 10), bed-status donut, multi-series line for monthly movement,
  and an inline recent-activity panel. Tones flip red/amber/green based
  on the underlying numbers.
- Notification bell in the topbar polls `/dashboard/alerts` every minute,
  shows a coloured badge with the critical + warning count, and opens a
  side drawer grouped by severity with direct links into the relevant
  property / employee / maintenance pages.
- `/alerts` — full-page version of the digest grouped by severity with
  expandable lists per category. Hidden sections collapse to keep the
  view tidy when everything is healthy.
- Sidebar phase tag bumped to v0.9.0.

Tests
- `pytest -q` → **67 passed** (6 new for dashboard summary, alerts
  digest, activity feed, occupancy-by-property chart, monthly movement
  chart, and the permission gate).

## What Phase 10 added

Backend
- `services/reports.py` — a small registry where each report is a function
  returning `{columns, rows, meta}`. New reports are added with a single
  `@report(slug, title, category)` decorator. Shipped reports:
  1. Property Occupancy (per-property bed totals + breakdown + %).
  2. Room-wise Bed Allocation (every bed with its current employee).
  3. Empty Beds (subset of #2 with the assignment columns hidden).
  4. Property-wise Employee List.
  5. Division-wise Accommodation (assigned / pending / on vacation).
  6. Employee Accommodation History (reuses the Phase 7 timeline).
  7. Landlord Agreement Expiry (active agreements + bucket + days-left).
  8. Employees on Vacation.
  9. Maintenance Room/Bed (defaults to in-progress).
  10. Monthly Accommodation Movement.
  11. Audit Trail.
- `to_workbook(title, columns, rows)` writes a styled `.xlsx` (header
  fill, frozen panes, auto column widths) via openpyxl.
- Endpoints under `/api/v1/reports`:
  - `GET /` — catalog (slug / title / category / description).
  - `GET /<slug>?…filters…` — returns the report payload as JSON.
  - `GET /<slug>/export?…filters…` — downloads the report as Excel.
- All filters arrive as query-string params; each report decides which
  ones it honours. JSON view is gated by `report.view`; export by
  `report.export`.

Frontend
- `/reports` — category cards (Occupancy / Employees / Property /
  Operations / Audit) loaded from the catalog endpoint.
- `/reports/[slug]` — generic viewer that renders any report:
  - Per-slug filter form (text / number / date / select / property
    picker / division picker / employee picker), persisted to
    localStorage so refresh keeps your filters.
  - TanStack Table with click-to-sort headers and a "Columns"
    toggle panel for column visibility.
  - Excel download (permission-gated by `report.export`) and a Print
    button with a global print stylesheet that drops sidebar/topbar
    and removes glassmorphism for clean output.
- Sidebar phase tag bumped to v0.10.0.

Tests
- `pytest -q` → **79 passed** (12 new for the report catalog, every
  shipped report's filtering, the openpyxl export, missing-required-
  filter handling, 404 for unknown slugs, and the permission gate).

## What Phase 11 added

Backend
- New models:
  - `SystemSetting` — generic key/value (JSON-typed) settings table with
    `category` indexing.
  - `ApprovalRequest` (`APPR-YYYYMM-NNNN`) — module, entity_type +
    entity_id pointing at the underlying transaction, requested_by /
    requested_at, status (`pending` / `approved` / `rejected`),
    decided_by / decided_at / decision_remarks, human summary string.
- Added `status` column to `AccommodationTransfer`,
  `AccommodationCancellation`, `LandlordRenewal` (the assignment table
  already had one). Default `"completed"`; pending records carry
  `"pending_approval"`, rejected records carry `"rejected"`.
- `services/settings.py` — `get / get_bool / set_value / seed_defaults`
  helpers and four shipped toggles:
  - `approval.assignment.required`
  - `approval.transfer.required`
  - `approval.cancellation.required`
  - `approval.renewal.required`
- `services/approvals.py` — `create_request`, `list_requests`,
  `approve`, `reject`, `pending_counts`. Approve dispatches to a
  module-specific finalizer:
  - `finalize_pending_assignment` — re-runs every validation guard
    against current state (in case the bed was taken by another
    request while this one was pending) before applying side effects.
  - `finalize_pending_transfer` — re-validates the destination bed,
    then closes the source assignment, empties the source bed, posts
    the new assignment, and links the two via the transfer row.
  - `finalize_pending_cancellation` — closes the assignment, empties
    the bed, clears `employee.current_*` and updates `employee.status`.
  - `finalize_pending_renewal` — creates the new agreement and
    archives the previous active one (draft fields are stashed on the
    renewal row at request time and reconstituted on approval).
- Refactored `post_assignment` / `post_transfer` / `post_cancellation` /
  `post_renewal` so they:
  - Run every validation guard up-front (no half-state ever).
  - Honour the per-module approval setting: if ON, create the
    transaction in `pending_approval` status, add an `ApprovalRequest`
    row, and skip side effects. If OFF, behave exactly as before.
- Endpoints:
  - `GET /api/v1/approvals` — queue with `status` / `module` filters
    and `pending_counts` in the meta.
  - `GET /api/v1/approvals/counts` — module → count (for the sidebar
    badge and dashboard).
  - `POST /api/v1/approvals/<id>/approve` (gated by `approval.approve`)
  - `POST /api/v1/approvals/<id>/reject` (gated by `approval.reject`)
  - `GET /api/v1/settings` (gated by `settings.view`)
  - `PUT /api/v1/settings/<key>` (gated by `settings.manage`)
- CLI `flask --app wsgi seed` now also seeds the four approval settings
  alongside permissions / roles / super-user.

Frontend
- `/approvals` — pending queue with module + status filters, semantic
  tones, Approve / Reject buttons that open a tiny remarks dialog
  before posting. Decision remarks are surfaced under the status badge.
- `/settings` — replaces the placeholder with a focused page that
  exposes the four approval toggles (UI gated by `settings.manage`,
  read-only for `settings.view`). Phase 12 will broaden this page.
- Sidebar gains an **Approvals** entry with a live pending-count badge
  that polls `/approvals/counts` every minute. Tag bumped to v0.11.0.

Tests
- `pytest -q` → **91 passed** (12 new for approval queue happy paths,
  assignment / transfer / cancellation / renewal pending behaviour,
  reject leaves state untouched, second pending request for the same
  employee is rejected up-front, approval revalidates at decision time
  so a stolen bed surfaces "occupied", pending counts endpoint, and
  the synchronous path still works when the toggle is off).

## What Phase 12 added

Backend
- `services/settings.py` now declares a **catalog of 44 settings across
  11 categories**: Company, Property, Numbering, Approval, Alerts,
  Email, UI, Import/Export, Security, Backup, Audit. Each entry carries
  a `type` hint (`bool` / `int` / `string` / `select` / `password` /
  `textarea`), an optional `options` list for selects, an `is_secret`
  flag, and human-readable `label` / `description` / `help`.
- `set_value` coerces incoming values to the declared type (e.g. `"true"`
  → `True`, `"2500"` → `2500`) and validates select options against the
  catalog before writing.
- New endpoints under `/api/v1/settings`:
  - `GET /catalog` — settings grouped by category with full metadata
    (secret values masked to `value: null, is_set: bool`).
  - `GET /` — flat list, also masking secrets.
  - `GET /public` — **unauthenticated** subset (`company.name`,
    `company.logo_url`) for the login page and the topbar.
  - `PUT /` — bulk update with `{ settings: { key: value, ... } }`.
    Type coercion runs per key; an invalid value rolls back the whole
    update.
  - `PUT /<key>` — single-setting update (kept from Phase 11).
- Numbering prefixes (`numbering.property.prefix`, `.landlord`,
  `.division`, `.employee`) are now read from settings by
  `services/codes.prefix_for(entity)` and used by every auto-code
  generator (so `numbering.property.prefix=BLDG` immediately produces
  `BLDG-0001` on the next property).
- Audit log captures bulk updates with the new values (secret keys
  redacted in the snapshot).

Frontend
- `/settings` is now a fully-tabbed page driven by the catalog. Left
  rail lists every category with an icon, an active highlight, and an
  amber dot when the section has unsaved changes. Right pane renders
  the appropriate input per `type`:
  - **string** → text input
  - **textarea** → multi-line
  - **int** → number input
  - **bool** → toggle
  - **select** → `<select>` with the catalog's options
  - **password** → masked input with "set / not set" indicator that
    only sends a value when the admin types one
- Per-section **Save changes** and **Reset** buttons; drafts persist in
  state per category so switching tabs doesn't lose work.
- `useCompanyName()` / `useCompanyLogo()` hooks in
  `lib/public-settings.ts` fetch `/settings/public` on first use and
  cache via Zustand. The sidebar header now displays the configured
  company name + logo (or falls back to a generated initial badge),
  and the login page mirrors the same branding.
- Sidebar phase tag bumped to v0.12.0.

Tests
- `pytest -q` → **99 passed** (8 new for the catalog grouping, public
  endpoint, bulk update with coercion, invalid-select rejection,
  single-setting update, secret-never-returned, numbering-prefix-takes-
  effect, and the auth gate).

## What Phase 13 added

Live UI settings
- `/api/v1/settings/public` now returns the five `ui.*` keys
  (`accent_color`, `glassmorphism`, `compact_mode`,
  `sidebar_default_collapsed`, `table_density`) in addition to the
  branding fields. The public endpoint stays unauthenticated so the
  theme renders correctly even before sign-in.
- `lib/public-settings.ts` exposes them through a typed Zustand store
  (`useCompanyName`, `useCompanyLogo` plus the full UI block).
- New `<ThemeBridge>` component mounted at the root: writes the
  `--primary` and `--ring` HSL CSS variables for the chosen accent
  (blue / emerald / violet / amber / rose) and sets `data-glass`,
  `data-compact`, `data-density` attributes on `<html>`.
- `globals.css` reacts to those attributes — turning off
  glassmorphism produces solid cards, compact mode tightens padding,
  and table density adjusts row vertical padding across every table
  in the app. A `:focus-visible` global rule restores the accent
  ring on every focusable element.

Responsive shell
- New `<MobileNav>` Framer-Motion side drawer with the same nav,
  permissions, and pending-approval badge as the desktop sidebar.
  Triggered by a hamburger button that only appears below `lg`.
- Topbar tightens its padding on small screens and hides the search
  box on `<sm`; the user menu and bell still fit comfortably.
- `min-w-0` on the main container so wide tables now scroll within
  their card instead of pushing the layout off-screen.

Reusable status components (`components/ui/states.tsx`)
- `<Skeleton>` — pulsing placeholder block.
- `<SkeletonTable rows columns>` — drops straight into a `<table>` for
  list pages while data loads.
- `<EmptyState icon title hint action>` — for grids and detail panels.
- `<ErrorState title message onRetry>` — matching destructive variant.

Motion & a11y polish
- `<Modal>` rewritten with `AnimatePresence`, scale + fade transitions,
  Esc-to-close, `role="dialog"` + `aria-modal`.
- `<RouteProgress>` strip at the very top of the app pulses on every
  navigation — quick visual feedback without pulling in NProgress.
- Icon-only buttons gain descriptive `aria-label`s in the employees
  list, attachments table, and elsewhere they were ambiguous.
- The shared `<AttachmentsTab>` moved to
  `components/attachments-tab.tsx` (Next disallows non-page exports
  from a page file). Employees and property detail import it from there.

Refactor / fixes done along the way
- Renamed a `Record` shadow type in
  `transactions/maintenance/page.tsx` so it stops colliding with TS's
  built-in `Record<K, V>` utility.
- Switched `<ThemeProvider>` to derive its props from the
  `next-themes` component type, fixing the missing
  `ThemeProviderProps` import.
- `npx next build` now produces a clean production build.

Tests
- `pytest -q` → **99 passed** (the existing public-settings test
  extended to assert the new UI keys ship through).
- Frontend: `tsc --noEmit` clean and `next build` green.

## What Phase 14 added

Frontend test framework
- Vitest 2 + `@testing-library/react` + `jsdom`. Runs with
  `npm test` (single pass) or `npm run test:watch`.
- 13 unit tests across 3 files:
  - `src/lib/auth-store.test.ts` — `has()` against missing user,
    super user, `*` wildcard, explicit codes, and `setSession`
    atomicity.
  - `src/lib/public-settings.test.ts` — defaults, full API
    merge, graceful failure when fetch rejects.
  - `src/components/ui/states.test.tsx` — `<EmptyState>`,
    `<ErrorState>` retry click, `<Skeleton>` className passthrough,
    `<SkeletonTable>` row/column shape.
- Manual path alias in `vitest.config.ts` (no ESM-only plugin) so
  `@/*` imports work identically to Next.

Container build
- `backend/Dockerfile` — multi-arch Python 3.11 image, drops to a
  non-root `app` user, healthcheck against `/api/v1/health`,
  gunicorn entrypoint reading `backend/gunicorn.conf.py`.
- `frontend/Dockerfile` — three-stage build (deps → builder → runner)
  on `node:20-alpine`, accepts a build-time `NEXT_PUBLIC_API_URL`
  arg, runs as non-root with a `wget` healthcheck.
- `deploy/Dockerfile.nginx` + `deploy/nginx.conf` — reverse-proxy in
  front of both services, gzip, real-IP from Cloudflare
  (`CF-Connecting-IP`), 30 MB upload limit, `/health` shortcut.
- `backend/gunicorn.conf.py` — 2×cores+1 workers (cap 16),
  4 threads, JSON-format access log to stdout, 60s timeout.

Orchestration
- `docker-compose.yml` wires `db` (Postgres 16-alpine) → `backend` →
  `frontend` → `nginx`, with healthchecks ordering and named volumes
  for Postgres data and uploads. `command:` runs
  `flask db upgrade && flask seed && gunicorn …` on every boot
  (both upgrade and seed are idempotent).
- Root `.env.example` documents every variable; the only required
  changes for a fresh box are `POSTGRES_PASSWORD`, `SECRET_KEY`,
  `JWT_SECRET_KEY`, `SUPERUSER_PASSWORD`, and `PUBLIC_BASE_URL`.

Backup / restore
- `scripts/backup.sh` — gzipped `pg_dump` to
  `backups/pug-YYYYMMDDTHHMMSSZ.sql.gz` + prune by retention.
- `scripts/restore.sh` — confirms before dropping the schema and
  piping a dump back in.

CI / automation
- `.github/workflows/ci.yml` runs on push and PR:
  - **backend** job: `pip install`, `pytest -q --disable-warnings`.
  - **frontend** job: `npm ci`, `npm run type-check`, `npm test`,
    `npm run build`.
  - **docker** job (gated on the two above): `docker compose build
    --pull` to catch image-level regressions.

Deployment docs
- `docs/DEPLOYMENT.md` — full Ubuntu + Docker runbook covering
  architecture, first-time setup, env reference, upgrades,
  backup/restore + cron schedule, log rotation, TLS via Cloudflare
  (Full-strict / `CF-Connecting-IP`), health checks, common ops
  (re-seed, shell, password reset), and a troubleshooting table.

Tests
- Backend `pytest -q` → **99 passed** (unchanged).
- Frontend `npm test` → **13 passed**, `tsc --noEmit` clean,
  `next build` green.

---

## 🎉 Build complete

All 14 phases from the blueprint are shipped. From here:
- Run `cp .env.example .env`, fill in secrets, `docker compose up -d`,
  open `http://localhost`, log in as `admin` with the password you set.
- Push to GitHub to trigger the CI workflow; merge to `main` once green.
- Schedule the cron backup line from `docs/DEPLOYMENT.md`.

---

## License

Internal — Paris United Group.
