# WST Backend Decisions

## Decided (Dated)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-20 | NestJS 12 | Version used when this project was scaffolded; aligns with Common Pack baseline |
| 2026-09-20 | Strict TypeScript (`strict: true`) | Catch bugs early; matches Common Pack quality bar |
| 2026-09-20 | ESNext module output (`module: nodenext`) | Matches `tsconfig.json`; enables ESM-style imports with Node.js |
| 2026-09-20 | Jest + Supertest | Standard for NestJS; supports unit + integration with real PostgreSQL |
| 2026-09-20 | PostgreSQL + `pg` driver | Direct transaction control for inventory concurrency; no ORM overhead |
| 2026-09-20 | `/api/v1` global prefix | Versioned REST per Common Pack convention |
| 2026-09-20 | Frozen OpenAPI is contract authority | Backend must match YAML exactly; no drift |
| 2026-09-20 | Swagger UI at `/api/docs` | Developer ergonomics; frozen YAML loaded at runtime, not generated |
| 2026-09-20 | Feature branches + PRs (`backend/<feature>`) | Protects main; enables discard on bad AI output |
| 2026-09-20 | Docker deferred (not rejected) | MVP runs locally via `npm run start:dev`; containerization in Session 27 |
| 2026-09-21 | Attachment storage: local filesystem behind `AttachmentStorage` interface (OQ-02 resolved) | No real object-storage provider selected yet; the interface (`src/common/storage/attachment-storage.ts`, now `put`/`get`/`remove` only) lets a real provider (S3/MinIO/Azure) replace `LocalAttachmentStorage` later without touching callers. Tests use `TestAttachmentStorage` (in-memory), never real storage. |
| 2026-09-21 | Attachment download URLs are served by a real, signed route inside this API (`GET /api/v1/attachments/downloads/{authorizationId}`), not by the storage adapter | A first pass returned a URL pointing at a non-existent `storage.internal` host with the raw `object_storage_key` embedded — unusable by a client and a key-exposure defect. Corrected: the storage interface no longer builds URLs at all; the attachments module signs an HMAC-SHA256 token over the `download_authorizations` row's own id + expiry (never the storage key or a path), and a controller route verifies that signature before reading bytes via `AttachmentStorage.get()`. (Superseded by the row below: this route is authenticated, not public.) |
| 2026-09-21 | The attachment download route (`GET /api/v1/attachments/downloads/{authorizationId}`) requires the same Bearer access token as every other endpoint; it is not `@Public()`, and is not treated like public certificate verification | Private attachment content must be bound to the specific user it was issued to, not to mere possession of a URL. The signed token payload now includes `issuedTo` (`authorizationId.issuedTo.expiresAtMillis`, HMAC-SHA256, `timingSafeEqual` comparison), so the signature itself is caller-bound; the DB row's `issued_to` is independently re-checked after signature/expiry verification. A different authenticated caller presenting someone else's URL, and any invalid/tampered/expired token, both get a uniform 404. The route is also rate limited per remote IP (`request.socket.remoteAddress`, never `X-Forwarded-For`) in addition to the existing per-user upload/issuance limits. It remains an internal implementation route behind the frozen contract's opaque `DownloadAuthorization.url` — no OpenAPI path was added or changed. |

---

## Open Questions

| ID | Question | Blocking? |
|----|----------|-----------|
| OQ-01 | Exact JWT access token TTL and refresh token TTL values | No — OpenAPI contract provides no defaults; values must be selected in Session 6 |
| OQ-02 | — RESOLVED (2026-09-21): local filesystem behind `AttachmentStorage`; a real provider can be swapped in later | — |
| OQ-03 | Password hashing: Argon2id vs bcrypt (OpenAPI says either) | No — decide in Session 6; both acceptable |
| OQ-04 | Rate limit numbers (requests/window) for auth, exports, predictions | No — OpenAPI says "rate limited"; tune in Sessions 5/11/19/21 |
| OQ-05 | Audit event retention policy and partitioning strategy | No — Session 11; schema has `audit_events` table |
| OQ-06 | Whether `pg` pool uses PgBouncer in production | No — infra decision; `DatabaseService` abstracts pool |
| OQ-07 | — RESOLVED: The frozen contract defines the exact `ErrorCode` enum | — |
| OQ-08 | Seed script framework (TypeORM migration? custom CLI? SQL file?) | No — Session 27; `schema.sql` already seeds roles, permissions, role mappings, and default configuration. A reproducible synthetic acceptance/demo seed generator is still required |
| OQ-09 | CI pipeline steps (lint, build, test, scan, docker build) | No — Session 27/29; CI provider not yet selected (keep open) |
| OQ-10 | ML service protocol (HTTP/gRPC) and prediction payload shape | No — Session 20; OpenAPI defines `PredictionRunRequest/Response` |
| OQ-11 | SYSTEM_ADMIN and FINANCE_VIEWER_AUDITOR organization-scope behavior (bypass/read-across) | Yes — must be resolved before Session 7 |
| OQ-12 | Idempotency retention period and key scoping policy (user/endpoint) | No — resolve before Session 21 |