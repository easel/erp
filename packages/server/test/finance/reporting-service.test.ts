/**
 * Financial Reporting Service unit tests — consolidated module.
 *
 * Previously covered reporting-service.ts (now deleted); all tests now import
 * from rpt-service.ts, the single authoritative reporting module.
 *
 * Covers FIN-005/006/007 acceptance criteria from SD-003-WP2:
 * - convertAmount: multi-currency amount conversion with exchange rate
 * - lookupExchangeRate: direct, date-based, and missing rate lookup
 * - buildTrialBalance: totals, balance check
 * - buildIncomeStatement: revenue/expense aggregation, net income
 * - buildBalanceSheet: asset/liability/equity aggregation, balance check
 * - buildEliminationJournalEntry: intercompany DR revenue / CR expense entry
 * - buildConsolidatedReport: multi-entity aggregation + eliminations
 *
 * Ref: SD-003-WP2 FIN-005..007, SD-002 §4.1/4.5/4.6, hx-4ecfb70d, hx-075e2310
 */

import { describe, expect, test } from "bun:test";
import {
	type EliminationAdjustment,
	type ExchangeRateSnapshot,
	type GLBalanceSnapshot,
	RPTError,
	type ReportAccountSnapshot,
	buildBalanceSheet,
	buildConsolidatedReport,
	buildEliminationJournalEntry,
	buildIncomeStatement,
	buildTrialBalance,
	convertAmount,
	lookupExchangeRate,
} from "../../src/finance/rpt-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_A = "10000000-0000-0000-0000-000000000001" as const;
const ENTITY_B = "10000000-0000-0000-0000-000000000002" as const;
const CONSOL_ENTITY = "10000000-0000-0000-0000-000000000003" as const;
const PERIOD_ID = "50000000-0000-0000-0000-000000000001" as const;
const ACC_CASH = "40000000-0000-0000-0000-000000000001" as const;
const ACC_AR = "40000000-0000-0000-0000-000000000002" as const;
const ACC_REVENUE = "40000000-0000-0000-0000-000000000003" as const;
const ACC_EXPENSE = "40000000-0000-0000-0000-000000000004" as const;
const ACC_AP = "40000000-0000-0000-0000-000000000005" as const;
const ACC_EQUITY = "40000000-0000-0000-0000-000000000006" as const;
const IC_TX_ID = "70000000-0000-0000-0000-000000000001" as const;

const AS_OF_DATE = "2026-04-30";

/** Build a minimal ExchangeRateSnapshot for use with convertAmount. */
function makeRateSnapshot(
	fromCurrency: string,
	toCurrency: string,
	rate: string,
): ExchangeRateSnapshot {
	return {
		id: "00000000-0000-0000-0000-000000000000" as const,
		rateTypeCode: "SPOT",
		fromCurrency,
		toCurrency,
		rate,
		effectiveDate: AS_OF_DATE,
	};
}

/** Build a minimal GLBalanceSnapshot with debit and credit totals. */
function makeBalance(
	accountId: string,
	periodDebit: string,
	periodCredit: string,
	ytdDebit?: string,
	ytdCredit?: string,
): GLBalanceSnapshot {
	const pd = periodDebit;
	const pc = periodCredit;
	const yd = ytdDebit ?? pd;
	const yc = ytdCredit ?? pc;

	function computeNet(debit: string, credit: string): string {
		const [di = "0", dd = ""] = debit.split(".");
		const [ci = "0", cd = ""] = credit.split(".");
		const dMicro = BigInt(di) * 1_000_000n + BigInt(dd.padEnd(6, "0").slice(0, 6));
		const cMicro = BigInt(ci) * 1_000_000n + BigInt(cd.padEnd(6, "0").slice(0, 6));
		const net = dMicro - cMicro;
		const abs = net < 0n ? -net : net;
		const sign = net < 0n ? "-" : "";
		return `${sign}${abs / 1_000_000n}.${(abs % 1_000_000n).toString().padStart(6, "0")}`;
	}

	return {
		entityId: ENTITY_A,
		accountId: accountId as typeof ACC_CASH,
		fiscalPeriodId: PERIOD_ID,
		periodDebitTotal: pd,
		periodCreditTotal: pc,
		periodNet: computeNet(pd, pc),
		ytdDebitTotal: yd,
		ytdCreditTotal: yc,
		ytdNet: computeNet(yd, yc),
	};
}

/** Account map used across most tests. */
const accountMap = new Map<string, ReportAccountSnapshot>([
	[
		ACC_CASH,
		{
			id: ACC_CASH,
			accountNumber: "1000",
			name: "Cash",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		},
	],
	[
		ACC_AR,
		{
			id: ACC_AR,
			accountNumber: "1200",
			name: "Accounts Receivable",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		},
	],
	[
		ACC_AP,
		{
			id: ACC_AP,
			accountNumber: "2000",
			name: "Accounts Payable",
			accountType: "LIABILITY",
			normalBalance: "CREDIT",
		},
	],
	[
		ACC_EQUITY,
		{
			id: ACC_EQUITY,
			accountNumber: "3000",
			name: "Retained Earnings",
			accountType: "EQUITY",
			normalBalance: "CREDIT",
		},
	],
	[
		ACC_REVENUE,
		{
			id: ACC_REVENUE,
			accountNumber: "4000",
			name: "Service Revenue",
			accountType: "REVENUE",
			normalBalance: "CREDIT",
		},
	],
	[
		ACC_EXPENSE,
		{
			id: ACC_EXPENSE,
			accountNumber: "5000",
			name: "Salary Expense",
			accountType: "EXPENSE",
			normalBalance: "DEBIT",
		},
	],
]);

/** Helper: assert a sync function throws RPTError with the given code. */
function expectRPTError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error("expected RPTError but function did not throw");
	} catch (e) {
		expect(e).toBeInstanceOf(RPTError);
		expect((e as RPTError).code).toBe(expectedCode);
	}
}

// ── convertAmount ─────────────────────────────────────────────────────────────

describe("convertAmount", () => {
	test("converts USD to EUR at 0.92 rate", () => {
		// 1000 USD × 0.92 = 920 EUR
		const rate = makeRateSnapshot("USD", "EUR", "0.9200000000");
		expect(convertAmount("1000.000000", rate)).toBe("920.000000");
	});

	test("converts EUR to USD at 1.0869565217 rate", () => {
		// 920 EUR × 1.0869565217 ≈ 1000 USD (round-trip)
		const rate = makeRateSnapshot("EUR", "USD", "1.0869565217");
		const result = convertAmount("920.000000", rate);
		expect(result).toBe("1000.000000");
	});

	test("handles fractional amounts", () => {
		// 123.456789 × 2.0 = 246.913578
		const rate = makeRateSnapshot("USD", "EUR", "2.0000000000");
		expect(convertAmount("123.456789", rate)).toBe("246.913578");
	});

	test("handles rate of 1 (identity)", () => {
		const rate = makeRateSnapshot("USD", "USD", "1.0000000000");
		expect(convertAmount("500.000000", rate)).toBe("500.000000");
	});

	test("handles zero amount", () => {
		const rate = makeRateSnapshot("USD", "EUR", "1.5000000000");
		expect(convertAmount("0.000000", rate)).toBe("0.000000");
	});

	test("negative amounts are converted correctly", () => {
		// -100 × 0.9 = -90
		const rate = makeRateSnapshot("USD", "EUR", "0.9000000000");
		expect(convertAmount("-100.000000", rate)).toBe("-90.000000");
	});

	test("same-currency snapshot returns unchanged amount", () => {
		const rate = makeRateSnapshot("USD", "USD", "1.0000000000");
		expect(convertAmount("500.000000", rate)).toBe("500.000000");
	});
});

// ── lookupExchangeRate ────────────────────────────────────────────────────────

describe("lookupExchangeRate", () => {
	const rates: ExchangeRateSnapshot[] = [
		{
			id: "r1000000-0000-0000-0000-000000000001" as const,
			rateTypeCode: "SPOT",
			fromCurrency: "USD",
			toCurrency: "EUR",
			rate: "0.9200000000",
			effectiveDate: AS_OF_DATE,
		},
		{
			id: "r1000000-0000-0000-0000-000000000002" as const,
			rateTypeCode: "SPOT",
			fromCurrency: "USD",
			toCurrency: "GBP",
			rate: "0.7800000000",
			effectiveDate: AS_OF_DATE,
		},
	];

	test("returns snapshot for direct match", () => {
		const r = lookupExchangeRate(rates, "USD", "EUR", AS_OF_DATE);
		expect(r.rate).toBe("0.9200000000");
	});

	test("returns synthetic rate snapshot for same currency", () => {
		const r = lookupExchangeRate([], "USD", "USD", AS_OF_DATE);
		expect(r.rate).toBe("1.0000000000");
		expect(r.fromCurrency).toBe("USD");
		expect(r.toCurrency).toBe("USD");
	});

	test("throws RATE_NOT_FOUND for unknown pair", () => {
		expectRPTError(() => lookupExchangeRate([], "JPY", "EUR", AS_OF_DATE), "RATE_NOT_FOUND");
	});

	test("throws RATE_NOT_FOUND when all rates are after asOfDate", () => {
		expectRPTError(() => lookupExchangeRate(rates, "USD", "EUR", "2020-01-01"), "RATE_NOT_FOUND");
	});
});

// ── buildTrialBalance ─────────────────────────────────────────────────────────

describe("buildTrialBalance", () => {
	// A balanced set: total debits = total credits
	const balancedBalances: GLBalanceSnapshot[] = [
		// Cash DR 10000
		makeBalance(ACC_CASH, "10000.000000", "0.000000"),
		// Revenue CR 10000
		makeBalance(ACC_REVENUE, "0.000000", "10000.000000"),
	];

	test("produces one row per balance entry", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balancedBalances, accountMap);
		expect(tb.lines.length).toBe(2);
	});

	test("sums total debits and credits", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balancedBalances, accountMap);
		expect(tb.totalDebits).toBe("10000.000000");
		expect(tb.totalCredits).toBe("10000.000000");
	});

	test("isBalanced is true when debits equal credits", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balancedBalances, accountMap);
		expect(tb.isBalanced).toBe(true);
	});

	test("isBalanced is false when debits do not equal credits", () => {
		const unbalanced: GLBalanceSnapshot[] = [
			makeBalance(ACC_CASH, "10000.000000", "0.000000"),
			makeBalance(ACC_REVENUE, "0.000000", "9999.000000"),
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, unbalanced, accountMap);
		expect(tb.isBalanced).toBe(false);
	});

	test("sets entityId and fiscalPeriodId", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balancedBalances, accountMap);
		expect(tb.entityId).toBe(ENTITY_A);
		expect(tb.fiscalPeriodId).toBe(PERIOD_ID);
	});

	test("empty balances produces zero totals and isBalanced=true", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, [], accountMap);
		expect(tb.totalDebits).toBe("0.000000");
		expect(tb.totalCredits).toBe("0.000000");
		expect(tb.isBalanced).toBe(true);
	});
});

// ── buildIncomeStatement ──────────────────────────────────────────────────────

describe("buildIncomeStatement", () => {
	const balances: GLBalanceSnapshot[] = [
		makeBalance(ACC_CASH, "5000.000000", "0.000000"),
		makeBalance(ACC_REVENUE, "0.000000", "8000.000000"),
		makeBalance(ACC_EXPENSE, "3000.000000", "0.000000"),
	];

	test("filters revenue and expense lines only", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const stmt = buildIncomeStatement(tb);
		expect(stmt.revenue.lines.length).toBe(1);
		expect(stmt.expenses.lines.length).toBe(1);
	});

	test("computes revenue and expense totals", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const stmt = buildIncomeStatement(tb);
		expect(stmt.revenue.total).toBe("8000.000000");
		expect(stmt.expenses.total).toBe("3000.000000");
	});

	test("net income = revenue − expenses", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const stmt = buildIncomeStatement(tb);
		expect(stmt.netIncome).toBe("5000.000000");
	});

	test("net loss when expenses exceed revenue", () => {
		const lossBalances: GLBalanceSnapshot[] = [
			makeBalance(ACC_REVENUE, "0.000000", "1000.000000"),
			makeBalance(ACC_EXPENSE, "3000.000000", "0.000000"),
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, lossBalances, accountMap);
		const stmt = buildIncomeStatement(tb);
		expect(stmt.netIncome).toBe("-2000.000000");
	});
});

// ── buildBalanceSheet ─────────────────────────────────────────────────────────

describe("buildBalanceSheet", () => {
	// Assets: cash 10000, AR 5000 → total assets 15000
	// Liabilities: AP 3000 → total liabilities 3000
	// Equity: 12000 → total equity 12000
	// Liabilities + Equity = 3000 + 12000 = 15000 ✓
	const balances: GLBalanceSnapshot[] = [
		makeBalance(ACC_CASH, "10000.000000", "0.000000", "10000.000000", "0.000000"),
		makeBalance(ACC_AR, "5000.000000", "0.000000", "5000.000000", "0.000000"),
		makeBalance(ACC_AP, "0.000000", "3000.000000", "0.000000", "3000.000000"),
		makeBalance(ACC_EQUITY, "0.000000", "12000.000000", "0.000000", "12000.000000"),
	];

	test("groups lines by account type", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const sheet = buildBalanceSheet(tb);
		expect(sheet.assets.lines.length).toBe(2);
		expect(sheet.liabilities.lines.length).toBe(1);
		expect(sheet.equity.lines.length).toBe(1);
	});

	test("computes asset total", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const sheet = buildBalanceSheet(tb);
		expect(sheet.assets.total).toBe("15000.000000");
	});

	test("computes liabilities and equity total", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const sheet = buildBalanceSheet(tb);
		expect(sheet.liabilitiesAndEquity).toBe("15000.000000");
	});

	test("isBalanced when assets = liabilities + equity", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const sheet = buildBalanceSheet(tb);
		expect(sheet.isBalanced).toBe(true);
	});

	test("isBalanced is false when out of balance", () => {
		const unbalanced: GLBalanceSnapshot[] = [
			makeBalance(ACC_CASH, "10000.000000", "0.000000", "10000.000000", "0.000000"),
			makeBalance(ACC_EQUITY, "0.000000", "9000.000000", "0.000000", "9000.000000"),
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, unbalanced, accountMap);
		const sheet = buildBalanceSheet(tb);
		expect(sheet.isBalanced).toBe(false);
	});
});

// ── buildEliminationJournalEntry ──────────────────────────────────────────────

describe("buildEliminationJournalEntry", () => {
	test("creates balanced elimination entry (DR revenue, CR expense)", () => {
		const entry = buildEliminationJournalEntry(
			IC_TX_ID,
			"5000.000000",
			"USD",
			ACC_REVENUE,
			ACC_EXPENSE,
			CONSOL_ENTITY,
			PERIOD_ID,
			"2026-04-30",
		);

		expect(entry.lines.length).toBe(2);

		const debit = entry.lines.find((l) => l.type === "DEBIT")!;
		const credit = entry.lines.find((l) => l.type === "CREDIT")!;

		expect(debit.accountId).toBe(ACC_REVENUE);
		expect(credit.accountId).toBe(ACC_EXPENSE);
		expect(debit.amount).toBe("5000.000000");
		expect(credit.amount).toBe("5000.000000");
	});

	test("reference is ELIM-{icTransactionId}", () => {
		const entry = buildEliminationJournalEntry(
			IC_TX_ID,
			"5000.000000",
			"USD",
			ACC_REVENUE,
			ACC_EXPENSE,
			CONSOL_ENTITY,
			PERIOD_ID,
			"2026-04-30",
		);
		expect(entry.reference).toBe(`ELIM-${IC_TX_ID}`);
	});

	test("legalEntityId is consolidationEntityId", () => {
		const entry = buildEliminationJournalEntry(
			IC_TX_ID,
			"5000.000000",
			"USD",
			ACC_REVENUE,
			ACC_EXPENSE,
			CONSOL_ENTITY,
			PERIOD_ID,
			"2026-04-30",
		);
		expect(entry.legalEntityId).toBe(CONSOL_ENTITY);
	});

	test("throws ELIM_AMOUNT_ZERO for zero amount", () => {
		expectRPTError(
			() =>
				buildEliminationJournalEntry(
					IC_TX_ID,
					"0.000000",
					"USD",
					ACC_REVENUE,
					ACC_EXPENSE,
					CONSOL_ENTITY,
					PERIOD_ID,
					"2026-04-30",
				),
			"ELIM_AMOUNT_ZERO",
		);
	});
});

// ── buildConsolidatedReport ───────────────────────────────────────────────────

describe("buildConsolidatedReport", () => {
	// Entity A: revenue 8000 CR, expense 3000 DR
	const entityABalances: GLBalanceSnapshot[] = [
		makeBalance(ACC_REVENUE, "0.000000", "8000.000000"),
		makeBalance(ACC_EXPENSE, "3000.000000", "0.000000"),
	];
	// Entity B: revenue 4000 CR, expense 1000 DR
	const entityBBalances: GLBalanceSnapshot[] = [
		{
			...makeBalance(ACC_REVENUE, "0.000000", "4000.000000"),
			entityId: ENTITY_B,
		},
		{
			...makeBalance(ACC_EXPENSE, "1000.000000", "0.000000"),
			entityId: ENTITY_B,
		},
	];

	const tbA = buildTrialBalance(ENTITY_A, PERIOD_ID, entityABalances, accountMap);
	const tbB = buildTrialBalance(ENTITY_B, PERIOD_ID, entityBBalances, accountMap);

	test("aggregates revenue and expenses across entities", () => {
		const report = buildConsolidatedReport([tbA, tbB], []);
		// Revenue: 8000 + 4000 = 12000; Expense: 3000 + 1000 = 4000
		expect(report.combinedTotals.get("REVENUE")).toBe("12000.000000");
		expect(report.combinedTotals.get("EXPENSE")).toBe("4000.000000");
	});

	test("consolidated net income = combined revenue − combined expenses", () => {
		const report = buildConsolidatedReport([tbA, tbB], []);
		expect(report.consolidatedNetIncome).toBe("8000.000000");
	});

	test("applies elimination adjustments to reduce revenue and expense", () => {
		// IC transaction: 2000 elimination reduces revenue AND expense symmetrically
		const eliminations: EliminationAdjustment[] = [
			{ accountType: "REVENUE", amount: "2000.000000", description: "IC rev elimination" },
			{ accountType: "EXPENSE", amount: "2000.000000", description: "IC exp elimination" },
		];
		const report = buildConsolidatedReport([tbA, tbB], eliminations);
		expect(report.eliminatedTotals.get("REVENUE")).toBe("10000.000000");
		expect(report.eliminatedTotals.get("EXPENSE")).toBe("2000.000000");
		// Net income unchanged (symmetric elimination): 10000 − 2000 = 8000
		expect(report.consolidatedNetIncome).toBe("8000.000000");
	});

	test("includes all entity IDs", () => {
		const report = buildConsolidatedReport([tbA, tbB], []);
		expect(report.entityIds).toContain(ENTITY_A);
		expect(report.entityIds).toContain(ENTITY_B);
	});

	test("throws NO_ENTITIES when empty array is provided", () => {
		expectRPTError(() => buildConsolidatedReport([], []), "NO_ENTITIES");
	});
});
