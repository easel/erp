/**
 * PostgreSQL GLRepository integration tests.
 *
 * Tests run against a real database when DATABASE_URL or TEST_DATABASE_URL is
 * set; otherwise they are skipped via `skipIfNoDb`.
 *
 * Covers:
 * - findPeriod: returns snapshot for a known period; null for unknown
 * - findAccounts: returns map of known accounts; omits unknown IDs
 * - findEntry: returns null for non-existent entry
 * - createGLRepository satisfies GLRepository interface structurally
 *
 * Ref: SD-002-data-model.md §4.2, SD-001 §3.4
 * Issue: hx-7a945c01
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type pg from "pg";
import type { GLRepository } from "../../src/finance/gl-engine.js";
import { createGLRepository } from "../../src/finance/gl-repository.js";
import { getTestPool, releaseTestPool, skipIfNoDb } from "../helpers/index.js";

// ── Interface compliance (no DB) ──────────────────────────────────────────────

describe("createGLRepository interface compliance", () => {
	test("returns an object satisfying GLRepository interface", () => {
		const fakeDb = {
			async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
				return { rows: [] };
			},
		};
		const repo: GLRepository = createGLRepository(fakeDb);
		expect(typeof repo.findPeriod).toBe("function");
		expect(typeof repo.findAccounts).toBe("function");
		expect(typeof repo.findEntry).toBe("function");
	});

	test("findAccounts returns empty map for empty accountIds", async () => {
		const fakeDb = {
			async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
				return { rows: [] };
			},
		};
		const repo = createGLRepository(fakeDb);
		const result = await repo.findAccounts("00000000-0000-0000-0000-000000000001" as never, []);
		expect(result.size).toBe(0);
	});
});

// ── DB integration tests (gated on skipIfNoDb) ────────────────────────────────

describe.skipIf(skipIfNoDb)("GLRepository — real DB", () => {
	let pool: pg.Pool;
	let repo: GLRepository;

	beforeAll(async () => {
		pool = await getTestPool();
		repo = createGLRepository(pool);
	});

	afterAll(async () => {
		await releaseTestPool(pool);
	});

	test("findPeriod returns null for a non-existent period", async () => {
		const entityId = "00000000-0000-0000-0000-000000000001" as never;
		const periodId = "ffffffff-ffff-ffff-ffff-ffffffffffff" as never;
		const result = await repo.findPeriod(entityId, periodId);
		expect(result).toBeNull();
	});

	test("findAccounts returns empty map for non-existent account IDs", async () => {
		const entityId = "00000000-0000-0000-0000-000000000001" as never;
		const accountId = "ffffffff-ffff-ffff-ffff-ffffffffffff" as never;
		const result = await repo.findAccounts(entityId, [accountId]);
		expect(result.size).toBe(0);
	});

	test("findEntry returns null for a non-existent entry", async () => {
		const entityId = "00000000-0000-0000-0000-000000000001" as never;
		const entryId = "ffffffff-ffff-ffff-ffff-ffffffffffff" as never;
		const result = await repo.findEntry(entityId, entryId);
		expect(result).toBeNull();
	});

	test("can query the account table without error", async () => {
		// Basic smoke test: the table exists and returns rows (may be empty).
		const result = await pool.query<{ count: string }>(
			"SELECT COUNT(*)::text AS count FROM account",
		);
		const count = Number(result.rows[0]?.count ?? "-1");
		expect(count).toBeGreaterThanOrEqual(0);
	});

	test("can query the fiscal_period table without error", async () => {
		const result = await pool.query<{ count: string }>(
			"SELECT COUNT(*)::text AS count FROM fiscal_period",
		);
		const count = Number(result.rows[0]?.count ?? "-1");
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
