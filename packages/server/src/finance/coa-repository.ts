/**
 * PostgreSQL-backed COARepository adapter.
 *
 * Implements the COARepository interface from coa-service.ts using `pg`
 * queries against the `account` table defined in the migration.
 *
 * Design:
 * - Accepts a DbClient (structural: works with pg.Pool, pg.PoolClient, or test double).
 * - Returns domain AccountSnapshot (camelCase) mapped from snake_case DB rows.
 * - Respects soft-delete: queries filter `deleted_at IS NULL`.
 *
 * Ref: SD-002-data-model.md §4.1, SD-001 §3.4 (Data Layer)
 * Issue: hx-7a945c01
 */

import type { UUID } from "@apogee/shared";
import type { DbClient } from "../db.js";
import type { AccountSnapshot, AccountType, COARepository, NormalBalance } from "./coa-service.js";

// ── DB row type ───────────────────────────────────────────────────────────────

interface AccountRow {
	id: string;
	entity_id: string;
	account_number: string;
	account_type: string;
	normal_balance: string;
	is_header: boolean;
	is_active: boolean;
	parent_account_id: string | null;
	currency_code: string | null;
	itar_compartment_id: string | null;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function rowToSnapshot(row: AccountRow): AccountSnapshot {
	return {
		id: row.id as UUID,
		entityId: row.entity_id as UUID,
		accountNumber: row.account_number,
		accountType: row.account_type as AccountType,
		normalBalance: row.normal_balance as NormalBalance,
		isHeader: row.is_header,
		isActive: row.is_active,
		parentAccountId: (row.parent_account_id as UUID | null) ?? null,
		currencyCode: row.currency_code,
		itarCompartmentId: (row.itar_compartment_id as UUID | null) ?? null,
	};
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Create a COARepository backed by a real PostgreSQL connection.
 *
 * @param db  Any DbClient (pg.Pool, pg.PoolClient, or test double).
 */
export function createCOARepository(db: DbClient): COARepository {
	return {
		async findByNumber(entityId: UUID, accountNumber: string): Promise<AccountSnapshot | null> {
			const result = await db.query<AccountRow>(
				`SELECT id, entity_id, account_number, account_type, normal_balance,
				        is_header, is_active, parent_account_id, currency_code, itar_compartment_id
				 FROM account
				 WHERE entity_id = $1 AND account_number = $2 AND deleted_at IS NULL
				 LIMIT 1`,
				[entityId, accountNumber],
			);
			const row = result.rows[0];
			return row ? rowToSnapshot(row) : null;
		},

		async findById(id: UUID): Promise<AccountSnapshot | null> {
			const result = await db.query<AccountRow>(
				`SELECT id, entity_id, account_number, account_type, normal_balance,
				        is_header, is_active, parent_account_id, currency_code, itar_compartment_id
				 FROM account
				 WHERE id = $1 AND deleted_at IS NULL
				 LIMIT 1`,
				[id],
			);
			const row = result.rows[0];
			return row ? rowToSnapshot(row) : null;
		},

		async hasChildren(parentId: UUID): Promise<boolean> {
			const result = await db.query<{ exists: boolean }>(
				`SELECT EXISTS (
				    SELECT 1 FROM account
				    WHERE parent_account_id = $1 AND deleted_at IS NULL
				 ) AS exists`,
				[parentId],
			);
			return result.rows[0]?.exists ?? false;
		},
	};
}
