-- Platform schema: WP-1 foundation
-- Tables: legal_entity, user_account, RBAC, ITAR compartments, audit_entry
-- Audit trigger: audit_stamp() + trigger on legal_entity (sentinel)
-- Ref: SD-002-data-model.md §3.1–3.3
-- Issues: hx-369c3437, hx-c3e547b2

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
