/**
 * WP7-PERF: Domain-level performance benchmarks.
 *
 * Validates that core domain functions meet Phase 1 performance SLAs without
 * requiring a running database or HTTP server. These benchmarks exercise the
 * pure domain functions at production-representative data volumes.
 *
 * SLA targets (from SD-003-WP7):
 *   - Financial report generation (trial balance + income statement + balance sheet):
 *     1000-account entity < 100ms, 50-entity consolidation < 10s
 *   - Batch denied-party screening (1000 parties): < 30s
 *   - Three-way match (1000 PO lines): < 1s
 *
 * Note: These tests run in-process with Bun's timer. HTTP-layer performance
 * (p95 API response < 500ms, 500 concurrent users) requires a running server
 * and is covered by the k6 load test scripts in this directory.
 *
 * Ref: SD-003-WP7 §WP7-PERF performance SLAs
 * Issue: hx-beff0d61
 */

import { describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import {
	type EliminationAdjustment,
	type GLBalanceSnapshot,
	type ReportAccountSnapshot,
	type TrialBalance,
	buildBalanceSheet,
	buildConsolidatedReport,
	buildIncomeStatement,
	buildTrialBalance,
} from "../../src/finance/rpt-service.js";
import {
	bestMatchScore,
	normaliseScreeningName,
} from "../../src/compliance/export-control-service.js";
import {
	type BillLineSnapshot,
	type GoodsReceiptLineSnapshot,
	type POLineSnapshot,
	performThreeWayMatch,
} from "../../src/procurement/gr-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Data generators
// ─────────────────────────────────────────────────────────────────────────────

function uuid(s: string): UUID {
	return s as UUID;
}

/** Pad integer n to 12 hex digits for a UUID suffix. */
function hexPad(n: number): string {
	return n.toString(16).padStart(12, "0");
}

/** Account types cycling over the five possible types. */
const ACCT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const NORMAL_BALANCES = ["DEBIT", "CREDIT", "CREDIT", "CREDIT", "DEBIT"] as const;

/**
 * Generate a ReportAccountSnapshot map with `count` accounts.
 * Accounts cycle through all five types evenly.
 */
function generateAccountsMap(count: number): ReadonlyMap<UUID, ReportAccountSnapshot> {
	const map = new Map<UUID, ReportAccountSnapshot>();
	for (let i = 0; i < count; i++) {
		const id = uuid(`00000000-acct-0000-0000-${hexPad(i + 1)}`);
		const typeIdx = i % ACCT_TYPES.length;
		map.set(id, {
			id,
			accountNumber: (1000 + i).toString(),
			name: `Account ${i + 1}`,
			accountType: ACCT_TYPES[typeIdx] ?? "ASSET",
			normalBalance: NORMAL_BALANCES[typeIdx] ?? "DEBIT",
		});
	}
	return map;
}

/** Generate GL balance snapshots for a given entity + period. */
function generateBalances(
	entityId: UUID,
	periodId: UUID,
	accountIds: readonly UUID[],
): GLBalanceSnapshot[] {
	return accountIds.map((accountId, i) => ({
		entityId,
		accountId,
		fiscalPeriodId: periodId,
		periodDebitTotal: `${(i + 1) * 1000}.000000`,
		periodCreditTotal: `${(i + 1) * 800}.000000`,
		periodNet: `${(i + 1) * 200}.000000`,
		ytdDebitTotal: `${(i + 1) * 3000}.000000`,
		ytdCreditTotal: `${(i + 1) * 2400}.000000`,
		ytdNet: `${(i + 1) * 600}.000000`,
	}));
}

/** Build a trial balance for one entity with the given number of accounts. */
function buildEntityTrialBalance(
	entityId: UUID,
	periodId: UUID,
	accountCount: number,
	accountsMap: ReadonlyMap<UUID, ReportAccountSnapshot>,
): TrialBalance {
	const accountIds = [...accountsMap.keys()].slice(0, accountCount);
	const balances = generateBalances(entityId, periodId, accountIds);
	return buildTrialBalance(entityId, periodId, balances, accountsMap);
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial reporting benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe("Financial reporting — performance SLAs", () => {
	const PERIOD_ID = uuid("00000000-prd-00000000-0000-000000000001");
	const ACCOUNT_COUNT = 1000;
	const accountsMap = generateAccountsMap(ACCOUNT_COUNT);

	test(`trial balance + income statement + balance sheet for ${ACCOUNT_COUNT} accounts < 100ms`, () => {
		const entityId = uuid("00000000-ent-0000-0000-000000000001");
		const start = performance.now();

		const tb = buildEntityTrialBalance(entityId, PERIOD_ID, ACCOUNT_COUNT, accountsMap);
		const is_ = buildIncomeStatement(tb);
		const bs = buildBalanceSheet(tb);

		const elapsed = performance.now() - start;

		// Correctness checks
		expect(tb.lines.length).toBe(ACCOUNT_COUNT);
		expect(is_.revenue.lines.length).toBeGreaterThan(0);
		expect(bs.assets.lines.length).toBeGreaterThan(0);

		// SLA: under 100ms for 1000 accounts
		expect(elapsed).toBeLessThan(100);
	});

	test("50-entity consolidated report < 10,000ms (10s SLA)", () => {
		const ENTITY_COUNT = 50;
		const ACCOUNTS_PER_ENTITY = 200; // realistic for subsidiary

		const entityTrialBalances: TrialBalance[] = [];
		for (let i = 0; i < ENTITY_COUNT; i++) {
			const entityId = uuid(`00000000-ent-0000-0000-${hexPad(i + 1)}`);
			entityTrialBalances.push(
				buildEntityTrialBalance(entityId, PERIOD_ID, ACCOUNTS_PER_ENTITY, accountsMap),
			);
		}

		// IC eliminations (simulate 10 IC transactions across entities)
		const eliminations: EliminationAdjustment[] = Array.from({ length: 10 }, (_, i) => ({
			accountType: i % 2 === 0 ? "REVENUE" : "EXPENSE",
			amount: "50000.000000",
			description: `IC elimination ${i + 1}`,
		}));

		const start = performance.now();
		const report = buildConsolidatedReport(entityTrialBalances, eliminations);
		const elapsed = performance.now() - start;

		// Correctness
		expect(report.entityIds.length).toBe(ENTITY_COUNT);

		// SLA: under 10s (10,000ms)
		expect(elapsed).toBeLessThan(10_000);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Denied-party screening benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe("Denied-party screening — performance SLAs", () => {
	// Acceptance criteria (SD-003 WP-3): single-party real-time check < 500ms.
	// This test validates the in-memory Levenshtein scoring phase of screenParty
	// against a realistic list size (5,000 entries). The DB round-trip is excluded
	// here (covered by integration tests); this validates the pure CPU-bound path.
	test("in-memory Levenshtein scoring: 1 query × 5,000 list entries < 500ms", () => {
		const LIST_SIZE = 5000;

		// Simulate a denied-party list with realistic entry names
		const listEntries = Array.from({ length: LIST_SIZE }, (_, i) => ({
			entryNorm: normaliseScreeningName(`Sanctioned Entity Group ${i} International`),
			aliasesNorm: [normaliseScreeningName(`SEG${i} Corp`)],
		}));

		const queryNorm = normaliseScreeningName("Orbital Components Ltd");

		const start = performance.now();
		let topScore = 0;

		for (const entry of listEntries) {
			const score = bestMatchScore(queryNorm, entry.entryNorm, entry.aliasesNorm);
			if (score > topScore) topScore = score;
		}

		const elapsed = performance.now() - start;

		// Query should not match any entry (completely different name pattern)
		expect(topScore).toBeLessThan(0.72);

		// SLA: single-party screening < 500ms
		expect(elapsed).toBeLessThan(500);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Three-way match benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe("Three-way match — performance SLAs", () => {
	test("three-way match for 1,000 PO lines < 1,000ms (1s SLA)", () => {
		const LINE_COUNT = 1000;

		const grLine: GoodsReceiptLineSnapshot = {
			id: uuid("00000000-grl-0000-0000-000000000001"),
			goodsReceiptId: uuid("00000000-gr-00000000-0000-000000000001"),
			purchaseOrderLineId: uuid("00000000-pol-0000-0000-000000000001"),
			lineNumber: 1,
			quantityAccepted: "10.0000",
			unitPrice: "1500.000000",
			accountId: uuid("00000000-acct-0000-0000-000000000003"),
			description: "Component",
		};

		const start = performance.now();
		let matchCount = 0;
		let varianceCount = 0;

		for (let i = 0; i < LINE_COUNT; i++) {
			const poLine: POLineSnapshot = {
				id: uuid(`00000000-pol-0000-0000-${hexPad(i + 1)}`),
				purchaseOrderId: uuid("00000000-po-00000000-0000-000000000001"),
				lineNumber: i + 1,
				quantityOrdered: "10.0000",
				quantityReceived: "10.0000",
				unitPrice: "1500.000000",
				amount: "15000.000000",
				currencyCode: "USD",
			};

			// Every 10th line has a price variance (simulates real-world mix)
			const billLine: BillLineSnapshot = {
				purchaseOrderLineId: poLine.id,
				lineNumber: i + 1,
				amount: i % 10 === 0 ? "16000.000000" : "15000.000000",
				unitPrice: i % 10 === 0 ? "1600.000000" : "1500.000000",
				currencyCode: "USD",
			};

			const result = performThreeWayMatch(poLine, [grLine], billLine);
			if (result.overallMatch === "MATCH") matchCount++;
			else varianceCount++;
		}

		const elapsed = performance.now() - start;

		// Correctness: ~100 variances (every 10th), ~900 matches
		expect(varianceCount).toBe(100);
		expect(matchCount).toBe(900);

		// SLA: under 1s for 1000 matches
		expect(elapsed).toBeLessThan(1000);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Memory efficiency: large dataset does not exhaust process memory
// ─────────────────────────────────────────────────────────────────────────────

describe("Memory efficiency — large dataset handling", () => {
	test("10,000 GL balance rows processed without OOM (< 500ms)", () => {
		const PERIOD_ID = uuid("00000000-prd-00000000-0000-000000000002");
		const ENTITY_ID = uuid("00000000-ent-0000-0000-999999999999");
		const ROW_COUNT = 10_000;

		// Use a smaller account map and repeat accounts (multi-currency rows)
		const accountsMap = generateAccountsMap(200);
		const accountIds = [...accountsMap.keys()];

		// Generate 10k rows (50 currency rows per account = 200 accounts × 50)
		const balances: GLBalanceSnapshot[] = Array.from({ length: ROW_COUNT }, (_, i) => ({
			entityId: ENTITY_ID,
			accountId:
				accountIds[i % accountIds.length] ??
				accountIds[0] ??
				uuid("00000000-acct-0000-0000-000000000001"),
			fiscalPeriodId: PERIOD_ID,
			periodDebitTotal: "1000.000000",
			periodCreditTotal: "800.000000",
			periodNet: "200.000000",
			ytdDebitTotal: "3000.000000",
			ytdCreditTotal: "2400.000000",
			ytdNet: "600.000000",
		}));

		const start = performance.now();
		const tb = buildTrialBalance(ENTITY_ID, PERIOD_ID, balances, accountsMap);
		const elapsed = performance.now() - start;

		// buildTrialBalance aggregates multi-currency rows per account
		expect(tb.lines.length).toBe(200); // collapsed to 200 unique accounts
		expect(elapsed).toBeLessThan(500);
	});
});
