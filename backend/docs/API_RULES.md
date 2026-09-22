# WST API Implementation Rules

Extracted from frozen OpenAPI contract (`wst-openapi-frozen.yaml`). Only implementation-relevant rules.

---

## Paths & Prefix
- All endpoints under `/api/v1` (global prefix in `main.ts`)
- Public endpoints (security: []):
  - `GET /health`
  - `GET /health/ready`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `GET /public/certificate-verifications/{verificationToken}`
- All others require Bearer JWT

---

## Authentication
- `POST /auth/login` → `{accessToken, refreshToken, tokenType, expiresIn, mustChangePassword}`
- Access token: short-lived JWT (TTL per OQ-01)
- Refresh token: rotating, single-use, SHA-256 hashed in DB, family revocation on reuse
- `POST /auth/refresh` rotates token; reuse → 401 + family revoked
- `POST /auth/logout` revokes family (authenticated, not public)
- `GET /auth/me` returns `CurrentUser` (id, email, displayName, preferredLocale, roles, permissions, organizationScopeIds, studentId?, mustChangePassword)

---

## Authorization
- **Permission check:** `x-permissions` on operation = any-of list. Missing → 403 `FORBIDDEN`
- **Role-permission matrix:** Defined in `x-role-permissions` (root). Users hold multiple roles → union of permissions
- **Row scope:** After permission check, `ScopeService` filters by `user_organization_scopes`. Technicians → assigned jobs only. Mentors → own sessions only. Students → own records only (`students.self`).
- **Scope miss → 404** (not 403) to avoid existence disclosure
- **Separation of duties:** Enforced via distinct permissions (e.g., `jobs.transition.start` vs `quality.perform`, `purchasing.create` vs `purchasing.approve`)
- **Organization scope behavior for SYSTEM_ADMIN and FINANCE_VIEWER_AUDITOR is unresolved** — see DECISIONS.md (open question before Session 7)

---

## Scopes
- Organization scopes: `BRANCH`, `STORE`, `TRAINING_PROGRAM` (hierarchical via `parent_id`)
- User scopes granted via `user_organization_scopes`
- Row-level scope rules are defined per operation in the OpenAPI contract; do not assume every list endpoint has identical organization scoping

---

## Validation
- DTOs use `class-validator` + `class-transformer`
- `forbidNonWhitelisted: true` + `whitelist: true` — unknown properties rejected with 400 `BAD_REQUEST`
- `transform: true` — plain objects → class instances
- Semantic validation errors → 422 `VALIDATION_FAILED` with `details[]` (field, code, message, params)
- Enum codes, UUIDs, identifiers never localized

---

## Pagination & Filtering
- Query params: `page` (≥1, default 1), `pageSize` (1–100, default 20), `sort` (comma-separated, `-` prefix for desc, pattern `^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$`)
- Typed filters per endpoint (e.g., `stage`, `priority`, `jobNumber`, `from`, `to`)
- Unknown filter/sort field → 400 `BAD_REQUEST`
- Response envelope: `{items: T[], page: PageInfo}`
- `GET /roles` only unpaged collection (fixed 10 roles)

---

## Error Handling
- All errors use `Error` schema: `{code, message, details?, requestId}`
- `requestId` correlates logs, audit, client debugging
- Standard codes: `BAD_REQUEST`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`
- **409 Conflict codes:** `INVALID_STATE_TRANSITION`, `VERSION_CONFLICT`, `DUPLICATE_RESOURCE`, `IDEMPOTENCY_CONFLICT`, `RESOURCE_IN_USE`, `CUSTOMER_APPROVAL_REQUIRED`, `JOB_STAGE_NOT_ALLOWED`, `JOB_ASSIGNMENT_REQUIRED`, `CHECKLIST_INCOMPLETE`, `QUALITY_CHECK_REQUIRED`, `INVOICE_REQUIRED`, `INSUFFICIENT_STOCK`, `REVERSAL_EXCEEDS_ISSUED`, `RESERVATION_INVALID`, `SCHEDULE_CONFLICT`, `CONFLICT_NOT_OVERRIDABLE`, `SEPARATION_OF_DUTIES_VIOLATION`, `DUPLICATE_APPROVAL`, `RECEIPT_EXCEEDS_ORDERED`, `PAYMENT_AMOUNT_MISMATCH`, `ASSESSMENT_LOCKED`, `CERTIFICATE_NOT_ELIGIBLE`, `ATTACHMENT_INVALID`, `ATTACHMENT_NOT_LINKABLE`, `EXPORT_NOT_READY`, `EXPORT_EXPIRED`
- **Schedule conflicts** → 409 with `ScheduleConflictError` containing explainable `conflicts[]`
- **500/503** never leak internals
- A 429 error uses the contract code `RATE_LIMITED`, not `TOO_MANY_REQUESTS`

---

## Idempotency
- Header: `Idempotency-Key` (8–128 chars) on operations that explicitly declare it in the frozen contract
- Same key + same body → original 201/200 response (cached)
- Same key + different body → 409 `IDEMPOTENCY_CONFLICT`
- Retention period and key scoping (user/endpoint) are open questions — see DECISIONS.md (Session 21)
- Endpoints that declare `Idempotency-Key`:
  - `POST /job-cards/{jobId}/part-issues`
  - `POST /job-cards/{jobId}/part-issues/{partIssueId}/reversals`
  - `POST /job-cards/{jobId}/part-reservations`
  - `POST /stock-adjustments`
  - `POST /purchase-orders/{purchaseOrderId}/goods-receipts`
  - `POST /invoices/{invoiceId}/payments`
  - `POST /certificates`

---

## Concurrency
- Resources with `version` property require it on `PATCH`/`PUT`
- Stale version → 409 `VERSION_CONFLICT`
- Job stage transitions use `expectedFromStage` in body; mismatch → 409 `VERSION_CONFLICT`
- Inventory balance rows locked via `SELECT ... FOR UPDATE` in transaction
- Purchase order approvals: creator cannot approve; distinct users required; duplicate approval → 409 `DUPLICATE_APPROVAL` or `SEPARATION_OF_DUTIES_VIOLATION`
- Stock adjustments: `decided_by <> requested_by` enforced by DB constraint

---

## Localization
- `Accept-Language: en` or `ar` (fallback `en`)
- Localizes: `message` in `Error`, dashboard labels, prediction explanations
- Never localizes: UUIDs, jobNumber, VIN, plate, SKU, barcode, amounts, certificateNumber, verificationToken

---

## Audit
- Every important mutation writes `AuditEvent` (actor, timestamp, action, entityType, entityId, outcome, changes)
- Sensitive reads (attachment download, export download, audit read) also audited
- For transaction-bound successful mutations, the required success audit event should be inserted in the same transaction before commit
- DENIED/FAILED audit handling may use an independent write and is finalized with `AuditService` in Session 11
- Audit reads require `audit.read` permission

---

## Rate Limiting
- Auth endpoints: per-IP + per-account (429 `RATE_LIMITED` with `Retry-After`)
- Exports: per-user (async jobs prevent unbounded sync responses)
- Predictions: per-user
- Public certificate verification: strict per-IP