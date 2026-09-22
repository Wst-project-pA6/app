# Deployment

This app is a static single-page application (SPA): `npm run build` produces
a folder of static files (HTML/JS/CSS) with no server-side rendering and no
Node.js runtime needed to serve it. Any static file host works, provided it
is configured for SPA fallback routing (below).

## Building for production

```bash
npm ci
npm run build
```

`build` runs `tsc -b` (project-wide type check, no emit) and then
`vite build`. Output goes to `dist/`:

```
dist/
  index.html
  favicon.svg
  assets/
    index-<hash>.js
    index-<hash>.css
```

Filenames are content-hashed, so the whole `dist/` folder can be deployed
behind a CDN with a long-lived, immutable cache policy — a new build always
produces new filenames, and only `index.html` needs a short/no-cache policy
(see below).

`npm run preview` serves the built `dist/` folder locally (via Vite's own
static server) for a final sanity check before deploying — this is closer to
production than `npm run dev`, which serves unbundled source through the dev
server and proxy instead.

## Environment configuration

The single environment variable this app reads is `VITE_API_BASE_URL` (see
`.env.example`). Vite inlines it into the JS bundle **at build time** — there
is no runtime environment-variable reading in a static SPA, so a different
backend URL means a different build (or see "one build, multiple
environments" below).

| Environment                                               | `VITE_API_BASE_URL`                                                                                      | Why                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev (`npm run dev`)                                 | unset (defaults to `/api/v1`)                                                                            | Requests go through the Vite dev server's proxy (`vite.config.ts`) to `http://localhost:3000`, so the backend needs no CORS configuration for local development.                             |
| Any deployed environment (staging, prod, a PR preview, …) | the full origin + base path of that environment's backend, e.g. `https://api.staging.example.edu/api/v1` | There is no dev proxy once this is a static bundle served from its own origin; the browser calls the backend URL directly, so it must be a same-origin-or-CORS-enabled, fully-qualified URL. |

Set it when building:

```bash
VITE_API_BASE_URL=https://api.example.edu/api/v1 npm run build
```

or via a `.env.production` / `.env.<mode>` file that Vite picks up
automatically (see [Vite's env docs](https://vite.dev/guide/env-and-mode)) —
copy `.env.example` and fill in the real value; never commit the filled-in
file (the existing `.gitignore` already excludes `*.local` and `.env*`
variants other than `.env.example`).

### One build, multiple environments

Because `VITE_API_BASE_URL` is baked in at build time, the simplest CI/CD
setup is **one build per environment**, each with its own value of that
variable, each producing its own `dist/` to deploy to its own host/bucket.
If a single build artifact must be promoted unchanged across environments
instead (build once, deploy many times), that requires a small runtime
config step this app does not currently have (e.g. an `index.html`-injected
`<script>` or a fetched `config.json` read before the app boots) — out of
scope for this change; flagging it here as the tradeoff of the current
build-time-only approach.

## Static hosting requirements

### 1. SPA fallback routing (required)

This app uses `react-router-dom`'s `BrowserRouter` (real paths like
`/jobs/123`, not `#/jobs/123` hashes). That means the **host must serve
`index.html` for every path**, not just `/` — otherwise refreshing the page
on `/jobs/123` or opening that URL directly returns the host's default 404
instead of the app (which would then handle `/jobs/123` client-side via
`react-router-dom`).

Concretely: this app is verified to build correctly, but it was **not**
possible to verify SPA fallback behavior against a live production-mode
static host from within this task's environment (no hosting target was
provisioned) — configure and manually verify one of the following for
whichever host is chosen, before considering deployment complete:

- **Nginx**: `try_files $uri $uri/ /index.html;` inside the relevant
  `location /` block.
- **Apache**: an `.htaccess` (or vhost config) rewrite rule falling back to
  `/index.html` for non-file requests.
- **Netlify**: a `_redirects` file (or `netlify.toml` `[[redirects]]`) with
  `/* /index.html 200`.
- **Vercel**: a rewrite in `vercel.json`: `{"source": "/(.*)", "destination": "/index.html"}`.
- **AWS S3 + CloudFront**: set the S3 static-website-hosting "error
  document" to `index.html` (with a 200, not S3's default 404), or add a
  CloudFront custom error response mapping 403/404 → `/index.html` with
  status 200.
- **AWS Amplify / Azure Static Web Apps / GitHub Pages (with a SPA shim) /
  Cloudflare Pages**: each has a first-class "SPA fallback" or "rewrite"
  setting — enable it rather than relying on the default static-404
  behavior.

Verify after configuring: build and deploy, then open the deployed site,
navigate client-side into a nested route (e.g. click into a job card), copy
that URL, and load it **directly** in a fresh tab (or hit it with `curl`) —
it must return the app's `index.html` (200), not a 404.

### 2. Base path handling

`vite.config.ts` does not set `base`, so the build assumes it is served from
the **root** of its origin (`https://example.edu/`, not
`https://example.edu/some-subpath/`) — `index.html` references
`/favicon.svg` and `/assets/...` as absolute root paths. Deploying under a
subpath requires setting
[`base`](https://vite.dev/guide/build.html#public-base-path) in
`vite.config.ts` (or via the `--base` CLI flag) to that subpath before
building, e.g. `vite build --base=/wst/`.

### 3. Cache headers

Since asset filenames are content-hashed:

- `dist/assets/*` → safe to cache aggressively and immutably
  (`Cache-Control: public, max-age=31536000, immutable`).
- `dist/index.html` → must **not** be cached long-term
  (`Cache-Control: no-cache` or a short max-age), since it is what
  references the current hashed asset filenames — an aggressively cached
  stale `index.html` would keep pointing at deleted/replaced assets after a
  new deploy.

## Backend requirements (CORS / HTTPS)

Once this app is served from its own static-hosting origin (not the Vite dev
proxy), the backend must:

- **Enable CORS** for the frontend's deployed origin(s) — allow the
  `Authorization` header (Bearer tokens) and, at minimum, `GET, POST, PATCH,
PUT, DELETE, OPTIONS`. Restrict `Access-Control-Allow-Origin` to the
  specific known frontend origin(s) per environment; do not use a wildcard
  once real user data is involved.
- **Serve over HTTPS** in every environment reachable from a real browser
  outside localhost. Per the backend's own configuration (see its
  `APP_BASE_URL` documentation), plain `http://` is only accepted for
  `localhost`/`127.0.0.1`; any deployed backend must be HTTPS both because
  the backend itself enforces this for non-local hosts and because this
  frontend sends bearer tokens and credentials in requests that must not
  travel in the clear.
- If the frontend and backend are deployed on **different origins**
  (different domain, subdomain, or port), CORS (above) is mandatory — there
  is no cookie-based session here to fall back on if CORS is misconfigured;
  requests will simply fail in the browser.

## CI command sequence

No CI configuration currently exists in this repository (no
`.github/workflows`, no other CI platform config) — this is deliberately
just the documented command sequence a CI pipeline should run before
allowing a merge or deploy, in this order (each must pass before the next
provides useful signal, and a build using a stale/wrong contract is worse
than one that fails fast):

```bash
npm ci
npm run api:check      # verifies the vendored OpenAPI contract hash and that generated types are current
npm run lint            # ESLint across the project
npm run typecheck       # tsc -b --noEmit, project-wide (includes e2e/)
npm run test -- --run   # Vitest unit/component suite, single run (not watch mode)
npm run build           # tsc -b + vite build — also re-verifies types via the build's own tsc pass
npm run format:check    # Prettier, check-only
```

`npm run test:e2e` (the Playwright suite added alongside this document; see
`e2e/README.md`) is **not** part of this list: it requires a real running
backend + database (and demo-seeded data) and is meaningfully slower, so it
belongs in a separate CI stage/job — e.g. one that spins up the backend and
a database service first — rather than gating every commit the same way the
fast unit-level commands above do. Run it before a release/deploy, not on
every push.

## Security: what must never ship to this bundle

This is a **static, publicly-served** JS bundle — anything in it is
readable by anyone who loads the page (view-source, browser DevTools, or
simply downloading the file). Concretely, for this codebase:

- **No API secrets, service-role keys, or backend credentials of any kind.**
  This app has exactly one piece of backend-facing configuration —
  `VITE_API_BASE_URL`, a public URL, not a secret — and must never grow a
  second one that holds a credential. Any Vite env var prefixed `VITE_` is
  inlined into the client bundle by design; never put a secret behind that
  prefix.
- **No hardcoded demo/admin credentials.** The demo seed's password
  (documented in the backend's `docs/DEMO_SEED.md`) must stay out of this
  repo's shipped source — it is a backend-only, development-only seed
  value, referenced from `e2e/` test config (never bundled into `dist/`),
  never from `src/`.
- Authentication is entirely token-based against the real backend
  (`src/api/tokenStorage.ts`; see `docs/SECURITY.md` for the storage
  tradeoffs) — there is nothing else sensitive baked into the build to
  guard.

### Verified: grep of the actual built output

As part of this change, `dist/` was rebuilt and searched for
secret-shaped content:

```bash
npm run build
grep -riE "(api[_-]?key|secret|password|token|private[_-]?key|-----BEGIN|AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,})" dist/assets/*.js dist/assets/*.css dist/index.html
```

Findings: matches exist only as **generic English words inside React's own
minified library code and this app's own UI strings/CSS class names** (e.g.
the literal text "Password" from form labels, `type="password"` on inputs,
`tokenStorage`-related identifier names) — no actual key, secret, or
credential value. A follow-up, more targeted search for real secret shapes
came back empty:

```bash
grep -oE "(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})" dist/assets/*.js dist/assets/*.css dist/index.html
# (no output)
```

The only environment-derived string actually inlined into the bundle is the
API base path itself (`/api/v1`, the default used when `VITE_API_BASE_URL`
is unset at build time) — confirmed via:

```bash
grep -o "/api/v1" dist/assets/*.js | head -3
```

Re-run this grep after any change that adds a new environment variable or
third-party SDK, since those are the most common way a secret accidentally
ends up in a client bundle.
