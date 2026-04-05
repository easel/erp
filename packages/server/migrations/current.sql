-- Platform schema: WP-1 foundation
-- Tables: legal_entity, user_account, RBAC, ITAR compartments, audit_entry
-- Ref: SD-002-data-model.md §3.1–3.3
-- Issue: hx-369c3437

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
