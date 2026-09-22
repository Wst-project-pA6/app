-- =====================================================================================
-- WST — Workshop Management & Student Practical Training
-- PostgreSQL Production Schema
--
-- Source documents reconciled for this design:
--   1. 00_START_HERE_Common_Pack.pdf            (delivery rules, common architecture, NFRs)
--   2. P6_Workshop_Management_Practical_Training.pdf (functional requirements WST-FR-01..14)
--   3. WST_Master_Requirements_Report.md         (consolidated requirements + data checklist)
--   4. Claude.yaml — frozen OpenAPI 3.1 contract (authoritative shapes, enums, workflow rules)
--
-- Conventions used throughout:
--   * snake_case identifiers, plural table names.
--   * Every table has a UUID surrogate primary key (uuid, default gen_random_uuid()),
--     matching the API contract's `Uuid` type and avoiding sequential-ID enumeration of
--     sensitive records (customers, students, invoices, certificates).
--   * TIMESTAMPTZ everywhere (UTC storage per the API contract; the client renders locale).
--   * Money is modelled as (amount NUMERIC(14,4), currency_code CHAR(3)) pairs, mirroring
--     the API's {amount, currency} Money object. NUMERIC — never FLOAT — for exactness.
--   * created_at/updated_at/created_by/updated_by are mandatory on every mutable business
--     table (RecordMeta in the API), enabling the audit/traceability rules in the Common
--     Pack and WST-FR-01/05/06.
--   * Immutable, append-only history tables (stage events, stock movements, approvals,
--     audit events) intentionally expose NO update/delete path: no updated_at/updated_by,
--     and are protected by REVOKE + trigger-based guards further down.
--   * `version` integer columns implement optimistic concurrency exactly where the API
--     contract requires it (409 VERSION_CONFLICT).
--   * CHECK constraints enforce state-machine values, non-negative quantities/money and
--     other business invariants directly in the database, so the guarantee holds even if
--     an application bug bypasses service-layer validation.
--   * Sensitive PII (customer contact info, vehicle identifiers, student data, financial
--     data, certificates) get restrictive comments below; encryption-at-rest and
--     column-level encryption (e.g. pgcrypto for phone/email) are an infrastructure
--     decision layered on top of this schema — hooks are noted inline.
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- SECTION 0 — EXTENSIONS
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest() for hashing tokens

-- =====================================================================================
-- SECTION 1 — SHARED UTILITY FUNCTIONS
-- =====================================================================================

-- Generic trigger to keep updated_at current on every UPDATE of a mutable business row.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic trigger to block UPDATE/DELETE on tables that must be strictly append-only
-- (stage events, stock movements, approvals, audit events, etc.) so history can never be
-- silently rewritten, per Common Pack Definition of Done and WST-FR-05/06/08.
CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is append-only: % is not permitted on immutable history records',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'raise_exception';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- SECTION 2 — IDENTITY, ACCESS CONTROL, ORGANIZATION SCOPE  (WST-FR-01)
-- =====================================================================================

CREATE TABLE organization_scopes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(40)  NOT NULL,
    name                VARCHAR(120) NOT NULL,
    type                VARCHAR(20)  NOT NULL
                            CHECK (type IN ('BRANCH', 'STORE', 'TRAINING_PROGRAM')),
    parent_id           UUID REFERENCES organization_scopes(id) ON DELETE SET NULL,
    status              VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_org_scope_code UNIQUE (code),
    CONSTRAINT chk_org_scope_not_self_parent CHECK (parent_id IS DISTINCT FROM id)
);
COMMENT ON TABLE organization_scopes IS
    'Row-level access boundary (branch/store/training program). Drives WST-FR-01 organization scoping.';

CREATE TABLE roles (
    code                VARCHAR(40) PRIMARY KEY
                            CHECK (code IN ('SYSTEM_ADMIN','WORKSHOP_MANAGER','SERVICE_ADVISOR',
                                'TECHNICIAN','QUALITY_CHECKER','STOREKEEPER_PROCUREMENT','MENTOR',
                                'TRAINING_SUPERVISOR','STUDENT','FINANCE_VIEWER_AUDITOR')),
    description         TEXT NOT NULL
);
COMMENT ON TABLE roles IS 'Fixed set of ten roles defined by the frozen OpenAPI contract (x-role-permissions).';

CREATE TABLE permissions (
    code                VARCHAR(60) PRIMARY KEY,
    description         TEXT
);
COMMENT ON TABLE permissions IS
    'Permission catalog enforced by the backend (never by hiding UI). Separation-of-duties depends on this being granular.';

CREATE TABLE role_permissions (
    role_code           VARCHAR(40) NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
    permission_code     VARCHAR(60) NOT NULL REFERENCES permissions(code) ON DELETE RESTRICT,
    PRIMARY KEY (role_code, permission_code)
);
COMMENT ON TABLE role_permissions IS 'Default role-to-permission matrix (x-role-permissions in the OpenAPI contract).';

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(254) NOT NULL,
    display_name        VARCHAR(120) NOT NULL,
    -- Argon2id/bcrypt hash only; never plaintext. Non-API concern, enforced at app layer.
    password_hash       TEXT NOT NULL,
    preferred_locale    VARCHAR(2) NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en','ar')),
    status              VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_users_email UNIQUE (email)
);
COMMENT ON TABLE users IS
    'Identity table. password_hash must only ever store a salted Argon2id/bcrypt digest — never logged, never returned by the API.';
COMMENT ON COLUMN users.password_hash IS 'SENSITIVE: hashed credential only. Application must never SELECT this column into logs or API responses.';

CREATE TABLE user_roles (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code           VARCHAR(40) NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE user_organization_scopes (
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE CASCADE,
    granted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, organization_scope_id)
);
COMMENT ON TABLE user_organization_scopes IS 'Row-level scope grants. Backend authorization derives from this table, never from client claims.';

-- Refresh-token rotation family, supporting single-use rotation + reuse detection (login/refresh contract).
CREATE TABLE refresh_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id           UUID NOT NULL,
    token_hash          TEXT NOT NULL,                 -- SHA-256 hash of the refresh token; never the raw token
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    rotated_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SENSITIVE: store only a hash of the refresh token, never the raw value.';

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_user_roles_role ON user_roles(role_code);
CREATE INDEX idx_user_org_scopes_scope ON user_organization_scopes(organization_scope_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_org_scopes_parent ON organization_scopes(parent_id);

CREATE TRIGGER trg_org_scopes_updated BEFORE UPDATE ON organization_scopes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 3 — CONFIGURATION  (approval policy, finance settings, prediction settings)
-- =====================================================================================

-- Single-row configuration tables use a boolean singleton guard (id fixed) to keep the
-- "one system currency" and "one approval policy" business rules enforceable in SQL.
CREATE TABLE finance_settings (
    id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    version             INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    currency_code       CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    labor_hourly_rate   NUMERIC(14,4) NOT NULL CHECK (labor_hourly_rate >= 0),
    tax_rate_percent    NUMERIC(6,3)  NOT NULL CHECK (tax_rate_percent BETWEEN 0 AND 100),
    tax_label           VARCHAR(40) NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE finance_settings IS
    'Singleton row: one system currency. Application must reject changing currency_code once any invoice or PO exists (409 RESOURCE_IN_USE) — enforced at service layer around this table.';

CREATE TABLE purchase_approval_policy (
    id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    version             INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    currency_code       CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE purchase_approval_tiers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id           BOOLEAN NOT NULL REFERENCES purchase_approval_policy(id) ON DELETE CASCADE,
    minimum_total       NUMERIC(14,4) NOT NULL CHECK (minimum_total >= 0),
    required_approvals  SMALLINT NOT NULL CHECK (required_approvals IN (1,2)),
    CONSTRAINT uq_policy_tier_minimum UNIQUE (policy_id, minimum_total)
);
COMMENT ON TABLE purchase_approval_tiers IS
    'Tiers must be strictly ascending with the first starting at 0; enforced by application transaction on replace (PUT) since PostgreSQL cannot express "the set is contiguous" declaratively.';

CREATE TABLE prediction_settings (
    id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    reorder_lookback_weeks  INTEGER NOT NULL DEFAULT 8 CHECK (reorder_lookback_weeks BETWEEN 1 AND 52),
    ml_service_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    baseline_version        VARCHAR(40) NOT NULL DEFAULT 'rule-baseline-v1',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE prediction_settings IS
    'The rule baseline always runs regardless of ml_service_enabled — WST-FR-14 "deterministic baseline and fallback" rule.';

CREATE TRIGGER trg_finance_settings_updated BEFORE UPDATE ON finance_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prediction_settings_updated BEFORE UPDATE ON prediction_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 4 — CUSTOMERS AND VEHICLES  (WST-FR-03)
-- =====================================================================================

CREATE TABLE customers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    display_name            VARCHAR(160) NOT NULL,
    type                    VARCHAR(12) NOT NULL CHECK (type IN ('INDIVIDUAL','BUSINESS')),
    -- SENSITIVE PII: phone/email. Consider pgcrypto column encryption or app-layer envelope
    -- encryption at rest; masked in exports and only bulk-export reads are audited (WST-FR-03).
    phone                   VARCHAR(20) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
    email                   VARCHAR(254) CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    preferred_channel       VARCHAR(10) CHECK (preferred_channel IN ('PHONE','SMS','EMAIL')),
    preferred_locale        VARCHAR(2) CHECK (preferred_locale IN ('en','ar')),
    status                  VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE customers IS 'Business entities only — customers never log in (no user account).';
COMMENT ON COLUMN customers.phone IS 'SENSITIVE PII.';
COMMENT ON COLUMN customers.email IS 'SENSITIVE PII.';

CREATE TABLE vehicles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    plate                   VARCHAR(20) NOT NULL,
    vin                     VARCHAR(17) NOT NULL CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
    make                    VARCHAR(60) NOT NULL,
    model                   VARCHAR(60) NOT NULL,
    year                    SMALLINT NOT NULL CHECK (year BETWEEN 1950 AND 2100),
    mileage                 INTEGER NOT NULL CHECK (mileage >= 0),
    mileage_unit            VARCHAR(2) NOT NULL CHECK (mileage_unit IN ('KM','MI')),
    status                  VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON COLUMN vehicles.vin IS 'SENSITIVE identifier: unique per active vehicle, always rendered LTR regardless of UI locale.';
-- "Plate and VIN unique among ACTIVE vehicles" per API contract — partial unique indexes below.
CREATE UNIQUE INDEX uq_vehicles_active_plate ON vehicles(plate) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_vehicles_active_vin ON vehicles(vin) WHERE status = 'ACTIVE';
COMMENT ON INDEX uq_vehicles_active_plate IS 'Enforces plate uniqueness among ACTIVE vehicles only, allowing archived duplicates to remain in history.';

CREATE TABLE service_reminders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id              UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title                   VARCHAR(160) NOT NULL,
    due_date                DATE,
    due_mileage             INTEGER CHECK (due_mileage IS NULL OR due_mileage >= 0),
    status                  VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','CANCELLED')),
    completed_at            TIMESTAMPTZ,
    notes                   VARCHAR(500),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_reminder_has_trigger CHECK (due_date IS NOT NULL OR due_mileage IS NOT NULL)
);

CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX idx_customers_org_scope ON customers(organization_scope_id);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_service_reminders_vehicle ON service_reminders(vehicle_id);
CREATE INDEX idx_service_reminders_status_due ON service_reminders(status, due_date);

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_service_reminders_updated BEFORE UPDATE ON service_reminders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 5 — SHARED BAYS  (WST-FR-10 shared resource, used by both jobs and sessions)
-- =====================================================================================

CREATE TABLE bays (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    code                    VARCHAR(20) NOT NULL,
    name                    VARCHAR(80) NOT NULL,
    capacity                INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
    status                  VARCHAR(11) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','INACTIVE')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_bay_code UNIQUE (code)
);
COMMENT ON TABLE bays IS
    'Shared physical resource used by both workshop jobs and training sessions; conflict detection queries job_cards + training_sessions windows against the same bay_id.';

CREATE INDEX idx_bays_org_scope ON bays(organization_scope_id);
CREATE INDEX idx_bays_status ON bays(status);

CREATE TRIGGER trg_bays_updated BEFORE UPDATE ON bays
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 6 — WORKSHOP JOBS  (WST-FR-04, WST-FR-05, WST-FR-06)
-- =====================================================================================

-- Sequence backing the human-readable job number JC-YYYY-NNNNNN (server-generated, immutable).
CREATE SEQUENCE job_number_seq START 1;

CREATE TABLE job_cards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_number              VARCHAR(20) NOT NULL,
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    vehicle_id              UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    complaint               TEXT NOT NULL CHECK (char_length(complaint) BETWEEN 3 AND 2000),
    service_type            VARCHAR(12) NOT NULL
                                CHECK (service_type IN ('MAINTENANCE','REPAIR','DIAGNOSTIC','INSPECTION','OTHER')),
    priority                VARCHAR(6) NOT NULL DEFAULT 'NORMAL'
                                CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    mileage_at_intake       INTEGER NOT NULL CHECK (mileage_at_intake >= 0),
    stage                   VARCHAR(14) NOT NULL DEFAULT 'RECEIVED'
                                CHECK (stage IN ('RECEIVED','IN_PROGRESS','QUALITY_CHECK','READY','DELIVERED')),
    stage_changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    bay_id                  UUID REFERENCES bays(id) ON DELETE SET NULL,
    technician_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    scheduled_start_at      TIMESTAMPTZ,
    expected_completion_at  TIMESTAMPTZ NOT NULL,
    delivered_at            TIMESTAMPTZ,
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_job_number UNIQUE (job_number),
    CONSTRAINT chk_job_assignment_window CHECK (
        scheduled_start_at IS NULL OR expected_completion_at IS NULL
        OR scheduled_start_at < expected_completion_at
    ),
    CONSTRAINT chk_job_delivered_has_timestamp CHECK (
        (stage = 'DELIVERED' AND delivered_at IS NOT NULL)
        OR (stage <> 'DELIVERED')
    )
);
COMMENT ON TABLE job_cards IS
    'Reception-to-delivery workflow (WST-FR-04/05). Stage is only ever changed through the controlled transition workflow — see job_stage_events and the application-layer transition guard; a bare UPDATE of stage bypasses history and must be prevented by application code plus the trigger below.';
COMMENT ON COLUMN job_cards.version IS 'Optimistic concurrency token; a stale version on PATCH/transition returns 409 VERSION_CONFLICT.';

CREATE INDEX idx_job_cards_stage ON job_cards(stage);
CREATE INDEX idx_job_cards_customer ON job_cards(customer_id);
CREATE INDEX idx_job_cards_vehicle ON job_cards(vehicle_id);
CREATE INDEX idx_job_cards_technician ON job_cards(technician_id);
CREATE INDEX idx_job_cards_bay ON job_cards(bay_id);
CREATE INDEX idx_job_cards_org_scope ON job_cards(organization_scope_id);
CREATE INDEX idx_job_cards_created_at ON job_cards(created_at DESC);
CREATE INDEX idx_job_cards_priority ON job_cards(priority);

CREATE TRIGGER trg_job_cards_updated BEFORE UPDATE ON job_cards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Immutable, append-only lifecycle timeline (WST-FR-05: "full stage history auditable").
CREATE TABLE job_stage_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    from_stage          VARCHAR(14) CHECK (from_stage IN ('RECEIVED','IN_PROGRESS','QUALITY_CHECK','READY','DELIVERED')),
    to_stage            VARCHAR(14) NOT NULL
                            CHECK (to_stage IN ('RECEIVED','IN_PROGRESS','QUALITY_CHECK','READY','DELIVERED')),
    transitioned_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transitioned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason              VARCHAR(500)
);
COMMENT ON TABLE job_stage_events IS 'APPEND-ONLY audit trail of every job stage transition. No UPDATE/DELETE path (see trigger).';
CREATE INDEX idx_job_stage_events_job ON job_stage_events(job_id, transitioned_at);
CREATE TRIGGER trg_job_stage_events_immutable
    BEFORE UPDATE OR DELETE ON job_stage_events
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE work_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    description         VARCHAR(300) NOT NULL,
    status              VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','CANCELLED')),
    is_additional_work  BOOLEAN NOT NULL DEFAULT FALSE,
    approval_id         UUID,   -- FK added after job_approvals is created (circular reference resolved below)
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_work_items_job ON work_items(job_id);
CREATE INDEX idx_work_items_status ON work_items(status);
CREATE TRIGGER trg_work_items_updated BEFORE UPDATE ON work_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_approvals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                  UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    scope                   VARCHAR(15) NOT NULL CHECK (scope IN ('INITIAL_WORK','ADDITIONAL_WORK','SUBLET')),
    description             VARCHAR(1000) NOT NULL CHECK (char_length(description) >= 3),
    estimated_amount        NUMERIC(14,4) CHECK (estimated_amount IS NULL OR estimated_amount >= 0),
    estimated_currency_code CHAR(3) CHECK (estimated_currency_code IS NULL OR estimated_currency_code ~ '^[A-Z]{3}$'),
    status                  VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    method                  VARCHAR(12) CHECK (method IN ('IN_PERSON','PHONE','MESSAGE','EMAIL','SIGNED_FORM')),
    approved_by_name        VARCHAR(120),
    decided_at              TIMESTAMPTZ,
    recorded_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    notes                   VARCHAR(1000),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_decision_fields CHECK (
        (status = 'PENDING' AND decided_at IS NULL)
        OR (status IN ('APPROVED','REJECTED') AND decided_at IS NOT NULL AND method IS NOT NULL AND approved_by_name IS NOT NULL)
    )
);
COMMENT ON TABLE job_approvals IS
    'Customer approvals gating billable work (the hardest business rule in the brief: no billable work starts before approval). A decided approval is immutable — enforced by application (a second decision creates a new row, not an UPDATE of this one) and reinforced by the trigger below once decided.';
CREATE INDEX idx_job_approvals_job ON job_approvals(job_id);
CREATE INDEX idx_job_approvals_status ON job_approvals(status);
CREATE TRIGGER trg_job_approvals_updated BEFORE UPDATE ON job_approvals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Guard: once an approval is decided (APPROVED/REJECTED) its status can never flip again.
CREATE OR REPLACE FUNCTION forbid_redecision_job_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('APPROVED','REJECTED') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'job_approvals % is already decided (%) and cannot be redecided', OLD.id, OLD.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_job_approvals_no_redecision
    BEFORE UPDATE ON job_approvals
    FOR EACH ROW EXECUTE FUNCTION forbid_redecision_job_approval();

-- Resolve the work_items -> job_approvals reference now that job_approvals exists.
ALTER TABLE work_items
    ADD CONSTRAINT fk_work_items_approval FOREIGN KEY (approval_id)
        REFERENCES job_approvals(id) ON DELETE SET NULL;
CREATE INDEX idx_work_items_approval ON work_items(approval_id);

-- Junction: which work items a given approval covers (ADDITIONAL_WORK approvals list >=1 item).
CREATE TABLE job_approval_work_items (
    approval_id         UUID NOT NULL REFERENCES job_approvals(id) ON DELETE CASCADE,
    work_item_id        UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    PRIMARY KEY (approval_id, work_item_id)
);

CREATE TABLE quality_checks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    result              VARCHAR(6) NOT NULL CHECK (result IN ('PASSED','FAILED')),
    notes               TEXT,
    performed_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    performed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_failed_requires_notes CHECK (result = 'PASSED' OR (result = 'FAILED' AND notes IS NOT NULL))
);
COMMENT ON TABLE quality_checks IS
    'Recorded by a permission (quality.perform) distinct from job execution — separation of duties. Append-only: a check result is never edited, only superseded by a new record.';
CREATE INDEX idx_quality_checks_job ON quality_checks(job_id, performed_at);
CREATE TRIGGER trg_quality_checks_immutable
    BEFORE UPDATE OR DELETE ON quality_checks
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE labor_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    work_item_id        UUID REFERENCES work_items(id) ON DELETE SET NULL,
    technician_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    work_date           DATE NOT NULL,
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    description         VARCHAR(500),
    hourly_rate_amount  NUMERIC(14,4) NOT NULL CHECK (hourly_rate_amount >= 0),
    hourly_rate_currency CHAR(3) NOT NULL CHECK (hourly_rate_currency ~ '^[A-Z]{3}$'),
    amount              NUMERIC(14,4) NOT NULL CHECK (amount >= 0),
    amount_currency     CHAR(3) NOT NULL CHECK (amount_currency ~ '^[A-Z]{3}$'),
    status              VARCHAR(7) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
    void_reason         VARCHAR(500),
    voided_at           TIMESTAMPTZ,
    voided_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_labor_void_fields CHECK (
        (status = 'ACTIVE' AND void_reason IS NULL)
        OR (status = 'VOIDED' AND void_reason IS NOT NULL AND voided_at IS NOT NULL)
    )
);
COMMENT ON TABLE labor_entries IS
    'hourly_rate_amount is a SNAPSHOT of finance_settings.labor_hourly_rate at logging time — rate changes never retroactively alter historical entries. Invoices are computed exclusively from ACTIVE rows here (WST-FR-09).';
CREATE INDEX idx_labor_entries_job ON labor_entries(job_id, work_date);
CREATE INDEX idx_labor_entries_technician ON labor_entries(technician_id);
CREATE INDEX idx_labor_entries_status ON labor_entries(status);
CREATE TRIGGER trg_labor_entries_updated BEFORE UPDATE ON labor_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sublet_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    description         VARCHAR(300) NOT NULL CHECK (char_length(description) >= 3),
    vendor_id           UUID,   -- FK added after vendors is created
    cost_amount         NUMERIC(14,4) NOT NULL CHECK (cost_amount >= 0),
    cost_currency       CHAR(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    approval_id         UUID NOT NULL REFERENCES job_approvals(id) ON DELETE RESTRICT,
    status              VARCHAR(7) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
    void_reason         VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_sublet_entries_job ON sublet_entries(job_id);
CREATE TRIGGER trg_sublet_entries_updated BEFORE UPDATE ON sublet_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 7 — ATTACHMENTS (private evidence, short-lived download authorization)
-- =====================================================================================

CREATE TABLE attachments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_name           VARCHAR(200) NOT NULL,
    content_type        VARCHAR(30) NOT NULL
                            CHECK (content_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
    size_bytes          INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    sha256              CHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    -- object_storage_key never exposed via API; a signed short-lived URL is issued on demand.
    object_storage_key  TEXT NOT NULL,
    purpose             VARCHAR(20) NOT NULL
                            CHECK (purpose IN ('JOB_PHOTO','APPROVAL_EVIDENCE','QUALITY_EVIDENCE','TRAINING_EVIDENCE')),
    status              VARCHAR(8) NOT NULL DEFAULT 'UNLINKED' CHECK (status IN ('UNLINKED','LINKED','EXPIRED')),
    owner_type          VARCHAR(15) CHECK (owner_type IN ('JOB_CARD','JOB_APPROVAL','QUALITY_CHECK','ASSESSMENT')),
    owner_id            UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_attachment_owner_pair CHECK (
        (status = 'UNLINKED' AND owner_type IS NULL AND owner_id IS NULL)
        OR (status IN ('LINKED','EXPIRED') AND owner_type IS NOT NULL AND owner_id IS NOT NULL)
    )
);
COMMENT ON TABLE attachments IS
    'Private object storage only. No permanent public URL — every read goes through a signed, single-purpose, <=5-minute download_authorizations row. Content-type is both declared and sniffed by the application at upload time; malware scanning is an infrastructure concern applied before object_storage_key is written.';
CREATE INDEX idx_attachments_uploader ON attachments(uploaded_by);
CREATE INDEX idx_attachments_owner ON attachments(owner_type, owner_id);
CREATE TRIGGER trg_attachments_updated BEFORE UPDATE ON attachments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE download_authorizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id       UUID REFERENCES attachments(id) ON DELETE CASCADE,
    export_job_id       UUID,  -- FK added after export_jobs is created
    issued_to           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_download_auth_target CHECK (
        (attachment_id IS NOT NULL AND export_job_id IS NULL)
        OR (attachment_id IS NULL AND export_job_id IS NOT NULL)
    )
);
COMMENT ON TABLE download_authorizations IS 'Every issuance is itself an audited sensitive read (see audit_events).';
CREATE INDEX idx_download_auth_attachment ON download_authorizations(attachment_id);
CREATE INDEX idx_download_auth_export ON download_authorizations(export_job_id);

-- =====================================================================================
-- SECTION 8 — INVENTORY  (WST-FR-07): stores, parts, balances, append-only ledger
-- =====================================================================================

CREATE TABLE stores (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    code                    VARCHAR(20) NOT NULL,
    name                    VARCHAR(120) NOT NULL,
    status                  VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_store_code UNIQUE (code)
);
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE parts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku                 VARCHAR(64) NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
    barcode             VARCHAR(64) CHECK (barcode IS NULL OR barcode ~ '^[0-9A-Za-z-]{4,64}$'),
    name_en             VARCHAR(200) NOT NULL,
    name_ar             VARCHAR(200),
    category            VARCHAR(80) NOT NULL,
    unit_of_measure     VARCHAR(20) NOT NULL,
    selling_price_amount NUMERIC(14,4) NOT NULL CHECK (selling_price_amount >= 0),
    selling_price_currency CHAR(3) NOT NULL CHECK (selling_price_currency ~ '^[A-Z]{3}$'),
    status              VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    version             INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_parts_sku UNIQUE (sku),
    CONSTRAINT uq_parts_barcode UNIQUE (barcode)
);
COMMENT ON COLUMN parts.sku IS 'Immutable once set; the API never allows SKU edits.';
CREATE INDEX idx_parts_category ON parts(category);
CREATE INDEX idx_parts_status ON parts(status);
CREATE TRIGGER trg_parts_updated BEFORE UPDATE ON parts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE part_vehicle_compatibility (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    make                VARCHAR(60) NOT NULL,
    model               VARCHAR(60),
    year_from           SMALLINT CHECK (year_from IS NULL OR year_from BETWEEN 1950 AND 2100),
    year_to             SMALLINT CHECK (year_to IS NULL OR year_to BETWEEN 1950 AND 2100),
    CONSTRAINT chk_compat_year_range CHECK (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)
);
CREATE INDEX idx_compat_part ON part_vehicle_compatibility(part_id);
CREATE INDEX idx_compat_make_model ON part_vehicle_compatibility(make, model);

-- Derived/materialized balance per (store, part). Never written directly by the API —
-- only ever updated inside the same transaction that appends a stock_movements row.
CREATE TABLE stock_balances (
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    on_hand             INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved            INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    min_level           INTEGER NOT NULL DEFAULT 0 CHECK (min_level >= 0),
    max_level           INTEGER NOT NULL DEFAULT 0 CHECK (max_level >= 0),
    average_cost_amount NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (average_cost_amount >= 0),
    average_cost_currency CHAR(3) CHECK (average_cost_currency IS NULL OR average_cost_currency ~ '^[A-Z]{3}$'),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, part_id),
    CONSTRAINT chk_reserved_lte_on_hand CHECK (reserved <= on_hand),
    CONSTRAINT chk_levels_order CHECK (max_level >= min_level)
);
COMMENT ON TABLE stock_balances IS
    'Materialized view of the append-only stock_movements ledger. "available" (on_hand - reserved) is computed, not stored, so it can never drift. reserved <= on_hand is a hard invariant maintained by every movement-writing transaction (issue, reserve, receive, adjust).';
CREATE INDEX idx_stock_balances_part ON stock_balances(part_id);
CREATE INDEX idx_stock_balances_below_min ON stock_balances(store_id) WHERE on_hand <= min_level;
CREATE TRIGGER trg_stock_balances_updated BEFORE UPDATE ON stock_balances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only ledger: the single source of truth for every stock change. Never UPDATE/DELETE.
CREATE TABLE stock_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id                UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    part_id                 UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    type                    VARCHAR(20) NOT NULL CHECK (type IN
                                ('OPENING_BALANCE','RECEIPT','ISSUE','ISSUE_REVERSAL',
                                 'RESERVATION','RESERVATION_RELEASE','ADJUSTMENT')),
    on_hand_delta           INTEGER NOT NULL,
    reserved_delta          INTEGER NOT NULL,
    on_hand_after           INTEGER NOT NULL CHECK (on_hand_after >= 0),
    reserved_after          INTEGER NOT NULL CHECK (reserved_after >= 0),
    unit_cost_amount        NUMERIC(14,4) CHECK (unit_cost_amount IS NULL OR unit_cost_amount >= 0),
    unit_cost_currency      CHAR(3) CHECK (unit_cost_currency IS NULL OR unit_cost_currency ~ '^[A-Z]{3}$'),
    job_id                  UUID REFERENCES job_cards(id) ON DELETE SET NULL,
    part_issue_id           UUID,               -- FK added after part_issues is created
    purchase_order_id       UUID,               -- FK added after purchase_orders is created
    goods_receipt_id        UUID,               -- FK added after goods_receipts is created
    stock_adjustment_id     UUID,               -- FK added after stock_adjustments is created
    reason                  VARCHAR(500),
    actor_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reserved_after_lte_on_hand_after CHECK (reserved_after <= on_hand_after)
);
COMMENT ON TABLE stock_movements IS
    'APPEND-ONLY inventory ledger (WST-FR-06/07). This is the ONLY writer of truth for inventory; stock_balances is a cached projection recomputed transactionally alongside each insert here. OPENING_BALANCE rows are written only by seed/migration tooling, never through the API.';
CREATE INDEX idx_stock_movements_store_part ON stock_movements(store_id, part_id, occurred_at DESC);
CREATE INDEX idx_stock_movements_type ON stock_movements(type);
CREATE INDEX idx_stock_movements_job ON stock_movements(job_id);
CREATE INDEX idx_stock_movements_po ON stock_movements(purchase_order_id);
CREATE INDEX idx_stock_movements_gr ON stock_movements(goods_receipt_id);
CREATE INDEX idx_stock_movements_adjustment ON stock_movements(stock_adjustment_id);
CREATE INDEX idx_stock_movements_occurred_at ON stock_movements(occurred_at DESC);
CREATE TRIGGER trg_stock_movements_immutable
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE part_reservations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
    consumed_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
    status              VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FULFILLED','RELEASED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumed_lte_quantity CHECK (consumed_quantity <= quantity)
);
CREATE INDEX idx_reservations_job ON part_reservations(job_id);
CREATE INDEX idx_reservations_store_part ON part_reservations(store_id, part_id);
CREATE INDEX idx_reservations_status ON part_reservations(status);
CREATE TRIGGER trg_reservations_updated BEFORE UPDATE ON part_reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE part_issues (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE RESTRICT,
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    part_sku            VARCHAR(64) NOT NULL,          -- denormalized snapshot for history stability
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    work_item_id        UUID REFERENCES work_items(id) ON DELETE SET NULL,
    reservation_id      UUID REFERENCES part_reservations(id) ON DELETE SET NULL,
    quantity            INTEGER NOT NULL CHECK (quantity >= 1),
    reversed_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (reversed_quantity >= 0),
    unit_price_amount   NUMERIC(14,4) NOT NULL CHECK (unit_price_amount >= 0),
    unit_price_currency CHAR(3) NOT NULL CHECK (unit_price_currency ~ '^[A-Z]{3}$'),
    unit_cost_amount    NUMERIC(14,4) CHECK (unit_cost_amount IS NULL OR unit_cost_amount >= 0),
    unit_cost_currency  CHAR(3) CHECK (unit_cost_currency IS NULL OR unit_cost_currency ~ '^[A-Z]{3}$'),
    line_total_amount   NUMERIC(14,4) NOT NULL CHECK (line_total_amount >= 0),
    line_total_currency CHAR(3) NOT NULL CHECK (line_total_currency ~ '^[A-Z]{3}$'),
    status              VARCHAR(17) NOT NULL DEFAULT 'ISSUED'
                            CHECK (status IN ('ISSUED','PARTIALLY_REVERSED','REVERSED')),
    stock_movement_id   UUID NOT NULL,   -- FK added below once column order is settled
    idempotency_key     VARCHAR(128),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_reversed_lte_issued CHECK (reversed_quantity <= quantity)
);
ALTER TABLE part_issues
    ADD CONSTRAINT fk_part_issues_movement FOREIGN KEY (stock_movement_id)
        REFERENCES stock_movements(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_part_issue FOREIGN KEY (part_issue_id)
        REFERENCES part_issues(id) ON DELETE SET NULL;
COMMENT ON TABLE part_issues IS
    'unit_price/unit_cost are point-in-time SNAPSHOTS taken atomically with the ISSUE stock_movements row (WST-FR-06). idempotency_key backs the Idempotency-Key header contract for safe POST retries.';
CREATE UNIQUE INDEX uq_part_issues_idempotency ON part_issues(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_part_issues_job ON part_issues(job_id);
CREATE INDEX idx_part_issues_part ON part_issues(part_id);
CREATE TRIGGER trg_part_issues_updated BEFORE UPDATE ON part_issues
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE part_issue_reversals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_issue_id       UUID NOT NULL REFERENCES part_issues(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity >= 1),
    reason              VARCHAR(500) NOT NULL CHECK (char_length(reason) >= 3),
    reversed_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reversed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    stock_movement_id   UUID NOT NULL REFERENCES stock_movements(id) ON DELETE RESTRICT,
    idempotency_key     VARCHAR(128)
);
COMMENT ON TABLE part_issue_reversals IS 'APPEND-ONLY. The original issue and its stock movement are never modified — only reversed via a new movement referenced here.';
CREATE UNIQUE INDEX uq_reversals_idempotency ON part_issue_reversals(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_reversals_issue ON part_issue_reversals(part_issue_id);
CREATE TRIGGER trg_part_issue_reversals_immutable
    BEFORE UPDATE OR DELETE ON part_issue_reversals
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE stock_adjustments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity_delta      INTEGER NOT NULL CHECK (quantity_delta <> 0),
    reason_code         VARCHAR(20) NOT NULL CHECK (reason_code IN ('DAMAGE','LOSS','FOUND','COUNT_CORRECTION','OTHER')),
    note                VARCHAR(500),
    status              VARCHAR(17) NOT NULL DEFAULT 'PENDING_APPROVAL'
                            CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED')),
    requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decided_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at          TIMESTAMPTZ,
    decision_reason     VARCHAR(500),
    stock_movement_id   UUID REFERENCES stock_movements(id) ON DELETE RESTRICT,
    idempotency_key     VARCHAR(128),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_adjustment_decision CHECK (
        (status = 'PENDING_APPROVAL' AND decided_by IS NULL AND stock_movement_id IS NULL)
        OR (status IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT chk_adjustment_separation_of_duties CHECK (decided_by IS DISTINCT FROM requested_by)
);
COMMENT ON TABLE stock_adjustments IS
    'Separation of duties enforced in SQL: decided_by can never equal requested_by (409 SEPARATION_OF_DUTIES_VIOLATION at the API layer maps to this constraint).';
ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_adjustment FOREIGN KEY (stock_adjustment_id)
        REFERENCES stock_adjustments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_adjustments_idempotency ON stock_adjustments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_adjustments_status ON stock_adjustments(status);
CREATE INDEX idx_adjustments_store_part ON stock_adjustments(store_id, part_id);
CREATE TRIGGER trg_stock_adjustments_updated BEFORE UPDATE ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 9 — PROCUREMENT  (WST-FR-08): vendors, purchase orders, approvals, receipts
-- =====================================================================================

CREATE TABLE vendors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(20) NOT NULL,
    name                VARCHAR(160) NOT NULL,
    contact_name        VARCHAR(120),
    phone               VARCHAR(20) CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
    email               VARCHAR(254) CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    status              VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_vendor_code UNIQUE (code)
);
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sublet_entries
    ADD CONSTRAINT fk_sublet_entries_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX idx_sublet_entries_vendor ON sublet_entries(vendor_id);

CREATE SEQUENCE po_number_seq START 1;

CREATE TABLE purchase_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number               VARCHAR(20) NOT NULL,
    vendor_id               UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    store_id                UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    status                  VARCHAR(19) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED',
                                                   'PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
    total_amount            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_currency          CHAR(3) NOT NULL CHECK (total_currency ~ '^[A-Z]{3}$'),
    required_approvals      SMALLINT CHECK (required_approvals IN (1,2)),
    approvals_recorded      SMALLINT NOT NULL DEFAULT 0 CHECK (approvals_recorded >= 0),
    source_prediction_id    UUID,  -- FK added after predictions is created
    expected_delivery_date  DATE,
    notes                   VARCHAR(1000),
    submitted_at            TIMESTAMPTZ,
    cancellation_reason     VARCHAR(500),
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_po_number UNIQUE (po_number),
    CONSTRAINT chk_po_required_approvals_snapshot CHECK (
        (status = 'DRAFT' AND required_approvals IS NULL)
        OR (status <> 'DRAFT')
    )
);
COMMENT ON TABLE purchase_orders IS
    'required_approvals is snapshotted from purchase_approval_policy at DRAFT->PENDING_APPROVAL submission time, so later policy edits never retroactively affect an order already in flight.';
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_store ON purchase_orders(store_id);
CREATE INDEX idx_po_created_at ON purchase_orders(created_at DESC);
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_po FOREIGN KEY (purchase_order_id)
        REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE TABLE purchase_order_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL CHECK (line_number >= 1),
    part_id                 UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity_ordered        INTEGER NOT NULL CHECK (quantity_ordered BETWEEN 1 AND 100000),
    quantity_accepted       INTEGER NOT NULL DEFAULT 0 CHECK (quantity_accepted >= 0),
    quantity_rejected       INTEGER NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
    unit_cost_amount        NUMERIC(14,4) NOT NULL CHECK (unit_cost_amount >= 0),
    unit_cost_currency      CHAR(3) NOT NULL CHECK (unit_cost_currency ~ '^[A-Z]{3}$'),
    line_total_amount       NUMERIC(14,4) NOT NULL CHECK (line_total_amount >= 0),
    line_total_currency     CHAR(3) NOT NULL CHECK (line_total_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT uq_po_line_number UNIQUE (purchase_order_id, line_number),
    CONSTRAINT chk_po_accepted_lte_ordered CHECK (quantity_accepted <= quantity_ordered)
);
CREATE INDEX idx_po_lines_order ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_po_lines_part ON purchase_order_lines(part_id);

CREATE TABLE purchase_approvals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    approver_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision            VARCHAR(8) NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
    reason              VARCHAR(500),
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_purchase_rejection_reason CHECK (decision = 'APPROVED' OR (decision = 'REJECTED' AND reason IS NOT NULL)),
    CONSTRAINT uq_purchase_approval_per_approver UNIQUE (purchase_order_id, approver_id)
);
COMMENT ON TABLE purchase_approvals IS
    'APPEND-ONLY. uq_purchase_approval_per_approver enforces "a user cannot decide twice" (409 DUPLICATE_APPROVAL) directly in the database. Separation of duties (creator cannot decide) is enforced at the application layer, since it compares against purchase_orders.created_by, a cross-table rule best expressed as a transaction check or trigger referencing both tables.';
CREATE INDEX idx_purchase_approvals_po ON purchase_approvals(purchase_order_id);
CREATE TRIGGER trg_purchase_approvals_immutable
    BEFORE UPDATE OR DELETE ON purchase_approvals
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Cross-table separation-of-duties guard: the PO creator cannot also approve/reject it.
CREATE OR REPLACE FUNCTION forbid_self_approval_purchase_order()
RETURNS TRIGGER AS $$
DECLARE
    v_creator UUID;
BEGIN
    SELECT created_by INTO v_creator FROM purchase_orders WHERE id = NEW.purchase_order_id;
    IF v_creator = NEW.approver_id THEN
        RAISE EXCEPTION 'Purchase order % cannot be approved/rejected by its creator (separation of duties)', NEW.purchase_order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_purchase_approvals_sod
    BEFORE INSERT ON purchase_approvals
    FOR EACH ROW EXECUTE FUNCTION forbid_self_approval_purchase_order();

CREATE SEQUENCE goods_receipt_number_seq START 1;

CREATE TABLE goods_receipts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number      VARCHAR(20) NOT NULL,
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    delivery_reference  VARCHAR(80),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key      VARCHAR(128),
    CONSTRAINT uq_goods_receipt_number UNIQUE (receipt_number)
);
COMMENT ON TABLE goods_receipts IS 'APPEND-ONLY / immutable: corrections happen through stock_adjustments, never by editing a receipt.';
ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_gr FOREIGN KEY (goods_receipt_id)
        REFERENCES goods_receipts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_goods_receipts_idempotency ON goods_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_goods_receipts_po ON goods_receipts(purchase_order_id);
CREATE TRIGGER trg_goods_receipts_immutable
    BEFORE UPDATE OR DELETE ON goods_receipts
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE goods_receipt_lines (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_receipt_id            UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    purchase_order_line_id      UUID NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
    part_id                     UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity_received           INTEGER NOT NULL CHECK (quantity_received >= 0),
    quantity_accepted           INTEGER NOT NULL CHECK (quantity_accepted >= 0),
    quantity_rejected           INTEGER NOT NULL CHECK (quantity_rejected >= 0),
    rejection_reason            VARCHAR(300),
    stock_movement_id           UUID REFERENCES stock_movements(id) ON DELETE RESTRICT,
    CONSTRAINT chk_gr_line_quantities CHECK (quantity_received = quantity_accepted + quantity_rejected),
    CONSTRAINT chk_gr_line_rejection_reason CHECK (quantity_rejected = 0 OR rejection_reason IS NOT NULL)
);
CREATE INDEX idx_gr_lines_receipt ON goods_receipt_lines(goods_receipt_id);
CREATE INDEX idx_gr_lines_po_line ON goods_receipt_lines(purchase_order_line_id);

-- =====================================================================================
-- SECTION 10 — INVOICING (accounting-lite)  (WST-FR-09)
-- =====================================================================================

CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number          VARCHAR(20),                 -- assigned only when ISSUED
    job_id                  UUID NOT NULL REFERENCES job_cards(id) ON DELETE RESTRICT,
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status                  VARCHAR(6) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PAID','VOID')),
    currency_code           CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    discount_type           VARCHAR(7) CHECK (discount_type IN ('PERCENT','AMOUNT')),
    discount_value          NUMERIC(14,4) CHECK (discount_value IS NULL OR discount_value >= 0),
    discount_reason         VARCHAR(300),
    labor_subtotal          NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (labor_subtotal >= 0),
    parts_subtotal          NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (parts_subtotal >= 0),
    sublet_subtotal         NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (sublet_subtotal >= 0),
    subtotal                NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_total          NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    taxable_amount          NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0),
    tax_rate_percent        NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (tax_rate_percent BETWEEN 0 AND 100),
    tax_amount              NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes                   VARCHAR(1000),
    issued_at               TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    void_reason             VARCHAR(500),
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_invoice_number UNIQUE (invoice_number),
    -- Only one non-VOID invoice may exist per job at a time (regeneration requires the prior one voided).
    CONSTRAINT chk_invoice_number_present_when_issued CHECK (
        (status = 'DRAFT' AND invoice_number IS NULL)
        OR (status <> 'DRAFT' AND invoice_number IS NOT NULL)
    )
);
COMMENT ON TABLE invoices IS
    'Lines and totals are server-calculated exclusively from ACTIVE labor_entries, non-reversed part_issues, and ACTIVE sublet_entries (WST-FR-09 hardest rule: never manually typed). SENSITIVE financial record.';
CREATE UNIQUE INDEX uq_invoices_one_nonvoid_per_job ON invoices(job_id) WHERE status <> 'VOID';
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_type           VARCHAR(6) NOT NULL CHECK (line_type IN ('LABOR','PART','SUBLET')),
    description         TEXT NOT NULL,
    quantity            NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_price_amount   NUMERIC(14,4) NOT NULL CHECK (unit_price_amount >= 0),
    unit_price_currency CHAR(3) NOT NULL CHECK (unit_price_currency ~ '^[A-Z]{3}$'),
    line_total_amount   NUMERIC(14,4) NOT NULL CHECK (line_total_amount >= 0),
    line_total_currency CHAR(3) NOT NULL CHECK (line_total_currency ~ '^[A-Z]{3}$'),
    source_type         VARCHAR(13) NOT NULL CHECK (source_type IN ('LABOR_ENTRY','PART_ISSUE','SUBLET_ENTRY')),
    source_labor_entry_id  UUID REFERENCES labor_entries(id) ON DELETE RESTRICT,
    source_part_issue_id   UUID REFERENCES part_issues(id) ON DELETE RESTRICT,
    source_sublet_entry_id UUID REFERENCES sublet_entries(id) ON DELETE RESTRICT,
    CONSTRAINT chk_invoice_line_single_source CHECK (
        (num_nonnulls(source_labor_entry_id, source_part_issue_id, source_sublet_entry_id) = 1)
    )
);
COMMENT ON TABLE invoice_lines IS 'Every line traces to exactly one operational source record — the traceability rule from WST-FR-09.';
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE payment_references (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    method              VARCHAR(13) NOT NULL CHECK (method IN ('CASH','CARD','BANK_TRANSFER','CHEQUE','OTHER')),
    reference           VARCHAR(120) NOT NULL,
    amount_amount       NUMERIC(14,4) NOT NULL CHECK (amount_amount >= 0),
    amount_currency     CHAR(3) NOT NULL CHECK (amount_currency ~ '^[A-Z]{3}$'),
    paid_at             TIMESTAMPTZ NOT NULL,
    idempotency_key     VARCHAR(128),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE payment_references IS 'Full (non-partial) payment only in the MVP: amount must equal invoice total, enforced at the application/transaction layer.';
CREATE UNIQUE INDEX uq_payment_refs_idempotency ON payment_references(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_payment_refs_invoice ON payment_references(invoice_id);

-- =====================================================================================
-- SECTION 11 — TRAINING: terms, competencies, tasks, courses  (WST-FR-10, WST-FR-11, WST-FR-12)
-- =====================================================================================

CREATE TABLE training_terms (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_scope_id   UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    name                    VARCHAR(120) NOT NULL,
    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL,
    status                  VARCHAR(7) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','CLOSED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_term_dates CHECK (start_date < end_date)
);
CREATE INDEX idx_training_terms_status ON training_terms(status);
CREATE TRIGGER trg_training_terms_updated BEFORE UPDATE ON training_terms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE competencies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(30) NOT NULL,
    name_en             VARCHAR(200) NOT NULL,
    name_ar             VARCHAR(200),
    description         TEXT,
    status              VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_competency_code UNIQUE (code)
);
CREATE TRIGGER trg_competencies_updated BEFORE UPDATE ON competencies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE practical_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(30) NOT NULL,
    title_en            VARCHAR(200) NOT NULL,
    title_ar            VARCHAR(200),
    description         TEXT,
    competency_id       UUID NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
    expected_minutes    INTEGER NOT NULL CHECK (expected_minutes BETWEEN 1 AND 1440),
    status              VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_task_code UNIQUE (code)
);
COMMENT ON TABLE practical_tasks IS 'Each task belongs to exactly one competency; archiving a task never affects assessments already recorded (FK is RESTRICT, status flag controls future selection).';
CREATE INDEX idx_practical_tasks_competency ON practical_tasks(competency_id);
CREATE TRIGGER trg_practical_tasks_updated BEFORE UPDATE ON practical_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE courses (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_scope_id       UUID NOT NULL REFERENCES organization_scopes(id) ON DELETE RESTRICT,
    code                        VARCHAR(30) NOT NULL,
    name_en                     VARCHAR(200) NOT NULL,
    name_ar                     VARCHAR(200),
    term_id                     UUID NOT NULL REFERENCES training_terms(id) ON DELETE RESTRICT,
    description                 TEXT,
    minimum_attendance_percent  INTEGER NOT NULL CHECK (minimum_attendance_percent BETWEEN 0 AND 100),
    status                      VARCHAR(8) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_course_code UNIQUE (code)
);
CREATE INDEX idx_courses_term ON courses(term_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE course_tasks (
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    task_id             UUID NOT NULL REFERENCES practical_tasks(id) ON DELETE RESTRICT,
    required            BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (course_id, task_id)
);
COMMENT ON TABLE course_tasks IS
    'Which tasks belong to a course and which are required for completion. Editing this set on an ACTIVE course with enrollments must be blocked at the application layer (409 RESOURCE_IN_USE) so previously granted eligibility is never silently invalidated.';

-- =====================================================================================
-- SECTION 12 — STUDENTS, GROUPS, ENROLLMENTS
-- =====================================================================================

CREATE TABLE students (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    student_number      VARCHAR(30) NOT NULL,
    status              VARCHAR(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_students_user UNIQUE (user_id),
    CONSTRAINT uq_students_number UNIQUE (student_number)
);
COMMENT ON TABLE students IS
    'One-to-one with a STUDENT-role user. Stores no contact data of its own beyond the user account, minimizing duplicated PII (WST-FR privacy rule).';
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce that a student's linked user actually holds the STUDENT role.
CREATE OR REPLACE FUNCTION check_student_user_has_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.user_id AND role_code = 'STUDENT') THEN
        RAISE EXCEPTION 'User % must hold the STUDENT role to have a student profile', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_students_require_role
    BEFORE INSERT ON students
    FOR EACH ROW EXECUTE FUNCTION check_student_user_has_role();

CREATE TABLE training_groups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(120) NOT NULL,
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    status              VARCHAR(6) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_training_groups_course ON training_groups(course_id);
CREATE TRIGGER trg_training_groups_updated BEFORE UPDATE ON training_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE enrollments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id            UUID NOT NULL REFERENCES training_groups(id) ON DELETE RESTRICT,
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    status              VARCHAR(9) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WITHDRAWN','COMPLETED')),
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    withdrawn_at        TIMESTAMPTZ,
    withdrawal_reason   VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_withdrawal_fields CHECK (
        (status <> 'WITHDRAWN') OR (withdrawn_at IS NOT NULL AND withdrawal_reason IS NOT NULL)
    )
);
COMMENT ON TABLE enrollments IS
    'A student may hold only one ACTIVE enrollment per course (409 DUPLICATE_RESOURCE) — enforced by the partial unique index below. A WITHDRAWN enrollment never becomes ACTIVE again (application-enforced state machine).';
CREATE UNIQUE INDEX uq_enrollments_active_per_course ON enrollments(student_id, course_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_enrollments_group ON enrollments(group_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================================
-- SECTION 13 — TRAINING SESSIONS, SHARED BAY CALENDAR, CONFLICT OVERRIDES
-- =====================================================================================

CREATE TABLE training_sessions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                       VARCHAR(160) NOT NULL,
    course_id                   UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    group_id                    UUID NOT NULL REFERENCES training_groups(id) ON DELETE RESTRICT,
    bay_id                      UUID NOT NULL REFERENCES bays(id) ON DELETE RESTRICT,
    mentor_id                   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    starts_at                   TIMESTAMPTZ NOT NULL,
    ends_at                     TIMESTAMPTZ NOT NULL,
    status                      VARCHAR(9) NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN ('DRAFT','PUBLISHED','COMPLETED','CANCELLED')),
    cancellation_reason         VARCHAR(500),
    version                     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_session_window CHECK (starts_at < ends_at)
);
COMMENT ON TABLE training_sessions IS
    'Publishing (DRAFT->PUBLISHED) re-validates the shared bay calendar server-side against active job_cards windows on the same bay, other PUBLISHED sessions, bay availability and mentor double-booking. Any change to bay/mentor/window invalidates prior conflict_overrides (see trigger).';
CREATE INDEX idx_sessions_bay_window ON training_sessions(bay_id, starts_at, ends_at)
    WHERE status IN ('PUBLISHED','COMPLETED');
CREATE INDEX idx_sessions_mentor_window ON training_sessions(mentor_id, starts_at, ends_at)
    WHERE status IN ('PUBLISHED','COMPLETED');
CREATE INDEX idx_sessions_course ON training_sessions(course_id);
CREATE INDEX idx_sessions_group ON training_sessions(group_id);
CREATE INDEX idx_sessions_status ON training_sessions(status);
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON training_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Overridable conflict authorizations, bound to exact conflict keys; voided by reassignment.
CREATE TABLE conflict_overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    conflict_key        VARCHAR(200) NOT NULL,
    reason              VARCHAR(500) NOT NULL CHECK (char_length(reason) >= 10),
    authorized_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    authorized_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at           TIMESTAMPTZ,
    CONSTRAINT uq_conflict_override UNIQUE (training_session_id, conflict_key)
);
COMMENT ON TABLE conflict_overrides IS
    'Only BAY_JOB_CONFLICT (overlap with an active workshop job) is overridable, granted by training.override-conflict (typically the workshop manager, not the publishing supervisor). voided_at is set by application logic whenever bay/mentor/window changes on the session.';
CREATE INDEX idx_conflict_overrides_session ON conflict_overrides(training_session_id) WHERE voided_at IS NULL;

-- =====================================================================================
-- SECTION 14 — ATTENDANCE, ASSESSMENTS, SIGN-OFF, COMPETENCY, CERTIFICATES
-- =====================================================================================

CREATE TABLE attendance_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    status              VARCHAR(7) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
    note                VARCHAR(300),
    recorded_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_attendance_session_student UNIQUE (session_id, student_id)
);
COMMENT ON TABLE attendance_records IS 'Bulk upsert target for PUT /training-sessions/{id}/attendance; changes are audited with before/after values in audit_events.';
CREATE INDEX idx_attendance_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE assessments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES training_sessions(id) ON DELETE RESTRICT,
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    task_id                 UUID NOT NULL REFERENCES practical_tasks(id) ON DELETE RESTRICT,
    course_id               UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    result                  VARCHAR(18) NOT NULL CHECK (result IN ('PASS','FAIL','NEEDS_IMPROVEMENT')),
    time_on_task_minutes    INTEGER NOT NULL CHECK (time_on_task_minutes BETWEEN 0 AND 1440),
    mentor_note             TEXT,
    assessed_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assessed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    sign_off_status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                                CHECK (sign_off_status IN ('PENDING','SIGNED_OFF','RETURNED')),
    signed_off_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    signed_off_at           TIMESTAMPTZ,
    sign_off_note           TEXT,
    counts_toward_completion BOOLEAN NOT NULL DEFAULT FALSE,
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_counts_only_when_signed_pass CHECK (
        (counts_toward_completion = TRUE AND sign_off_status = 'SIGNED_OFF' AND result = 'PASS')
        OR (counts_toward_completion = FALSE)
    ),
    CONSTRAINT chk_sign_off_by_distinct_from_assessor CHECK (signed_off_by IS DISTINCT FROM assessed_by),
    CONSTRAINT chk_returned_requires_note CHECK (sign_off_status <> 'RETURNED' OR sign_off_note IS NOT NULL)
);
COMMENT ON TABLE assessments IS
    'Unsigned results remain pending and are excluded from competency coverage/certification (WST-FR-11/12 completion rule). A SIGNED_OFF record is immutable (409 ASSESSMENT_LOCKED); a retake creates a new row rather than editing this one. chk_sign_off_by_distinct_from_assessor enforces separation of duties: the signer can never be the assessor.';
CREATE INDEX idx_assessments_student_course ON assessments(student_id, course_id);
CREATE INDEX idx_assessments_session ON assessments(session_id);
CREATE INDEX idx_assessments_task ON assessments(task_id);
CREATE INDEX idx_assessments_sign_off_status ON assessments(sign_off_status);
CREATE TRIGGER trg_assessments_updated BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Guard: a SIGNED_OFF assessment can never be edited again (ASSESSMENT_LOCKED).
CREATE OR REPLACE FUNCTION forbid_edit_signed_off_assessment()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.sign_off_status = 'SIGNED_OFF' THEN
        RAISE EXCEPTION 'Assessment % is signed off and immutable', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_assessments_lock_after_signoff
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION forbid_edit_signed_off_assessment();

CREATE TABLE assessment_evidence_attachments (
    assessment_id       UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    attachment_id       UUID NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
    PRIMARY KEY (assessment_id, attachment_id)
);

CREATE TABLE quality_check_evidence_attachments (
    quality_check_id    UUID NOT NULL REFERENCES quality_checks(id) ON DELETE CASCADE,
    attachment_id       UUID NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
    PRIMARY KEY (quality_check_id, attachment_id)
);

CREATE TABLE job_approval_evidence_attachments (
    approval_id         UUID NOT NULL REFERENCES job_approvals(id) ON DELETE CASCADE,
    attachment_id       UUID NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
    PRIMARY KEY (approval_id, attachment_id)
);

CREATE TABLE job_card_attachments (
    job_id              UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    attachment_id       UUID NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
    PRIMARY KEY (job_id, attachment_id)
);

CREATE SEQUENCE certificate_number_seq START 1;

CREATE TABLE certificates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number      VARCHAR(20) NOT NULL,
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    course_id               UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    enrollment_id           UUID NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
    issued_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_by               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                  VARCHAR(7) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','REVOKED')),
    revoked_at              TIMESTAMPTZ,
    revoked_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    revocation_reason       VARCHAR(500),
    -- The server stores only the SHA-256 hash of the public verification token, never the raw
    -- token, so a database leak alone cannot be used to forge/verify certificates.
    verification_token_hash CHAR(64) NOT NULL CHECK (verification_token_hash ~ '^[a-f0-9]{64}$'),
    idempotency_key         VARCHAR(128),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_certificate_number UNIQUE (certificate_number),
    CONSTRAINT uq_certificate_token_hash UNIQUE (verification_token_hash),
    CONSTRAINT chk_certificate_revocation_fields CHECK (
        (status = 'ISSUED' AND revoked_at IS NULL)
        OR (status = 'REVOKED' AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
    )
);
COMMENT ON TABLE certificates IS
    'One active certificate per enrollment (uq_certificates_one_active_per_enrollment). Public verification (verifyCertificate) looks up by hashing the presented token in constant time and comparing to verification_token_hash — never a plaintext token comparison.';
COMMENT ON COLUMN certificates.verification_token_hash IS 'SENSITIVE: hash only. The raw 256-bit token is generated once, returned to the caller, and never persisted.';
CREATE UNIQUE INDEX uq_certificates_one_active_per_enrollment ON certificates(enrollment_id) WHERE status = 'ISSUED';
CREATE UNIQUE INDEX uq_certificates_idempotency ON certificates(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_certificates_student ON certificates(student_id);
CREATE INDEX idx_certificates_course ON certificates(course_id);

-- =====================================================================================
-- SECTION 15 — DASHBOARDS / EXPORTS / PREDICTIONS  (WST-FR-13, WST-FR-14)
-- =====================================================================================

CREATE TABLE export_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    export_type         VARCHAR(30) NOT NULL CHECK (export_type IN (
                            'JOBS','LABOR_ENTRIES','PART_ISSUES','STOCK_BALANCES','STOCK_MOVEMENTS',
                            'PURCHASE_ORDERS','INVOICES','CUSTOMER_STATEMENT','ATTENDANCE','ASSESSMENTS',
                            'CERTIFICATES','REORDER_SUGGESTIONS','TRAINING_RISK','DASHBOARD_WORKSHOP',
                            'DASHBOARD_INVENTORY_FINANCE','DASHBOARD_TRAINING','DASHBOARD_AI_DATA','AUDIT_EVENTS')),
    format              VARCHAR(3) NOT NULL CHECK (format IN ('CSV','PDF')),
    status              VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','EXPIRED')),
    filters             JSONB NOT NULL DEFAULT '{}'::jsonb,
    filter_fingerprint  CHAR(64) NOT NULL,
    sensitive           BOOLEAN NOT NULL DEFAULT FALSE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,   -- required only for CUSTOMER_STATEMENT
    row_count           INTEGER CHECK (row_count IS NULL OR row_count >= 0),
    object_storage_key  TEXT,
    failure_message     TEXT,
    completed_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE export_jobs IS
    'filter_fingerprint is a deterministic hash of the effective filters + caller scope, letting an export be reconciled against a dashboard call with identical filters (WST-FR-13 reconciliation rule).';
CREATE INDEX idx_export_jobs_requester ON export_jobs(requested_by, created_at DESC);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE TRIGGER trg_export_jobs_updated BEFORE UPDATE ON export_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE download_authorizations
    ADD CONSTRAINT fk_download_auth_export FOREIGN KEY (export_job_id)
        REFERENCES export_jobs(id) ON DELETE CASCADE;

CREATE TABLE predictions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type                        VARCHAR(20) NOT NULL CHECK (type IN ('REORDER_SUGGESTION','TRAINING_RISK')),
    status                      VARCHAR(11) NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','ACCEPTED','OVERRIDDEN','DISMISSED','SUPERSEDED')),
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_kind                 VARCHAR(12) NOT NULL CHECK (source_kind IN ('RULE_BASELINE','ML_MODEL')),
    source_name                 VARCHAR(100) NOT NULL,
    source_version               VARCHAR(40) NOT NULL,
    explanation_summary         TEXT NOT NULL,
    explanation_factors         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- REORDER_SUGGESTION fields
    store_id                    UUID REFERENCES stores(id) ON DELETE CASCADE,
    part_id                     UUID REFERENCES parts(id) ON DELETE CASCADE,
    reorder_input               JSONB,
    reorder_suggested_quantity  INTEGER CHECK (reorder_suggested_quantity IS NULL OR reorder_suggested_quantity >= 1),
    reorder_estimated_weeks_of_cover NUMERIC(10,2),
    -- TRAINING_RISK fields
    student_id                  UUID REFERENCES students(id) ON DELETE CASCADE,
    course_id                   UUID REFERENCES courses(id) ON DELETE CASCADE,
    risk_input                  JSONB,
    risk_level                  VARCHAR(6) CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    risk_flags                  JSONB,
    -- decision bookkeeping (advisory only — never triggers an action by itself)
    decision                    VARCHAR(10) CHECK (decision IN ('ACCEPTED','OVERRIDDEN','DISMISSED')),
    decided_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at                  TIMESTAMPTZ,
    override_reason             VARCHAR(500),
    override_quantity           INTEGER CHECK (override_quantity IS NULL OR override_quantity >= 0),
    decision_note               VARCHAR(500),
    evaluation_outcome          VARCHAR(15) DEFAULT 'PENDING'
                                    CHECK (evaluation_outcome IN ('PENDING','CONFIRMED','NOT_CONFIRMED','NOT_APPLICABLE')),
    evaluated_at                TIMESTAMPTZ,
    evaluation_note             VARCHAR(500),
    CONSTRAINT chk_prediction_type_fields CHECK (
        (type = 'REORDER_SUGGESTION' AND store_id IS NOT NULL AND part_id IS NOT NULL
            AND reorder_suggested_quantity IS NOT NULL AND student_id IS NULL AND course_id IS NULL)
        OR
        (type = 'TRAINING_RISK' AND student_id IS NOT NULL AND course_id IS NOT NULL
            AND risk_level IS NOT NULL AND store_id IS NULL AND part_id IS NULL)
    ),
    CONSTRAINT chk_prediction_decision_fields CHECK (
        (status = 'ACTIVE' AND decision IS NULL)
        OR (status <> 'ACTIVE' AND decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT chk_override_reason_required CHECK (decision <> 'OVERRIDDEN' OR override_reason IS NOT NULL)
);
COMMENT ON TABLE predictions IS
    'advisory_only is a hard product invariant, not a column: this table never places a purchase order, grades or certifies a student, or makes a safety decision by itself — decisions here are bookkeeping only, and the actual purchasing/grading action is a separate, independently-authorized write elsewhere (WST-FR-14).';
CREATE INDEX idx_predictions_type_status ON predictions(type, status);
CREATE INDEX idx_predictions_store_part ON predictions(store_id, part_id) WHERE type = 'REORDER_SUGGESTION';
CREATE INDEX idx_predictions_student_course ON predictions(student_id, course_id) WHERE type = 'TRAINING_RISK';
CREATE INDEX idx_predictions_generated_at ON predictions(generated_at DESC);

ALTER TABLE purchase_orders
    ADD CONSTRAINT fk_po_source_prediction FOREIGN KEY (source_prediction_id)
        REFERENCES predictions(id) ON DELETE SET NULL;
CREATE INDEX idx_po_source_prediction ON purchase_orders(source_prediction_id);

CREATE TABLE prediction_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type                VARCHAR(20) NOT NULL CHECK (type IN ('REORDER_SUGGESTION','TRAINING_RISK')),
    source_kind         VARCHAR(12) NOT NULL CHECK (source_kind IN ('RULE_BASELINE','ML_MODEL')),
    source_name         VARCHAR(100) NOT NULL,
    source_version      VARCHAR(40) NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ,
    generated_count     INTEGER NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
    ml_service_status   VARCHAR(25) NOT NULL DEFAULT 'NOT_ENABLED'
                            CHECK (ml_service_status IN ('NOT_ENABLED','AVAILABLE','UNAVAILABLE_FALLBACK_USED')),
    triggered_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
COMMENT ON TABLE prediction_runs IS 'The rule baseline always runs; ml_service_status=UNAVAILABLE_FALLBACK_USED records exactly the required fallback event for the AI release gate.';
CREATE INDEX idx_prediction_runs_type ON prediction_runs(type, started_at DESC);

-- =====================================================================================
-- SECTION 16 — AUDIT (immutable, append-only)  — Common Pack Auditability NFR, WST-FR-01/05/06
-- =====================================================================================

CREATE TABLE audit_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_roles         VARCHAR(40)[] NOT NULL DEFAULT '{}',
    action              VARCHAR(120) NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)*$'),
    entity_type         VARCHAR(60) NOT NULL CHECK (entity_type ~ '^[A-Z][A-Z0-9_]*$'),
    entity_id           UUID,
    outcome             VARCHAR(7) NOT NULL CHECK (outcome IN ('SUCCESS','DENIED','FAILED')),
    request_id          VARCHAR(64) NOT NULL,
    summary             TEXT,
    -- Field-level before/after diff, e.g. [{"field": "...", "before": "...", "after": "..."}].
    -- Sensitive values (passwords, tokens, PII beyond what's necessary) must be redacted by
    -- the application before this row is written — the schema cannot see raw values to redact.
    changes             JSONB
);
COMMENT ON TABLE audit_events IS
    'APPEND-ONLY (see trigger). Central record of every important mutation, approval, role change, prediction decision, and sensitive read (attachment/export download authorization, audit reads themselves). Reading this table is itself audited by the application, per the OpenAPI contract.';
CREATE INDEX idx_audit_events_occurred_at ON audit_events(occurred_at DESC);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_action ON audit_events(action);
CREATE INDEX idx_audit_events_outcome ON audit_events(outcome);
CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- =====================================================================================
-- SECTION 17 — SEED / REFERENCE DATA: roles, permissions, role_permissions
-- (matches x-role-permissions in the frozen OpenAPI contract exactly)
-- =====================================================================================

INSERT INTO roles (code, description) VALUES
    ('SYSTEM_ADMIN',            'Manages users, roles, reference data, configuration and audit review.'),
    ('WORKSHOP_MANAGER',        'Configures services, bays, technicians, approvals, KPIs and operational oversight.'),
    ('SERVICE_ADVISOR',         'Registers customers/vehicles, opens job cards, records approvals, communicates status.'),
    ('TECHNICIAN',              'Performs assigned work, logs labor and parts, uploads evidence.'),
    ('QUALITY_CHECKER',         'Performs quality checks, distinct permission from job execution.'),
    ('STOREKEEPER_PROCUREMENT', 'Maintains parts, stock, vendors, purchase orders, approvals and goods receipts.'),
    ('MENTOR',                  'Schedules/assists sessions, records attendance and assessments.'),
    ('TRAINING_SUPERVISOR',     'Manages training, publishes sessions, signs off assessments, issues certificates.'),
    ('STUDENT',                 'Views own sessions, attendance, tasks, results, competencies and certificates.'),
    ('FINANCE_VIEWER_AUDITOR',  'Read-only view of invoices, purchasing, inventory cost and audit history.');

INSERT INTO permissions (code) VALUES
    ('users.read'),('users.manage'),('roles.assign'),('scopes.manage'),('config.read'),('config.manage'),
    ('audit.read'),('customers.read'),('customers.write'),('vehicles.read'),('vehicles.write'),
    ('jobs.read'),('jobs.read.assigned'),('jobs.create'),('jobs.update'),('jobs.assign'),
    ('jobs.transition.start'),('jobs.transition.submit-qc'),('jobs.transition.ready'),('jobs.transition.deliver'),
    ('quality.perform'),('approvals.read'),('approvals.record'),('labor.read'),('labor.write'),
    ('bays.read'),('bays.manage'),('parts.read'),('parts.write'),('stores.manage'),
    ('inventory.read'),('inventory.cost.read'),('inventory.issue'),('inventory.reverse'),
    ('inventory.adjust'),('inventory.adjust.approve'),('vendors.read'),('vendors.write'),
    ('purchasing.read'),('purchasing.create'),('purchasing.approve'),('purchasing.receive'),
    ('invoices.read'),('invoices.manage'),('payments.record'),
    ('training.read'),('training.manage'),('training.publish'),('training.override-conflict'),
    ('training.attendance.record'),('training.assess'),('training.signoff'),
    ('certificates.issue'),('certificates.revoke'),('attachments.upload'),
    ('dashboards.workshop'),('dashboards.inventory-finance'),('dashboards.training'),('dashboards.ai-data'),
    ('exports.create'),('exports.read'),
    ('predictions.reorder.read'),('predictions.reorder.decide'),('predictions.risk.read'),('predictions.risk.decide'),
    ('students.self');

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('SYSTEM_ADMIN','users.read'),('SYSTEM_ADMIN','users.manage'),('SYSTEM_ADMIN','roles.assign'),
    ('SYSTEM_ADMIN','scopes.manage'),('SYSTEM_ADMIN','config.read'),('SYSTEM_ADMIN','config.manage'),
    ('SYSTEM_ADMIN','audit.read'),

    ('WORKSHOP_MANAGER','customers.read'),('WORKSHOP_MANAGER','vehicles.read'),('WORKSHOP_MANAGER','jobs.read'),
    ('WORKSHOP_MANAGER','jobs.update'),('WORKSHOP_MANAGER','jobs.assign'),
    ('WORKSHOP_MANAGER','jobs.transition.start'),('WORKSHOP_MANAGER','jobs.transition.submit-qc'),
    ('WORKSHOP_MANAGER','jobs.transition.ready'),('WORKSHOP_MANAGER','jobs.transition.deliver'),
    ('WORKSHOP_MANAGER','approvals.read'),('WORKSHOP_MANAGER','labor.read'),('WORKSHOP_MANAGER','bays.read'),
    ('WORKSHOP_MANAGER','bays.manage'),('WORKSHOP_MANAGER','parts.read'),('WORKSHOP_MANAGER','inventory.read'),
    ('WORKSHOP_MANAGER','inventory.cost.read'),('WORKSHOP_MANAGER','inventory.reverse'),
    ('WORKSHOP_MANAGER','inventory.adjust.approve'),('WORKSHOP_MANAGER','vendors.read'),
    ('WORKSHOP_MANAGER','purchasing.read'),('WORKSHOP_MANAGER','purchasing.approve'),
    ('WORKSHOP_MANAGER','invoices.read'),('WORKSHOP_MANAGER','invoices.manage'),('WORKSHOP_MANAGER','config.read'),
    ('WORKSHOP_MANAGER','training.read'),('WORKSHOP_MANAGER','training.override-conflict'),
    ('WORKSHOP_MANAGER','attachments.upload'),('WORKSHOP_MANAGER','dashboards.workshop'),
    ('WORKSHOP_MANAGER','dashboards.inventory-finance'),('WORKSHOP_MANAGER','dashboards.ai-data'),
    ('WORKSHOP_MANAGER','exports.create'),('WORKSHOP_MANAGER','exports.read'),
    ('WORKSHOP_MANAGER','predictions.reorder.read'),

    ('SERVICE_ADVISOR','customers.read'),('SERVICE_ADVISOR','customers.write'),('SERVICE_ADVISOR','vehicles.read'),
    ('SERVICE_ADVISOR','vehicles.write'),('SERVICE_ADVISOR','jobs.read'),('SERVICE_ADVISOR','jobs.create'),
    ('SERVICE_ADVISOR','jobs.update'),('SERVICE_ADVISOR','jobs.transition.deliver'),
    ('SERVICE_ADVISOR','approvals.read'),('SERVICE_ADVISOR','approvals.record'),
    ('SERVICE_ADVISOR','invoices.read'),('SERVICE_ADVISOR','invoices.manage'),('SERVICE_ADVISOR','payments.record'),
    ('SERVICE_ADVISOR','bays.read'),('SERVICE_ADVISOR','attachments.upload'),('SERVICE_ADVISOR','config.read'),

    ('TECHNICIAN','jobs.read.assigned'),('TECHNICIAN','jobs.transition.start'),
    ('TECHNICIAN','jobs.transition.submit-qc'),('TECHNICIAN','approvals.read'),('TECHNICIAN','labor.read'),
    ('TECHNICIAN','labor.write'),('TECHNICIAN','parts.read'),('TECHNICIAN','inventory.read'),
    ('TECHNICIAN','inventory.issue'),('TECHNICIAN','attachments.upload'),('TECHNICIAN','bays.read'),

    ('QUALITY_CHECKER','jobs.read'),('QUALITY_CHECKER','quality.perform'),
    ('QUALITY_CHECKER','jobs.transition.ready'),('QUALITY_CHECKER','approvals.read'),
    ('QUALITY_CHECKER','labor.read'),('QUALITY_CHECKER','parts.read'),('QUALITY_CHECKER','inventory.read'),
    ('QUALITY_CHECKER','attachments.upload'),('QUALITY_CHECKER','bays.read'),

    ('STOREKEEPER_PROCUREMENT','parts.read'),('STOREKEEPER_PROCUREMENT','parts.write'),
    ('STOREKEEPER_PROCUREMENT','stores.manage'),('STOREKEEPER_PROCUREMENT','inventory.read'),
    ('STOREKEEPER_PROCUREMENT','inventory.cost.read'),('STOREKEEPER_PROCUREMENT','inventory.reverse'),
    ('STOREKEEPER_PROCUREMENT','inventory.adjust'),('STOREKEEPER_PROCUREMENT','vendors.read'),
    ('STOREKEEPER_PROCUREMENT','vendors.write'),('STOREKEEPER_PROCUREMENT','purchasing.read'),
    ('STOREKEEPER_PROCUREMENT','purchasing.create'),('STOREKEEPER_PROCUREMENT','purchasing.receive'),
    ('STOREKEEPER_PROCUREMENT','attachments.upload'),('STOREKEEPER_PROCUREMENT','dashboards.inventory-finance'),
    ('STOREKEEPER_PROCUREMENT','dashboards.ai-data'),('STOREKEEPER_PROCUREMENT','exports.create'),
    ('STOREKEEPER_PROCUREMENT','exports.read'),('STOREKEEPER_PROCUREMENT','predictions.reorder.read'),
    ('STOREKEEPER_PROCUREMENT','predictions.reorder.decide'),

    ('MENTOR','training.read'),('MENTOR','training.attendance.record'),('MENTOR','training.assess'),
    ('MENTOR','attachments.upload'),('MENTOR','bays.read'),('MENTOR','predictions.risk.read'),

    ('TRAINING_SUPERVISOR','training.read'),('TRAINING_SUPERVISOR','training.manage'),
    ('TRAINING_SUPERVISOR','training.publish'),('TRAINING_SUPERVISOR','training.attendance.record'),
    ('TRAINING_SUPERVISOR','training.signoff'),('TRAINING_SUPERVISOR','certificates.issue'),
    ('TRAINING_SUPERVISOR','certificates.revoke'),('TRAINING_SUPERVISOR','bays.read'),
    ('TRAINING_SUPERVISOR','attachments.upload'),('TRAINING_SUPERVISOR','dashboards.training'),
    ('TRAINING_SUPERVISOR','dashboards.ai-data'),('TRAINING_SUPERVISOR','exports.create'),
    ('TRAINING_SUPERVISOR','exports.read'),('TRAINING_SUPERVISOR','predictions.risk.read'),
    ('TRAINING_SUPERVISOR','predictions.risk.decide'),

    ('STUDENT','students.self'),

    ('FINANCE_VIEWER_AUDITOR','invoices.read'),('FINANCE_VIEWER_AUDITOR','purchasing.read'),
    ('FINANCE_VIEWER_AUDITOR','inventory.read'),('FINANCE_VIEWER_AUDITOR','inventory.cost.read'),
    ('FINANCE_VIEWER_AUDITOR','audit.read'),('FINANCE_VIEWER_AUDITOR','dashboards.workshop'),
    ('FINANCE_VIEWER_AUDITOR','dashboards.inventory-finance'),('FINANCE_VIEWER_AUDITOR','exports.create'),
    ('FINANCE_VIEWER_AUDITOR','exports.read');

-- Seed a default singleton configuration row so the app has something to read on first boot.
INSERT INTO finance_settings (currency_code, labor_hourly_rate, tax_rate_percent, tax_label)
    VALUES ('EGP', 150.0000, 14.000, 'VAT');
INSERT INTO purchase_approval_policy (currency_code) VALUES ('EGP');
INSERT INTO purchase_approval_tiers (policy_id, minimum_total, required_approvals) VALUES
    (TRUE, 0.0000, 1),
    (TRUE, 20000.0000, 2);
INSERT INTO prediction_settings DEFAULT VALUES;

-- =====================================================================================
-- SECTION 18 — LEAST-PRIVILEGE APPLICATION ROLE (infrastructure hook)
-- =====================================================================================
-- The application connects as a role with normal DML rights but no ability to bypass the
-- append-only guards above (those are enforced by trigger regardless of grantee, including
-- table owners, unless the role has BYPASSRLS/superuser — so deployment must ensure the
-- application role is a plain, non-superuser role).
--
-- Example (uncomment and adapt during deployment; left inert here to avoid failing on
-- environments where the role/password must be provisioned via secrets management):
--
-- CREATE ROLE wst_app LOGIN PASSWORD :'wst_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- GRANT USAGE ON SCHEMA public TO wst_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wst_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wst_app;
-- REVOKE DELETE ON job_stage_events, stock_movements, purchase_approvals, goods_receipts,
--     part_issue_reversals, quality_checks, audit_events FROM wst_app;

COMMIT;

-- =====================================================================================
-- END OF SCRIPT
-- =====================================================================================
