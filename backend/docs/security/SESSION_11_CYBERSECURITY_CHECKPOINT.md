# Session 11 Cybersecurity Checkpoint

Short handoff note for the cybersecurity teammate (per roadmap Session 11). Reflects the
codebase as of this session; does not modify the frozen OpenAPI contract or `schema.sql`.

## Authentication and refresh tokens

- Access tokens: short-lived JWT (HS256, 600s TTL), issuer/audience pinned, secret from
  `AUTH_JWT_SECRET` (>= 32 UTF-8 bytes, validated at boot).
- Passwords: Argon2id (`m=19456, t=2, p=1`), PHC-format hash, constant-time verification
  (`password.service.ts`).
- Refresh tokens: random, rotating, single-use; only a SHA-256 hash is persisted
  (`token.service.ts`). Reuse of a spent refresh token is expected to revoke the family — verify
  this end-to-end once storage/session tables are exercised under load.
- Login and refresh/change-password are rate limited per-account and per-IP with integer
  `Retry-After` (`login-rate-limiter.ts`, `auth-operation-rate-limiter.ts`). Both key on a
  SHA-256 hash of the account identifier, not the raw value, so limiter state is not itself a
  PII store.

## RBAC and organization scopes

- Every protected route declares `x-permissions`; `PermissionsGuard` enforces "any of" the
  listed permissions and otherwise returns 403.
- Row-level access is enforced separately from permission checks: `ScopeService` restricts
  queries to the caller's `organizationScopeIds`, and job-scoped reads additionally check
  `jobs.read` vs `jobs.read.assigned` (technician sees only their own assigned job).
- Attachment authorization for a LINKED file mirrors the owning resource's own rule exactly,
  not a single generic "job access" check reused everywhere: JOB_CARD uses jobs.read/assigned;
  JOB_APPROVAL uses `approvals.read` scoped by organization only (no technician restriction,
  matching `ApprovalsService.list`); QUALITY_CHECK uses jobs.read, jobs.read.assigned or
  `quality.perform` (matching `QualityService.list`); ASSESSMENT uses `training.read` or the
  owning student's own `students.self` access. An earlier version of this check incorrectly
  reused the JOB_CARD rule for JOB_APPROVAL and QUALITY_CHECK, which would have wrongly denied
  some legitimately-permitted actors (e.g. a technician with `approvals.read` but not
  `jobs.read`) — this was corrected and is covered by tests in `attachments.service.spec.ts`.
- **Known open item (OQ-11, unresolved):** `SYSTEM_ADMIN` and `FINANCE_VIEWER_AUDITOR`
  organization-scope behavior (bypass vs. read-across) is not finalized. `audit.read` is not
  scope-filtered in this session because the contract defines no scope filter for
  `/audit-events` — confirm this is the intended trust boundary before relying on it.
- Existence is concealed by returning 404 (not 403) whenever a row is out of scope, consistent
  across jobs, approvals, quality checks and attachments.

## Attachment upload/download protections

- Upload requires `attachments.upload`; multipart via `FileInterceptor`, memory storage only
  (no temp files on disk), hard 10 MiB limit enforced by multer (→ 413).
- Content type is checked twice: the declared MIME type must be in the allow-list (JPEG, PNG,
  WebP, PDF) **and** must match a magic-byte sniff of the actual bytes
  (`file-signature.util.ts`); any mismatch is 415, not silently accepted.
- SHA-256 is computed server-side from the received bytes (never trusted from the client).
- File names are sanitized (`sanitize-file-name.util.ts`: strips path separators and control
  characters) and are metadata only — the on-disk/object key is always a server-generated
  UUID, never derived from client input, so path traversal via a crafted file name is not
  possible.
- Storage is private and abstracted (`AttachmentStorage`: `put`/`get`/`remove` only —
  building/signing a URL is deliberately NOT part of this interface). The local implementation
  writes under a directory that is asserted at startup to be neither the repo root, the user's
  home directory, the OS temp directory, nor a filesystem root (`assertSafeDirectory`), and
  every key is confined to that directory via `path.basename` before any read/write/remove.
- `POST /attachments/{id}/download-authorizations` returns a URL of the form
  `{baseUrl}/api/v1/attachments/downloads/{authorizationId}?expires=...&sig=...`. This is a
  **real, working, authenticated route** in this app (`AttachmentsController#download`) — not
  a placeholder pointing at an unresolvable host, and (corrected from an earlier version of
  this session) **not** `@Public()`. It requires the same Bearer access token as every other
  endpoint and is explicitly NOT treated like public certificate verification, because
  attachment content is private to the caller it was issued to, not merely gated by possession
  of an unguessable URL. The signed value carries only the `download_authorizations` row's own
  id and the expiry — never the storage key or a filesystem path — and `authorizationId` alone
  is not treated as sufficient proof: the HMAC-SHA256 signature (over
  `authorizationId.issuedTo.expiresAtMillis`, verified with `timingSafeEqual`, secret from
  `ATTACHMENTS_SIGNING_SECRET`) is the actual bearer credential, and it is computed using the
  *authenticated caller's own id* as the `issuedTo` value — so a different authenticated user
  who obtains someone else's URL produces a signature mismatch before the database is even
  consulted. The DB row's `issued_to` is then independently re-checked after signature/expiry
  verification, as defense in depth. No token/hash is persisted for this at all —
  `download_authorizations` has no token column, and the signature is recomputed from the
  server secret each time, never stored anywhere.
- The download route returns 404 uniformly for a bad signature, a tampered expiry, a
  different authenticated caller, an unknown authorization id, or a genuinely expired one, so
  a probing client learns nothing about which case applies. Missing, malformed or expired
  Bearer credentials are rejected earlier, by the existing global `AuthGuard`, as a normal 401.
  It is additionally rate limited per remote IP (`request.socket.remoteAddress`, fixed window,
  never trusting `X-Forwarded-For`) on top of the existing per-user upload/issuance limits.
- Every read of attachment content is gated by a short-lived (<=5 min) `DownloadAuthorization`
  cryptographically bound to the caller (`issued_to`, baked into the HMAC payload, not merely
  checked after the fact) and audited as a sensitive read at issuance time. A new authorization
  (and a new signed URL) is created on every call; there is no permanent/public URL for
  attachment content, and none of `object_storage_key`, a filesystem path, or a raw database id
  (without its signature) is ever sufficient to read a file.
- Unlinked attachments are visible only to their uploader and are treated as inaccessible after
  24 hours for reading, linking, and download authorization (checked at request time using an
  injectable clock, not by a background job).
- Upload and download-authorization issuance are both rate limited per user with integer
  `Retry-After` (`attachment-rate-limiter.ts`).
- **Known assumption:** malware/virus scanning of uploaded bytes is explicitly out of scope
  here (per `schema.sql` comment: "malware scanning is an infrastructure concern applied
  before object_storage_key is written"). If a real object-storage provider is later
  substituted, confirm a scanning step is added before this session's guarantees are trusted
  in production.

## Audit behavior

- `AuditService` (Session 10) is the single writer and reader of `audit_events`; hardened this
  session to also read (`list`/`getById`) so there is exactly one implementation of audit
  logic, not two.
- `audit_events` is append-only at the database level (`forbid_mutation` trigger) — no backend
  code path attempts UPDATE/DELETE.
- Redaction is centralized (`redact.util.ts`) and recursive: a `changes` entry whose top-level
  `field` name matches a sensitive marker (password, password hash, access/refresh token,
  authorization header, cookie, secret, storage key) has its whole `before`/`after` replaced
  with `[REDACTED]`; otherwise `before`/`after` are walked into (objects and arrays) so a
  sensitive key nested inside a non-sensitive field is still caught. Applied both when writing
  and (defensively, for rows written before this hardening) when reading. Never mutates its
  input — every level that changes is copied first, proven by a test that redacts a
  `Object.freeze`d row without throwing and without altering the original.
- Reading audit events (`GET /audit-events`, `GET /audit-events/{id}`) requires `audit.read`
  and is itself audited as `AUDIT_EVENT.READ` in the same transaction as the read — this does
  not recurse, since the write path never calls the read path.
- Attachment download authorization issuance is audited as `ATTACHMENT.DOWNLOAD_AUTHORIZED`.

## Secrets and known assumptions

- Secrets consulted: `AUTH_JWT_SECRET` (required, >= 32 bytes, validated at boot).
  `ATTACHMENTS_SIGNING_SECRET` is preferred for signing download tokens; if set it is held to
  the same >= 32-byte minimum (validated at boot), and if left empty it falls back to
  `AUTH_JWT_SECRET` — never to a hardcoded value (`AttachmentsService.signingSecret()` throws
  rather than silently using `''`). `APP_BASE_URL` is validated at boot too: HTTPS is required
  when `NODE_ENV=production`; plain HTTP is accepted only for localhost/127.0.0.1/[::1] outside
  production, so a signed download link's query-string signature cannot be made to travel over
  an unencrypted public connection by configuration mistake.
- `.env` and other secret material were not read, printed, or modified by this session; the
  new variables were documented only in `.env.example` with empty/generation-instruction values.
- No package was installed and no network or real database/object-storage connection was made
  while building or testing this session's code; attachment tests use an in-memory
  `TestAttachmentStorage`, and repository/service tests use mocked `pg` clients.
- This note does not constitute a security review — it is a map for the cybersecurity teammate
  to start from.
