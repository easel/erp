/**
 * PostgreSQL-backed GLRepository adapter.
 *
 * Implements the GLRepository interface from gl-engine.ts using `pg` queries
 * against the `fiscal_period`, `account`, `journal_entry`, and
 * `journal_entry_line` tables defined in the migration.
 *
 * Design:
 * - Accepts a DbClient (structural: works with pg.Pool or pg.PoolClient).
 * - Returns domain snapshots (camelCase) mapped from snake_case DB rows.
 * - Uses parameterised queries throughout — no string interpolation of IDs.
 *
 * Ref: SD-002-data-model.md §4.1–4.2, SD-001 §3.4 (Data Layer)
 * Issue: hx-7a945c01
 */

import type { UUID } from "@apogee/shared";
import type { DbClient } from "../db.js";
import type {
	FiscalPeriodSnapshot,
	FiscalPeriodStatus,
	GLAccountSnapshot,
	GLRepository,
	JournalEntrySnapshot,
	JournalEntryStatus,
	JournalLineSnapshot,
} from "./gl-engine.js";

// ── DB row types ───────────────────────────────────────────────────────────────

interface FiscalPeriodRow {
	id: string;
	entity_id: string;
	status: string;
	period_label: string;
}

interface AccountRow {
	id: string;
	entity_id: string;
	account_number: string;
	is_header: boolean;
	is_active: boolean;
	currency_code: string | null;
}

interface JournalEntryRow {
	id: string;
	entity_id: string;
	status: string;
	entry_number: string;
	description: string;
	fiscal_period_id: string;
}

interface JournalEntryLineRow {
	id: string;
	account_id: string;
	description: string | null;
	debit_amount: string;
	credit_amount: string;
	currency_code: string;
	exchange_rate: string;
	base_debit_amount: string;
	base_credit_amount: string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Create a GLRepository backed by a real PostgreSQL connection.
 *
 * @param db  Any DbClient (pg.Pool, pg.PoolClient, or test double).
 */
export function createGLRepository(db: DbClient): GLRepository {
	return {
		async findPeriod(entityId: UUID, periodId: UUID): Promise<FiscalPeriodSnapshot | null> {
			const result = await db.query<FiscalPeriodRow>(
				`SELECT id, entity_id, status, period_label
				 FROM fiscal_period
				 WHERE id = $1 AND entity_id = $2
				 LIMIT 1`,
				[periodId, entityId],
			);
			const row = result.rows[0];
			if (!row) return null;
			return {
				id: row.id as UUID,
				entityId: row.entity_id as UUID,
				status: row.status as FiscalPeriodStatus,
				periodLabel: row.period_label,
			};
		},

		async findAccounts(entityId: UUID, accountIds: UUID[]): Promise<Map<UUID, GLAccountSnapshot>> {
			const map = new Map<UUID, GLAccountSnapshot>();
			if (accountIds.length === 0) return map;

			// Build parameterised IN clause: $1 = entityId, $2..$N = accountIds
			const placeholders = accountIds.map((_, i) => `$${i + 2}`).join(", ");
			const result = await db.query<AccountRow>(
				`SELECT id, entity_id, account_number, is_header, is_active, currency_code
				 FROM account
				 WHERE entity_id = $1
				   AND id IN (${placeholders})
				   AND deleted_at IS NULL`,
				[entityId, ...accountIds],
			);
			for (const row of result.rows) {
				map.set(row.id as UUID, {
					id: row.id as UUID,
					entityId: row.entity_id as UUID,
					accountNumber: row.account_number,
					isHeader: row.is_header,
					isActive: row.is_active,
					currencyCode: row.currency_code,
				});
			}
			return map;
		},

		async findEntry(entityId: UUID, entryId: UUID): Promise<JournalEntrySnapshot | null> {
			const entryResult = await db.query<JournalEntryRow>(
				`SELECT id, entity_id, status, entry_number, description, fiscal_period_id
				 FROM journal_entry
				 WHERE id = $1 AND entity_id = $2 AND deleted_at IS NULL
				 LIMIT 1`,
				[entryId, entityId],
			);
			const entryRow = entryResult.rows[0];
			if (!entryRow) return null;

			const linesResult = await db.query<JournalEntryLineRow>(
				`SELECT id, account_id, description,
				        debit_amount::text, credit_amount::text,
				        currency_code, exchange_rate::text,
				        base_debit_amount::text, base_credit_amount::text
				 FROM journal_entry_line
				 WHERE journal_entry_id = $1
				 ORDER BY line_number`,
				[entryId],
			);

			const lines: JournalLineSnapshot[] = linesResult.rows.map((l) => ({
				id: l.id as UUID,
				accountId: l.account_id as UUID,
				description: l.description,
				debitAmount: l.debit_amount,
				creditAmount: l.credit_amount,
				currencyCode: l.currency_code,
				exchangeRate: l.exchange_rate,
				baseDebitAmount: l.base_debit_amount,
				baseCreditAmount: l.base_credit_amount,
			}));

			return {
				id: entryRow.id as UUID,
				entityId: entryRow.entity_id as UUID,
				status: entryRow.status as JournalEntryStatus,
				entryNumber: entryRow.entry_number,
				description: entryRow.description,
				fiscalPeriodId: entryRow.fiscal_period_id as UUID,
				lines,
			};
		},
	};
}
