# Demo Seed System

A synthetic, idempotent demo dataset for local development and manual/demo testing. Every record
it creates goes through the **real HTTP API** — the same controllers, services, validation,
permission checks and audit trail as data created by a real user in the frontend — with exactly
one narrowly-scoped, documented exception (see "The bootstrap admin exception" below).

Nothing in this dataset is real customer, vendor, or personal data. Emails, phone numbers, VINs,
codes and SKUs are all invented and follow fixed, recognizable patterns (see "Data markers"
below) specifically so the reset tool can find and remove exactly (and only) these rows.

## Quick start (Windows / PowerShell or Git Bash)

```
npm.cmd run build          # optional — the scripts below run it automatically
npm.cmd run seed           # create/refresh the demo dataset (safe to run repeatedly)
npm.cmd run seed:verify    # confirm representative records are retrievable via the real API
npm.cmd run seed:reset     # remove demo data that the audit trail allows removing (see below)
```

These are plain npm scripts, so they work identically in `cmd.exe`, PowerShell, or a POSIX shell
(`npm run seed` also works). They require your `.env` to already point at a running Postgres
instance with `schema.sql` applied — the same setup `npm run start:dev` uses.

Each command runs `nest build` first and then executes the compiled entry point directly
(`node dist/seed/run-seed.js`, with `--verify`/`--reset` flags), so it always reflects the current
source and starts fresh — you don't need a separate build step.

## What gets seeded

| Domain | What |
|---|---|
| Access | 12 demo accounts spanning all 10 roles, 4 organization scopes (2 branches, 1 store, 1 training program), role + scope grants |
| Customers/Vehicles | 4 customers (mixed individual/business), 5 vehicles, 3 service reminders |
| Workshop | 3 bays |
| Inventory | 6 parts, 1 store, opening stock via a real purchase order → approval → goods receipt, min/max stock levels, one approved stock adjustment |
| Purchasing | 2 vendors, 1 purchase order (submitted, approved, received) |
| Jobs | 5 job cards covering the full lifecycle: approvals (INITIAL_WORK and ADDITIONAL_WORK), bay/technician assignment, all 5 stage transitions, labor entries, part reservations/issues, quality checks, job photo + quality-evidence attachments, and one job left queued with only a pending (undecided) approval |
| Invoices | DRAFT, ISSUED-but-unpaid, and PAID examples (payments are single-shot, exact-amount only — see "Design notes") |
| Training (Session 15) | 1 term, 2 courses, 2 students, 2 groups, 3 enrollments, 2 sessions |
| Media | Synthetic vehicle/job photos and quality-evidence images, generated in-process (see "Media sourcing" below) and uploaded through the real attachment pipeline |

## Demo credentials

All demo accounts share one password (development-only, never used for anything resembling a
production secret):

```
Password: DemoPass!2026Seed
```

| Email | Role |
|---|---|
| demo.admin@demo.wst.local | SYSTEM_ADMIN |
| demo.manager@demo.wst.local | WORKSHOP_MANAGER |
| demo.advisor@demo.wst.local | SERVICE_ADVISOR |
| demo.tech1@demo.wst.local / demo.tech2@demo.wst.local | TECHNICIAN |
| demo.qc@demo.wst.local | QUALITY_CHECKER |
| demo.storekeeper@demo.wst.local | STOREKEEPER_PROCUREMENT |
| demo.mentor@demo.wst.local | MENTOR |
| demo.supervisor@demo.wst.local | TRAINING_SUPERVISOR |
| demo.student1@demo.wst.local / demo.student2@demo.wst.local | STUDENT |
| demo.finance@demo.wst.local | FINANCE_VIEWER_AUDITOR |

Source of truth: `src/seed/fixtures.ts` (`DEMO_USERS`, `DEMO_PASSWORD`).

## How idempotency works

Every seeded record has a **deterministic synthetic key** (fixed emails, `DEMO-`/`WST0`-prefixed
codes and VINs — see `src/seed/fixtures.ts`). A local, git-ignored manifest
(`storage/seed/manifest.json`) maps each key to the id the real API returned when it was created.
On every run, `npm run seed`:

1. Looks the key up in the manifest.
2. If found, verifies it still resolves via a real GET (where the API has one) before reusing it.
3. Otherwise creates it via a real POST — and if that hits a 409 (a database uniqueness
   constraint, e.g. on code/SKU/email), recovers the existing id via a list-and-find lookup
   instead of failing.
4. For a handful of resources with **no** uniqueness constraint and no single-item GET (customers,
   vehicles, job cards, purchase orders, stock adjustments, training terms/groups), it also tries
   a natural-key search (e.g. a vehicle's exact `vin`) *before* creating, so even a manually
   deleted `manifest.json` self-heals against an already-seeded database instead of duplicating.

**Do not hand-edit or delete `storage/seed/manifest.json`.** If you need a clean slate, use
`npm run seed:reset` (below), which keeps the manifest and the database in sync. See
`src/seed/idempotent.ts` and `src/seed/manifest.ts` for the exact mechanics.

## Reset — and its one real limitation

`npm run seed:reset` removes demo rows using the same deterministic markers, scoped so it can
never touch a row that doesn't trace back to one of them (see the markers list below). It does
**not** run as one big transaction — it works through table groups independently so a blocked
group never prevents everything else from being cleaned up — and it trims the manifest to match
exactly what it actually removed.

**`schema.sql` makes seven tables strictly append-only** (`job_stage_events`, `quality_checks`,
`stock_movements`, `part_issue_reversals`, `purchase_approvals`, `goods_receipts`,
`audit_events` — enforced by a `forbid_mutation()` database trigger, not application code). Job
creation always writes a `job_stage_events` row and a received purchase order always has a
`goods_receipts` row, so **once `npm run seed` has actually run, its job/vehicle/customer chain
and its purchasing/inventory chain (parts, stores, vendors, stock) can never be deleted again, by
anyone, through any path** — that is the system's real audit-integrity guarantee, not a gap in
this tool. `npm run seed:reset` detects this up front (read-only) and leaves that whole chain, and
its manifest entries, completely untouched rather than partially deleting it (which would desync
the manifest from the database — worse than deleting nothing). It still fully removes: the
training domain (no append-only table anywhere in it), bays, attachments (once nothing links to
them), organization scopes (once nothing references them), and any demo user who never acted on a
now-permanent row (in practice: the admin, mentor, and students — the manager, advisor,
technicians, quality checker and storekeeper are retained, since they are the `transitioned_by` /
`performed_by` / `technician_id` / `approver_id` / `received_by` on rows that must stay forever).

If you need a fully pristine environment, provision a fresh database from `schema.sql` (the
Session 27 Docker/seed roadmap item) rather than trying to force a delete through the audit trail.

### Data markers reset looks for

| Table | Marker |
|---|---|
| `users.email` | `demo.%@demo.wst.local` |
| `customers.email` | `%@demo-customer.wst.local` |
| `vehicles.vin` | `WST0%` |
| `organization_scopes.code`, `bays.code`, `stores.code` | `DEMO-%` |
| `vendors.code` | `DEMO-VEND-%` |
| `parts.sku` | `DEMO-PART-%` |
| `courses.code` | `DEMO-CRS-%` |

## Verification

`npm run seed:verify` runs ~20 checks, every one a real authenticated HTTP call (login as each
demo role, then representative GETs) — never a direct database read. It prints a PASS/FAIL line
per check and exits non-zero if anything fails. `test/seed-smoke.e2e-spec.ts` (part of
`npm run test:e2e`) runs the same seed step functions in-process and asserts, with Jest, that at
least one customer, job card, invoice and training enrollment are retrievable — the "focused
smoke test" proving the seed's output behaves like organically-created data.

## The bootstrap admin exception

By design, `PUT /users/:id/roles` requires an actor who already holds `roles.assign`, and public
self-registration (`POST /auth/register`) always grants zero roles. `schema.sql` seeds the
role/permission catalogue itself but never a default admin user. On a freshly-created database
there is therefore **no HTTP-reachable way to mint the first SYSTEM_ADMIN at all** — a genuine
product gap (see `docs/DECISIONS.md` OQ-08), not something to route around silently.

`src/seed/bootstrap-admin.ts` handles this with one narrow, documented, in-process exception:
after registering the demo admin through the real `/auth/register` endpoint, it calls
`AccessService.replaceRoles` directly (in-process) to grant it `SYSTEM_ADMIN` — the exact same
transaction/validation/audit code path a real `PUT /users/:id/roles` call would run, only skipping
the HTTP-layer permission guard, which nothing could satisfy yet. The granting actor is an
already-existing SYSTEM_ADMIN if the database has one (no password needed — looked up in-process,
never over HTTP as that account), or a second freshly self-registered demo account otherwise. It
no-ops the moment the demo admin already holds the role, and refuses outright when
`NODE_ENV=production`. Every other seeded record — including every other role/scope grant —
goes through real, permission-checked HTTP calls using the token this produces.

## Media sourcing and licensing

Demo vehicle/job photos and quality-evidence images are **entirely generated in-process**
(`src/seed/png.ts`) — a small, self-contained PNG encoder (raw scanlines + Node's built-in
`zlib.deflateSync`, no image library dependency) that draws a background, a colored "vehicle body"
rectangle and a "plate" bar. No photograph, stock image, or any external asset is read, fetched,
or embedded at any point. Because nothing is copied or scraped, there is no license or attribution
to track: **author is this seed script, license is whatever this repository's license is,
provenance is 100% synthetic.**

Images are uploaded through the real attachment pipeline (`POST /attachments`, magic-byte content
sniffing, private local-filesystem storage per `docs/DECISIONS.md`) and linked the same way an
organic upload would be: job photos via `POST /job-cards/:id/attachments`, quality evidence via
`evidenceAttachmentIds` on the quality-check call. Binary bytes are never written to Postgres —
only metadata, exactly like every other attachment in the system.

## Design notes / known API behaviors this seed works around

- **Payments are single-shot and exact-amount-only.** `POST /invoices/:id/payments` rejects
  anything but a payment that exactly equals the invoice total (`PAYMENT_AMOUNT_MISMATCH`
  otherwise) — there is no partial-payment path. "Issued but not yet paid" is demonstrated by
  simply never recording a payment, not by a partial one.
- **A job's approved parts/labor must precede its transitions.** `RECEIVED -> IN_PROGRESS`
  requires bay+technician assignment *and* an APPROVED `INITIAL_WORK` approval
  (`billable_work_allowed`); `IN_PROGRESS -> QUALITY_CHECK` requires every work item
  DONE/CANCELLED; `QUALITY_CHECK -> READY` requires the latest quality check to be PASSED (and
  auto-generates the job's draft invoice as a side effect); `READY -> DELIVERED` requires a
  non-void invoice. `src/seed/steps/jobs.seed.ts` sequences every step in that order.
- **Roles are strict about *who* can do what.** Job creation/approvals/invoicing is
  SERVICE_ADVISOR; bay assignment, all stage transitions, and purchase-order approval are
  WORKSHOP_MANAGER; labor and part issuance are TECHNICIAN; quality checks are QUALITY_CHECKER;
  parts/stores/vendors/purchasing/stock-adjustment-creation are STOREKEEPER_PROCUREMENT; training
  is TRAINING_SUPERVISOR. See the role→permission table in `schema.sql` §17 if you add a new step.
- **Purchase order approval tiers.** `finance_settings`/`purchase_approval_policy` require a
  second approver once a PO total reaches 20,000 EGP; the seeded PO is kept under that so a single
  WORKSHOP_MANAGER approval suffices.

## Two pre-existing application defects fixed along the way

Building and exercising this seed end-to-end surfaced two real, pre-existing bugs unrelated to the
seed system itself (both now fixed, and both would have affected real usage of the corresponding
endpoints, not just seeding):

1. `AccessRepository.lockActiveSystemAdmins` used `SELECT DISTINCT ... FOR UPDATE`, which
   PostgreSQL rejects outright — meaning **`PUT /users/:id/roles` was completely broken** for
   every caller, not just this seed. Fixed by dropping the (redundant, given the `user_roles`
   primary key) `DISTINCT`.
2. Two SQL bugs in `src/modules/purchasing/purchase-orders.service.ts` and
   `goods-receipts.service.ts`: a parameter used both bare and `::numeric`-cast in the same
   `INSERT` ("inconsistent types deduced for parameter"), and a `SELECT id FROM stock_balances`
   lock query against a table whose primary key is `(store_id, part_id)` with no `id` column at
   all — meaning **creating any purchase order, and receiving goods against any purchase order,
   were both completely broken** for every caller. Both fixed with explicit casts / selecting the
   real primary-key columns.
