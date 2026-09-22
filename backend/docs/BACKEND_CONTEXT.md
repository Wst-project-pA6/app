# WST Backend Context

**Project:** Workshop Management & Student Practical Training (WST)  
**Backend Stack:** Node.js + TypeScript + NestJS 12 + PostgreSQL (pg driver)  
**Source of Truth Order:**
1. Frozen OpenAPI (`docs/openapi/wst-openapi-frozen.yaml`) — HTTP paths, payloads, security, responses
2. PostgreSQL schema (`source-docs/schema.sql`) — tables, types, constraints, triggers, RBAC seeds
3. Master Requirements Report (`source-docs/WST_Master_Requirements_Report.md`) — business meaning, team boundaries
4. Backend Roadmap (`source-docs/WST_BACKEND_ROADMAP.md`) — implementation sequence, working process

---

## Key API Conventions
- Base path: `/api/v1`
- JSON only (multipart for attachment upload)
- Bearer JWT authentication; roles/permissions/scopes resolved server-side
- UUID identifiers; human-readable numbers (jobNumber, poNumber, invoiceNumber, certificateNumber) server-generated, immutable, never localized
- RFC 3339 UTC timestamps; dates `YYYY-MM-DD`
- Money = `{amount: string, currency: string}` — decimal string, never float
- Pagination: `page` (default 1), `pageSize` (default 20, max 100), `sort` (prefix `-` for desc), typed filters
- Unknown filter/sort → 400
- `Accept-Language: en|ar` localizes messages only; identifiers/amounts never transformed
- Idempotency-Key used only by operations that explicitly declare it in the frozen contract, including certificate issuance
- Optimistic concurrency via `version` on mutable resources

---

## Key Database Conventions
- `snake_case`, plural table names
- UUID PK (`gen_random_uuid()`)
- `TIMESTAMPTZ` everywhere (UTC)
- Money: `amount NUMERIC(14,4)`, `currency_code CHAR(3)`
- Audit columns: `created_at`, `updated_at`, `created_by`, `updated_by` on mutable tables
- Append-only history tables (stage events, stock movements, approvals, audit events) — no UPDATE/DELETE, enforced by triggers
- `version` integer for optimistic concurrency where API requires it
- CHECK constraints for state machines, non-negative quantities/money
- Sensitive PII marked in comments; encryption-at-rest is infra decision

---

## Key Security Rules
- Backend enforces RBAC + organization/row scope; hiding UI buttons is not security
- Permission check first (403), then row scope (404 to avoid existence disclosure)
- Students see only own records (`students.self`)
- Technicians see only assigned jobs; mentors only own sessions
- Separation of duties: distinct permissions for job execution, quality check, stock adjustment, PO creation, PO approval, invoice viewing, assessment entry, supervisor sign-off, certificate issuance
- Refresh token rotation + reuse detection; family revocation on reuse
- Passwords/tokens/secrets never logged or returned
- Attachments: private storage, short-lived signed URLs (≤5 min), type/size validation, malware scanning infra concern
- Certificate verification: random 256-bit token generated once, never persisted; only SHA-256 hash (`verification_token_hash`) stored; constant-time comparison on verification

---

## Key Transaction Rules
- All stock-changing operations (issue, reserve, receive, adjust, reverse) run in a single DB transaction: lock balance → validate → append ledger movement → update balance → commit
- Job stage transitions: one transaction validates current state, checks guards, updates job, inserts stage event, audits
- Purchase approvals: distinct approvers, no self-approval, snapshotted required approvals at submission
- Goods receipt: accepted quantities only update stock; rejected quantities never change stock
- Invoice generation: server-calculated from ACTIVE labor + issued parts (net of reversals) + permitted sublet; lines trace to source records
- Reversals: authorized + reason + history; original records never modified

---

## Key Business Rules
1. No billable work before required customer approval
2. Additional work needs new approval scope without destroying earlier history
3. Job stage changes controlled; clients cannot bypass via arbitrary status updates
4. Every important state transition remains historically auditable
5. Labor/parts for billing come from operational records only
6. Part issue/reservation/reversal and goods receipt use transaction-safe logic
7. Available stock never negative (`reserved ≤ on_hand` invariant)
8. Reversal requires authorization + reason + history
9. Purchase approvals obey configured threshold/policy rules
10. Goods receipt affects stock only for accepted quantities
11. Workshop jobs and training sessions share bay/resource scheduling
12. Unsigned assessments don't count toward competency/completion
13. Certificate issuance requires eligibility (all required signed PASS results)
14. AI predictions advisory only; deterministic baseline always runs; workshop/training continue if ML offline
15. Critical/sensitive actions auditable

---

## Team Responsibility Boundaries
| Team | Owns |
|------|------|
| **Backend** | API, business logic, RBAC, audit, scheduled jobs, PostgreSQL integration |
| **QA** | Independent API/acceptance/regression/E2E testing |
| **AI Engineer** | Models, training, evaluation, ML metrics |
| **UI/UX** | Screens, workflows, Arabic/RTL layout, usability |
| **Cybersecurity** | Threat model, security testing, review, sign-off |
| **Data Analyst / BI** | KPIs, reconciliations, dashboards, reporting interpretation |

Backend integrates with other teams; does not replace their work.

---

## Source Document Locations
- External source pack (Common Pack PDF, P6 Brief PDF, original ERD, etc.) lives in `D:\WST\source-docs\`
- The frozen OpenAPI contract copy used by the application is inside this repository at `docs/openapi/wst-openapi-frozen.yaml`