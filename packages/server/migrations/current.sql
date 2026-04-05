-- Platform schema: WP-1 foundation
-- Tables: legal_entity, user_account, RBAC, ITAR compartments, audit_entry,
--         authn_sessions, authn_identity_links
-- user_account: MFA + lockout columns (mfa_totp_secret, mfa_enabled, failed_login_count, locked_until)
-- Audit trigger: audit_stamp() + trigger on legal_entity (sentinel)
-- Ref: SD-002-data-model.md §3.1–3.3, SD-004-authn-provider-abstraction.md §6
-- Issues: hx-369c3437, hx-c3e547b2, hx-96f7639a

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 Entity & Organization
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_entity (
	id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code               VARCHAR(20)  NOT NULL UNIQUE,
	name               VARCHAR(255) NOT NULL,
	country_code       CHAR(2)      NOT NULL,
	base_currency_code CHAR(3)      NOT NULL,
	tax_id             VARCHAR(50),
	parent_entity_id   UUID         REFERENCES legal_entity(id),
	is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
	ext                JSONB        NOT NULL DEFAULT '{}'::jsonb,
	created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by         UUID         NOT NULL,
	updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by         UUID         NOT NULL,
	version            INTEGER      NOT NULL DEFAULT 1,
	deleted_at         TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 Users & Access Control
-- ─────────────────────────────────────────────────────────────────────────────

-- user_account created before FKs so legal_entity and user_account can
-- reference it. The self-referential created_by/updated_by is valid for
-- the system bootstrap record.
CREATE TABLE IF NOT EXISTS user_account (
	id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	external_id   VARCHAR(255) UNIQUE,
	email         VARCHAR(255) NOT NULL UNIQUE,
	display_name  VARCHAR(255) NOT NULL,
	is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
	last_login_at TIMESTAMPTZ,
	ext           JSONB        NOT NULL DEFAULT '{}'::jsonb,
	created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by    UUID         NOT NULL,
	updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by    UUID         NOT NULL,
	version       INTEGER      NOT NULL DEFAULT 1,
	deleted_at    TIMESTAMPTZ
);

-- Add FK from legal_entity to user_account now that the table exists
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'legal_entity_created_by_fk'
	) THEN
		ALTER TABLE legal_entity
			ADD CONSTRAINT legal_entity_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id),
			ADD CONSTRAINT legal_entity_updated_by_fk FOREIGN KEY (updated_by) REFERENCES user_account(id);
	END IF;
END $$;

-- Self-referential FK on user_account
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'user_account_created_by_fk'
	) THEN
		ALTER TABLE user_account
			ADD CONSTRAINT user_account_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id),
			ADD CONSTRAINT user_account_updated_by_fk FOREIGN KEY (updated_by) REFERENCES user_account(id);
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS role (
	id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code        VARCHAR(50)  NOT NULL UNIQUE,
	name        VARCHAR(100) NOT NULL,
	description TEXT,
	is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
	created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by  UUID         NOT NULL REFERENCES user_account(id),
	updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by  UUID         NOT NULL REFERENCES user_account(id),
	version     INTEGER      NOT NULL DEFAULT 1,
	deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS permission (
	id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code        VARCHAR(100) NOT NULL UNIQUE,
	module      VARCHAR(50)  NOT NULL,
	description TEXT,
	created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by  UUID         NOT NULL REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS role_permission (
	role_id       UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
	permission_id UUID NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
	PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_role (
	id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID        NOT NULL REFERENCES user_account(id),
	role_id    UUID        NOT NULL REFERENCES role(id),
	entity_id  UUID        REFERENCES legal_entity(id),
	granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	granted_by UUID        NOT NULL REFERENCES user_account(id),
	revoked_at TIMESTAMPTZ
);
-- Active unique: one active assignment per (user, role, entity)
CREATE UNIQUE INDEX IF NOT EXISTS user_role_active_uq
	ON user_role (user_id, role_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
	WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS itar_compartment (
	id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code                 VARCHAR(50)  NOT NULL UNIQUE,
	name                 VARCHAR(255) NOT NULL,
	description          TEXT,
	classification_level VARCHAR(50)  NOT NULL,
	is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by           UUID         NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by           UUID         NOT NULL REFERENCES user_account(id),
	version              INTEGER      NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS role_assignment (
	id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID        NOT NULL REFERENCES user_account(id),
	role_id         UUID        NOT NULL REFERENCES role(id),
	entity_id       UUID        REFERENCES legal_entity(id),
	compartment_id  UUID        REFERENCES itar_compartment(id),
	effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
	effective_until TIMESTAMPTZ,
	granted_by      UUID        NOT NULL REFERENCES user_account(id),
	revoked_at      TIMESTAMPTZ,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by      UUID        NOT NULL REFERENCES user_account(id),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_by      UUID        NOT NULL REFERENCES user_account(id),
	version         INTEGER     NOT NULL DEFAULT 1,
	CONSTRAINT role_assignment_effective_chk
		CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS role_assignment_active_uq
	ON role_assignment (
		user_id,
		role_id,
		COALESCE(entity_id,      '00000000-0000-0000-0000-000000000000'::uuid),
		COALESCE(compartment_id, '00000000-0000-0000-0000-000000000000'::uuid)
	)
	WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_entity_access (
	id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID        NOT NULL REFERENCES user_account(id),
	entity_id  UUID        NOT NULL REFERENCES legal_entity(id),
	is_default BOOLEAN     NOT NULL DEFAULT FALSE,
	granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	granted_by UUID        NOT NULL REFERENCES user_account(id),
	UNIQUE (user_id, entity_id)
);

CREATE TABLE IF NOT EXISTS user_compartment_access (
	id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id        UUID        NOT NULL REFERENCES user_account(id),
	compartment_id UUID        NOT NULL REFERENCES itar_compartment(id),
	granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	granted_by     UUID        NOT NULL REFERENCES user_account(id),
	expires_at     TIMESTAMPTZ,
	revoked_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS user_compartment_active_uq
	ON user_compartment_access (user_id, compartment_id)
	WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 Audit Log  (append-only, range-partitioned by month)
-- Ref: ADR-004
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_entry (
	id             UUID         NOT NULL DEFAULT gen_random_uuid(),
	entity_id      UUID         REFERENCES legal_entity(id),
	table_name     VARCHAR(100) NOT NULL,
	record_id      UUID         NOT NULL,
	action         VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
	old_value      JSONB,
	new_value      JSONB,
	changed_fields TEXT[],
	user_id        UUID         NOT NULL,
	user_email     VARCHAR(255),
	chain_hash     BYTEA,
	ip_address     INET,
	user_agent     VARCHAR(500),
	correlation_id UUID,
	occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
	PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Initial monthly partitions (2026 Q2)
CREATE TABLE IF NOT EXISTS audit_entry_2026_04
	PARTITION OF audit_entry
	FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS audit_entry_2026_05
	PARTITION OF audit_entry
	FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS audit_entry_2026_06
	PARTITION OF audit_entry
	FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Immutability trigger: no UPDATE or DELETE on audit_entry
CREATE OR REPLACE FUNCTION audit_entry_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_entry rows are immutable — UPDATE and DELETE are not allowed (ADR-004)';
END;
$$;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_entry_no_update'
	) THEN
		CREATE TRIGGER audit_entry_no_update
			BEFORE UPDATE ON audit_entry
			FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();
	END IF;
END $$;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_entry_no_delete'
	) THEN
		CREATE TRIGGER audit_entry_no_delete
			BEFORE DELETE ON audit_entry
			FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();
	END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data  (dev — idempotent via ON CONFLICT DO NOTHING)
-- 1 system user, 3 legal entities, 5 roles, 5 seed users, entity access grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
	system_id          UUID := '00000000-0000-0000-0000-000000000001'::uuid;
	us_id              UUID := '10000000-0000-0000-0000-000000000001'::uuid;
	uk_id              UUID := '10000000-0000-0000-0000-000000000002'::uuid;
	sg_id              UUID := '10000000-0000-0000-0000-000000000003'::uuid;
	role_admin_id      UUID := '20000000-0000-0000-0000-000000000001'::uuid;
	role_finance_id    UUID := '20000000-0000-0000-0000-000000000002'::uuid;
	role_sales_id      UUID := '20000000-0000-0000-0000-000000000003'::uuid;
	role_compliance_id UUID := '20000000-0000-0000-0000-000000000004'::uuid;
	role_readonly_id   UUID := '20000000-0000-0000-0000-000000000005'::uuid;
	user_admin_id      UUID := '30000000-0000-0000-0000-000000000001'::uuid;
	user_finance_id    UUID := '30000000-0000-0000-0000-000000000002'::uuid;
	user_sales_id      UUID := '30000000-0000-0000-0000-000000000003'::uuid;
	user_compliance_id UUID := '30000000-0000-0000-0000-000000000004'::uuid;
	user_readonly_id   UUID := '30000000-0000-0000-0000-000000000005'::uuid;
BEGIN
	-- System user (self-referential: created_by = own id)
	INSERT INTO user_account (id, email, display_name, is_active, created_by, updated_by)
	VALUES (system_id, 'system@apogee.internal', 'System', TRUE, system_id, system_id)
	ON CONFLICT (id) DO NOTHING;

	-- 3 legal entities
	INSERT INTO legal_entity (id, code, name, country_code, base_currency_code, created_by, updated_by)
	VALUES
		(us_id, 'SATCO-US', 'Satellite Corp USA Inc.',          'US', 'USD', system_id, system_id),
		(uk_id, 'SATCO-UK', 'Satellite Corp UK Ltd.',           'GB', 'GBP', system_id, system_id),
		(sg_id, 'SATCO-SG', 'Satellite Corp Singapore Pte.',    'SG', 'SGD', system_id, system_id)
	ON CONFLICT (id) DO NOTHING;

	-- UK and SG are subsidiaries of US
	UPDATE legal_entity
	SET parent_entity_id = us_id
	WHERE id IN (uk_id, sg_id) AND parent_entity_id IS NULL;

	-- 5 system roles
	INSERT INTO role (id, code, name, description, is_system, created_by, updated_by)
	VALUES
		(role_admin_id,      'admin',      'Administrator',      'Full system access',                    TRUE, system_id, system_id),
		(role_finance_id,    'finance',    'Finance User',       'GL, AP, AR, reporting access',          TRUE, system_id, system_id),
		(role_sales_id,      'sales',      'Sales User',         'CRM, quotes, orders access',            TRUE, system_id, system_id),
		(role_compliance_id, 'compliance', 'Compliance Officer', 'Export control and screening access',   TRUE, system_id, system_id),
		(role_readonly_id,   'read_only',  'Read-Only',          'View access across all modules',        TRUE, system_id, system_id)
	ON CONFLICT (id) DO NOTHING;

	-- 5 seed users
	INSERT INTO user_account (id, email, display_name, is_active, created_by, updated_by)
	VALUES
		(user_admin_id,      'admin@satco.example',      'Alice Admin',     TRUE, system_id, system_id),
		(user_finance_id,    'finance@satco.example',    'Bob Finance',     TRUE, system_id, system_id),
		(user_sales_id,      'sales@satco.example',      'Carol Sales',     TRUE, system_id, system_id),
		(user_compliance_id, 'compliance@satco.example', 'Dave Compliance', TRUE, system_id, system_id),
		(user_readonly_id,   'readonly@satco.example',   'Eve ReadOnly',    TRUE, system_id, system_id)
	ON CONFLICT (id) DO NOTHING;

	-- Global role assignments for seed users (no entity scope = global)
	INSERT INTO user_role (user_id, role_id, granted_by)
	VALUES
		(user_admin_id,      role_admin_id,      system_id),
		(user_finance_id,    role_finance_id,    system_id),
		(user_sales_id,      role_sales_id,      system_id),
		(user_compliance_id, role_compliance_id, system_id),
		(user_readonly_id,   role_readonly_id,   system_id)
	ON CONFLICT DO NOTHING;

	-- Grant all 5 seed users access to all 3 entities; SATCO-US is default
	INSERT INTO user_entity_access (user_id, entity_id, is_default, granted_by)
	SELECT u.id, e.id, (e.id = us_id), system_id
	FROM user_account u CROSS JOIN legal_entity e
	WHERE u.id IN (user_admin_id, user_finance_id, user_sales_id, user_compliance_id, user_readonly_id)
	ON CONFLICT (user_id, entity_id) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit trigger: audit_stamp()
--
-- Generic AFTER trigger that records every INSERT/UPDATE/DELETE into
-- audit_entry.  The application layer must call set_config() to set actor
-- context before any mutation:
--
--   SELECT set_config('app.actor_id',    '<uuid>', TRUE),
--          set_config('app.actor_email', 'user@…', TRUE),
--          set_config('app.entity_id',   '<uuid>', TRUE);
--
-- Use set_config(..., TRUE) so the settings are transaction-local (equivalent
-- to SET LOCAL).  The helper setAuditContext() in audit-context.ts wraps this.
--
-- Trigger is applied to legal_entity as the sentinel platform table.
-- All WP-2+ business tables should add the same trigger.
--
-- Issue: hx-c3e547b2
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_stamp() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
	v_actor_id       UUID;
	v_actor_email    VARCHAR(255);
	v_entity_id      UUID;
	v_record_id      UUID;
	v_old_value      JSONB;
	v_new_value      JSONB;
	v_changed_fields TEXT[];
BEGIN
	-- Read transaction-local actor context set by the application layer.
	v_actor_id    := nullif(current_setting('app.actor_id',    TRUE), '')::UUID;
	v_actor_email := nullif(current_setting('app.actor_email', TRUE), '');
	v_entity_id   := nullif(current_setting('app.entity_id',   TRUE), '')::UUID;

	IF v_actor_id IS NULL THEN
		RAISE EXCEPTION
			'audit_stamp: app.actor_id is not set — wrap mutation in setAuditContext() (hx-c3e547b2)';
	END IF;

	IF TG_OP = 'DELETE' THEN
		v_record_id      := (row_to_json(OLD) ->> 'id')::UUID;
		v_old_value      := to_jsonb(OLD);
		v_new_value      := NULL;
		v_changed_fields := NULL;
	ELSIF TG_OP = 'INSERT' THEN
		v_record_id      := (row_to_json(NEW) ->> 'id')::UUID;
		v_old_value      := NULL;
		v_new_value      := to_jsonb(NEW);
		v_changed_fields := NULL;
	ELSE  -- UPDATE
		v_record_id := (row_to_json(NEW) ->> 'id')::UUID;
		v_old_value := to_jsonb(OLD);
		v_new_value := to_jsonb(NEW);
		SELECT array_agg(key) INTO v_changed_fields
		FROM   jsonb_each(to_jsonb(NEW)) AS n(key, val)
		WHERE  to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key;
	END IF;

	INSERT INTO audit_entry (
		entity_id, table_name, record_id, action,
		old_value, new_value, changed_fields,
		user_id, user_email
	) VALUES (
		v_entity_id, TG_TABLE_NAME, v_record_id, TG_OP,
		v_old_value, v_new_value, v_changed_fields,
		v_actor_id, v_actor_email
	);

	RETURN NULL;  -- AFTER trigger return value is ignored
END;
$$;

-- Apply audit_stamp to legal_entity as the platform sentinel table.
-- All downstream WP business tables should add the same trigger via:
--   CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION audit_stamp();
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgname = 'audit_stamp' AND tgrelid = 'legal_entity'::regclass
	) THEN
		CREATE TRIGGER audit_stamp
			AFTER INSERT OR UPDATE OR DELETE ON legal_entity
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-4: Procurement Schema
-- Tables: inventory_item, inventory_location, lot, serial_number,
--         inventory_level, vendor, vendor_contact, vendor_address,
--         vendor_bank_account, purchase_order, purchase_order_line,
--         goods_receipt, goods_receipt_line
-- Ref: SD-002-data-model.md §5
-- Issue: hx-a6806af7
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 Inventory Master
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_item (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	item_code            VARCHAR(30)   NOT NULL,
	name                 VARCHAR(255)  NOT NULL,
	description          TEXT,
	category             VARCHAR(50),
	unit_of_measure      VARCHAR(20)   NOT NULL,
	is_serialized        BOOLEAN       NOT NULL DEFAULT FALSE,
	is_lot_tracked       BOOLEAN       NOT NULL DEFAULT FALSE,
	standard_cost        NUMERIC(19,6),
	cost_currency_code   CHAR(3),
	reorder_point        NUMERIC(16,4),
	reorder_quantity     NUMERIC(16,4),
	itar_compartment_id  UUID          REFERENCES itar_compartment(id),
	is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
	ext                  JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by           UUID          NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by           UUID          NOT NULL REFERENCES user_account(id),
	version              INTEGER       NOT NULL DEFAULT 1,
	deleted_at           TIMESTAMPTZ,
	UNIQUE (entity_id, item_code)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'inventory_item'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON inventory_item
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_location (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	location_code        VARCHAR(30)   NOT NULL,
	name                 VARCHAR(255)  NOT NULL,
	address              JSONB,
	is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
	itar_compartment_id  UUID          REFERENCES itar_compartment(id),
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by           UUID          NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by           UUID          NOT NULL REFERENCES user_account(id),
	version              INTEGER       NOT NULL DEFAULT 1,
	UNIQUE (entity_id, location_code)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'inventory_location'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON inventory_location
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

-- lot must be created before inventory_level and serial_number (FK targets)
CREATE TABLE IF NOT EXISTS lot (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	inventory_item_id    UUID          NOT NULL REFERENCES inventory_item(id),
	lot_number           VARCHAR(50)   NOT NULL,
	manufacture_date     DATE,
	expiry_date          DATE,
	supplier_lot_number  VARCHAR(50),
	status               VARCHAR(20)   NOT NULL DEFAULT 'AVAILABLE'
		CHECK (status IN ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'CONSUMED')),
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by           UUID          NOT NULL REFERENCES user_account(id),
	UNIQUE (entity_id, inventory_item_id, lot_number)
);

CREATE TABLE IF NOT EXISTS serial_number (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	inventory_item_id    UUID          NOT NULL REFERENCES inventory_item(id),
	serial_number        VARCHAR(100)  NOT NULL,
	lot_id               UUID          REFERENCES lot(id),
	location_id          UUID          REFERENCES inventory_location(id),
	status               VARCHAR(20)   NOT NULL DEFAULT 'IN_STOCK'
		CHECK (status IN ('IN_STOCK', 'RESERVED', 'SHIPPED', 'RETURNED', 'SCRAPPED')),
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by           UUID          NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by           UUID          NOT NULL REFERENCES user_account(id),
	UNIQUE (entity_id, inventory_item_id, serial_number)
);

CREATE TABLE IF NOT EXISTS inventory_level (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	inventory_item_id    UUID          NOT NULL REFERENCES inventory_item(id),
	location_id          UUID          NOT NULL REFERENCES inventory_location(id),
	lot_id               UUID          REFERENCES lot(id),
	quantity_on_hand     NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
	quantity_reserved    NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
	quantity_available   NUMERIC(16,4) NOT NULL DEFAULT 0,
	last_count_date      DATE,
	updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- Functional unique index: one stock level per (entity, item, location, lot).
-- COALESCE handles nullable lot_id so that lot-less stock is also unique.
-- Ref: SD-002 §5 inventory_level UNIQUE constraint.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_level_unique_idx
	ON inventory_level (entity_id, inventory_item_id, location_id,
	                    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 Vendor Master
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id               UUID          NOT NULL REFERENCES legal_entity(id),
	vendor_code             VARCHAR(20)   NOT NULL,
	legal_name              VARCHAR(255)  NOT NULL,
	trade_name              VARCHAR(255),
	country_code            CHAR(2)       NOT NULL,
	tax_id                  VARCHAR(50),
	payment_terms           VARCHAR(30)   NOT NULL DEFAULT 'NET30',
	default_currency_code   CHAR(3)       NOT NULL,
	default_payment_method  VARCHAR(20)
		CHECK (default_payment_method IN ('CHECK', 'WIRE', 'ACH')),
	is_active               BOOLEAN       NOT NULL DEFAULT TRUE,
	risk_rating             VARCHAR(10)
		CHECK (risk_rating IN ('LOW', 'MEDIUM', 'HIGH')),
	website                 VARCHAR(500),
	notes                   TEXT,
	ext                     JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by              UUID          NOT NULL REFERENCES user_account(id),
	updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by              UUID          NOT NULL REFERENCES user_account(id),
	version                 INTEGER       NOT NULL DEFAULT 1,
	deleted_at              TIMESTAMPTZ,
	UNIQUE (entity_id, vendor_code)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'vendor'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON vendor
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_contact (
	id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	vendor_id   UUID          NOT NULL REFERENCES vendor(id) ON DELETE CASCADE,
	first_name  VARCHAR(100)  NOT NULL,
	last_name   VARCHAR(100)  NOT NULL,
	email       VARCHAR(255),
	phone       VARCHAR(50),
	role_title  VARCHAR(100),
	is_primary  BOOLEAN       NOT NULL DEFAULT FALSE,
	created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by  UUID          NOT NULL REFERENCES user_account(id),
	updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by  UUID          NOT NULL REFERENCES user_account(id),
	version     INTEGER       NOT NULL DEFAULT 1,
	deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vendor_address (
	id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	vendor_id       UUID          NOT NULL REFERENCES vendor(id) ON DELETE CASCADE,
	address_type    VARCHAR(20)   NOT NULL
		CHECK (address_type IN ('BILLING', 'REMITTANCE', 'SHIPPING')),
	address_line_1  VARCHAR(255)  NOT NULL,
	address_line_2  VARCHAR(255),
	city            VARCHAR(100)  NOT NULL,
	state_province  VARCHAR(100),
	postal_code     VARCHAR(20),
	country_code    VARCHAR(2)    NOT NULL,
	is_primary      BOOLEAN       NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by      UUID          NOT NULL REFERENCES user_account(id),
	updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by      UUID          NOT NULL REFERENCES user_account(id),
	version         INTEGER       NOT NULL DEFAULT 1,
	deleted_at      TIMESTAMPTZ
);

-- Bank account numbers are encrypted at rest; the application layer encrypts
-- before INSERT and decrypts on SELECT using the DB encryption key (ADR-TBD).
CREATE TABLE IF NOT EXISTS vendor_bank_account (
	id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	vendor_id                 UUID          NOT NULL REFERENCES vendor(id) ON DELETE CASCADE,
	bank_name                 VARCHAR(255)  NOT NULL,
	account_number_encrypted  BYTEA         NOT NULL,
	routing_number            VARCHAR(50),
	swift_bic                 VARCHAR(11),
	iban                      VARCHAR(34),
	currency_code             VARCHAR(3)    NOT NULL,
	is_primary                BOOLEAN       NOT NULL DEFAULT FALSE,
	created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by                UUID          NOT NULL REFERENCES user_account(id),
	updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by                UUID          NOT NULL REFERENCES user_account(id),
	version                   INTEGER       NOT NULL DEFAULT 1,
	deleted_at                TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.3 Purchase Orders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_order (
	id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id              UUID          NOT NULL REFERENCES legal_entity(id),
	vendor_id              UUID          NOT NULL REFERENCES vendor(id),
	po_number              VARCHAR(30)   NOT NULL,
	po_date                DATE          NOT NULL,
	expected_delivery_date DATE,
	currency_code          CHAR(3)       NOT NULL,
	exchange_rate          NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	subtotal_amount        NUMERIC(19,6) NOT NULL DEFAULT 0,
	tax_amount             NUMERIC(19,6) NOT NULL DEFAULT 0,
	total_amount           NUMERIC(19,6) NOT NULL DEFAULT 0,
	base_total_amount      NUMERIC(19,6) NOT NULL DEFAULT 0,
	status                 VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT',
		                  'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
	ship_to_address        JSONB,
	payment_terms          VARCHAR(30),
	notes                  TEXT,
	-- compliance_status is set by WP-3 Export Control engine on PO approval
	compliance_status      VARCHAR(10)   NOT NULL DEFAULT 'pending'
		CHECK (compliance_status IN ('pending', 'cleared', 'held')),
	itar_compartment_id    UUID          REFERENCES itar_compartment(id),
	ext                    JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by             UUID          NOT NULL REFERENCES user_account(id),
	updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by             UUID          NOT NULL REFERENCES user_account(id),
	version                INTEGER       NOT NULL DEFAULT 1,
	deleted_at             TIMESTAMPTZ,
	UNIQUE (entity_id, po_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'purchase_order'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON purchase_order
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_order_line (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	purchase_order_id    UUID          NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
	line_number          INTEGER       NOT NULL,
	inventory_item_id    UUID          REFERENCES inventory_item(id),
	description          VARCHAR(500)  NOT NULL,
	quantity_ordered     NUMERIC(16,4) NOT NULL CHECK (quantity_ordered > 0),
	quantity_received    NUMERIC(16,4) NOT NULL DEFAULT 0,
	unit_of_measure      VARCHAR(20)   NOT NULL,
	unit_price           NUMERIC(19,6) NOT NULL,
	amount               NUMERIC(19,6) NOT NULL,
	currency_code        CHAR(3)       NOT NULL,
	tax_code             VARCHAR(20),
	tax_amount           NUMERIC(19,6) NOT NULL DEFAULT 0,
	-- account_id FK to account(id) will be added in WP-2 Finance migration
	account_id           UUID,
	required_date        DATE,
	ext                  JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	UNIQUE (purchase_order_id, line_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.4 Goods Receipt
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goods_receipt (
	id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID          NOT NULL REFERENCES legal_entity(id),
	purchase_order_id   UUID          NOT NULL REFERENCES purchase_order(id),
	receipt_number      VARCHAR(30)   NOT NULL,
	receipt_date        DATE          NOT NULL,
	status              VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
	received_by         UUID          NOT NULL REFERENCES user_account(id),
	location_id         UUID          REFERENCES inventory_location(id),
	notes               TEXT,
	ext                 JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by          UUID          NOT NULL REFERENCES user_account(id),
	updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by          UUID          NOT NULL REFERENCES user_account(id),
	version             INTEGER       NOT NULL DEFAULT 1,
	UNIQUE (entity_id, receipt_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'goods_receipt'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON goods_receipt
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS goods_receipt_line (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	goods_receipt_id        UUID          NOT NULL REFERENCES goods_receipt(id) ON DELETE CASCADE,
	purchase_order_line_id  UUID          NOT NULL REFERENCES purchase_order_line(id),
	line_number             INTEGER       NOT NULL,
	quantity_received       NUMERIC(16,4) NOT NULL CHECK (quantity_received > 0),
	quantity_accepted       NUMERIC(16,4) NOT NULL,
	quantity_rejected       NUMERIC(16,4) NOT NULL DEFAULT 0,
	lot_id                  UUID          REFERENCES lot(id),
	serial_number_id        UUID          REFERENCES serial_number(id),
	location_id             UUID          REFERENCES inventory_location(id),
	notes                   TEXT,
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	UNIQUE (goods_receipt_id, line_number),
	CHECK (quantity_accepted + quantity_rejected <= quantity_received)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-6: Logistics Schema
-- Tables: carrier, carrier_service, shipment, shipment_line,
--         customs_document, tracking_event
-- Ref: SD-002-data-model.md §9
-- Issue: hx-5db7c4c0
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.1 Carrier Master
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carrier (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id               UUID          NOT NULL REFERENCES legal_entity(id),
	code                    VARCHAR(20)   NOT NULL,
	name                    VARCHAR(255)  NOT NULL,
	carrier_type            VARCHAR(20)   NOT NULL
		CHECK (carrier_type IN ('AIR', 'OCEAN', 'GROUND', 'COURIER', 'MULTIMODAL')),
	account_number          VARCHAR(50),
	website                 VARCHAR(500),
	tracking_url_template   VARCHAR(500),
	is_active               BOOLEAN       NOT NULL DEFAULT TRUE,
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by              UUID          NOT NULL REFERENCES user_account(id),
	updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by              UUID          NOT NULL REFERENCES user_account(id),
	version                 INTEGER       NOT NULL DEFAULT 1,
	UNIQUE (entity_id, code)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'carrier'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON carrier
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS carrier_service (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	carrier_id              UUID          NOT NULL REFERENCES carrier(id),
	code                    VARCHAR(30)   NOT NULL,
	name                    VARCHAR(100)  NOT NULL,
	transit_days_estimate   INTEGER,
	is_active               BOOLEAN       NOT NULL DEFAULT TRUE,
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by              UUID          NOT NULL REFERENCES user_account(id),
	UNIQUE (carrier_id, code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.2 Shipment
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shipment (
	id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id                UUID          NOT NULL REFERENCES legal_entity(id),
	shipment_number          VARCHAR(30)   NOT NULL,
	-- sales_order_id: FK to sales_order(id) — added in WP-5 Sales migration
	sales_order_id           UUID,
	-- customer_id: FK to customer(id) — added in WP-5 Sales migration
	customer_id              UUID,
	carrier_service_id       UUID          REFERENCES carrier_service(id),
	tracking_number          VARCHAR(100),
	ship_date                DATE,
	expected_delivery_date   DATE,
	actual_delivery_date     DATE,
	ship_from_address        JSONB,
	ship_to_address          JSONB         NOT NULL,
	weight_kg                NUMERIC(12,4),
	dimensions_cm            JSONB,
	shipping_cost            NUMERIC(19,6),
	shipping_cost_currency   CHAR(3),
	insurance_value          NUMERIC(19,6),
	insurance_currency       CHAR(3),
	status                   VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED')),
	incoterm                 VARCHAR(10),
	-- compliance_status: set by WP-3 Export Control engine on pre-shipment check
	compliance_status        VARCHAR(10)   NOT NULL DEFAULT 'pending'
		CHECK (compliance_status IN ('pending', 'cleared', 'held')),
	itar_compartment_id      UUID          REFERENCES itar_compartment(id),
	-- compliance_hold_id: FK to compliance_hold(id) — added in WP-3 Export Control migration
	compliance_hold_id       UUID,
	notes                    TEXT,
	ext                      JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by               UUID          NOT NULL REFERENCES user_account(id),
	updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by               UUID          NOT NULL REFERENCES user_account(id),
	version                  INTEGER       NOT NULL DEFAULT 1,
	UNIQUE (entity_id, shipment_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'shipment'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON shipment
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

-- Ref: SD-002 §10.2
CREATE INDEX IF NOT EXISTS ix_ship_tracking
	ON shipment (tracking_number)
	WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ship_entity_status
	ON shipment (entity_id, status);

CREATE TABLE IF NOT EXISTS shipment_line (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	shipment_id             UUID          NOT NULL REFERENCES shipment(id) ON DELETE CASCADE,
	-- sales_order_line_id: FK to sales_order_line(id) — added in WP-5 Sales migration
	sales_order_line_id     UUID,
	inventory_item_id       UUID          REFERENCES inventory_item(id),
	line_number             INTEGER       NOT NULL,
	description             VARCHAR(500)  NOT NULL,
	quantity                NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
	unit_of_measure         VARCHAR(20)   NOT NULL,
	lot_id                  UUID          REFERENCES lot(id),
	serial_number_id        UUID          REFERENCES serial_number(id),
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
	UNIQUE (shipment_id, line_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.3 Customs Documentation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customs_document (
	id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	shipment_id              UUID          NOT NULL REFERENCES shipment(id),
	document_type            VARCHAR(30)   NOT NULL
		CHECK (document_type IN (
			'COMMERCIAL_INVOICE', 'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN',
			'EXPORT_LICENSE', 'AES_FILING', 'CUSTOMS_DECLARATION'
		)),
	document_number          VARCHAR(50),
	filing_date              DATE,
	status                   VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'FILED', 'ACCEPTED', 'REJECTED')),
	document_data            JSONB,
	file_reference           VARCHAR(500),
	itn_number               VARCHAR(30),
	hts_codes                TEXT[],
	declared_value           NUMERIC(19,6),
	declared_value_currency  CHAR(3),
	notes                    TEXT,
	created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by               UUID          NOT NULL REFERENCES user_account(id),
	updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by               UUID          NOT NULL REFERENCES user_account(id),
	version                  INTEGER       NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.4 Tracking Events
-- Partitioned by event_timestamp (range, monthly) per SD-002 §11.1
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracking_event (
	id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	shipment_id      UUID          NOT NULL REFERENCES shipment(id),
	event_timestamp  TIMESTAMPTZ   NOT NULL,
	event_type       VARCHAR(30)   NOT NULL
		CHECK (event_type IN (
			'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
			'EXCEPTION', 'CUSTOMS_HOLD', 'CUSTOMS_CLEARED'
		)),
	location         VARCHAR(255),
	description      VARCHAR(500),
	source           VARCHAR(20)   NOT NULL DEFAULT 'MANUAL'
		CHECK (source IN ('MANUAL', 'CARRIER_API', 'EDI')),
	raw_data         JSONB,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-2: Financial Management Schema
-- Tables: fiscal_year, fiscal_period, currency, exchange_rate_type,
--         exchange_rate, account, account_segment, account_segment_value,
--         account_mapping, journal_entry, journal_entry_line, period_status,
--         gl_balance, vendor_bill, vendor_bill_line, payment_batch, payment,
--         vendor_bill_payment, customer_invoice, customer_invoice_line,
--         customer_payment, payment_application, dunning_run, dunning_letter,
--         intercompany_agreement, intercompany_transaction, elimination_entry
-- Ref: SD-002-data-model.md §3.1 (fiscal), §4
-- Issue: hx-c0ca9962
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 Fiscal Calendar (Platform — Finance dependency)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fiscal_year (
	id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id    UUID         NOT NULL REFERENCES legal_entity(id),
	year_label   VARCHAR(10)  NOT NULL,
	start_date   DATE         NOT NULL,
	end_date     DATE         NOT NULL,
	is_closed    BOOLEAN      NOT NULL DEFAULT FALSE,
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by   UUID         NOT NULL REFERENCES user_account(id),
	updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by   UUID         NOT NULL REFERENCES user_account(id),
	version      INTEGER      NOT NULL DEFAULT 1,
	UNIQUE (entity_id, year_label),
	CHECK (end_date > start_date)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'fiscal_year'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON fiscal_year
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS fiscal_period (
	id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	fiscal_year_id   UUID         NOT NULL REFERENCES fiscal_year(id),
	entity_id        UUID         NOT NULL REFERENCES legal_entity(id),
	period_number    INTEGER      NOT NULL,
	period_label     VARCHAR(20)  NOT NULL,
	start_date       DATE         NOT NULL,
	end_date         DATE         NOT NULL,
	status           VARCHAR(20)  NOT NULL DEFAULT 'FUTURE'
		CHECK (status IN ('FUTURE', 'OPEN', 'SOFT_CLOSED', 'HARD_CLOSED')),
	created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by       UUID         NOT NULL REFERENCES user_account(id),
	updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by       UUID         NOT NULL REFERENCES user_account(id),
	version          INTEGER      NOT NULL DEFAULT 1,
	UNIQUE (fiscal_year_id, period_number),
	CHECK (end_date > start_date)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'fiscal_period'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON fiscal_period
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.5 Multi-Currency (declared early — referenced by exchange_rate and GL)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS currency (
	code           CHAR(3)      PRIMARY KEY,
	name           VARCHAR(100) NOT NULL,
	symbol         VARCHAR(5),
	decimal_places INTEGER      NOT NULL DEFAULT 2,
	is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS exchange_rate_type (
	id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code        VARCHAR(20)  NOT NULL UNIQUE,
	name        VARCHAR(100) NOT NULL,
	is_default  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS exchange_rate (
	id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	rate_type_id     UUID           NOT NULL REFERENCES exchange_rate_type(id),
	from_currency    CHAR(3)        NOT NULL REFERENCES currency(code),
	to_currency      CHAR(3)        NOT NULL REFERENCES currency(code),
	rate             NUMERIC(18,10) NOT NULL,
	effective_date   DATE           NOT NULL,
	source           VARCHAR(50),
	created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by       UUID           NOT NULL REFERENCES user_account(id),
	UNIQUE (rate_type_id, from_currency, to_currency, effective_date),
	CHECK (rate > 0),
	CHECK (from_currency <> to_currency)
);

-- Seed common currencies
INSERT INTO currency (code, name, symbol, decimal_places) VALUES
	('USD', 'US Dollar',          '$',  2),
	('EUR', 'Euro',               '€',  2),
	('GBP', 'British Pound',      '£',  2),
	('JPY', 'Japanese Yen',       '¥',  0),
	('SGD', 'Singapore Dollar',   'S$', 2),
	('CAD', 'Canadian Dollar',    'C$', 2),
	('AUD', 'Australian Dollar',  'A$', 2),
	('CHF', 'Swiss Franc',        'CHF',2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO exchange_rate_type (code, name, is_default) VALUES
	('SPOT',    'Spot Rate',       TRUE),
	('BUDGET',  'Budget Rate',     FALSE),
	('AVERAGE', 'Average Rate',    FALSE),
	('CLOSING', 'Period Closing Rate', FALSE)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 Chart of Accounts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account (
	id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID         NOT NULL REFERENCES legal_entity(id),
	account_number       VARCHAR(30)  NOT NULL,
	name                 VARCHAR(255) NOT NULL,
	account_type         VARCHAR(20)  NOT NULL
		CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
	normal_balance       VARCHAR(6)   NOT NULL
		CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
	parent_account_id    UUID         REFERENCES account(id),
	is_header            BOOLEAN      NOT NULL DEFAULT FALSE,
	is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
	currency_code        CHAR(3)      REFERENCES currency(code),
	itar_compartment_id  UUID         REFERENCES itar_compartment(id),
	ext                  JSONB        NOT NULL DEFAULT '{}'::jsonb,
	created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by           UUID         NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by           UUID         NOT NULL REFERENCES user_account(id),
	version              INTEGER      NOT NULL DEFAULT 1,
	deleted_at           TIMESTAMPTZ,
	UNIQUE (entity_id, account_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'account'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON account
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS account_segment (
	id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id      UUID         NOT NULL REFERENCES legal_entity(id),
	code           VARCHAR(30)  NOT NULL,
	name           VARCHAR(100) NOT NULL,
	display_order  INTEGER      NOT NULL DEFAULT 0,
	is_required    BOOLEAN      NOT NULL DEFAULT FALSE,
	created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by     UUID         NOT NULL REFERENCES user_account(id),
	updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by     UUID         NOT NULL REFERENCES user_account(id),
	version        INTEGER      NOT NULL DEFAULT 1,
	UNIQUE (entity_id, code)
);

CREATE TABLE IF NOT EXISTS account_segment_value (
	id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	segment_id  UUID         NOT NULL REFERENCES account_segment(id),
	code        VARCHAR(30)  NOT NULL,
	name        VARCHAR(100) NOT NULL,
	is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by  UUID         NOT NULL REFERENCES user_account(id),
	UNIQUE (segment_id, code)
);

CREATE TABLE IF NOT EXISTS account_mapping (
	id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
	source_entity_id    UUID  NOT NULL REFERENCES legal_entity(id),
	source_account_id   UUID  NOT NULL REFERENCES account(id),
	target_entity_id    UUID  NOT NULL REFERENCES legal_entity(id),
	target_account_id   UUID  NOT NULL REFERENCES account(id),
	effective_from      DATE  NOT NULL,
	effective_to        DATE,
	created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by          UUID        NOT NULL REFERENCES user_account(id),
	UNIQUE (source_entity_id, source_account_id, target_entity_id, effective_from)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.2 General Ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entry (
	id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID         NOT NULL REFERENCES legal_entity(id),
	entry_number        VARCHAR(30)  NOT NULL,
	entry_date          DATE         NOT NULL,
	fiscal_period_id    UUID         NOT NULL REFERENCES fiscal_period(id),
	description         VARCHAR(500) NOT NULL,
	source_module       VARCHAR(30),
	source_document_id  UUID,
	status              VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID')),
	posted_at           TIMESTAMPTZ,
	posted_by           UUID         REFERENCES user_account(id),
	reversal_of_id      UUID         REFERENCES journal_entry(id),
	is_adjustment       BOOLEAN      NOT NULL DEFAULT FALSE,
	ext                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by          UUID         NOT NULL REFERENCES user_account(id),
	updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by          UUID         NOT NULL REFERENCES user_account(id),
	version             INTEGER      NOT NULL DEFAULT 1,
	deleted_at          TIMESTAMPTZ,
	UNIQUE (entity_id, entry_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'journal_entry'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON journal_entry
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS journal_entry_line (
	id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	journal_entry_id    UUID           NOT NULL REFERENCES journal_entry(id),
	line_number         INTEGER        NOT NULL,
	account_id          UUID           NOT NULL REFERENCES account(id),
	description         VARCHAR(500),
	debit_amount        NUMERIC(19,6)  NOT NULL DEFAULT 0,
	credit_amount       NUMERIC(19,6)  NOT NULL DEFAULT 0,
	currency_code       CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate       NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	base_debit_amount   NUMERIC(19,6)  NOT NULL DEFAULT 0,
	base_credit_amount  NUMERIC(19,6)  NOT NULL DEFAULT 0,
	segment_values      JSONB          NOT NULL DEFAULT '{}'::jsonb,
	itar_compartment_id UUID           REFERENCES itar_compartment(id),
	ext                 JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (journal_entry_id, line_number),
	CHECK (debit_amount >= 0),
	CHECK (credit_amount >= 0),
	CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
);

-- period_status: per SD-002 ADR-007 note, canonical lifecycle is fiscal_period.status.
-- Retained for module-level override granularity only.
CREATE TABLE IF NOT EXISTS period_status (
	id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	fiscal_period_id  UUID         NOT NULL REFERENCES fiscal_period(id),
	entity_id         UUID         NOT NULL REFERENCES legal_entity(id),
	module            VARCHAR(30)  NOT NULL DEFAULT 'GL',
	status            VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
		CHECK (status IN ('OPEN', 'CLOSED', 'FUTURE')),
	closed_at         TIMESTAMPTZ,
	closed_by         UUID         REFERENCES user_account(id),
	created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by        UUID         NOT NULL REFERENCES user_account(id),
	updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by        UUID         NOT NULL REFERENCES user_account(id),
	version           INTEGER      NOT NULL DEFAULT 1,
	UNIQUE (fiscal_period_id, entity_id, module)
);

CREATE TABLE IF NOT EXISTS gl_balance (
	id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID           NOT NULL REFERENCES legal_entity(id),
	account_id          UUID           NOT NULL REFERENCES account(id),
	fiscal_period_id    UUID           NOT NULL REFERENCES fiscal_period(id),
	currency_code       CHAR(3)        NOT NULL REFERENCES currency(code),
	segment_values      JSONB          NOT NULL DEFAULT '{}'::jsonb,
	period_debit_total  NUMERIC(19,6)  NOT NULL DEFAULT 0,
	period_credit_total NUMERIC(19,6)  NOT NULL DEFAULT 0,
	period_net          NUMERIC(19,6)  NOT NULL DEFAULT 0,
	ytd_debit_total     NUMERIC(19,6)  NOT NULL DEFAULT 0,
	ytd_credit_total    NUMERIC(19,6)  NOT NULL DEFAULT 0,
	ytd_net             NUMERIC(19,6)  NOT NULL DEFAULT 0,
	last_refreshed_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (entity_id, account_id, fiscal_period_id, currency_code, segment_values)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.3 Accounts Payable
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_bill (
	id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID           NOT NULL REFERENCES legal_entity(id),
	vendor_id           UUID           NOT NULL REFERENCES vendor(id),
	bill_number         VARCHAR(50)    NOT NULL,
	internal_ref        VARCHAR(30)    NOT NULL,
	bill_date           DATE           NOT NULL,
	due_date            DATE           NOT NULL,
	currency_code       CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate       NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	subtotal_amount     NUMERIC(19,6)  NOT NULL,
	tax_amount          NUMERIC(19,6)  NOT NULL DEFAULT 0,
	total_amount        NUMERIC(19,6)  NOT NULL,
	base_total_amount   NUMERIC(19,6)  NOT NULL,
	amount_paid         NUMERIC(19,6)  NOT NULL DEFAULT 0,
	balance_due         NUMERIC(19,6)  NOT NULL,
	status              VARCHAR(20)    NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED',
		                  'PARTIALLY_PAID', 'PAID', 'VOID')),
	fiscal_period_id    UUID           REFERENCES fiscal_period(id),
	journal_entry_id    UUID           REFERENCES journal_entry(id),
	purchase_order_id   UUID           REFERENCES purchase_order(id),
	goods_receipt_id    UUID           REFERENCES goods_receipt(id),
	payment_terms       VARCHAR(30),
	notes               TEXT,
	ext                 JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by          UUID           NOT NULL REFERENCES user_account(id),
	updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by          UUID           NOT NULL REFERENCES user_account(id),
	version             INTEGER        NOT NULL DEFAULT 1,
	deleted_at          TIMESTAMPTZ,
	UNIQUE (entity_id, vendor_id, bill_number),
	CHECK (total_amount >= 0),
	CHECK (balance_due >= 0)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'vendor_bill'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON vendor_bill
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_bill_line (
	id                     UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	vendor_bill_id         UUID           NOT NULL REFERENCES vendor_bill(id),
	line_number            INTEGER        NOT NULL,
	description            VARCHAR(500)   NOT NULL,
	account_id             UUID           NOT NULL REFERENCES account(id),
	quantity               NUMERIC(16,4)  NOT NULL DEFAULT 1,
	unit_price             NUMERIC(19,6)  NOT NULL,
	amount                 NUMERIC(19,6)  NOT NULL,
	currency_code          CHAR(3)        NOT NULL REFERENCES currency(code),
	tax_code               VARCHAR(20),
	tax_amount             NUMERIC(19,6)  NOT NULL DEFAULT 0,
	purchase_order_line_id UUID           REFERENCES purchase_order_line(id),
	segment_values         JSONB          NOT NULL DEFAULT '{}'::jsonb,
	ext                    JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (vendor_bill_id, line_number)
);

CREATE TABLE IF NOT EXISTS payment_batch (
	id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id       UUID           NOT NULL REFERENCES legal_entity(id),
	batch_number    VARCHAR(30)    NOT NULL,
	payment_method  VARCHAR(20)    NOT NULL
		CHECK (payment_method IN ('CHECK', 'WIRE', 'ACH', 'CREDIT_CARD')),
	currency_code   CHAR(3)        NOT NULL REFERENCES currency(code),
	total_amount    NUMERIC(19,6)  NOT NULL DEFAULT 0,
	status          VARCHAR(20)    NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'APPROVED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
	payment_date    DATE           NOT NULL,
	bank_account_id UUID,
	created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by      UUID           NOT NULL REFERENCES user_account(id),
	updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by      UUID           NOT NULL REFERENCES user_account(id),
	version         INTEGER        NOT NULL DEFAULT 1,
	UNIQUE (entity_id, batch_number)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'payment_batch'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON payment_batch
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment (
	id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id         UUID           NOT NULL REFERENCES legal_entity(id),
	payment_batch_id  UUID           REFERENCES payment_batch(id),
	vendor_id         UUID           NOT NULL REFERENCES vendor(id),
	payment_number    VARCHAR(30)    NOT NULL,
	payment_date      DATE           NOT NULL,
	payment_method    VARCHAR(20)    NOT NULL
		CHECK (payment_method IN ('CHECK', 'WIRE', 'ACH', 'CREDIT_CARD')),
	currency_code     CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate     NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	amount            NUMERIC(19,6)  NOT NULL,
	base_amount       NUMERIC(19,6)  NOT NULL,
	status            VARCHAR(20)    NOT NULL DEFAULT 'PENDING'
		CHECK (status IN ('PENDING', 'CLEARED', 'VOIDED', 'RETURNED')),
	reference         VARCHAR(100),
	journal_entry_id  UUID           REFERENCES journal_entry(id),
	realized_gain_loss NUMERIC(19,6) DEFAULT 0,
	ext               JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by        UUID           NOT NULL REFERENCES user_account(id),
	updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by        UUID           NOT NULL REFERENCES user_account(id),
	version           INTEGER        NOT NULL DEFAULT 1,
	UNIQUE (entity_id, payment_number),
	CHECK (amount > 0)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'payment'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON payment
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_bill_payment (
	id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	payment_id      UUID           NOT NULL REFERENCES payment(id),
	vendor_bill_id  UUID           NOT NULL REFERENCES vendor_bill(id),
	applied_amount  NUMERIC(19,6)  NOT NULL,
	currency_code   CHAR(3)        NOT NULL REFERENCES currency(code),
	applied_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	applied_by      UUID           NOT NULL REFERENCES user_account(id),
	UNIQUE (payment_id, vendor_bill_id),
	CHECK (applied_amount > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.4 Accounts Receivable
-- Note: customer_id FKs reference customer(id) which is created in WP-5.
--       sales_order_id FKs reference sales_order(id) from WP-5.
--       product_id FKs reference product(id) from WP-5.
--       FK constraints will be added via ALTER TABLE in the WP-5 migration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_invoice (
	id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id         UUID           NOT NULL REFERENCES legal_entity(id),
	customer_id       UUID           NOT NULL,  -- FK to customer(id) added in WP-5
	invoice_number    VARCHAR(30)    NOT NULL,
	invoice_date      DATE           NOT NULL,
	due_date          DATE           NOT NULL,
	currency_code     CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate     NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	subtotal_amount   NUMERIC(19,6)  NOT NULL,
	tax_amount        NUMERIC(19,6)  NOT NULL DEFAULT 0,
	total_amount      NUMERIC(19,6)  NOT NULL,
	base_total_amount NUMERIC(19,6)  NOT NULL,
	amount_received   NUMERIC(19,6)  NOT NULL DEFAULT 0,
	balance_due       NUMERIC(19,6)  NOT NULL,
	status            VARCHAR(20)    NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID', 'WRITTEN_OFF')),
	fiscal_period_id  UUID           REFERENCES fiscal_period(id),
	journal_entry_id  UUID           REFERENCES journal_entry(id),
	sales_order_id    UUID,                      -- FK to sales_order(id) added in WP-5
	payment_terms     VARCHAR(30),
	notes             TEXT,
	ext               JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by        UUID           NOT NULL REFERENCES user_account(id),
	updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by        UUID           NOT NULL REFERENCES user_account(id),
	version           INTEGER        NOT NULL DEFAULT 1,
	deleted_at        TIMESTAMPTZ,
	UNIQUE (entity_id, invoice_number),
	CHECK (total_amount >= 0),
	CHECK (balance_due >= 0)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'customer_invoice'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON customer_invoice
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS customer_invoice_line (
	id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	customer_invoice_id   UUID           NOT NULL REFERENCES customer_invoice(id),
	line_number           INTEGER        NOT NULL,
	product_id            UUID,                      -- FK to product(id) added in WP-5
	description           VARCHAR(500)   NOT NULL,
	account_id            UUID           NOT NULL REFERENCES account(id),
	quantity              NUMERIC(16,4)  NOT NULL DEFAULT 1,
	unit_price            NUMERIC(19,6)  NOT NULL,
	discount_percent      NUMERIC(5,2)   NOT NULL DEFAULT 0,
	amount                NUMERIC(19,6)  NOT NULL,
	currency_code         CHAR(3)        NOT NULL REFERENCES currency(code),
	tax_code              VARCHAR(20),
	tax_amount            NUMERIC(19,6)  NOT NULL DEFAULT 0,
	segment_values        JSONB          NOT NULL DEFAULT '{}'::jsonb,
	ext                   JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (customer_invoice_id, line_number)
);

CREATE TABLE IF NOT EXISTS customer_payment (
	id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id         UUID           NOT NULL REFERENCES legal_entity(id),
	customer_id       UUID           NOT NULL,  -- FK to customer(id) added in WP-5
	payment_number    VARCHAR(30)    NOT NULL,
	payment_date      DATE           NOT NULL,
	payment_method    VARCHAR(20)    NOT NULL
		CHECK (payment_method IN ('WIRE', 'CHECK', 'ACH', 'CREDIT_CARD')),
	currency_code     CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate     NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	amount            NUMERIC(19,6)  NOT NULL,
	base_amount       NUMERIC(19,6)  NOT NULL,
	status            VARCHAR(20)    NOT NULL DEFAULT 'RECEIVED'
		CHECK (status IN ('RECEIVED', 'APPLIED', 'RETURNED', 'VOIDED')),
	reference         VARCHAR(100),
	journal_entry_id  UUID           REFERENCES journal_entry(id),
	realized_gain_loss NUMERIC(19,6) DEFAULT 0,
	ext               JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by        UUID           NOT NULL REFERENCES user_account(id),
	updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by        UUID           NOT NULL REFERENCES user_account(id),
	version           INTEGER        NOT NULL DEFAULT 1,
	UNIQUE (entity_id, payment_number),
	CHECK (amount > 0)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'customer_payment'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON customer_payment
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_application (
	id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	customer_payment_id   UUID           NOT NULL REFERENCES customer_payment(id),
	customer_invoice_id   UUID           NOT NULL REFERENCES customer_invoice(id),
	applied_amount        NUMERIC(19,6)  NOT NULL,
	currency_code         CHAR(3)        NOT NULL REFERENCES currency(code),
	applied_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
	applied_by            UUID           NOT NULL REFERENCES user_account(id),
	UNIQUE (customer_payment_id, customer_invoice_id),
	CHECK (applied_amount > 0)
);

CREATE TABLE IF NOT EXISTS dunning_run (
	id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id    UUID         NOT NULL REFERENCES legal_entity(id),
	run_date     DATE         NOT NULL,
	run_number   VARCHAR(30)  NOT NULL,
	status       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'EXECUTED', 'CANCELLED')),
	cutoff_date  DATE         NOT NULL,
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by   UUID         NOT NULL REFERENCES user_account(id),
	updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by   UUID         NOT NULL REFERENCES user_account(id),
	version      INTEGER      NOT NULL DEFAULT 1,
	UNIQUE (entity_id, run_number)
);

CREATE TABLE IF NOT EXISTS dunning_letter (
	id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	dunning_run_id        UUID           NOT NULL REFERENCES dunning_run(id),
	customer_id           UUID           NOT NULL,  -- FK to customer(id) added in WP-5
	dunning_level         INTEGER        NOT NULL,
	total_overdue_amount  NUMERIC(19,6)  NOT NULL,
	currency_code         CHAR(3)        NOT NULL REFERENCES currency(code),
	sent_at               TIMESTAMPTZ,
	delivery_channel      VARCHAR(20)
		CHECK (delivery_channel IN ('EMAIL', 'MAIL')),
	created_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.6 Intercompany
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intercompany_agreement (
	id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_a_id               UUID         NOT NULL REFERENCES legal_entity(id),
	entity_b_id               UUID         NOT NULL REFERENCES legal_entity(id),
	agreement_number          VARCHAR(30)  NOT NULL UNIQUE,
	description               TEXT,
	effective_from            DATE         NOT NULL,
	effective_to              DATE,
	transfer_pricing_method   VARCHAR(50),
	is_active                 BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by                UUID         NOT NULL REFERENCES user_account(id),
	updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by                UUID         NOT NULL REFERENCES user_account(id),
	version                   INTEGER      NOT NULL DEFAULT 1,
	CHECK (entity_a_id <> entity_b_id)
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'intercompany_agreement'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON intercompany_agreement
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS intercompany_transaction (
	id                         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	agreement_id               UUID           REFERENCES intercompany_agreement(id),
	transaction_date           DATE           NOT NULL,
	description                VARCHAR(500),
	entity_a_journal_entry_id  UUID           NOT NULL REFERENCES journal_entry(id),
	entity_b_journal_entry_id  UUID           NOT NULL REFERENCES journal_entry(id),
	amount                     NUMERIC(19,6)  NOT NULL,
	currency_code              CHAR(3)        NOT NULL REFERENCES currency(code),
	status                     VARCHAR(20)    NOT NULL DEFAULT 'PENDING'
		CHECK (status IN ('PENDING', 'MATCHED', 'DISPUTED', 'ELIMINATED')),
	created_at                 TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by                 UUID           NOT NULL REFERENCES user_account(id),
	updated_at                 TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by                 UUID           NOT NULL REFERENCES user_account(id),
	version                    INTEGER        NOT NULL DEFAULT 1
);
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'audit_stamp' AND tgrelid = 'intercompany_transaction'::regclass
	) THEN
		CREATE TRIGGER audit_stamp AFTER INSERT OR UPDATE OR DELETE ON intercompany_transaction
			FOR EACH ROW EXECUTE FUNCTION audit_stamp();
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS elimination_entry (
	id                           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	intercompany_transaction_id  UUID           REFERENCES intercompany_transaction(id),
	fiscal_period_id             UUID           NOT NULL REFERENCES fiscal_period(id),
	journal_entry_id             UUID           NOT NULL REFERENCES journal_entry(id),
	consolidation_entity_id      UUID           NOT NULL REFERENCES legal_entity(id),
	amount                       NUMERIC(19,6)  NOT NULL,
	currency_code                CHAR(3)        NOT NULL REFERENCES currency(code),
	created_at                   TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by                   UUID           NOT NULL REFERENCES user_account(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-2 FK fix: enforce account_id on purchase_order_line
-- (column existed as plain UUID stub since WP-4 migration)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_line_account_id_fk'
	) THEN
		ALTER TABLE purchase_order_line
			ADD CONSTRAINT purchase_order_line_account_id_fk
				FOREIGN KEY (account_id) REFERENCES account(id);
	END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-2 Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_journal_entry_entity_period
	ON journal_entry (entity_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS ix_journal_entry_status
	ON journal_entry (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_jel_journal_entry
	ON journal_entry_line (journal_entry_id);
CREATE INDEX IF NOT EXISTS ix_jel_account
	ON journal_entry_line (account_id);
CREATE INDEX IF NOT EXISTS ix_account_entity
	ON account (entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_vendor_bill_entity_status
	ON vendor_bill (entity_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_vendor_bill_vendor
	ON vendor_bill (vendor_id);
CREATE INDEX IF NOT EXISTS ix_vendor_bill_due_date
	ON vendor_bill (due_date) WHERE status NOT IN ('PAID', 'VOID');
CREATE INDEX IF NOT EXISTS ix_customer_invoice_entity_status
	ON customer_invoice (entity_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_customer_invoice_customer
	ON customer_invoice (customer_id);
CREATE INDEX IF NOT EXISTS ix_customer_invoice_due_date
	ON customer_invoice (due_date) WHERE status NOT IN ('PAID', 'VOID', 'WRITTEN_OFF');
CREATE INDEX IF NOT EXISTS ix_gl_balance_account_period
	ON gl_balance (account_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS ix_exchange_rate_lookup
	ON exchange_rate (from_currency, to_currency, effective_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-3: Export Control Schema
-- Tables: product_classification, screening_list, screening_list_entry,
--         screening_result (partitioned), denied_party_match, compliance_hold,
--         country_restriction, country_restriction_rule, restricted_region
-- Ref: SD-002-data-model.md §8
-- Issues: erp-61c3650b
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Product Classification ────────────────────────────────────────────────────
-- ITAR/EAR classification for a product. Phase 1: explicit per-item only
-- (ADR-001: no automatic inheritance — pending ITAR counsel review).

CREATE TABLE IF NOT EXISTS product_classification (
	id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	product_id            UUID         NOT NULL,
	jurisdiction          VARCHAR(20)  NOT NULL CHECK (jurisdiction IN ('ITAR', 'EAR', 'NOT_CONTROLLED')),
	classification_basis  VARCHAR(100),
	usml_category         VARCHAR(20),
	eccn                  VARCHAR(20),
	license_requirement   VARCHAR(50),
	notes                 TEXT,
	classified_by         UUID         NOT NULL REFERENCES user_account(id),
	classified_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
	reviewed_by           UUID         REFERENCES user_account(id),
	reviewed_at           TIMESTAMPTZ,
	effective_from        DATE         NOT NULL,
	effective_to          DATE,
	created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by            UUID         NOT NULL REFERENCES user_account(id),
	updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by            UUID         NOT NULL REFERENCES user_account(id),
	version               INTEGER      NOT NULL DEFAULT 1
);

CREATE TRIGGER product_classification_audit_stamp
	BEFORE INSERT OR UPDATE ON product_classification
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

-- ── Screening List ────────────────────────────────────────────────────────────
-- Reference table of denied-party and restricted-entity lists.

CREATE TABLE IF NOT EXISTS screening_list (
	id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	code             VARCHAR(30)  NOT NULL UNIQUE,
	name             VARCHAR(255) NOT NULL,
	source_authority VARCHAR(100) NOT NULL,
	source_url       VARCHAR(500),
	last_updated_at  TIMESTAMPTZ,
	is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by       UUID         NOT NULL REFERENCES user_account(id)
);

-- ── Screening List Entry ──────────────────────────────────────────────────────
-- Individual entry on a screening list (a denied or restricted party).

CREATE TABLE IF NOT EXISTS screening_list_entry (
	id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	screening_list_id  UUID         NOT NULL REFERENCES screening_list(id),
	entry_name         VARCHAR(500) NOT NULL,
	aliases            TEXT[],
	entity_type        VARCHAR(20),
	country_codes      CHAR(2)[],
	identifiers        JSONB,
	remarks            TEXT,
	source_id          VARCHAR(100),
	listed_date        DATE,
	delisted_date      DATE,
	created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sle_list
	ON screening_list_entry (screening_list_id);
CREATE INDEX IF NOT EXISTS ix_sle_entry_name
	ON screening_list_entry (entry_name);

-- ── Screening Result ──────────────────────────────────────────────────────────
-- Result of screening a party against lists. Range-partitioned monthly (7yr retention).

CREATE TABLE IF NOT EXISTS screening_result (
	id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
	entity_id           UUID         NOT NULL REFERENCES legal_entity(id),
	screened_table      VARCHAR(50)  NOT NULL,
	screened_record_id  UUID         NOT NULL,
	screened_name       VARCHAR(500) NOT NULL,
	screening_date      TIMESTAMPTZ  NOT NULL DEFAULT now(),
	screening_type      VARCHAR(20)  NOT NULL CHECK (screening_type IN ('AUTOMATED', 'MANUAL')),
	overall_result      VARCHAR(20)  NOT NULL CHECK (overall_result IN ('CLEAR', 'POTENTIAL_MATCH', 'CONFIRMED_MATCH')),
	match_count         INTEGER      NOT NULL DEFAULT 0,
	reviewed_by         UUID         REFERENCES user_account(id),
	reviewed_at         TIMESTAMPTZ,
	review_decision     VARCHAR(20)  CHECK (review_decision IN ('CLEARED', 'ESCALATED', 'BLOCKED')),
	review_notes        TEXT,
	created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by          UUID         NOT NULL REFERENCES user_account(id),
	PRIMARY KEY (id, screening_date)
) PARTITION BY RANGE (screening_date);

-- Initial monthly partitions (2026 Q2)
CREATE TABLE IF NOT EXISTS screening_result_2026_04
	PARTITION OF screening_result
	FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS screening_result_2026_05
	PARTITION OF screening_result
	FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS screening_result_2026_06
	PARTITION OF screening_result
	FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX IF NOT EXISTS ix_sr_screened_record
	ON screening_result (screened_table, screened_record_id);
CREATE INDEX IF NOT EXISTS ix_sr_entity_date
	ON screening_result (entity_id, screening_date DESC);

-- ── Denied Party Match ────────────────────────────────────────────────────────
-- Individual match detail within a screening result.

CREATE TABLE IF NOT EXISTS denied_party_match (
	id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	screening_result_id     UUID          NOT NULL,
	screening_list_entry_id UUID          NOT NULL REFERENCES screening_list_entry(id),
	match_score             NUMERIC(5,4)  NOT NULL CHECK (match_score BETWEEN 0 AND 1),
	match_algorithm         VARCHAR(30),
	matched_fields          JSONB,
	created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_dpm_screening_result
	ON denied_party_match (screening_result_id);

-- ── Compliance Hold ───────────────────────────────────────────────────────────
-- Places a transaction on hold pending export control review.

CREATE TABLE IF NOT EXISTS compliance_hold (
	id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID         NOT NULL REFERENCES legal_entity(id),
	held_table           VARCHAR(50)  NOT NULL,
	held_record_id       UUID         NOT NULL,
	hold_reason          VARCHAR(50)  NOT NULL CHECK (hold_reason IN ('SCREENING_MATCH', 'CLASSIFICATION_REQUIRED', 'COUNTRY_RESTRICTION', 'AMBIGUOUS_REGION', 'MANUAL')),
	screening_result_id  UUID,
	status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'REJECTED')),
	placed_by            UUID         NOT NULL REFERENCES user_account(id),
	placed_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
	resolved_by          UUID         REFERENCES user_account(id),
	resolved_at          TIMESTAMPTZ,
	resolution_notes     TEXT,
	created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by           UUID         NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by           UUID         NOT NULL REFERENCES user_account(id),
	version              INTEGER      NOT NULL DEFAULT 1
);

CREATE TRIGGER compliance_hold_audit_stamp
	BEFORE INSERT OR UPDATE ON compliance_hold
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

-- Partial index: active holds for compliance dashboard
CREATE INDEX IF NOT EXISTS ix_ch_active
	ON compliance_hold (entity_id, held_table, held_record_id) WHERE status = 'ACTIVE';

-- ── Country Restriction ───────────────────────────────────────────────────────
-- Named set of export restriction rules for product categories to countries.

CREATE TABLE IF NOT EXISTS country_restriction (
	id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id   UUID         NOT NULL REFERENCES legal_entity(id),
	name        VARCHAR(255) NOT NULL,
	description TEXT,
	is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by  UUID         NOT NULL REFERENCES user_account(id),
	updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by  UUID         NOT NULL REFERENCES user_account(id),
	version     INTEGER      NOT NULL DEFAULT 1
);

CREATE TRIGGER country_restriction_audit_stamp
	BEFORE INSERT OR UPDATE ON country_restriction
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

-- ── Country Restriction Rule ──────────────────────────────────────────────────
-- Individual rules within a country restriction set (five-level model per FEAT-006).

CREATE TABLE IF NOT EXISTS country_restriction_rule (
	id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	country_restriction_id UUID        NOT NULL REFERENCES country_restriction(id),
	country_code           CHAR(2)     NOT NULL,
	classification_type    VARCHAR(20),
	restriction_type       VARCHAR(20) NOT NULL CHECK (restriction_type IN ('EMBARGOED', 'HEAVILY_RESTRICTED', 'LICENSE_REQUIRED', 'CAUTION', 'UNRESTRICTED')),
	effective_from         DATE        NOT NULL,
	effective_to           DATE,
	notes                  TEXT,
	created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by             UUID        NOT NULL REFERENCES user_account(id),
	UNIQUE (country_restriction_id, country_code, classification_type, effective_from)
);

CREATE INDEX IF NOT EXISTS ix_crr_restriction_id
	ON country_restriction_rule (country_restriction_id);
CREATE INDEX IF NOT EXISTS ix_crr_country_code
	ON country_restriction_rule (country_code);

-- ── Restricted Region ─────────────────────────────────────────────────────────
-- Sub-national sanctioned regions (EXP-012): e.g., Crimea, Donetsk within Ukraine.

CREATE TABLE IF NOT EXISTS restricted_region (
	id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	country_code      CHAR(2)      NOT NULL,
	region_name       VARCHAR(255) NOT NULL,
	region_code       VARCHAR(20),
	sanctions_regime  VARCHAR(100) NOT NULL,
	effective_date    TIMESTAMPTZ  NOT NULL,
	expiration_date   TIMESTAMPTZ,
	source_authority  VARCHAR(100) NOT NULL,
	admin_divisions   JSONB,
	geojson_boundary  JSONB,
	boundary_type     VARCHAR(20)  CHECK (boundary_type IN ('ADMIN_DIVISION', 'GEOJSON', 'BOTH')),
	created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by        UUID         NOT NULL REFERENCES user_account(id),
	updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by        UUID         NOT NULL REFERENCES user_account(id),
	version           INTEGER      NOT NULL DEFAULT 1,
	deleted_at        TIMESTAMPTZ,
	UNIQUE (country_code, region_code, sanctions_regime),
	CHECK (expiration_date IS NULL OR expiration_date > effective_date)
);

CREATE TRIGGER restricted_region_audit_stamp
	BEFORE INSERT OR UPDATE ON restricted_region
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_rr_country_code
	ON restricted_region (country_code) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-5: Sales & CRM Schema
-- Tables: customer, customer_address, product, price_list, price_list_entry,
--         quote, quote_line, sales_order, sales_order_line,
--         return_authorization, return_authorization_line (Sales §6),
--         crm_company, crm_contact, company_relationship, pipeline_stage,
--         opportunity, opportunity_line, activity, lead (CRM §7)
-- Ref: SD-002-data-model.md §6 and §7
-- Issues: hx-64aee390 (DB schema), hx-c116b0f8 (Zod schemas)
-- Epic: erp-fdd91a4b
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Customer Master ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer (
	id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id              UUID          NOT NULL REFERENCES legal_entity(id),
	customer_code          VARCHAR(20)   NOT NULL,
	legal_name             VARCHAR(255)  NOT NULL,
	trade_name             VARCHAR(255),
	country_code           CHAR(2)       NOT NULL,
	tax_id                 VARCHAR(50),
	payment_terms          VARCHAR(30)   NOT NULL DEFAULT 'NET30',
	credit_limit           NUMERIC(19,6),
	credit_limit_currency  CHAR(3),
	default_currency_code  CHAR(3)       NOT NULL,
	is_active              BOOLEAN       NOT NULL DEFAULT TRUE,
	risk_rating            VARCHAR(10)   CHECK (risk_rating IN ('LOW', 'MEDIUM', 'HIGH')),
	website                VARCHAR(500),
	notes                  TEXT,
	ext                    JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by             UUID          NOT NULL REFERENCES user_account(id),
	updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by             UUID          NOT NULL REFERENCES user_account(id),
	version                INTEGER       NOT NULL DEFAULT 1,
	deleted_at             TIMESTAMPTZ,
	UNIQUE (entity_id, customer_code)
);

CREATE TRIGGER customer_audit_stamp
	BEFORE INSERT OR UPDATE ON customer
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_customer_entity
	ON customer (entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_customer_country
	ON customer (country_code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_address (
	id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	customer_id      UUID          NOT NULL REFERENCES customer(id),
	address_type     VARCHAR(20)   NOT NULL CHECK (address_type IN ('BILLING', 'SHIPPING', 'BOTH')),
	address_line_1   VARCHAR(255)  NOT NULL,
	address_line_2   VARCHAR(255),
	city             VARCHAR(100)  NOT NULL,
	state_province   VARCHAR(100),
	postal_code      VARCHAR(20),
	country_code     CHAR(2)       NOT NULL,
	is_default       BOOLEAN       NOT NULL DEFAULT FALSE,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by       UUID          NOT NULL REFERENCES user_account(id),
	updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by       UUID          NOT NULL REFERENCES user_account(id),
	version          INTEGER       NOT NULL DEFAULT 1,
	deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_customer_address_customer
	ON customer_address (customer_id) WHERE deleted_at IS NULL;

-- ── Product Catalog ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product (
	id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID          NOT NULL REFERENCES legal_entity(id),
	product_code         VARCHAR(30)   NOT NULL,
	name                 VARCHAR(255)  NOT NULL,
	description          TEXT,
	product_type         VARCHAR(20)   NOT NULL CHECK (product_type IN ('GOOD', 'SERVICE', 'SUBSCRIPTION')),
	unit_of_measure      VARCHAR(20)   NOT NULL DEFAULT 'EA',
	is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
	revenue_account_id   UUID          REFERENCES account(id),
	cogs_account_id      UUID          REFERENCES account(id),
	inventory_item_id    UUID          REFERENCES inventory_item(id),
	itar_compartment_id  UUID          REFERENCES itar_compartment(id),
	ext                  JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by           UUID          NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by           UUID          NOT NULL REFERENCES user_account(id),
	version              INTEGER       NOT NULL DEFAULT 1,
	deleted_at           TIMESTAMPTZ,
	UNIQUE (entity_id, product_code)
);

CREATE TRIGGER product_audit_stamp
	BEFORE INSERT OR UPDATE ON product
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_product_entity
	ON product (entity_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS price_list (
	id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id       UUID          NOT NULL REFERENCES legal_entity(id),
	code            VARCHAR(30)   NOT NULL,
	name            VARCHAR(100)  NOT NULL,
	currency_code   CHAR(3)       NOT NULL REFERENCES currency(code),
	effective_from  DATE          NOT NULL,
	effective_to    DATE,
	is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
	created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by      UUID          NOT NULL REFERENCES user_account(id),
	updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by      UUID          NOT NULL REFERENCES user_account(id),
	version         INTEGER       NOT NULL DEFAULT 1,
	UNIQUE (entity_id, code)
);

CREATE TABLE IF NOT EXISTS price_list_entry (
	id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	price_list_id   UUID           NOT NULL REFERENCES price_list(id),
	product_id      UUID           NOT NULL REFERENCES product(id),
	unit_price      NUMERIC(19,6)  NOT NULL CHECK (unit_price >= 0),
	min_quantity    NUMERIC(16,4)  NOT NULL DEFAULT 1,
	effective_from  DATE           NOT NULL,
	effective_to    DATE,
	created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by      UUID           NOT NULL REFERENCES user_account(id),
	UNIQUE (price_list_id, product_id, min_quantity, effective_from)
);

CREATE INDEX IF NOT EXISTS ix_ple_price_list
	ON price_list_entry (price_list_id);
CREATE INDEX IF NOT EXISTS ix_ple_product
	ON price_list_entry (product_id);

-- ── Quote ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote (
	id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID           NOT NULL REFERENCES legal_entity(id),
	customer_id         UUID           NOT NULL REFERENCES customer(id),
	quote_number        VARCHAR(30)    NOT NULL,
	quote_date          DATE           NOT NULL,
	valid_until         DATE,
	currency_code       CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate       NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	subtotal_amount     NUMERIC(19,6)  NOT NULL DEFAULT 0,
	tax_amount          NUMERIC(19,6)  NOT NULL DEFAULT 0,
	total_amount        NUMERIC(19,6)  NOT NULL DEFAULT 0,
	base_total_amount   NUMERIC(19,6)  NOT NULL DEFAULT 0,
	status              VARCHAR(20)    NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
	assigned_to         UUID           REFERENCES user_account(id),
	compliance_status   VARCHAR(10)    NOT NULL DEFAULT 'pending'
		CHECK (compliance_status IN ('pending', 'cleared', 'held')),
	opportunity_id      UUID,           -- FK to opportunity(id) — added below after opportunity table
	notes               TEXT,
	ext                 JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by          UUID           NOT NULL REFERENCES user_account(id),
	updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by          UUID           NOT NULL REFERENCES user_account(id),
	version             INTEGER        NOT NULL DEFAULT 1,
	deleted_at          TIMESTAMPTZ,
	UNIQUE (entity_id, quote_number)
);

CREATE TRIGGER quote_audit_stamp
	BEFORE INSERT OR UPDATE ON quote
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_quote_entity_status
	ON quote (entity_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quote_customer
	ON quote (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS quote_line (
	id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	quote_id         UUID           NOT NULL REFERENCES quote(id),
	line_number      INTEGER        NOT NULL,
	product_id       UUID           REFERENCES product(id),
	description      VARCHAR(500)   NOT NULL,
	quantity         NUMERIC(16,4)  NOT NULL CHECK (quantity > 0),
	unit_price       NUMERIC(19,6)  NOT NULL,
	discount_percent NUMERIC(5,2)   NOT NULL DEFAULT 0,
	amount           NUMERIC(19,6)  NOT NULL,
	currency_code    CHAR(3)        NOT NULL,
	tax_code         VARCHAR(20),
	tax_amount       NUMERIC(19,6)  NOT NULL DEFAULT 0,
	created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (quote_id, line_number)
);

CREATE INDEX IF NOT EXISTS ix_quote_line_quote
	ON quote_line (quote_id);

-- ── Sales Order ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_order (
	id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id            UUID           NOT NULL REFERENCES legal_entity(id),
	customer_id          UUID           NOT NULL REFERENCES customer(id),
	quote_id             UUID           REFERENCES quote(id),
	order_number         VARCHAR(30)    NOT NULL,
	order_date           DATE           NOT NULL,
	required_date        DATE,
	currency_code        CHAR(3)        NOT NULL REFERENCES currency(code),
	exchange_rate        NUMERIC(18,10) NOT NULL DEFAULT 1.0,
	subtotal_amount      NUMERIC(19,6)  NOT NULL DEFAULT 0,
	tax_amount           NUMERIC(19,6)  NOT NULL DEFAULT 0,
	total_amount         NUMERIC(19,6)  NOT NULL DEFAULT 0,
	base_total_amount    NUMERIC(19,6)  NOT NULL DEFAULT 0,
	status               VARCHAR(30)    NOT NULL DEFAULT 'DRAFT'
		CHECK (status IN ('DRAFT', 'CONFIRMED', 'PENDING_COMPLIANCE_CHECK', 'RELEASED_TO_FULFILLMENT', 'PARTIALLY_SHIPPED', 'SHIPPED', 'INVOICED', 'CLOSED', 'CANCELLED')),
	shipping_address_id  UUID           REFERENCES customer_address(id),
	billing_address_id   UUID           REFERENCES customer_address(id),
	payment_terms        VARCHAR(30),
	assigned_to          UUID           REFERENCES user_account(id),
	compliance_status    VARCHAR(10)    NOT NULL DEFAULT 'pending'
		CHECK (compliance_status IN ('pending', 'cleared', 'held')),
	itar_compartment_id  UUID           REFERENCES itar_compartment(id),
	notes                TEXT,
	ext                  JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by           UUID           NOT NULL REFERENCES user_account(id),
	updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by           UUID           NOT NULL REFERENCES user_account(id),
	version              INTEGER        NOT NULL DEFAULT 1,
	deleted_at           TIMESTAMPTZ,
	UNIQUE (entity_id, order_number)
);

CREATE TRIGGER sales_order_audit_stamp
	BEFORE INSERT OR UPDATE ON sales_order
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_so_entity_status
	ON sales_order (entity_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_so_customer
	ON sales_order (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_so_compliance
	ON sales_order (compliance_status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sales_order_line (
	id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	sales_order_id      UUID           NOT NULL REFERENCES sales_order(id),
	line_number         INTEGER        NOT NULL,
	product_id          UUID           REFERENCES product(id),
	description         VARCHAR(500)   NOT NULL,
	quantity_ordered    NUMERIC(16,4)  NOT NULL CHECK (quantity_ordered > 0),
	quantity_shipped    NUMERIC(16,4)  NOT NULL DEFAULT 0,
	quantity_invoiced   NUMERIC(16,4)  NOT NULL DEFAULT 0,
	unit_price          NUMERIC(19,6)  NOT NULL,
	discount_percent    NUMERIC(5,2)   NOT NULL DEFAULT 0,
	amount              NUMERIC(19,6)  NOT NULL,
	currency_code       CHAR(3)        NOT NULL,
	tax_code            VARCHAR(20),
	tax_amount          NUMERIC(19,6)  NOT NULL DEFAULT 0,
	account_id          UUID           REFERENCES account(id),
	ext                 JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
	UNIQUE (sales_order_id, line_number)
);

CREATE INDEX IF NOT EXISTS ix_sol_sales_order
	ON sales_order_line (sales_order_id);

-- ── Return Merchandise Authorization ─────────────────────────────────────────

CREATE TYPE IF NOT EXISTS return_status AS ENUM (
	'REQUESTED', 'APPROVED', 'RECEIVED', 'INSPECTED', 'RESOLVED'
);

CREATE TABLE IF NOT EXISTS return_authorization (
	id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id       UUID           NOT NULL REFERENCES legal_entity(id),
	sales_order_id  UUID           NOT NULL REFERENCES sales_order(id),
	customer_id     UUID           NOT NULL REFERENCES customer(id),
	ra_number       VARCHAR(30)    NOT NULL UNIQUE,
	status          return_status  NOT NULL DEFAULT 'REQUESTED',
	reason          TEXT,
	requested_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
	approved_by     UUID           REFERENCES user_account(id),
	created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by      UUID           NOT NULL REFERENCES user_account(id),
	updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by      UUID           NOT NULL REFERENCES user_account(id),
	version         INTEGER        NOT NULL DEFAULT 1,
	deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER return_authorization_audit_stamp
	BEFORE INSERT OR UPDATE ON return_authorization
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_ra_sales_order
	ON return_authorization (sales_order_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_ra_customer
	ON return_authorization (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS return_authorization_line (
	id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	return_authorization_id  UUID           NOT NULL REFERENCES return_authorization(id),
	sales_order_line_id      UUID           NOT NULL REFERENCES sales_order_line(id),
	product_id               UUID           REFERENCES product(id),
	quantity_returned        NUMERIC(16,4)  NOT NULL CHECK (quantity_returned > 0),
	quantity_received        NUMERIC(16,4)  NOT NULL DEFAULT 0,
	quantity_restocked       NUMERIC(16,4)  NOT NULL DEFAULT 0,
	disposition              VARCHAR(20)    CHECK (disposition IN ('RESTOCK', 'SCRAP', 'REPAIR')),
	credit_amount            NUMERIC(19,6),
	credit_currency_code     CHAR(3),
	created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by               UUID           NOT NULL REFERENCES user_account(id),
	updated_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by               UUID           NOT NULL REFERENCES user_account(id),
	version                  INTEGER        NOT NULL DEFAULT 1,
	CHECK (quantity_received >= 0 AND quantity_received <= quantity_returned),
	CHECK (quantity_restocked >= 0 AND quantity_restocked <= quantity_received)
);

CREATE INDEX IF NOT EXISTS ix_ral_return_auth
	ON return_authorization_line (return_authorization_id);

-- ── CRM: Company ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_company (
	id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id             UUID          NOT NULL REFERENCES legal_entity(id),
	name                  VARCHAR(255)  NOT NULL,
	domain                VARCHAR(255),
	industry              VARCHAR(100),
	employee_count_range  VARCHAR(20),
	annual_revenue_range  VARCHAR(30),
	country_code          CHAR(2),
	phone                 VARCHAR(50),
	website               VARCHAR(500),
	customer_id           UUID          REFERENCES customer(id),
	vendor_id             UUID          REFERENCES vendor(id),
	owner_user_id         UUID          REFERENCES user_account(id),
	ext                   JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by            UUID          NOT NULL REFERENCES user_account(id),
	updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by            UUID          NOT NULL REFERENCES user_account(id),
	version               INTEGER       NOT NULL DEFAULT 1,
	deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER crm_company_audit_stamp
	BEFORE INSERT OR UPDATE ON crm_company
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_crmc_entity
	ON crm_company (entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_crmc_customer
	ON crm_company (customer_id) WHERE customer_id IS NOT NULL;

-- ── CRM: Contact ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_contact (
	id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id        UUID          NOT NULL REFERENCES legal_entity(id),
	crm_company_id   UUID          REFERENCES crm_company(id),
	first_name       VARCHAR(100)  NOT NULL,
	last_name        VARCHAR(100)  NOT NULL,
	email            VARCHAR(255),
	phone            VARCHAR(50),
	mobile           VARCHAR(50),
	job_title        VARCHAR(100),
	department       VARCHAR(100),
	country_code     CHAR(2),
	address          JSONB,
	do_not_contact   BOOLEAN       NOT NULL DEFAULT FALSE,
	owner_user_id    UUID          REFERENCES user_account(id),
	source           VARCHAR(50),
	ext              JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by       UUID          NOT NULL REFERENCES user_account(id),
	updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by       UUID          NOT NULL REFERENCES user_account(id),
	version          INTEGER       NOT NULL DEFAULT 1,
	deleted_at       TIMESTAMPTZ
);

CREATE TRIGGER crm_contact_audit_stamp
	BEFORE INSERT OR UPDATE ON crm_contact
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_crmct_company
	ON crm_contact (crm_company_id) WHERE crm_company_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_crmct_email
	ON crm_contact (email) WHERE email IS NOT NULL AND deleted_at IS NULL;

-- ── CRM: Company Relationship ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_relationship (
	id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id           UUID         NOT NULL REFERENCES legal_entity(id),
	parent_company_id   UUID         NOT NULL REFERENCES crm_company(id),
	child_company_id    UUID         NOT NULL REFERENCES crm_company(id),
	relationship_type   VARCHAR(30)  NOT NULL
		CHECK (relationship_type IN ('PARENT', 'SUBSIDIARY', 'PARTNER', 'JOINT_VENTURE', 'RESELLER')),
	effective_from      DATE         NOT NULL,
	effective_until     DATE,
	notes               TEXT,
	created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_by          UUID         NOT NULL REFERENCES user_account(id),
	updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_by          UUID         NOT NULL REFERENCES user_account(id),
	version             INTEGER      NOT NULL DEFAULT 1,
	deleted_at          TIMESTAMPTZ,
	CHECK (parent_company_id <> child_company_id),
	CHECK (effective_until IS NULL OR effective_until > effective_from),
	UNIQUE (parent_company_id, child_company_id, relationship_type, effective_from)
);

-- ── Pipeline Stage ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_stage (
	id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id        UUID           NOT NULL REFERENCES legal_entity(id),
	code             VARCHAR(30)    NOT NULL,
	name             VARCHAR(100)   NOT NULL,
	stage_order      INTEGER        NOT NULL,
	win_probability  NUMERIC(5,2),
	is_closed_won    BOOLEAN        NOT NULL DEFAULT FALSE,
	is_closed_lost   BOOLEAN        NOT NULL DEFAULT FALSE,
	created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by       UUID           NOT NULL REFERENCES user_account(id),
	UNIQUE (entity_id, code),
	UNIQUE (entity_id, stage_order)
);

-- ── Opportunity ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opportunity (
	id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id             UUID           NOT NULL REFERENCES legal_entity(id),
	crm_company_id        UUID           REFERENCES crm_company(id),
	customer_id           UUID           REFERENCES customer(id),
	name                  VARCHAR(255)   NOT NULL,
	description           TEXT,
	pipeline_stage_id     UUID           NOT NULL REFERENCES pipeline_stage(id),
	amount                NUMERIC(19,6),
	currency_code         CHAR(3),
	probability           NUMERIC(5,2),
	expected_close_date   DATE,
	actual_close_date     DATE,
	owner_user_id         UUID           REFERENCES user_account(id),
	source                VARCHAR(50),
	lost_reason           VARCHAR(255),
	ext                   JSONB          NOT NULL DEFAULT '{}'::jsonb,
	created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
	created_by            UUID           NOT NULL REFERENCES user_account(id),
	updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
	updated_by            UUID           NOT NULL REFERENCES user_account(id),
	version               INTEGER        NOT NULL DEFAULT 1,
	deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER opportunity_audit_stamp
	BEFORE INSERT OR UPDATE ON opportunity
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_opp_entity_stage
	ON opportunity (entity_id, pipeline_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_opp_company
	ON opportunity (crm_company_id) WHERE crm_company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS opportunity_line (
	id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
	opportunity_id  UUID           NOT NULL REFERENCES opportunity(id),
	product_id      UUID           REFERENCES product(id),
	description     VARCHAR(500)   NOT NULL,
	quantity        NUMERIC(16,4)  NOT NULL DEFAULT 1,
	unit_price      NUMERIC(19,6)  NOT NULL,
	amount          NUMERIC(19,6)  NOT NULL,
	currency_code   CHAR(3)        NOT NULL,
	created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_opl_opportunity
	ON opportunity_line (opportunity_id);

-- ── Activity ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity (
	id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id        UUID          NOT NULL REFERENCES legal_entity(id),
	activity_type    VARCHAR(20)   NOT NULL CHECK (activity_type IN ('CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE')),
	subject          VARCHAR(255)  NOT NULL,
	description      TEXT,
	crm_contact_id   UUID          REFERENCES crm_contact(id),
	crm_company_id   UUID          REFERENCES crm_company(id),
	opportunity_id   UUID          REFERENCES opportunity(id),
	lead_id          UUID,          -- FK to lead(id) — added below after lead table
	owner_user_id    UUID          NOT NULL REFERENCES user_account(id),
	due_date         TIMESTAMPTZ,
	completed_at     TIMESTAMPTZ,
	is_completed     BOOLEAN       NOT NULL DEFAULT FALSE,
	ext              JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by       UUID          NOT NULL REFERENCES user_account(id),
	updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by       UUID          NOT NULL REFERENCES user_account(id),
	version          INTEGER       NOT NULL DEFAULT 1,
	deleted_at       TIMESTAMPTZ
);

CREATE TRIGGER activity_audit_stamp
	BEFORE INSERT OR UPDATE ON activity
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_activity_opportunity
	ON activity (opportunity_id) WHERE opportunity_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_activity_company
	ON activity (crm_company_id) WHERE crm_company_id IS NOT NULL AND deleted_at IS NULL;

-- ── Lead ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead (
	id                         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id                  UUID          NOT NULL REFERENCES legal_entity(id),
	first_name                 VARCHAR(100)  NOT NULL,
	last_name                  VARCHAR(100)  NOT NULL,
	email                      VARCHAR(255),
	phone                      VARCHAR(50),
	company_name               VARCHAR(255),
	job_title                  VARCHAR(100),
	source                     VARCHAR(50),
	status                     VARCHAR(20)   NOT NULL DEFAULT 'NEW'
		CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED')),
	owner_user_id              UUID          REFERENCES user_account(id),
	converted_contact_id       UUID          REFERENCES crm_contact(id),
	converted_opportunity_id   UUID          REFERENCES opportunity(id),
	converted_at               TIMESTAMPTZ,
	notes                      TEXT,
	ext                        JSONB         NOT NULL DEFAULT '{}'::jsonb,
	created_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
	created_by                 UUID          NOT NULL REFERENCES user_account(id),
	updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
	updated_by                 UUID          NOT NULL REFERENCES user_account(id),
	version                    INTEGER       NOT NULL DEFAULT 1,
	deleted_at                 TIMESTAMPTZ
);

CREATE TRIGGER lead_audit_stamp
	BEFORE INSERT OR UPDATE ON lead
	FOR EACH ROW EXECUTE FUNCTION audit_stamp();

CREATE INDEX IF NOT EXISTS ix_lead_entity_status
	ON lead (entity_id, status) WHERE deleted_at IS NULL;

-- ── WP-5 FK fixups: wire deferred FK constraints now that tables exist ─────────

-- quote.opportunity_id → opportunity(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quote_opportunity_id_fk'
	) THEN
		ALTER TABLE quote ADD CONSTRAINT quote_opportunity_id_fk
			FOREIGN KEY (opportunity_id) REFERENCES opportunity(id);
	END IF;
END $$;

-- activity.lead_id → lead(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'activity_lead_id_fk'
	) THEN
		ALTER TABLE activity ADD CONSTRAINT activity_lead_id_fk
			FOREIGN KEY (lead_id) REFERENCES lead(id);
	END IF;
END $$;

-- customer_invoice.customer_id → customer(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoice_customer_id_fk'
	) THEN
		ALTER TABLE customer_invoice ADD CONSTRAINT customer_invoice_customer_id_fk
			FOREIGN KEY (customer_id) REFERENCES customer(id);
	END IF;
END $$;

-- customer_invoice.sales_order_id → sales_order(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoice_sales_order_id_fk'
	) THEN
		ALTER TABLE customer_invoice ADD CONSTRAINT customer_invoice_sales_order_id_fk
			FOREIGN KEY (sales_order_id) REFERENCES sales_order(id);
	END IF;
END $$;

-- customer_invoice_line.product_id → product(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoice_line_product_id_fk'
	) THEN
		ALTER TABLE customer_invoice_line ADD CONSTRAINT customer_invoice_line_product_id_fk
			FOREIGN KEY (product_id) REFERENCES product(id);
	END IF;
END $$;

-- customer_payment.customer_id → customer(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'customer_payment_customer_id_fk'
	) THEN
		ALTER TABLE customer_payment ADD CONSTRAINT customer_payment_customer_id_fk
			FOREIGN KEY (customer_id) REFERENCES customer(id);
	END IF;
END $$;

-- dunning_letter.customer_id → customer(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'dunning_letter_customer_id_fk'
	) THEN
		ALTER TABLE dunning_letter ADD CONSTRAINT dunning_letter_customer_id_fk
			FOREIGN KEY (customer_id) REFERENCES customer(id);
	END IF;
END $$;

-- shipment.sales_order_id → sales_order(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'shipment_sales_order_id_fk'
	) THEN
		ALTER TABLE shipment ADD CONSTRAINT shipment_sales_order_id_fk
			FOREIGN KEY (sales_order_id) REFERENCES sales_order(id);
	END IF;
END $$;

-- shipment.customer_id → customer(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'shipment_customer_id_fk'
	) THEN
		ALTER TABLE shipment ADD CONSTRAINT shipment_customer_id_fk
			FOREIGN KEY (customer_id) REFERENCES customer(id);
	END IF;
END $$;

-- shipment_line.sales_order_line_id → sales_order_line(id)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'shipment_line_sales_order_line_id_fk'
	) THEN
		ALTER TABLE shipment_line ADD CONSTRAINT shipment_line_sales_order_line_id_fk
			FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_line(id);
	END IF;
END $$;

-- product_classification.product_id → product(id)
-- (was plain UUID stub since WP-3, product table now exists)
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'product_classification_product_id_fk'
	) THEN
		ALTER TABLE product_classification ADD CONSTRAINT product_classification_product_id_fk
			FOREIGN KEY (product_id) REFERENCES product(id);
	END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- WP-1: AuthN Schema — PLT-006
-- Tables: authn_sessions, authn_identity_links
-- Columns added to user_account: MFA + lockout fields
-- Ref: SD-004-authn-provider-abstraction.md §6
-- Issue: hx-96f7639a
-- ─────────────────────────────────────────────────────────────────────────────

-- MFA and lockout columns on user_account (idempotent ADD COLUMN IF NOT EXISTS)
ALTER TABLE user_account
	ADD COLUMN IF NOT EXISTS mfa_totp_secret       TEXT        NULL,
	ADD COLUMN IF NOT EXISTS mfa_enabled            BOOLEAN     NOT NULL DEFAULT FALSE,
	ADD COLUMN IF NOT EXISTS failed_login_count     INTEGER     NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ NULL;

-- Session store: one row per browser session
-- revoked_at = NULL means active; non-null means forcibly revoked
CREATE TABLE IF NOT EXISTS authn_sessions (
	id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id       UUID        NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
	expires_at    TIMESTAMPTZ NOT NULL,
	ip_address    INET        NOT NULL,
	user_agent    TEXT        NOT NULL,
	mfa_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
	provider      TEXT        NOT NULL CHECK (provider IN ('oidc', 'saml')),
	revoked_at    TIMESTAMPTZ NULL,
	-- Optional: encrypted IdP refresh token for background OIDC token refresh
	idp_refresh_token_enc TEXT NULL
);

-- Fast lookup of active sessions for a user (session list UI + revokeAll)
CREATE INDEX IF NOT EXISTS idx_authn_sessions_user_id
	ON authn_sessions(user_id)
	WHERE revoked_at IS NULL;

-- Fast sweep of expired sessions for cleanup jobs
CREATE INDEX IF NOT EXISTS idx_authn_sessions_expires_at
	ON authn_sessions(expires_at)
	WHERE revoked_at IS NULL;

-- IdP identity → local user_account mapping
-- One user can have multiple IdP links (OIDC + SAML, or multiple OIDC tenants)
CREATE TABLE IF NOT EXISTS authn_identity_links (
	id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     UUID        NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
	provider    TEXT        NOT NULL CHECK (provider IN ('oidc', 'saml')),
	external_id TEXT        NOT NULL,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (provider, external_id)
);

-- Fast reverse lookup: user_id → identity links (for profile management)
CREATE INDEX IF NOT EXISTS idx_authn_identity_links_user_id
	ON authn_identity_links(user_id);
