/**
 * Financial Reporting Service unit tests.
 *
 * Covers FIN-005/006/007 acceptance criteria from SD-003-WP2:
 * - convertAmount: multi-currency amount conversion with exchange rate
 * - lookupExchangeRate: direct, inverse, and missing rate lookup
 * - buildTrialBalance: totals, balance check
 * - buildIncomeStatement: revenue/expense aggregation, net income
 * - buildBalanceSheet: asset/liability/equity aggregation, balance check
 * - buildEliminationEntry: intercompany DR revenue / CR expense entry
 * - buildConsolidatedTrialBalance: multi-entity aggregation + eliminations
 *
 * Ref: SD-003-WP2 FIN-005..007, SD-002 §4.1/4.5/4.6, hx-4ecfb70d
 */

import { describe, expect, test } from "bun:test";
import {
	ReportingError,
	type ExchangeRateSnapshot,
	type GLBalanceRow,
	type IntercompanyTransactionSnapshot,
	buildBalanceSheet,
	buildConsolidatedTrialBalance,
	buildEliminationEntry,
	buildIncomeStatement,
	buildTrialBalance,
	convertAmount,
	lookupExchangeRate,
} from "../../src/finance/reporting-service.js";

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
const TXN_ID = "70000000-0000-0000-0000-000000000001" as const;

function makeBalance(
	accountId: string,
	accountNumber: string,
	accountName: string,
	accountType: GLBalanceRow["accountType"],
	normalBalance: GLBalanceRow["normalBalance"],
	periodDebitTotal: string,
	periodCreditTotal: string,
	periodNet: string,
	ytdDebitTotal = periodDebitTotal,
	ytdCreditTotal = periodCreditTotal,
	ytdNet = periodNet,
	entityId: string = ENTITY_A,
): GLBalanceRow {
	return {
		accountId: accountId as GLBalanceRow["accountId"],
		accountNumber,
		accountName,
		accountType,
		normalBalance,
		entityId: entityId as GLBalanceRow["entityId"],
		periodDebitTotal,
		periodCreditTotal,
		periodNet,
		ytdDebitTotal,
		ytdCreditTotal,
		ytdNet,
		currencyCode: "USD",
	};
}

/** Helper: assert a sync function throws ReportingError with the given code. */
function expectReportingError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error("expected ReportingError but function did not throw");
	} catch (e) {
		expect(e).toBeInstanceOf(ReportingError);
		expect((e as ReportingError).code).toBe(expectedCode);
	}
}

// ── convertAmount ─────────────────────────────────────────────────────────────

describe("convertAmount", () => {
	test("converts USD to EUR at 0.92 rate", () => {
		// 1000 USD × 0.92 = 920 EUR
		expect(convertAmount("1000.000000", "0.9200000000")).toBe("920.000000");
	});

	test("converts EUR to USD at 1.0869565217 rate", () => {
		// 920 EUR × 1.0869565217 ≈ 1000 USD (round-trip)
		const result = convertAmount("920.000000", "1.0869565217");
		// Should be close to 1000 (within floating precision)
		expect(result).toBe("1000.000000");
	});

	test("handles fractional amounts", () => {
		// 123.456789 × 2.0 = 246.913578
		expect(convertAmount("123.456789", "2.0000000000")).toBe("246.913578");
	});

	test("handles rate of 1 (identity)", () => {
		expect(convertAmount("500.000000", "1.0000000000")).toBe("500.000000");
	});

	test("handles zero amount", () => {
		expect(convertAmount("0.000000", "1.5000000000")).toBe("0.000000");
	});

	test("negative amounts are converted correctly", () => {
		// -100 × 0.9 = -90
		expect(convertAmount("-100.000000", "0.9000000000")).toBe("-90.000000");
	});
});

// ── lookupExchangeRate ────────────────────────────────────────────────────────

describe("lookupExchangeRate", () => {
	const rates: ExchangeRateSnapshot[] = [
		{ fromCurrency: "USD", toCurrency: "EUR", rate: "0.9200000000" },
		{ fromCurrency: "USD", toCurrency: "GBP", rate: "0.7800000000" },
	];

	test("returns rate for direct match", () => {
		expect(lookupExchangeRate("USD", "EUR", rates)).toBe("0.9200000000");
	});

	test("returns 1.0 for same currency", () => {
		expect(lookupExchangeRate("USD", "USD", rates)).toBe("1.0000000000");
	});

	test("computes inverse rate when only reverse rate exists", () => {
		// EUR → USD: inverse of USD→EUR (0.92) ≈ 1.0869565217
		const result = lookupExchangeRate("EUR", "USD", rates);
		// 1 / 0.92 = 1.0869565217...
		expect(result.startsWith("1.086956521")).toBe(true);
	});

	test("throws EXCHANGE_RATE_NOT_FOUND for unknown pair", () => {
		expectReportingError(
			() => lookupExchangeRate("JPY", "EUR", rates),
			"EXCHANGE_RATE_NOT_FOUND",
		);
	});
});

// ── buildTrialBalance ─────────────────────────────────────────────────────────

describe("buildTrialBalance", () => {
	// A balanced set: total debits = total credits
	const balancedBalances: GLBalanceRow[] = [
		// Cash DR 10000
		makeBalance(ACC_CASH, "1000", "Cash", "ASSET", "DEBIT", "10000.000000", "0.000000", "10000.000000"),
		// Revenue CR 10000
		makeBalance(ACC_REVENUE, "4000", "Service Revenue", "REVENUE", "CREDIT", "0.000000", "10000.000000", "-10000.000000"),
	];

	test("produces one row per balance entry", () => {
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", balancedBalances);
		expect(report.rows.length).toBe(2);
	});

	test("sums total debits and credits", () => {
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", balancedBalances);
		expect(report.totalDebits).toBe("10000.000000");
		expect(report.totalCredits).toBe("10000.000000");
	});

	test("isBalanced is true when debits equal credits", () => {
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", balancedBalances);
		expect(report.isBalanced).toBe(true);
	});

	test("isBalanced is false when debits do not equal credits", () => {
		const unbalanced = [
			makeBalance(ACC_CASH, "1000", "Cash", "ASSET", "DEBIT", "10000.000000", "0.000000", "10000.000000"),
			makeBalance(ACC_REVENUE, "4000", "Revenue", "REVENUE", "CREDIT", "0.000000", "9999.000000", "-9999.000000"),
		];
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", unbalanced);
		expect(report.isBalanced).toBe(false);
	});

	test("sets entityId, fiscalPeriodId, reportingCurrency", () => {
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", balancedBalances);
		expect(report.entityId).toBe(ENTITY_A);
		expect(report.fiscalPeriodId).toBe(PERIOD_ID);
		expect(report.reportingCurrency).toBe("USD");
	});

	test("empty balances produces zero totals and isBalanced=true", () => {
		const report = buildTrialBalance(ENTITY_A, PERIOD_ID, "USD", []);
		expect(report.totalDebits).toBe("0.000000");
		expect(report.totalCredits).toBe("0.000000");
		expect(report.isBalanced).toBe(true);
	});
});

// ── buildIncomeStatement ──────────────────────────────────────────────────────

describe("buildIncomeStatement", () => {
	const balances: GLBalanceRow[] = [
		makeBalance(ACC_CASH, "1000", "Cash", "ASSET", "DEBIT", "5000.000000", "0.000000", "5000.000000"),
		makeBalance(ACC_REVENUE, "4000", "Service Revenue", "REVENUE", "CREDIT", "0.000000", "8000.000000", "-8000.000000"),
		makeBalance(ACC_EXPENSE, "5000", "Salary Expense", "EXPENSE", "DEBIT", "3000.000000", "0.000000", "3000.000000"),
	];

	test("filters revenue and expense lines only", () => {
		const stmt = buildIncomeStatement(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(stmt.revenueLines.length).toBe(1);
		expect(stmt.expenseLines.length).toBe(1);
	});

	test("computes totalRevenue and totalExpenses", () => {
		const stmt = buildIncomeStatement(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(stmt.totalRevenue).toBe("8000.000000");
		expect(stmt.totalExpenses).toBe("3000.000000");
	});

	test("net income = revenue − expenses", () => {
		const stmt = buildIncomeStatement(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(stmt.netIncome).toBe("5000.000000");
	});

	test("net loss when expenses exceed revenue", () => {
		const lossBalances: GLBalanceRow[] = [
			makeBalance(ACC_REVENUE, "4000", "Revenue", "REVENUE", "CREDIT", "0.000000", "1000.000000", "-1000.000000"),
			makeBalance(ACC_EXPENSE, "5000", "Expense", "EXPENSE", "DEBIT", "3000.000000", "0.000000", "3000.000000"),
		];
		const stmt = buildIncomeStatement(ENTITY_A, PERIOD_ID, "USD", lossBalances);
		expect(stmt.netIncome).toBe("-2000.000000");
	});
});

// ── buildBalanceSheet ─────────────────────────────────────────────────────────

describe("buildBalanceSheet", () => {
	// Assets: cash 10000, AR 5000 → total assets 15000
	// Liabilities: AP 3000 → total liabilities 3000
	// Equity: 12000 → total equity 12000
	// Liabilities + Equity = 3000 + 12000 = 15000 ✓
	const balances: GLBalanceRow[] = [
		makeBalance(ACC_CASH, "1000", "Cash", "ASSET", "DEBIT", "10000.000000", "0.000000", "10000.000000", "10000.000000", "0.000000", "10000.000000"),
		makeBalance(ACC_AR, "1200", "Accounts Receivable", "ASSET", "DEBIT", "5000.000000", "0.000000", "5000.000000", "5000.000000", "0.000000", "5000.000000"),
		makeBalance(ACC_AP, "2000", "Accounts Payable", "LIABILITY", "CREDIT", "0.000000", "3000.000000", "-3000.000000", "0.000000", "3000.000000", "-3000.000000"),
		makeBalance(ACC_EQUITY, "3000", "Retained Earnings", "EQUITY", "CREDIT", "0.000000", "12000.000000", "-12000.000000", "0.000000", "12000.000000", "-12000.000000"),
	];

	test("groups lines by account type", () => {
		const sheet = buildBalanceSheet(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(sheet.assetLines.length).toBe(2);
		expect(sheet.liabilityLines.length).toBe(1);
		expect(sheet.equityLines.length).toBe(1);
	});

	test("computes totalAssets", () => {
		const sheet = buildBalanceSheet(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(sheet.totalAssets).toBe("15000.000000");
	});

	test("computes totalLiabilitiesAndEquity", () => {
		const sheet = buildBalanceSheet(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(sheet.totalLiabilitiesAndEquity).toBe("15000.000000");
	});

	test("isBalanced when assets = liabilities + equity", () => {
		const sheet = buildBalanceSheet(ENTITY_A, PERIOD_ID, "USD", balances);
		expect(sheet.isBalanced).toBe(true);
	});

	test("isBalanced is false when out of balance", () => {
		const unbalanced: GLBalanceRow[] = [
			makeBalance(ACC_CASH, "1000", "Cash", "ASSET", "DEBIT", "10000.000000", "0.000000", "10000.000000", "10000.000000", "0.000000", "10000.000000"),
			makeBalance(ACC_EQUITY, "3000", "Equity", "EQUITY", "CREDIT", "0.000000", "9000.000000", "-9000.000000", "0.000000", "9000.000000", "-9000.000000"),
		];
		const sheet = buildBalanceSheet(ENTITY_A, PERIOD_ID, "USD", unbalanced);
		expect(sheet.isBalanced).toBe(false);
	});
});

// ── buildEliminationEntry ─────────────────────────────────────────────────────

describe("buildEliminationEntry", () => {
	const transaction: IntercompanyTransactionSnapshot = {
		id: TXN_ID,
		amount: "5000.000000",
		currencyCode: "USD",
		description: "Management fee Entity A → Entity B",
	};

	test("creates balanced elimination entry (DR revenue, CR expense)", () => {
		const entry = buildEliminationEntry(
			transaction,
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

	test("reference is ELIM-{first 8 chars of transaction id}", () => {
		const entry = buildEliminationEntry(
			transaction,
			ACC_REVENUE,
			ACC_EXPENSE,
			CONSOL_ENTITY,
			PERIOD_ID,
			"2026-04-30",
		);
		expect(entry.reference).toBe(`ELIM-${TXN_ID.slice(0, 8)}`);
	});

	test("legalEntityId is consolidationEntityId", () => {
		const entry = buildEliminationEntry(
			transaction,
			ACC_REVENUE,
			ACC_EXPENSE,
			CONSOL_ENTITY,
			PERIOD_ID,
			"2026-04-30",
		);
		expect(entry.legalEntityId).toBe(CONSOL_ENTITY);
	});

	test("throws ELIMINATION_AMOUNT_ZERO for zero amount", () => {
		const zeroTxn: IntercompanyTransactionSnapshot = {
			...transaction,
			amount: "0.000000",
		};
		expectReportingError(
			() => buildEliminationEntry(zeroTxn, ACC_REVENUE, ACC_EXPENSE, CONSOL_ENTITY, PERIOD_ID, "2026-04-30"),
			"ELIMINATION_AMOUNT_ZERO",
		);
	});
});

// ── buildConsolidatedTrialBalance ─────────────────────────────────────────────

describe("buildConsolidatedTrialBalance", () => {
	// Entity A: revenue 8000 CR, expense 3000 DR
	const entityABalances: GLBalanceRow[] = [
		makeBalance(ACC_REVENUE, "4000", "Service Revenue", "REVENUE", "CREDIT", "0.000000", "8000.000000", "-8000.000000", "0.000000", "8000.000000", "-8000.000000", ENTITY_A),
		makeBalance(ACC_EXPENSE, "5000", "Salary Expense", "EXPENSE", "DEBIT", "3000.000000", "0.000000", "3000.000000", "3000.000000", "0.000000", "3000.000000", ENTITY_A),
	];
	// Entity B: revenue 4000 CR, expense 1000 DR
	const entityBBalances: GLBalanceRow[] = [
		makeBalance(ACC_REVENUE, "4000", "Service Revenue", "REVENUE", "CREDIT", "0.000000", "4000.000000", "-4000.000000", "0.000000", "4000.000000", "-4000.000000", ENTITY_B),
		makeBalance(ACC_EXPENSE, "5000", "Salary Expense", "EXPENSE", "DEBIT", "1000.000000", "0.000000", "1000.000000", "1000.000000", "0.000000", "1000.000000", ENTITY_B),
	];

	test("aggregates debits and credits across entities by account number", () => {
		const report = buildConsolidatedTrialBalance(
			CONSOL_ENTITY,
			PERIOD_ID,
			"USD",
			[...entityABalances, ...entityBBalances],
			[],
		);

		// Two unique account numbers: 4000 and 5000
		expect(report.rows.length).toBe(2);

		const revenueRow = report.rows.find((r) => r.accountNumber === "4000")!;
		const expenseRow = report.rows.find((r) => r.accountNumber === "5000")!;

		// Revenue: 0 DR, 8000+4000=12000 CR
		expect(revenueRow.debitTotal).toBe("0.000000");
		expect(revenueRow.creditTotal).toBe("12000.000000");

		// Expense: 3000+1000=4000 DR, 0 CR
		expect(expenseRow.debitTotal).toBe("4000.000000");
		expect(expenseRow.creditTotal).toBe("0.000000");
	});

	test("applies elimination balances to consolidated totals", () => {
		// Elimination: DR revenue 2000, CR expense 2000 (cancels intercompany)
		const elimBalances: GLBalanceRow[] = [
			makeBalance(ACC_REVENUE, "4000", "Service Revenue", "REVENUE", "CREDIT", "2000.000000", "0.000000", "2000.000000", "2000.000000", "0.000000", "2000.000000", CONSOL_ENTITY),
			makeBalance(ACC_EXPENSE, "5000", "Salary Expense", "EXPENSE", "DEBIT", "0.000000", "2000.000000", "-2000.000000", "0.000000", "2000.000000", "-2000.000000", CONSOL_ENTITY),
		];

		const report = buildConsolidatedTrialBalance(
			CONSOL_ENTITY,
			PERIOD_ID,
			"USD",
			[...entityABalances, ...entityBBalances],
			elimBalances,
		);

		const revenueRow = report.rows.find((r) => r.accountNumber === "4000")!;
		const expenseRow = report.rows.find((r) => r.accountNumber === "5000")!;

		// Revenue: 2000 DR (elim) + 12000 CR (entities) → net 10000 CR
		expect(revenueRow.debitTotal).toBe("2000.000000");
		expect(revenueRow.creditTotal).toBe("12000.000000");

		// Expense: 4000 DR (entities) + 2000 CR (elim) → net 2000 DR
		expect(expenseRow.debitTotal).toBe("4000.000000");
		expect(expenseRow.creditTotal).toBe("2000.000000");
	});

	test("sets consolidationEntityId as entityId", () => {
		const report = buildConsolidatedTrialBalance(CONSOL_ENTITY, PERIOD_ID, "USD", [], []);
		expect(report.entityId).toBe(CONSOL_ENTITY);
	});
});
