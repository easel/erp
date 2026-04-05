/**
 * Database pool factory.
 *
 * Creates a pg.Pool from the DATABASE_URL environment variable (or an
 * explicit connection string passed during testing). The pool is a singleton
 * per process — call `getPool()` to obtain the shared instance.
 *
 * Design:
 * - Uses `pg` directly (no Kysely ORM at this phase). SD-001 lists Kysely as
 *   the intended query builder; adoption is deferred to a follow-on issue
 *   (hx-7a945c01 deliberate deviation: pg driver used initially for simplicity
 *   and to avoid adding a dependency before the schema stabilises).
 * - Pool is lazy — not created until first call to `getPool()`.
 * - `closePool()` is provided for clean shutdown and test teardown.
 *
 * Ref: SD-001 §2 (Technology Stack — ORM / Query Builder), SD-003-WP1
 * Issue: hx-7a945c01
 */

import pg from "pg";

let _pool: pg.Pool | null = null;

/**
 * Return the shared pg.Pool, creating it lazily on first call.
 * Uses DATABASE_URL from the environment unless `connectionString` is provided.
 */
export function getPool(connectionString?: string): pg.Pool {
	if (_pool) return _pool;
	const cs = connectionString ?? process.env.DATABASE_URL;
	if (!cs) {
		throw new Error(
			"No database connection string available. " +
				"Set DATABASE_URL or pass connectionString to getPool().",
		);
	}
	_pool = new pg.Pool({ connectionString: cs, max: 20 });
	return _pool;
}

/**
 * Close the shared pool and reset the singleton.
 * Call during server shutdown or test teardown.
 */
export async function closePool(): Promise<void> {
	if (_pool) {
		await _pool.end();
		_pool = null;
	}
}

/**
 * Structural query interface satisfied by pg.Pool, pg.PoolClient, and pg.Client.
 * Used throughout the repository layer to avoid hard dependencies on the
 * concrete pg types in pure-domain modules.
 */
export interface DbClient {
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
