# Phase 4 — apiflask schema migration TODO

This phase migrated the highest-traffic routes as the pattern. Remaining
routes still hand-validate and don't appear in `openapi.json`. Each is
migratable in isolation — copy the pattern from `auth.py`, `employees.py`,
or `landlords.py`:

  1. swap `from flask import Blueprint` → `from apiflask import APIBlueprint`
  2. add `@bp.input(SomeIn)` (creates a `json_data` kwarg)
  3. add `@bp.input(SomeQuery, location="query")` for filter params
  4. validation goes from manual checks to schema fields with `validate=OneOf(...)`

## Routes still hand-validated

  - `routes/properties.py`     — property CRUD + status changes
  - `routes/floors.py`         — floor CRUD
  - `routes/rooms.py`          — room CRUD
  - `routes/beds.py`           — bed CRUD + reservations
  - `routes/assignments.py`    — assignment lifecycle
  - `routes/movements.py`      — transfer / cancellation / vacation
  - `routes/renewals.py`       — landlord renewals
  - `routes/maintenance.py`    — start / complete / cancel
  - `routes/bulk_movements.py` — bulk operations
  - `routes/divisions.py`      — division CRUD
  - `routes/users.py`          — user CRUD
  - `routes/roles.py`          — role CRUD
  - `routes/approvals.py`      — approval workflow
  - `routes/settings.py`       — settings CRUD
  - `routes/reports.py`        — report queries
  - `routes/audit.py`          — audit log
  - `routes/dashboard.py`      — dashboard payloads
  - `routes/attachments.py`    — already validates content (Phase 3)
  - `routes/search.py`         — single GET, low priority
  - `routes/health.py`         — single GET, no body

## Response shapes (deferred)

`@bp.output(EnvelopeSchema)` would also describe the response shape in
OpenAPI, but apiflask 2.x runs the schema's `dump()` on the view return,
which would corrupt our `success_response()` envelope. Adding response
documentation needs a small custom apiflask plugin OR a per-route
`@bp.doc(responses={...})` with a statically-defined envelope schema
(not the dynamic `envelope()` factory in `schemas/common.py`, which
apispec can't register).

For now the generated `api-types.ts` covers input shapes (which is where
type safety matters most on the call site); response types stay as the
hand-written `ApiResponse<T>` envelope in `frontend/src/lib/api.ts`.
