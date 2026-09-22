# End-to-end tests (Playwright)

Automates the full workshop journey — register through delivery — plus
token refresh, logout, error handling, Arabic/RTL, and a mobile-viewport
subset, all against a **real running backend and frontend**. Nothing here is
mocked except two deliberate, narrow exceptions noted inline in
`tests/session.spec.ts` and `tests/error-handling.spec.ts` (a forced 401 and
a forced 422, both used to prove the app's _handling_ of those real response
shapes, not to fake success).

## Prerequisites

1. **Backend running**, with the demo seed applied (`D:\WST\backend`, branch
   `backend/demo-dataset-media`):
   ```bash
   npm run start:dev    # in the backend repo
   npm run seed          # idempotent; safe to re-run
   ```
2. **Frontend dev server running** (in this repo):
   ```bash
   npm run dev
   ```
3. Playwright's browser binary installed once: `npx playwright install chromium`.

## Running

```bash
npm run test:e2e          # headless, once
npm run test:e2e:ui       # Playwright's interactive UI mode, for debugging
npx playwright show-report  # open the last run's HTML report
```

Config lives in `playwright.config.ts` (repo root). The suite is
deliberately **serial** (`workers: 1`, `fullyParallel: false`) — see the
comment there: every test shares the same backend/database and the same
handful of accounts, which are subject to real login rate limiting
(`backend/src/modules/auth/login-rate-limiter.ts`), so parallel workers
would multiply login attempts and risk spurious 429s for no real benefit
(this is a correctness suite, not a load test).

Override the target URLs/credentials via environment variables (see
`support/env.ts` for the full list and defaults) — e.g. to point at a
different backend:

```bash
E2E_API_BASE_URL=https://api.staging.example.edu/api/v1 \
E2E_BASE_URL=https://staging.example.edu \
npm run test:e2e
```

## Design choices worth knowing before changing this suite

### How a pending account gets its first role/scope

Self-registration (`POST /auth/register`) always grants zero roles and zero
organization scopes — this is enforced **server-side**, not a UI gap (see
`src/pages/RegisterPage/RegisterPage.tsx` and the backend's
`docs/DEMO_SEED.md`, "The bootstrap admin exception": there is no
HTTP-reachable way to mint the very first `SYSTEM_ADMIN` on a fresh
database either, which is _why_ the backend's demo seed exists). So the
journey test's "admin grants access" step (`tests/journey.spec.ts`) does
exactly what a real administrator would do: log in as the backend's
pre-seeded demo admin (`demo.admin@demo.wst.local`, documented in the
backend's `docs/DEMO_SEED.md`) and call the same `PUT /users/{id}/roles`
and `PUT /users/{id}/organization-scopes` endpoints the Access Management UI
itself uses. This was chosen over "seed a pre-promoted test admin account
directly in the database" because it exercises the real, permission-checked
API path — the same one a human administrator would use — end to end,
rather than assuming a shortcut around it.

### Test data isolation

- **Fresh, unique data per run** for anything the journey actually creates
  or mutates: the journey's own account, customer, vehicle and job card are
  all generated with a timestamp+random suffix (`support/testData.ts`) each
  run, so runs never collide with each other or with the backend's static
  demo-seeded records, and nothing needs to be cleaned up afterward for the
  suite to be re-runnable.
- **Demo seed accounts used only for their documented role**, never for
  their data: `demo.admin`/`demo.manager`/`demo.storekeeper` are used
  exclusively to make the real admin/manager/storekeeper API calls a
  pending account or a stock top-up legitimately requires (see
  `support/globalSetup.ts`) — the suite never reads or asserts against the
  demo seed's own customers/vehicles/jobs, so it keeps working even if that
  seed dataset's specific contents change later.
- **Shared reference data resolved dynamically, not hardcoded**:
  `globalSetup.ts` looks up an organization scope with active bays and a
  part/store with (topped-up) stock via real `GET` calls rather than
  hardcoding their IDs, so the suite adapts if the demo seed's exact
  branch/bay/part naming changes.
- **One secondary account, provisioned once** (`globalSetup.ts`, holding
  `SERVICE_ADVISOR`) is reused read-mostly across `session.spec.ts`,
  `error-handling.spec.ts`, `rtl.spec.ts` and `mobile.spec.ts` — those specs
  are testing session/error/locale/viewport behavior, not the
  register→pending-access→grant flow itself (the journey spec already
  covers that), so provisioning a second full account for each would just
  add login-rate-limit risk for no additional coverage.
- **Stock top-up via the real stock-adjustment workflow**
  (`support/apiClient.ts`'s `topUpStock`), not a database write — the
  backend enforces separation of duties (the same account cannot both
  request and approve an adjustment), so this always uses the demo
  storekeeper and manager accounts together, never the journey's own user.

### Bugs this suite found and fixed in the app itself

Writing and running this suite against the real dev servers surfaced three
genuine, reproducible defects, fixed as part of this change (not routed
around in the tests):

1. **Spurious logout on page refresh in dev mode** — `AuthProvider`'s
   restore-on-mount effect called the token-refresh endpoint directly;
   under React StrictMode's double-effect-invocation (dev only), two
   concurrent refresh calls raced the single-use refresh token, and the
   loser's failure wiped out the winner's just-stored valid session. Fixed
   by having `AuthProvider` share the API client's existing single-flight
   `refreshOnce()` guard (`src/api/client.ts`, `src/auth/AuthProvider.tsx`)
   instead of duplicating the refresh call.
2. **"Refresh access" didn't leave the pending-access page** — once an
   admin granted a pending account's role/scope, clicking "Refresh access"
   correctly re-fetched the now-authorized user, but nothing navigated away
   from `/pending-access`; `ProtectedRoute` only ever redirects _to_ that
   page, never away from it. Fixed with a self-redirect in
   `PendingAccessPage.tsx` once the user is no longer pending (the same
   pattern `LoginPage`/`RegisterPage` already use for "already
   authenticated").
3. **Mobile viewport was horizontally pannable** — the closed off-canvas
   mobile nav drawer is positioned via `transform: translateX(-100%)`,
   which (being `position: fixed`) escapes an ordinary ancestor's
   `overflow` clipping; without `overflow-x: hidden` on the root element, a
   touch/trackpad swipe could reveal blank space and the edge of the closed
   drawer. Fixed in `src/styles/global.css`.

## Scenarios covered

| File                           | Scenario(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/journey.spec.ts`        | register → pending-access → admin grants access (real API call) → login; create customer → vehicle → job card + work item; assign bay/technician, request+approve customer approval, start job; log labor, issue a part, complete checklist, submit for quality check; record passing quality check, job reaches Ready (invoice auto-created); issue invoice, record exact payment; deliver job; **refresh the page and confirm state persisted server-side, not just in memory** |
| `tests/session.spec.ts`        | simulated 401 triggers silent token refresh + retry (not a forced logout); logout clears the session and redirects                                                                                                                                                                                                                                                                                                                                                                |
| `tests/error-handling.spec.ts` | a simulated real backend error response shows its actual code/message/request ID, not a generic crash                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/rtl.spec.ts`            | switching to Arabic mirrors the layout (dir=rtl, real translated text) while LTR-locked identifier columns (job numbers, etc.) stay LTR                                                                                                                                                                                                                                                                                                                                           |
| `tests/mobile.spec.ts`         | login, job list and job detail at a 390px mobile viewport: mobile nav drawer, no horizontal overflow, tabs remain usable                                                                                                                                                                                                                                                                                                                                                          |
