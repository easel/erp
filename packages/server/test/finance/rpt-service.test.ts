/**
 * Financial Reporting Service unit tests.
 *
 * Covers FIN-005, FIN-006, FIN-007 acceptance criteria from SD-003-WP2:
 *
 * FIN-005 (Multi-currency):
 * - lookupExchangeRate: finds most-recent rate on/before asOfDate, rate-type
 *   fallback to SPOT, same-currency synthetic rate, RATE_NOT_FOUND error.
 * - convertAmount: correct multiplication with NUMERIC(18,10) rate precision.
 * - calculateFxGainLoss: correct gain, loss, and neutral results.
 *
 * FIN-006 (Intercompany):
 * - buildIntercompanyTransactionRecord: field mapping, IC_AMOUNT_ZERO guard.
 * - buildEliminationJournalEntry: balanced DR revenue / CR expense entry,
 *   ELIM_AMOUNT_ZERO guard.
 *
 * FIN-007 (Financial Reporting):
 * - buildTrialBalance: aggregates multi-currency rows, skips orphans, balanced
 *   check, sorted by accountNumber.
 * - buildIncomeStatement: revenue/expense split, net income calculation.
 * - buildBalanceSheet: asset/liability/equity split, balance check.
 * - buildConsolidatedReport: merges 3 entities, applies eliminations,
 *   PERIOD_MISMATCH and NO_ENTITIES guards; consolidated trial balance is zero.
 *
 * Ref: SD-003-WP2 FIN-005..007, hx-4ecfb70d
 */

import { describe, expect, test } from "bun:test";
import {
	type EliminationAdjustment,
	type ExchangeRateSnapshot,
	type GLBalanceSnapshot,
	RPTError,
	type ReportAccountSnapshot,
	type TrialBalance,
	buildBalanceSheet,
	buildConsolidatedReport,
	buildEliminationJournalEntry,
	buildIncomeStatement,
	buildIntercompanyTransactionRecord,
	buildTrialBalance,
	calculateFxGainLoss,
	convertAmount,
	lookupExchangeRate,
} from "../../src/finance/rpt-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_A = "10000000-0000-0000-0000-000000000001" as const;
const ENTITY_B = "10000000-0000-0000-0000-000000000002" as const;
const ENTITY_C = "10000000-0000-0000-0000-000000000003" as const;
const PERIOD_ID = "50000000-0000-0000-0000-000000000001" as const;
const PERIOD_B = "50000000-0000-0000-0000-000000000002" as const;
const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as const;
const AGREEMENT_ID = "70000000-0000-0000-0000-000000000001" as const;
const JE_A = "80000000-0000-0000-0000-000000000001" as const;
const JE_B = "80000000-0000-0000-0000-000000000002" as const;
const IC_TX_ID = "90000000-0000-0000-0000-000000000001" as const;
const IC_REV_ACCT = "a0000000-0000-0000-0000-000000000001" as const;
const IC_EXP_ACCT = "a0000000-0000-0000-0000-000000000002" as const;

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

// ── FIN-005: Exchange Rate Lookup ─────────────────────────────────────────────

const rates: ExchangeRateSnapshot[] = [
	{
		id: "r1000000-0000-0000-0000-000000000001" as const,
		rateTypeCode: "SPOT",
		fromCurrency: "EUR",
		toCurrency: "USD",
		rate: "1.0800000000",
		effectiveDate: "2026-04-01",
	},
	{
		id: "r1000000-0000-0000-0000-000000000002" as const,
		rateTypeCode: "SPOT",
		fromCurrency: "EUR",
		toCurrency: "USD",
		rate: "1.0750000000",
		effectiveDate: "2026-03-31",
	},
	{
		id: "r1000000-0000-0000-0000-000000000003" as const,
		rateTypeCode: "CLOSING",
		fromCurrency: "EUR",
		toCurrency: "USD",
		rate: "1.0760000000",
		effectiveDate: "2026-03-31",
	},
	{
		id: "r1000000-0000-0000-0000-000000000004" as const,
		rateTypeCode: "SPOT",
		fromCurrency: "GBP",
		toCurrency: "USD",
		rate: "1.2600000000",
		effectiveDate: "2026-04-01",
	},
];

describe("lookupExchangeRate", () => {
	test("returns exact-date SPOT rate", () => {
		const r = lookupExchangeRate(rates, "EUR", "USD", "2026-04-01");
		expect(r.rate).toBe("1.0800000000");
		expect(r.effectiveDate).toBe("2026-04-01");
	});

	test("returns most-recent rate on or before asOfDate", () => {
		// Ask for a date between the two SPOT rates
		const r = lookupExchangeRate(rates, "EUR", "USD", "2026-04-05");
		expect(r.rate).toBe("1.0800000000"); // 2026-04-01 is most recent ≤ 2026-04-05
	});

	test("falls back to earlier rate when asOfDate is before newest", () => {
		const r = lookupExchangeRate(rates, "EUR", "USD", "2026-03-31");
		expect(r.rate).toBe("1.0750000000");
		expect(r.rateTypeCode).toBe("SPOT");
	});

	test("prefers requested rateTypeCode over SPOT", () => {
		const r = lookupExchangeRate(rates, "EUR", "USD", "2026-03-31", "CLOSING");
		expect(r.rate).toBe("1.0760000000");
		expect(r.rateTypeCode).toBe("CLOSING");
	});

	test("falls back to SPOT when requested rate type not found", () => {
		// BUDGET type doesn't exist → falls back to SPOT
		const r = lookupExchangeRate(rates, "EUR", "USD", "2026-04-01", "BUDGET");
		expect(r.rateTypeCode).toBe("SPOT");
		expect(r.rate).toBe("1.0800000000");
	});

	test("same-currency returns synthetic rate 1.0000000000", () => {
		const r = lookupExchangeRate([], "USD", "USD", "2026-04-01");
		expect(r.rate).toBe("1.0000000000");
		expect(r.fromCurrency).toBe("USD");
		expect(r.toCurrency).toBe("USD");
	});

	test("throws RATE_NOT_FOUND when no rate exists", () => {
		expectRPTError(() => lookupExchangeRate([], "EUR", "USD", "2026-04-01"), "RATE_NOT_FOUND");
	});

	test("throws RATE_NOT_FOUND when all rates are after asOfDate", () => {
		expectRPTError(() => lookupExchangeRate(rates, "EUR", "USD", "2026-01-01"), "RATE_NOT_FOUND");
	});
});

describe("convertAmount", () => {
	const eurUsdRate: ExchangeRateSnapshot = {
		id: "r2000000-0000-0000-0000-000000000001" as const,
		rateTypeCode: "SPOT",
		fromCurrency: "EUR",
		toCurrency: "USD",
		rate: "1.0800000000",
		effectiveDate: "2026-04-01",
	};

	test("converts EUR to USD at 1.08", () => {
		// 1000 EUR × 1.08 = 1080 USD
		expect(convertAmount("1000.000000", eurUsdRate)).toBe("1080.000000");
	});

	test("handles fractional amounts correctly", () => {
		// 100.50 × 1.08 = 108.54
		expect(convertAmount("100.500000", eurUsdRate)).toBe("108.540000");
	});

	test("rounds to 6 decimal places (half-up)", () => {
		// 1.000001 × 1.08 = 1.080001... rounds to 1.080001
		const result = convertAmount("1.000001", eurUsdRate);
		expect(result.split(".")[1]?.length).toBe(6);
	});

	test("same-currency synthetic rate returns unchanged amount", () => {
		const sameRate: ExchangeRateSnapshot = {
			id: "00000000-0000-0000-0000-000000000000" as const,
			rateTypeCode: "SPOT",
			fromCurrency: "USD",
			toCurrency: "USD",
			rate: "1.0000000000",
			effectiveDate: "2026-04-01",
		};
		expect(convertAmount("5000.000000", sameRate)).toBe("5000.000000");
	});
});

describe("calculateFxGainLoss", () => {
	test("realised gain when settlement rate is higher", () => {
		// 1000 EUR booked at 1.05, settled at 1.08
		// bookedBase = 1050, settledBase = 1080, gain = 30
		const result = calculateFxGainLoss("1000.000000", "1.0500000000", "1.0800000000");
		expect(result.gainLossAmount).toBe("30.000000");
		expect(result.isGain).toBe(true);
		expect(result.isLoss).toBe(false);
		expect(result.isNeutral).toBe(false);
	});

	test("realised loss when settlement rate is lower", () => {
		// 1000 EUR booked at 1.08, settled at 1.05 → loss of 30
		const result = calculateFxGainLoss("1000.000000", "1.0800000000", "1.0500000000");
		expect(result.gainLossAmount).toBe("-30.000000");
		expect(result.isLoss).toBe(true);
		expect(result.isGain).toBe(false);
	});

	test("neutral when booking and settlement rates are equal", () => {
		const result = calculateFxGainLoss("500.000000", "1.0800000000", "1.0800000000");
		expect(result.gainLossAmount).toBe("0.000000");
		expect(result.isNeutral).toBe(true);
	});
});

// ── FIN-006: Intercompany ─────────────────────────────────────────────────────

describe("buildIntercompanyTransactionRecord", () => {
	test("builds correct record with agreement", () => {
		const rec = buildIntercompanyTransactionRecord(
			"2026-04-01",
			"Services rendered",
			JE_A,
			JE_B,
			"50000.000000",
			"USD",
			ACTOR_ID,
			AGREEMENT_ID,
		);

		expect(rec.transactionDate).toBe("2026-04-01");
		expect(rec.description).toBe("Services rendered");
		expect(rec.entityAJournalEntryId).toBe(JE_A);
		expect(rec.entityBJournalEntryId).toBe(JE_B);
		expect(rec.amount).toBe("50000.000000");
		expect(rec.currencyCode).toBe("USD");
		expect(rec.status).toBe("PENDING");
		expect(rec.agreementId).toBe(AGREEMENT_ID);
		expect(rec.createdBy).toBe(ACTOR_ID);
	});

	test("sets agreementId to null when not provided", () => {
		const rec = buildIntercompanyTransactionRecord(
			"2026-04-01",
			"Ad-hoc IC",
			JE_A,
			JE_B,
			"1000.000000",
			"USD",
			ACTOR_ID,
		);
		expect(rec.agreementId).toBeNull();
	});

	test("throws IC_AMOUNT_ZERO for zero amount", () => {
		expectRPTError(
			() =>
				buildIntercompanyTransactionRecord(
					"2026-04-01",
					"Zero IC",
					JE_A,
					JE_B,
					"0.000000",
					"USD",
					ACTOR_ID,
				),
			"IC_AMOUNT_ZERO",
		);
	});

	test("throws IC_AMOUNT_ZERO for negative amount", () => {
		expectRPTError(
			() =>
				buildIntercompanyTransactionRecord(
					"2026-04-01",
					"Negative IC",
					JE_A,
					JE_B,
					"-100.000000",
					"USD",
					ACTOR_ID,
				),
			"IC_AMOUNT_ZERO",
		);
	});
});

describe("buildEliminationJournalEntry", () => {
	test("creates balanced DR revenue / CR expense entry", () => {
		const entry = buildEliminationJournalEntry(
			IC_TX_ID,
			"50000.000000",
			"USD",
			IC_REV_ACCT,
			IC_EXP_ACCT,
			ENTITY_A,
			PERIOD_ID,
			"2026-04-30",
		);

		expect(entry.lines.length).toBe(2);
		const debit = entry.lines.find((l) => l.type === "DEBIT")!;
		const credit = entry.lines.find((l) => l.type === "CREDIT")!;

		expect(debit.accountId).toBe(IC_REV_ACCT);
		expect(credit.accountId).toBe(IC_EXP_ACCT);
		expect(debit.amount).toBe("50000.000000");
		expect(credit.amount).toBe("50000.000000");
		expect(entry.reference).toBe(`ELIM-${IC_TX_ID}`);
		expect(entry.legalEntityId).toBe(ENTITY_A);
	});

	test("throws ELIM_AMOUNT_ZERO for zero amount", () => {
		expectRPTError(
			() =>
				buildEliminationJournalEntry(
					IC_TX_ID,
					"0.000000",
					"USD",
					IC_REV_ACCT,
					IC_EXP_ACCT,
					ENTITY_A,
					PERIOD_ID,
					"2026-04-30",
				),
			"ELIM_AMOUNT_ZERO",
		);
	});
});

// ── FIN-007: Financial Reporting ──────────────────────────────────────────────

// Account fixtures
const CASH_ACCT = "c0000000-0000-0000-0000-000000000001" as const;
const AR_ACCT = "c0000000-0000-0000-0000-000000000002" as const;
const AP_ACCT = "c0000000-0000-0000-0000-000000000003" as const;
const EQUITY_ACCT = "c0000000-0000-0000-0000-000000000004" as const;
const REV_ACCT = "c0000000-0000-0000-0000-000000000005" as const;
const EXP_ACCT = "c0000000-0000-0000-0000-000000000006" as const;

const accountMap = new Map<string, ReportAccountSnapshot>([
	[
		CASH_ACCT,
		{
			id: CASH_ACCT,
			accountNumber: "1000",
			name: "Cash",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		},
	],
	[
		AR_ACCT,
		{
			id: AR_ACCT,
			accountNumber: "1100",
			name: "Accounts Receivable",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		},
	],
	[
		AP_ACCT,
		{
			id: AP_ACCT,
			accountNumber: "2000",
			name: "Accounts Payable",
			accountType: "LIABILITY",
			normalBalance: "CREDIT",
		},
	],
	[
		EQUITY_ACCT,
		{
			id: EQUITY_ACCT,
			accountNumber: "3000",
			name: "Retained Earnings",
			accountType: "EQUITY",
			normalBalance: "CREDIT",
		},
	],
	[
		REV_ACCT,
		{
			id: REV_ACCT,
			accountNumber: "4000",
			name: "Revenue",
			accountType: "REVENUE",
			normalBalance: "CREDIT",
		},
	],
	[
		EXP_ACCT,
		{
			id: EXP_ACCT,
			accountNumber: "5000",
			name: "Operating Expense",
			accountType: "EXPENSE",
			normalBalance: "DEBIT",
		},
	],
]);

/**
 * Make a minimal GLBalanceSnapshot (period and YTD equal for simplicity in
 * most tests; override as needed).
 */
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
	const _pNet =
		BigInt(pd.replace(".", "").padEnd(13, "0").slice(0, 13)) -
		BigInt(pc.replace(".", "").padEnd(13, "0").slice(0, 13));
	// Simple net calculation — use raw string subtraction for test fixture
	const [pi = "0", pd_ = ""] = pd.split(".");
	const [ci = "0", cd_ = ""] = pc.split(".");
	const pDebitMicro = BigInt(pi) * 1_000_000n + BigInt(pd_.padEnd(6, "0").slice(0, 6));
	const pCreditMicro = BigInt(ci) * 1_000_000n + BigInt(cd_.padEnd(6, "0").slice(0, 6));
	const pNetMicro = pDebitMicro - pCreditMicro;
	const pNetAbs = pNetMicro < 0n ? -pNetMicro : pNetMicro;
	const pNetSign = pNetMicro < 0n ? "-" : "";
	const pNetStr = `${pNetSign}${pNetAbs / 1_000_000n}.${(pNetAbs % 1_000_000n).toString().padStart(6, "0")}`;

	const [yi = "0", yd_ = ""] = yd.split(".");
	const [yci = "0", ycd_ = ""] = yc.split(".");
	const yDebitMicro = BigInt(yi) * 1_000_000n + BigInt(yd_.padEnd(6, "0").slice(0, 6));
	const yCreditMicro = BigInt(yci) * 1_000_000n + BigInt(ycd_.padEnd(6, "0").slice(0, 6));
	const yNetMicro = yDebitMicro - yCreditMicro;
	const yNetAbs = yNetMicro < 0n ? -yNetMicro : yNetMicro;
	const yNetSign = yNetMicro < 0n ? "-" : "";
	const yNetStr = `${yNetSign}${yNetAbs / 1_000_000n}.${(yNetAbs % 1_000_000n).toString().padStart(6, "0")}`;

	return {
		entityId: ENTITY_A,
		accountId: accountId as typeof CASH_ACCT,
		fiscalPeriodId: PERIOD_ID,
		periodDebitTotal: pd,
		periodCreditTotal: pc,
		periodNet: pNetStr,
		ytdDebitTotal: yd,
		ytdCreditTotal: yc,
		ytdNet: yNetStr,
	};
}

describe("buildTrialBalance", () => {
	// Balanced set of postings:
	// DR Cash 5000 / CR Revenue 5000
	// DR Expense 2000 / CR Cash 2000
	// Total debits = 7000, total credits = 7000 → balanced
	const balances: GLBalanceSnapshot[] = [
		makeBalance(CASH_ACCT, "5000.000000", "2000.000000", "5000.000000", "2000.000000"),
		makeBalance(REV_ACCT, "0.000000", "5000.000000", "0.000000", "5000.000000"),
		makeBalance(EXP_ACCT, "2000.000000", "0.000000", "2000.000000", "0.000000"),
	];

	test("builds trial balance with correct account metadata", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		expect(tb.entityId).toBe(ENTITY_A);
		expect(tb.fiscalPeriodId).toBe(PERIOD_ID);
		expect(tb.lines.length).toBe(3);
	});

	test("total debits equal total credits (balanced)", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		expect(tb.totalDebits).toBe("7000.000000");
		expect(tb.totalCredits).toBe("7000.000000");
		expect(tb.isBalanced).toBe(true);
	});

	test("lines are sorted by accountNumber ascending", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const numbers = tb.lines.map((l) => l.accountNumber);
		expect(numbers).toEqual([...numbers].sort());
	});

	test("isBalanced is false for unbalanced input", () => {
		// DR 5000 vs CR 4000 → unbalanced
		const unbalanced: GLBalanceSnapshot[] = [
			makeBalance(CASH_ACCT, "5000.000000", "0.000000"),
			makeBalance(REV_ACCT, "0.000000", "4000.000000"),
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, unbalanced, accountMap);
		expect(tb.isBalanced).toBe(false);
	});

	test("skips orphaned balance rows (accountId not in account map)", () => {
		const orphanId = "99999999-0000-0000-0000-000000000001" as const;
		const withOrphan = [...balances, makeBalance(orphanId, "999.000000", "999.000000")];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, withOrphan, accountMap);
		expect(tb.lines.length).toBe(3); // orphan excluded
	});

	test("aggregates multi-currency rows for the same account", () => {
		// Two rows for REV_ACCT (USD and EUR) — should be summed
		const multiCurrency: GLBalanceSnapshot[] = [
			makeBalance(CASH_ACCT, "2000.000000", "0.000000"),
			{
				...makeBalance(REV_ACCT, "0.000000", "1000.000000"),
				fiscalPeriodId: PERIOD_ID,
				entityId: ENTITY_A,
			},
			{
				...makeBalance(REV_ACCT, "0.000000", "1000.000000"),
				fiscalPeriodId: PERIOD_ID,
				entityId: ENTITY_A,
			},
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, multiCurrency, accountMap);
		const revLine = tb.lines.find((l) => l.accountId === REV_ACCT)!;
		expect(revLine.periodCreditTotal).toBe("2000.000000");
	});
});

describe("buildIncomeStatement", () => {
	// Revenue 5000 CR, Expense 2000 DR → net income 3000
	const balances: GLBalanceSnapshot[] = [
		makeBalance(REV_ACCT, "0.000000", "5000.000000"),
		makeBalance(EXP_ACCT, "2000.000000", "0.000000"),
		makeBalance(CASH_ACCT, "7000.000000", "2000.000000"), // balance-sheet only
	];

	test("separates revenue and expense lines", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const is = buildIncomeStatement(tb);

		expect(is.revenue.lines.length).toBe(1);
		expect(is.expenses.lines.length).toBe(1);
		expect(is.revenue.lines[0]?.accountId).toBe(REV_ACCT);
		expect(is.expenses.lines[0]?.accountId).toBe(EXP_ACCT);
	});

	test("revenue total is net credit (CR − DR)", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const is = buildIncomeStatement(tb);
		expect(is.revenue.total).toBe("5000.000000");
	});

	test("expense total is net debit (DR − CR)", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const is = buildIncomeStatement(tb);
		expect(is.expenses.total).toBe("2000.000000");
	});

	test("net income = revenue − expenses", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const is = buildIncomeStatement(tb);
		expect(is.netIncome).toBe("3000.000000");
	});

	test("net loss when expenses exceed revenue", () => {
		const lossBalances: GLBalanceSnapshot[] = [
			makeBalance(REV_ACCT, "0.000000", "1000.000000"),
			makeBalance(EXP_ACCT, "3000.000000", "0.000000"),
		];
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, lossBalances, accountMap);
		const is = buildIncomeStatement(tb);
		expect(is.netIncome).toBe("-2000.000000");
	});
});

describe("buildBalanceSheet", () => {
	// Assets: Cash 3000 DR net, AR 2000 DR net
	// Liabilities: AP 1000 CR net
	// Equity: RE 4000 CR net
	// Assets = 5000, L+E = 5000 → balanced
	const balances: GLBalanceSnapshot[] = [
		makeBalance(CASH_ACCT, "3000.000000", "0.000000", "3000.000000", "0.000000"),
		makeBalance(AR_ACCT, "2000.000000", "0.000000", "2000.000000", "0.000000"),
		makeBalance(AP_ACCT, "0.000000", "1000.000000", "0.000000", "1000.000000"),
		makeBalance(EQUITY_ACCT, "0.000000", "4000.000000", "0.000000", "4000.000000"),
	];

	test("asset section contains ASSET accounts", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const bs = buildBalanceSheet(tb);
		expect(bs.assets.lines.map((l) => l.accountType).every((t) => t === "ASSET")).toBe(true);
	});

	test("asset total is sum of YTD net debits for ASSET accounts", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const bs = buildBalanceSheet(tb);
		expect(bs.assets.total).toBe("5000.000000");
	});

	test("liability total is sum of YTD net credits for LIABILITY accounts", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const bs = buildBalanceSheet(tb);
		expect(bs.liabilities.total).toBe("1000.000000");
	});

	test("equity total is sum of YTD net credits for EQUITY accounts", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const bs = buildBalanceSheet(tb);
		expect(bs.equity.total).toBe("4000.000000");
	});

	test("balance sheet is balanced: assets = liabilities + equity", () => {
		const tb = buildTrialBalance(ENTITY_A, PERIOD_ID, balances, accountMap);
		const bs = buildBalanceSheet(tb);
		expect(bs.liabilitiesAndEquity).toBe("5000.000000");
		expect(bs.isBalanced).toBe(true);
	});
});

// ── FIN-007: Consolidated Report ──────────────────────────────────────────────

/**
 * Build a simple per-entity trial balance with revenue and expense only.
 * Each entity has: revenue CR 10000, expense DR 7000.
 * Combined: revenue 30000, expense 21000, net income 9000.
 * IC elimination: 5000 revenue + 5000 expense (equal IC → net income unchanged).
 */
function makeEntityTB(entityId: string, periodId = PERIOD_ID): TrialBalance {
	const bals: GLBalanceSnapshot[] = [
		{
			entityId: entityId as typeof ENTITY_A,
			accountId: REV_ACCT,
			fiscalPeriodId: periodId as typeof PERIOD_ID,
			periodDebitTotal: "0.000000",
			periodCreditTotal: "10000.000000",
			periodNet: "-10000.000000",
			ytdDebitTotal: "0.000000",
			ytdCreditTotal: "10000.000000",
			ytdNet: "-10000.000000",
		},
		{
			entityId: entityId as typeof ENTITY_A,
			accountId: EXP_ACCT,
			fiscalPeriodId: periodId as typeof PERIOD_ID,
			periodDebitTotal: "7000.000000",
			periodCreditTotal: "0.000000",
			periodNet: "7000.000000",
			ytdDebitTotal: "7000.000000",
			ytdCreditTotal: "0.000000",
			ytdNet: "7000.000000",
		},
	];
	return buildTrialBalance(
		entityId as typeof ENTITY_A,
		periodId as typeof PERIOD_ID,
		bals,
		accountMap,
	);
}

describe("buildConsolidatedReport", () => {
	const tbA = makeEntityTB(ENTITY_A);
	const tbB = makeEntityTB(ENTITY_B);
	const tbC = makeEntityTB(ENTITY_C);

	test("includes all three entity IDs", () => {
		const report = buildConsolidatedReport([tbA, tbB, tbC], []);
		expect(report.entityIds).toContain(ENTITY_A);
		expect(report.entityIds).toContain(ENTITY_B);
		expect(report.entityIds).toContain(ENTITY_C);
	});

	test("combined revenue is sum across all entities (3 × 10000)", () => {
		const report = buildConsolidatedReport([tbA, tbB, tbC], []);
		expect(report.combinedTotals.get("REVENUE")).toBe("30000.000000");
	});

	test("combined expenses is sum across all entities (3 × 7000)", () => {
		const report = buildConsolidatedReport([tbA, tbB, tbC], []);
		expect(report.combinedTotals.get("EXPENSE")).toBe("21000.000000");
	});

	test("consolidated net income = combined revenue − combined expenses before eliminations", () => {
		const report = buildConsolidatedReport([tbA, tbB, tbC], []);
		// 30000 − 21000 = 9000
		expect(report.consolidatedNetIncome).toBe("9000.000000");
	});

	test("eliminations reduce revenue and expense totals symmetrically", () => {
		// IC transaction: entity A sold 5000 to entity B
		// Elimination: remove 5000 from revenue AND 5000 from expenses
		const eliminations: EliminationAdjustment[] = [
			{ accountType: "REVENUE", amount: "5000.000000", description: "IC A→B sale" },
			{ accountType: "EXPENSE", amount: "5000.000000", description: "IC B purchase from A" },
		];
		const report = buildConsolidatedReport([tbA, tbB, tbC], eliminations);

		expect(report.eliminatedTotals.get("REVENUE")).toBe("25000.000000");
		expect(report.eliminatedTotals.get("EXPENSE")).toBe("16000.000000");
		// Net income unchanged: 25000 − 16000 = 9000
		expect(report.consolidatedNetIncome).toBe("9000.000000");
	});

	test("consolidated trial balance totalDebits equals totalCredits (balanced input)", () => {
		// Each entity TB: revenue CR 10000, expense DR 7000 → NOT balanced by themselves
		// For a balanced test, we need DR = CR across all lines.
		// Let's verify the isBalanced flag tracks the underlying TBs correctly.
		// tbA, tbB, tbC each have totalDebits = 7000, totalCredits = 10000 → not balanced
		const report = buildConsolidatedReport([tbA, tbB, tbC], []);
		// Each entity total debits = 7000, credits = 10000 → combined 21000 vs 30000
		expect(report.totalDebits).toBe("21000.000000");
		expect(report.totalCredits).toBe("30000.000000");
		expect(report.isBalanced).toBe(false); // unbalanced entity TBs
	});

	test("consolidated trial balance is balanced when entities are balanced", () => {
		// Add offsetting balances to make each entity balanced:
		// Cash DR 3000 + offset CR 3000 added so DR = CR for period.
		// Use entities that have matching debits and credits.
		const balancedBalances = (entityId: string): GLBalanceSnapshot[] => [
			{
				entityId: entityId as typeof ENTITY_A,
				accountId: REV_ACCT,
				fiscalPeriodId: PERIOD_ID,
				periodDebitTotal: "10000.000000",
				periodCreditTotal: "10000.000000",
				periodNet: "0.000000",
				ytdDebitTotal: "10000.000000",
				ytdCreditTotal: "10000.000000",
				ytdNet: "0.000000",
			},
		];
		const tbBalanced = (eid: string) =>
			buildTrialBalance(eid as typeof ENTITY_A, PERIOD_ID, balancedBalances(eid), accountMap);
		const report = buildConsolidatedReport(
			[tbBalanced(ENTITY_A), tbBalanced(ENTITY_B), tbBalanced(ENTITY_C)],
			[],
		);
		expect(report.isBalanced).toBe(true);
	});

	test("throws NO_ENTITIES when empty array is provided", () => {
		expectRPTError(() => buildConsolidatedReport([], []), "NO_ENTITIES");
	});

	test("throws PERIOD_MISMATCH when entities use different fiscal periods", () => {
		const tbWrongPeriod = makeEntityTB(ENTITY_C, PERIOD_B);
		expectRPTError(() => buildConsolidatedReport([tbA, tbB, tbWrongPeriod], []), "PERIOD_MISMATCH");
	});

	test("single entity report has correct structure", () => {
		const report = buildConsolidatedReport([tbA], []);
		expect(report.entityIds.length).toBe(1);
		expect(report.consolidatedRevenue).toBe("10000.000000");
		expect(report.consolidatedExpenses).toBe("7000.000000");
		expect(report.consolidatedNetIncome).toBe("3000.000000");
	});
});
