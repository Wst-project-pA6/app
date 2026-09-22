# Security notes

## Token storage: the demo-compatible tradeoff

The frozen backend contract returns both the access token and the refresh
token in the JSON body of `POST /auth/login` and `POST /auth/refresh` —
there is no HttpOnly cookie involved. Given that constraint, this
frontend uses:

- **Access token: in memory only** (`src/api/tokenStorage.ts`). It is held
  in a plain module-level variable, never written to any storage API. It
  disappears on tab close or reload, which is what forces the silent
  refresh-on-load path in `AuthProvider` to run.
- **Refresh token: `sessionStorage`**, not `localStorage`. This lets a
  single tab restore its session across a reload (the point of a refresh
  token at all) while still scoping it to that tab/session and clearing it
  when the tab or browser closes — a real, if partial, mitigation against
  the token lingering indefinitely in storage that other scripts or a
  later, unrelated bug could read.

This is explicitly a **tradeoff for a backend that hands refresh tokens to
JavaScript at all**. It is more exposed to XSS than an HttpOnly,
`SameSite` cookie would be, because any script running on the page can
read `sessionStorage`. It is chosen over `localStorage` only, not over a
cookie-based design, which would be strictly better.

### Why this is isolated behind an interface

`TokenStorage` (`src/api/tokenStorage.ts`) is a small interface with a
single implementation. If the backend is later changed to set an HttpOnly
refresh cookie (the standard-practice fix), the replacement implementation
would simply stop storing a refresh token at all (the browser and server
handle that via the cookie) and `performRefresh()` in `src/api/client.ts`
would call `/auth/refresh` with `credentials: 'include'` and no body
token. No other file in the app reads or writes token storage directly,
so that change is contained to this one module and the `performRefresh`
call site.

## What is, and is not, enforced client-side

- **Nothing here is authoritative.** `hasAnyPermission` and the navigation
  registry only decide what to _show_. Every real mutation and read is
  re-authorized by the backend from the JWT identity on every request,
  independent of anything the client sends or renders. A user with the
  browser DevTools open and no legitimate permission gains nothing by
  forcing a hidden route to render — the underlying API calls (added in
  later stages) still 403.
- **Row-level scope** (organization scope, "only my assigned jobs", etc.)
  is entirely a backend concern per the contract; the client does not
  attempt to replicate it.

## Logging discipline

- The API client never logs response bodies, request bodies, or headers.
- `ApiError` carries `requestId` specifically so a user can quote it to
  support without any token or password ever appearing in a log line or
  error report.
- The `ErrorBoundary` does not log the caught error's message/stack to the
  console beyond React's own default development overlay, since it has no
  reliable way to distinguish a safe error from one that embeds sensitive
  data from an arbitrary thrown value.

## What is intentionally out of scope for Stage 1

- CSRF is not addressed because there is no cookie-based auth yet to be
  vulnerable to it.
- Content Security Policy, Subresource Integrity and other
  deployment-time HTTP headers are an infrastructure/deployment concern,
  not a Vite/React concern, and are not configured here.
- Rate limiting, password hashing, and dependency scanning are backend/
  infrastructure responsibilities per the contract's own "Non-API
  concerns" section and are not duplicated on the client.
