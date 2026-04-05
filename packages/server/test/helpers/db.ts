/**
 * Integration test database helpers.
 *
 * Provides a PgTestPool that connects to a real PostgreSQL instance for
 * integration tests. The connection string is sourced from DATABASE_URL
 * (or TEST_DATABASE_URL). When no database is available the helpers export
 * a `skipIfNoDb` flag so tests can be skipped cleanly.
 *
 * Usage pattern:
 *
 *   import { getTestPool, releaseTestPool, skipIfNoDb } from "./helpers/db.js";
 *
 *   describe.skipIf(skipIfNoDb)("my integration test", () => {
 *     let pool: pg.Pool;
 *     beforeAll(async () => { pool = await getTestPool(); });
 *     afterAll(async () => { await releaseTestPool(pool); });
 *     test("...", async () => { ... });
 *   });
 *
 * Ref: SD-003 §7 Integration Tests
 * Issue: hx-57d6a848
 */

import pg from "pg";
const { Pool } = pg;

/** True when DATABASE_URL / TEST_DATABASE_URL is not set — skip DB tests. */
export const skipIfNoDb: boolean = !(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

/**
 * Create a pg.Pool connected to the integration test database.
 *
 * @throws if no DATABASE_URL is set — check `skipIfNoDb` first.
 */
export async function getTestPool(): Promise<pg.Pool> {
	const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"No database URL configured. Set TEST_DATABASE_URL or DATABASE_URL to run integration tests.",
		);
	}
	const pool = new Pool({ connectionString, max: 5 });
	// Verify connectivity
	const client = await pool.connect();
	client.release();
	return pool;
}

/**
 * Release a test pool after use (call in afterAll).
 */
export async function releaseTestPool(pool: pg.Pool): Promise<void> {
	await pool.end();
}

/**
 * Minimal AuthDbClient adapter wrapping a pg.Pool.
 *
 * Satisfies the `AuthDbClient` interface used by auth middleware and session
 * manager, letting real-DB integration tests use the same code paths.
 */
export function pgPoolToAuthClient(pool: pg.Pool): {
	query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
} {
	return {
		async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
			const result = await pool.query<T>(sql, params);
			return { rows: result.rows };
		},
	};
}

/**
 * Wrap a single pg.PoolClient as an AuthDbClient for transaction-scoped tests.
 */
export function pgClientToAuthClient(client: pg.PoolClient): {
	query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
} {
	return {
		async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
			const result = await client.query<T>(sql, params);
			return { rows: result.rows };
		},
	};
}
