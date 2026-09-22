# WST Backend Architecture

## NestJS Module/Layer Structure (Planned)

```
src/
├── common/                          # Shared foundation (frozen names)
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts      # DatabaseService
│   │   └── transaction.service.ts   # TransactionService
│   ├── errors/
│   │   ├── app-error.ts             # AppError
│   │   └── error-codes.ts
│   ├── filters/
│   │   └── global-exception.filter.ts  # GlobalExceptionFilter
│   ├── pagination/
│   │   └── pagination.query.ts      # PaginationQuery
│   ├── request-context/
│   │   └── request-context.ts       # RequestContext
│   ├── auth/
│   │   ├── current-user.decorator.ts    # CurrentUser
│   │   ├── permissions.guard.ts         # PermissionsGuard
│   │   └── scope.service.ts             # ScopeService
│   ├── audit/
│   │   └── audit.service.ts         # AuditService
│   └── idempotency/
│       └── idempotency.service.ts   # IdempotencyService
├── config/
│   ├── configuration.ts
│   └── validation.schema.ts
├── modules/                         # Feature modules (one per domain)
│   ├── auth/
│   ├── users/
│   ├── customers/
│   ├── vehicles/
│   ├── bays/
│   ├── jobs/
│   ├── approvals/
│   ├── labor/
│   ├── inventory/
│   ├── procurement/
│   ├── invoices/
│   ├── attachments/
│   ├── training/
│   ├── attendance/
│   ├── assessments/
│   ├── competencies/
│   ├── certificates/
│   ├── dashboards/
│   ├── exports/
│   ├── predictions/
│   └── audit/
└── main.ts
```

---

## Frozen Shared Component Names

| Component | Purpose |
|-----------|---------|
| `DatabaseService` | Raw `pg` pool access, query helpers, health check |
| `TransactionService` | `runInTransaction(cb)` wrapper |
| `AppError` | Base error class with `code`, `message`, `details`, `statusCode` |
| `GlobalExceptionFilter` | Maps `AppError`/PostgreSQL errors to standard `Error` schema |
| `RequestContext` | AsyncLocalStorage carrier for `requestId`, `userId`, `roles`, `scopes` |
| `PaginationQuery` | Validated `page`, `pageSize`, `sort`, `filters` DTO |
| `CurrentUser` | Decorator injecting resolved `{id, email, roles, permissions, scopes}` |
| `PermissionsGuard` | Checks `x-permissions` (any-of) + row scope via `ScopeService` |
| `ScopeService` | Resolves caller's organization scopes + role-specific row filters |
| `AuditService` | `record(action, entityType, entityId, outcome, changes?)` |
| `IdempotencyService` | `checkAndStore(key, bodyHash, response)` for POST idempotency |

---

## Database Access
- **Driver:** `pg` (node-postgres) — direct pool, explicit transaction control
- **No ORM** — schema is fixed; SQL lives in repository classes
- **Migrations:**
  - No ORM auto-sync
  - No application-startup DDL
  - `schema.sql` is the authoritative baseline
  - Controlled migration/schema application and seed tooling will be handled during deployment work
- **Connection:** `.env` credentials; `DatabaseService` exposes `pool`

---

## Cross-Cutting Concerns
- **Global prefix:** `/api/v1` (set in `main.ts`)
- **Swagger:** `/api/docs` — the frozen YAML (`docs/openapi/wst-openapi-frozen.yaml`) is loaded and parsed at startup and served at this path; the YAML file must be included in the runtime/deployment artifact
- **Validation:** `class-validator` + `class-transformer` on DTOs; unknown properties forbidden
- **Localization:** `Accept-Language` header → i18n message keys; en/ar only
- **Rate limiting:** Per-IP and per-account on auth; per-user on exports/predictions
- **Health:** `GET /api/v1/health` (liveness), `GET /api/v1/health/ready` (DB + object storage + optional AI)
- **Request ID:** Generated per request; propagated to logs, errors, audit events