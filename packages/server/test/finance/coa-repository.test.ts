/**
 * PostgreSQL COARepository integration tests.
 *
 * Tests run against a real database when DATABASE_URL or TEST_DATABASE_URL is
 * set; otherwise they are skipped via `skipIfNoDb`.
 *
 * Covers:
 * - createCOARepository satisfies COARepository interface structurally
 * - findByNumber: returns null for unknown account
 * - findById: returns null for unknown ID
 * - hasChildren: returns false for unknown parent
 *
 * Ref: SD-002-data-model.md §4.1, SD-001 §3.4
 * Issue: hx-7a945c01
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type pg from "pg";
import { createCOARepository } from "../../src/finance/coa-repository.js";
import type { COARepository } from "../../src/finance/coa-service.js";
import { getTestPool, releaseTestPool, skipIfNoDb } from "../helpers/index.js";

// ── Interface compliance (no DB) ──────────────────────────────────────────────

describe("createCOARepository interface compliance", () => {
	test("returns an object satisfying COARepository interface", () => {
		const fakeDb = {
			async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
				return { rows: [] };
			},
		};
		const repo: COARepository = createCOARepository(fakeDb);
		expect(typeof repo.findByNumber).toBe("function");
		expect(typeof repo.findById).toBe("function");
		expect(typeof repo.hasChildren).toBe("function");
	});
});

// ── DB integration tests (gated on skipIfNoDb) ────────────────────────────────

describe.skipIf(skipIfNoDb)("COARepository — real DB", () => {
	let pool: pg.Pool;
	let repo: COARepository;

	beforeAll(async () => {
		pool = await getTestPool();
		repo = createCOARepository(pool);
	});

	afterAll(async () => {
		await releaseTestPool(pool);
	});

	test("findByNumber returns null for non-existent account number", async () => {
		const entityId = "00000000-0000-0000-0000-000000000001" as never;
		const result = await repo.findByNumber(entityId, "ZZZZ-9999");
		expect(result).toBeNull();
	});

	test("findById returns null for non-existent account ID", async () => {
		const id = "ffffffff-ffff-ffff-ffff-ffffffffffff" as never;
		const result = await repo.findById(id);
		expect(result).toBeNull();
	});

	test("hasChildren returns false for non-existent parent ID", async () => {
		const parentId = "ffffffff-ffff-ffff-ffff-ffffffffffff" as never;
		const result = await repo.hasChildren(parentId);
		expect(result).toBe(false);
	});

	test("can query the account table without error", async () => {
		const result = await pool.query<{ count: string }>(
			"SELECT COUNT(*)::text AS count FROM account",
		);
		const count = Number(result.rows[0]?.count ?? "-1");
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
