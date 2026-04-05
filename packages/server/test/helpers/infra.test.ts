/**
 * WP7-INFRA: Integration test infrastructure smoke tests.
 *
 * Validates:
 *   - Test fixtures export correct shape (no DB required)
 *   - pgPoolToAuthClient / pgClientToAuthClient satisfy AuthDbClient interface
 *   - skipIfNoDb flag works correctly
 *   - Module fixture data is internally consistent (IDs unique, required fields set)
 *
 * DB connectivity tests are gated on skipIfNoDb — they run when DATABASE_URL
 * or TEST_DATABASE_URL is set in the environment.
 *
 * Ref: SD-003 §7 Integration Tests
 * Issue: hx-57d6a848
 */

import { describe, expect, test } from "bun:test";
import {
	ACCOUNTS,
	CUSTOMER,
	ENTITIES,
	EXCHANGE_RATES,
	FISCAL_PERIOD,
	INVENTORY_ITEM,
	PO_LINE,
	USERS,
	VENDOR,
	pgClientToAuthClient,
	pgPoolToAuthClient,
	skipIfNoDb,
} from "./index.js";

// ── Fixture shape tests (no DB) ───────────────────────────────────────────────

describe("Platform fixtures", () => {
	test("three distinct legal entities", () => {
		const ids = [ENTITIES.US.id, ENTITIES.UK.id, ENTITIES.SG.id];
		expect(new Set(ids).size).toBe(3);
		for (const entity of Object.values(ENTITIES)) {
			expect(entity.id).toMatch(/^00000000-test-/);
			expect(entity.code).toBeTruthy();
			expect(entity.baseCurrencyCode).toHaveLength(3);
		}
	});

	test("five distinct seed users with distinct roles", () => {
		const ids = Object.values(USERS).map((u) => u.id);
		expect(new Set(ids).size).toBe(5);
		const roles = Object.values(USERS).map((u) => u.role);
		expect(new Set(roles).size).toBe(5);
	});
});

describe("Finance fixtures", () => {
	test("account IDs are unique", () => {
		const ids = Object.values(ACCOUNTS);
		expect(new Set(ids).size).toBe(Object.keys(ACCOUNTS).length);
	});

	test("fiscal period has valid dates", () => {
		expect(FISCAL_PERIOD.startDate < FISCAL_PERIOD.endDate).toBe(true);
		expect(FISCAL_PERIOD.status).toBe("OPEN");
	});
});

describe("Procurement fixtures", () => {
	test("vendor has required fields", () => {
		expect(VENDOR.id).toBeTruthy();
		expect(VENDOR.code).toBeTruthy();
		expect(VENDOR.name).toBeTruthy();
	});

	test("PO line has positive quantity and price", () => {
		expect(Number(PO_LINE.quantity)).toBeGreaterThan(0);
		expect(Number(PO_LINE.unitPrice)).toBeGreaterThan(0);
	});
});

describe("Logistics fixtures", () => {
	test("inventory item has positive on-hand quantity", () => {
		expect(Number(INVENTORY_ITEM.quantityOnHand)).toBeGreaterThan(0);
	});

	test("customer is linked to a known entity", () => {
		const entityIds = Object.values(ENTITIES).map((e) => e.id);
		expect(entityIds).toContain(CUSTOMER.entityId);
	});
});

describe("Exchange rate fixtures", () => {
	test("all rates have 10 decimal places", () => {
		for (const rate of EXCHANGE_RATES) {
			const dec = rate.rate.split(".")[1] ?? "";
			expect(dec).toHaveLength(10);
		}
	});
});

// ── DB client adapter interface compliance ────────────────────────────────────

describe("pgPoolToAuthClient", () => {
	test("returns object with query method", () => {
		// We only test the structural shape here — no real pool needed
		const fakePool = {
			query: async <T>(_sql: string, _params: unknown[]) => ({ rows: [] as T[] }),
		} as unknown as import("pg").Pool;
		const client = pgPoolToAuthClient(fakePool);
		expect(typeof client.query).toBe("function");
	});
});

describe("pgClientToAuthClient", () => {
	test("returns object with query method", () => {
		const fakeClient = {
			query: async <T>(_sql: string, _params: unknown[]) => ({ rows: [] as T[] }),
		} as unknown as import("pg").PoolClient;
		const client = pgClientToAuthClient(fakeClient);
		expect(typeof client.query).toBe("function");
	});
});

// ── DB connectivity check (gated) ─────────────────────────────────────────────

describe("skipIfNoDb flag", () => {
	test("is boolean", () => {
		expect(typeof skipIfNoDb).toBe("boolean");
	});

	test("is false when DATABASE_URL is set", () => {
		if (process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL) {
			expect(skipIfNoDb).toBe(false);
		} else {
			expect(skipIfNoDb).toBe(true);
		}
	});
});

describe.skipIf(skipIfNoDb)("Database connectivity (requires DATABASE_URL)", () => {
	test("can connect and execute a query", async () => {
		const { getTestPool, releaseTestPool } = await import("./db.js");
		const pool = await getTestPool();
		try {
			const result = await pool.query<{ one: number }>("SELECT 1 AS one");
			expect(result.rows[0]?.one).toBe(1);
		} finally {
			await releaseTestPool(pool);
		}
	});
});
