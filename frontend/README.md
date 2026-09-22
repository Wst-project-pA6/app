# WST Workshop Manager — Frontend

Stage 1 of the frontend for the Workshop Management & Student Practical
Training (WST) system: a production-shaped React foundation with a
generated API client, real authentication against the frozen backend
contract, authorization-aware application shell, English/Arabic
localization, and tests.

Stage 2 adds real, backend-integrated screens for four modules: Access
Management (users, roles, organization scopes), Customers, Vehicles
(including service history and service reminders), and Workshop Bays
(including the shared bay calendar). See "Stage 2 modules" below.

## Stack

- React 19 + TypeScript (strict) + Vite
- React Router for routing
- TanStack Query for server state
- React Hook Form + Zod for forms and validation
- i18next / react-i18next for localization (English, Arabic/RTL)
- openapi-typescript for generated contract types
- Vitest + React Testing Library + jsdom for tests
- Lucide React for icons
- A small in-house design system (CSS Modules + CSS variables) — no
  component framework

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: only needed to override the API base URL
npm run dev
```

The dev server proxies `/api` to `http://localhost:3000` (see
`vite.config.ts`), so the NestJS backend does not need CORS configured for
local development. Run the backend separately per its own README.

## Scripts

| Script                 | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                                                          |
| `npm run build`        | Type-check (`tsc -b`) and produce a production build                               |
| `npm run preview`      | Preview the production build locally                                               |
| `npm run lint`         | ESLint over the whole project                                                      |
| `npm run format`       | Format with Prettier                                                               |
| `npm run format:check` | Check formatting without writing                                                   |
| `npm run typecheck`    | TypeScript project-wide type check, no emit                                        |
| `npm test`             | Run the Vitest suite (`npm test -- --run` for a single non-watch pass)             |
| `npm run api:generate` | Regenerate `src/api/generated/schema.d.ts` from `openapi/wst-openapi.yaml`         |
| `npm run api:check`    | Verify the vendored contract's SHA-256 and that generated types are in sync        |
| `npm run test:e2e`     | Playwright end-to-end suite against real running dev servers — see `e2e/README.md` |
| `npm run test:e2e:ui`  | Same, in Playwright's interactive UI mode                                          |

## The frozen OpenAPI contract

`openapi/wst-openapi.yaml` is a byte-for-byte copy of the frozen contract.
It must never be hand-edited. `docs/openapi-contract.md` records its
SHA-256 and explains how to verify or refresh it. TypeScript types are
generated from it into `src/api/generated/schema.d.ts`, which application
code consumes through the thin re-exports in `src/api/types.ts` rather than
importing the generated file directly.

## Environment variables

See `.env.example`. `VITE_API_BASE_URL` controls where API requests go; in
development it is left pointing at `/api/v1` so the Vite proxy handles
routing to the backend. In production it should be set to the deployed
API's fully-qualified base URL.

## Documentation

- `docs/ARCHITECTURE.md` — layering, the API client, auth/token lifecycle,
  authorization model, localization, and the navigation/route registry.
- `docs/DEPLOYMENT.md` — production build, environment configuration, static
  hosting requirements (SPA fallback routing, base path), backend CORS/HTTPS
  requirements, the CI command sequence, and static-bundle security guidance.
- `e2e/README.md` — how to run the Playwright end-to-end suite, and the
  design choices behind it (test data isolation, the pending-access→admin
  grant flow).
- `docs/SECURITY.md` — token storage strategy and its tradeoffs, and what
  is and is not enforced on the client.
- `docs/openapi-contract.md` — contract provenance and hash verification.

## Project structure

```
src/
  api/           typed API client, generated types, endpoint functions,
                 TanStack Query hooks (api/hooks/*), query key factory
  app/           app-level wiring: routes, query client, error boundary
  auth/          auth context/provider, permission helpers, route guards
  components/    reusable design-system components
  hooks/         cross-feature React hooks (URL-synced list filter state)
  i18n/          i18next setup and locale resources (en, ar)
  layout/        application shell (header, sidebar, user menu)
  lib/           small framework-agnostic helpers (Intl date/number formatting)
  navigation/    permission-aware navigation/route registry
  pages/         route-level page components, grouped by module
                 (AccessManagement, Customers, Vehicles, Bays, plus Stage 1's
                 auth/shell pages)
  styles/        design tokens and global CSS
  test/          shared test setup/utilities
```

## Stage 2 modules

Four modules are now real, backend-integrated screens instead of the
"feature integration pending" placeholder. Every route below requires an
authenticated session; the specific ANY-OF permission gating each route is
noted, but the backend is always the authority — hiding a control here is
convenience only, never enforcement.

| Route                    | Page                                       | Requires (ANY of)                                                            |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `/access/users`          | User list                                  | `users.read`                                                                 |
| `/access/users/new`      | Create user                                | `users.manage`                                                               |
| `/access/users/:userId`  | User detail (profile, roles, scopes)       | `users.read` (role/scope panels need `roles.assign`/`scopes.manage` to show) |
| `/access/scopes`         | Organization scope management              | `scopes.manage` or `users.read` (create/edit need `scopes.manage`)           |
| `/customers`             | Customer list                              | `customers.read`                                                             |
| `/customers/new`         | Create customer                            | `customers.write`                                                            |
| `/customers/:customerId` | Customer detail                            | `customers.read` (edit/archive need `customers.write`)                       |
| `/vehicles`              | Vehicle list                               | `vehicles.read`                                                              |
| `/vehicles/new`          | Register vehicle                           | `vehicles.write`                                                             |
| `/vehicles/:vehicleId`   | Vehicle detail, service history, reminders | `vehicles.read` (edit/reminders need `vehicles.write`)                       |
| `/bays`                  | Bay list                                   | `bays.read` (create/edit need `bays.manage`)                                 |
| `/bays/:bayId/calendar`  | Bay calendar                               | `bays.read`                                                                  |

Navigation entries for these four modules only render for a signed-in user
who holds at least one of the module's permissions
(`src/navigation/registry.ts`, filtered in `src/layout/Sidebar.tsx`).

Every mutation (create, update, role/scope replacement, reminder and bay
transitions) goes through TanStack Query hooks in `src/api/hooks/*` wrapping
typed functions in `src/api/endpoints/*`, which call the real backend
through `src/api/client.ts` — no fake or hardcoded operational data. Running
these screens against real data requires the backend to be running and
reachable through the Vite dev proxy (`/api` → `http://localhost:3000`, see
`vite.config.ts` and `.env.example`); without a backend, requests fail with
the same structured `ApiError` handling (401/403/404/409/422/429) used
everywhere else in the app.

Still pending (unchanged "feature integration pending" placeholder): Job
Cards, Inventory, Purchasing, Invoices, Training, Reports/Exports,
Predictions, Audit Events. Customer statements (`GET
/customers/{customerId}/statement`) are intentionally not implemented yet —
they belong to the invoicing stage.

## Notes for later stages

Every module beyond the ones listed above (Job Cards, Inventory,
Purchasing, Invoices, Training, Reports/Exports, Predictions, Audit Events)
has a navigation entry and route already wired in
`src/navigation/registry.ts`, rendering a "feature integration pending"
placeholder. Implementing a module in a later stage means replacing its
placeholder route element — the shell, router and permission gating do not
need to change.
