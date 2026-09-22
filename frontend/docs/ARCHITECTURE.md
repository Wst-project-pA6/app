# Architecture

## Layering

```
pages/        route-level screens — compose components, call hooks, no HTTP details
layout/        application shell — header, sidebar, user menu
components/    presentational design-system pieces, no data fetching
auth/          authentication state, permission helpers, route guards
api/           the only layer that knows about HTTP, the contract, and tokens
navigation/    the single source of truth for what routes/nav items exist
i18n/          translations + document direction
```

Pages and layout components never call `fetch` or import from
`src/api/generated` directly; they go through `src/api/endpoints/*` (typed
functions) and, for anything beyond auth (added in later stages), would go
through TanStack Query hooks wrapping those functions.

## Generated contract types

`openapi/wst-openapi.yaml` is vendored verbatim. `npm run api:generate`
runs `openapi-typescript` against it and writes
`src/api/generated/schema.d.ts` — a disposable, regenerable build
artifact that is nonetheless committed so the project builds without a
codegen step. `src/api/types.ts` re-exports the schema types the app
actually uses (`LoginRequest`, `CurrentUser`, `Permission`, `Error`, …)
under stable names, so the rest of the app never imports
`components['schemas'][...]` paths directly. `npm run api:check`
(`scripts/check-api-hash.mjs`) fails the build if the vendored YAML has
drifted from the hash recorded in `docs/openapi-contract.md`, or if the
committed generated types are stale relative to it.

## API client (`src/api/client.ts`)

A single `request<T>(path, options)` function is the only thing that calls
`fetch`. It:

- Builds the URL from `VITE_API_BASE_URL` (default `/api/v1`) plus a query
  string built by `src/api/queryString.ts`, which serializes `page`,
  `pageSize`, `sort` and filter arrays as the contract expects (a single
  comma-separated value per repeated filter).
- Attaches `Authorization: Bearer <token>` from `tokenStorage` unless the
  call is `anonymous` (login, refresh, and any future public endpoint).
- Attaches `Accept-Language` from the active i18next language.
- Parses `204 No Content` as `undefined`, JSON bodies as `T`, and any
  non-2xx response into a typed `ApiError` (see `src/api/errors.ts`)
  carrying `code`, `message`, `details`, `requestId`, and — for 429 —
  `retryAfterSeconds` from the `Retry-After` header.
- On a `401` from a non-anonymous request, triggers exactly one shared
  refresh attempt (`refreshOnce()`), then retries the original request
  once with the new access token. Concurrent 401s across multiple
  in-flight requests all await the _same_ refresh promise, so only one
  `/auth/refresh` call is ever made no matter how many requests failed at
  once — this matters because the backend's refresh token is single-use
  and reuse revokes the whole token family.
- Never attempts a refresh for `/auth/login`, `/auth/refresh` or
  `/auth/logout` themselves (`skipAuthRefresh`), so a failing login can
  never recurse into a refresh loop.
- If the refresh itself fails, clears stored tokens and emits a
  `session-expired` event (`src/api/sessionEvents.ts`) that `AuthProvider`
  subscribes to, so the UI reliably falls back to "signed out" instead of
  looping on 401s.

`AbortSignal` is threaded through every endpoint function so callers
(TanStack Query, in later stages) can cancel in-flight requests.

## Authentication (`src/auth/`)

`AuthProvider` owns a small reducer with three statuses: `restoring`,
`authenticated`, `unauthenticated`. On mount, if a refresh token is present
in `sessionStorage`, it silently exchanges it for a fresh access token and
loads `/auth/me`; otherwise it goes straight to `unauthenticated` — this is
what lets a page reload restore a session without ever persisting the
access token itself. `login`, `changePassword` and `logout` all go through
the same `authApi` functions the rest of the app would use, so there is no
special-cased fetch logic outside `src/api`.

`mustChangePassword` is read from `/auth/me` (and from the login response,
which mirrors it) and enforced by `ProtectedRoute`: any authenticated
route redirects to `/change-password` until the flag clears, remembering
the originally requested location so `LoginPage`/`ChangePasswordPage` can
navigate back to it after success.

## Authorization

The contract's authorization model is ANY-OF: an operation's
`x-permissions` lists permissions of which the caller needs just one.
`src/auth/permissions.ts#hasAnyPermission` mirrors that exactly, and
`PermissionGate`/`PermissionRoute` (`src/auth/PermissionRoute.tsx`) use it
to gate routes and to filter the navigation registry
(`src/navigation/registry.ts`) down to what the current user's
`/auth/me` permissions actually allow. This is presentation-layer
convenience only — every real request is still authorized by the backend
from the JWT identity, never from anything the client asserts. Role names
are never used to infer authorization; only the `permissions` array
returned by `/auth/me` is consulted.

## Navigation/route registry

`src/navigation/registry.ts` is the single list of every planned module
(Dashboard, Access Management, Customers, Vehicles, Bays, Job Cards,
Inventory, Purchasing, Invoices, Training, Reports/Exports, Predictions,
Audit Events), each with its path, required ANY-OF permissions, and an
`implemented` flag. `AppRoutes` builds the sidebar from this one list for
every module, and the router from it for every module still flagged
`implemented: false` (rendering `PendingModulePage`, calling no endpoint).
Access Management, Customers, Vehicles and Bays are `implemented: true` as
of Stage 2: `AppRoutes` wires their real nested route trees explicitly
(`/access/users`, `/access/users/new`, `/access/users/:userId`,
`/access/scopes`, `/customers`, `/customers/new`, `/customers/:customerId`,
`/vehicles`, `/vehicles/new`, `/vehicles/:vehicleId`, `/bays`,
`/bays/:bayId/calendar`) instead of the generated pending route, each
wrapped in `PermissionGate` with the specific ANY-OF permission that
operation requires per the contract (e.g. `users.manage` to reach
`/access/users/new`, not just `users.read`). A later stage repeats this
same pattern for the remaining modules.

## Stage 2: data layer for the new modules

`src/api/endpoints/{users,roles,organizationScopes,customers,vehicles,bays}.ts`
are thin typed wrappers over `request<T>`, one function per contract
operation, following the exact shape of Stage 1's `endpoints/auth.ts` (no
logic beyond building the path/query/body and delegating to `request`).
`src/api/types.ts` re-exports every schema type these files need
(`User`, `UserCreateRequest`, `Customer`, `Vehicle`, `ServiceReminder`,
`Bay`, `BayCalendar`, the `*Page` wrappers, …), so pages and hooks never
import `src/api/generated/schema` directly, matching the Stage 1 rule.

`src/api/hooks/*` wraps each endpoint file in TanStack Query
`useQuery`/`useMutation` hooks, keyed through the factory in
`src/api/queryKeys.ts`. Every mutation invalidates (or directly
`setQueryData`s) the exact list/detail keys it affects — e.g. creating a
user invalidates the user list; replacing a user's roles updates that
user's cached detail and invalidates the list (roles can appear in list
columns). List hooks use `placeholderData: keepPreviousData` so pagination
and filter changes don't flash a loading state between pages.

List pages bind their filters, sort and page number to the URL via
`src/hooks/useSearchParamState.ts` (`useSearchParamState`/
`useSearchParamPage`), so reloading or sharing a list URL preserves what
was being viewed, and changing a filter resets back to page 1. Dates and
numbers are formatted with `Intl` through `src/lib/format.ts`, in the
active i18next locale, never hardcoded.

Shared UI added for these modules — reused rather than duplicated per page
— lives under `src/components/`: `ListStateBoundary` (loading skeleton /
`QueryErrorPanel` / `EmptyState` in one place), `FilterBar`, `SearchInput`
(debounced, so filtering doesn't fire a request per keystroke),
`ConfirmDialog`, `ToastProvider`/`useToast`, `LinkButton` (a route link
styled as a button), and `OrganizationScopeSelect` (the capability-aware
scope picker described below).

### Organization-scope selection without over-requiring permissions

Creating a customer or a bay needs an organization scope, but the task
requires that doing so never demands `scopes.manage`. `OrganizationScopeSelect`
(`src/components/OrganizationScopeSelect`) checks whether the caller holds
`scopes.manage` or `users.read` (the same ANY-OF the `/organization-scopes`
list endpoint itself requires); if so it lists real scope names, and if not
it falls back to a plain picker over the authenticated principal's own
`organizationScopeIds` from `/auth/me` — never inventing a new endpoint or
requiring a permission beyond what the operation being performed actually
needs. `src/pages/Vehicles/VehicleCreatePage/CustomerPicker.tsx` follows the
same pattern for customer lookup when registering a vehicle: a live search
against `/customers` when the caller holds `customers.read`, otherwise a
plain customer-ID field.

### Permission-aware behavior specific to Access Management

`UserDetailPage` composes three independent pieces that each gate
themselves on their own permission rather than the page's:
`RoleAssignmentPanel` (visible only with `roles.assign`) and
`ScopeAssignmentPanel` (visible only with `scopes.manage`) both disappear
entirely — not just disable — when the caller lacks the permission, and
both disable their own editing when the user is looking at their own
account (the backend rejects self role/scope changes with
`SEPARATION_OF_DUTIES_VIOLATION`, which the panels also render specially
when the backend returns it). Disabling a user, and removing the
`SYSTEM_ADMIN` role from someone who currently has it, both show a
confirmation step client-side; the backend's last-admin rule is never
duplicated or guessed at — the UI only warns and lets the backend's 409
be the final word.

## Localization

`src/i18n/index.ts` configures i18next with English and Arabic resources,
detects/persists only the language preference (via
`i18next-browser-languagedetector`, `localStorage`, never credentials),
and keeps `document.documentElement.lang`/`dir` in sync on every language
change. RTL is a pure client concern per the contract; a `.dir-ltr` utility
class (`src/styles/global.css`) keeps identifiers (UUIDs, VINs, job/PO
numbers, SKUs, amounts) directionally stable regardless of layout
direction, applied wherever such values are rendered (e.g. `HomePage`'s
email/permission list, `TextInput`'s `dirStable` prop, `Table`'s
`dirStable` column flag).
