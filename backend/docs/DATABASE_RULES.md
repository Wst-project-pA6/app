# WST Database Implementation Rules

Extracted from `schema.sql` and cross-referenced with frozen OpenAPI. Only implementation-relevant rules.

---

## Transaction Boundaries
- **All stock-changing operations** run in a single DB transaction:
  1. `SELECT ... FOR UPDATE` on `stock_balances` row(s)
  2. Validate business rules (available stock, approval state, stage)
  3. Append to `stock_movements` (append-only ledger)
  4. Update `stock_balances` (`on_hand`, `reserved`, `average_cost`)
  5. Insert domain record (`part_issues`, `part_reservations`, `goods_receipts`, `stock_adjustments`)
  6. Insert audit event
  7. Commit
- **Job stage transitions** in one transaction:
  1. Lock job row (`SELECT ... FOR UPDATE`)
  2. Validate current stage matches `expectedFromStage`
  3. Check guards (approval, assignment, checklist, QC result)
  4. Update `job_cards` (stage, `stage_changed_at`, `version++`)
  5. Insert `job_stage_events` (immutable)
  6. If READY: generate invoice (server-calculated)
  7. Insert audit event
  8. Commit
- **Purchase approvals** in one transaction:
  1. Lock PO row
  2. Validate state = `PENDING_APPROVAL`
  3. Check separation of duties (creator ≠ approver, no duplicate approver)
  4. Insert `purchase_approvals` row
  5. If approved count ≥ `required_approvals` → update PO status to `APPROVED`
  6. If any rejection → update PO status to `REJECTED`
  7. Insert audit event
  8. Commit
- **Goods receipt** in one transaction for the entire receipt (not per line):
  1. Lock all affected `stock_balances` rows in a stable order (e.g., by `store_id`, `part_id`)
  2. Validate PO status, cumulative accepted ≤ ordered for each line
  3. Append `RECEIPT` movement for accepted qty only
  4. Update `stock_balances` (on_hand, weighted average_cost)
  5. Update PO line `accepted_qty`, PO status
  6. Insert audit event
  7. Commit

---

## Append-Only Inventory Ledger
- `stock_movements` is the **single source of truth** for inventory
- Types: `OPENING_BALANCE`, `RECEIPT`, `ISSUE`, `ISSUE_REVERSAL`, `RESERVATION`, `RESERVATION_RELEASE`, `ADJUSTMENT`
- **Never UPDATE/DELETE** — enforced by `forbid_mutation()` trigger
- `stock_balances` is a materialized projection recomputed transactionally alongside each movement
- `available = on_hand - reserved` computed, never stored
- Reconciliation endpoint (`GET /stock-balances/reconciliation`) recomputes from ledger and reports mismatches

---

## No Negative Stock
- Hard invariant: `reserved ≤ on_hand` (CHECK constraint on `stock_balances`)
- `reserved_after ≤ on_hand_after` (CHECK constraint on `stock_movements`)
- Part issue: validates `quantity ≤ available (on_hand - reserved + own_reservation)`
- Part reservation: validates `quantity ≤ available`
- Goods receipt: accepted qty only increases `on_hand`
- Stock adjustment: approval validates resulting `on_hand ≥ reserved` and `on_hand ≥ 0`
- Concurrent issues serialize on `stock_balances` row lock

---

## Approval Rules
- **Job approvals:** `job_approvals` table with `scope` (`INITIAL_WORK`, `ADDITIONAL_WORK`, `SUBLET`)
  - `status` transitions: `PENDING` → `APPROVED`/`REJECTED` (immutable once decided; trigger `forbid_redecision_job_approval`)
  - Additional work items require linked `APPROVED` `ADDITIONAL_WORK` approval
  - Sublet entries require linked `APPROVED` `SUBLET` approval
  - No billable labor/parts without `APPROVED INITIAL_WORK` approval
- **Purchase approvals:** `purchase_approvals` table
  - Required approvals snapshotted from `purchase_approval_tiers` at PO submission
  - Distinct approvers enforced (creator cannot approve; same user cannot approve twice)
  - Any rejection → PO `REJECTED` (reason required)
  - Approval records immutable (append-only)
- **Stock adjustments:** `stock_adjustments` table
  - `PENDING_APPROVAL` → `APPROVED`/`REJECTED`
  - Separation of duties: `decided_by <> requested_by` (DB constraint `chk_adjustment_separation_of_duties`)
  - Approval runs in transaction: lock balance, validate, append `ADJUSTMENT` movement, update balance

---

## Invoice Derivation
- Invoice lines **only** from:
  - `labor_entries` with `status = 'ACTIVE'`
  - `part_issues` net of `part_issue_reversals`
  - `sublet_entries` with `status = 'ACTIVE'` and `APPROVED SUBLET` approval
- Server calculates: line totals, subtotal, tax, discount, total
- Currency must match `finance_settings.currency_code`:
  - Documents using a currency different from the configured system currency are rejected with 422
  - Changing the configured currency after any invoice or purchase order exists returns 409 `RESOURCE_IN_USE`
- `hourly_rate_amount` on `labor_entries` snapshots `finance_settings.labor_hourly_rate` at logging
- `unit_price_amount`/`unit_cost_amount` on `part_issues` are snapshots at issue time
- Invoice status: `DRAFT` → `ISSUED` (assigns `invoiceNumber`) → `PAID` / `VOID`
- `VOID` requires reason; rejected once `PAID`. `REGENERATE` only while `READY` and no non-void invoice exists.

---

## Scheduling Conflicts
- Shared resource: `bays` (used by `job_cards` and `training_sessions`)
- Conflict types:
  - Bay occupied by active job (`RECEIVED`/`IN_PROGRESS`/`QUALITY_CHECK` with window)
  - Bay occupied by published session (`PUBLISHED`/`COMPLETED`)
  - Bay status `MAINTENANCE`/`INACTIVE`
  - Mentor double-booked (mentor on another session OR technician on active job)
  - Capacity insufficient for group
- Conflict check: `POST /training-sessions/{id}/conflict-check` (read-only)
- Override: `POST /training-sessions/{id}/conflict-overrides` requires `training.override-conflict`, reason mandatory, audited, bound to exact conflict keys
- Publishing re-evaluates conflicts; uncovered → 409 `SCHEDULE_CONFLICT`
- Job assignment validates bay calendar; conflicts → 409 `SCHEDULE_CONFLICT` (no override)

---

## Assessment / Certificate Rules
- **Assessments:** `assessments` table with `result` (`PASS`, `FAIL`, `NEEDS_IMPROVEMENT`), `sign_off_status` (`PENDING`, `SIGNED_OFF`, `RETURNED`)
  - Mentor records result (`training.assess`); starts `PENDING`
  - Supervisor signs off (`training.signoff`); cannot be same user as assessor (409 `SEPARATION_OF_DUTIES_VIOLATION`)
  - `SIGNED_OFF` makes `PASS` count toward completion; `RETURNED` requires note, stays pending
  - `SIGNED_OFF` results immutable (409 `ASSESSMENT_LOCKED`)
  - Retakes = new assessment record
- **Competencies:** `competencies` linked to `practical_tasks`; courses reference required tasks
- **Coverage:** Only `SIGNED_OFF` `PASS` results count; unsigned/failed excluded
- **Completion eligibility:** Enrollment `ACTIVE` + attendance meets course minimum + all required tasks have latest `SIGNED_OFF PASS`
- **Certificates:** `certificates` table with `verification_token_hash` (SHA-256 of the 256-bit random token)
  - The raw 256-bit verification token is generated once at issuance and never persisted
  - Issuance (`certificates.issue`): re-evaluates eligibility in transaction; unmet → 409 `CERTIFICATE_NOT_ELIGIBLE`
  - One active certificate per enrollment
  - Revocation (`certificates.revoke`): permanent, reason required, reflected immediately in public verification
  - Public verification (`GET /public/certificate-verifications/{verificationToken}`): no auth, rate limited, constant-time token compare, exposes only safe data (certificateNumber, holderDisplayName, courseName, issuedAt, status, revokedAt)

---

## Audit Requirements
- `audit_events` table: append-only (trigger `forbid_mutation`)
- Columns: `actor_user_id`, `action`, `entity_type`, `entity_id`, `outcome` (`SUCCESS`/`DENIED`/`FAILED`), `changes` (JSONB, sensitive values redacted), `request_id`, `occurred_at`
- Written for: all mutations on mutable business tables, all stage/status transitions, all approval decisions, all sign-offs, certificate issuance/revocation, prediction decisions, sensitive reads (attachment download, export download, audit read)
- For transaction-bound successful mutations, the required success audit event should be inserted in the same transaction before commit
- DENIED/FAILED audit handling may use an independent write and should be finalized with `AuditService` in Session 11
- Audit reads require `audit.read` permission

---

## Migration & Schema Management
- **Do not modify** `schema.sql` tables, columns, constraints, triggers, indexes, or seed data
- Backend code must work with existing schema exactly as defined
- No `CREATE TABLE`, `ALTER TABLE`, `DROP` in application code
- No ORM auto-sync; no application-startup DDL; `schema.sql` is the authoritative baseline
- Controlled migration/schema application and seed tooling will be handled during deployment work
- Repository classes map existing columns to DTOs; no schema drift
- If a contract/schema mismatch is found, record in `DECISIONS.md` as open question; do not silently change either

---

## Frozen OpenAPI Contract Rules
- `RETURNED` assessments require a note and do not count toward completion