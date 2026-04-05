/**
 * Financial Reporting Service — trial balance, income statement, balance sheet.
 *
 * Implements FIN-005/006/007 (Multi-Currency, Intercompany, Financial Reporting)
 * from SD-003-WP2.
 *
 * Design:
 * - Pure domain functions: all operate on in-memory snapshots of GL data.
 * - No direct DB I/O. Callers load balances and pass them in.
 * - Reports are built from gl_balance aggregates (period_net / ytd_net).
 * - Multi-currency: amounts converted to a single reporting currency using
 *   exchange rates supplied by the caller (no live FX lookup here).
 * - Intercompany eliminations: builds a journal entry input that cancels
 *   matched intercompany revenue/expense pairs.
 *
 * Ref: SD-002-data-model.md §4.1/4.5/4.6, SD-003-WP2 FIN-005..007
 * Issue: hx-4ecfb70d
 */

import type { CurrencyCode, UUID } from "@apogee/shared";
import type { CreateJournalEntryInput } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";

/** A single row from gl_balance, minimally shaped for reporting. */
export interface GLBalanceRow {
	readonly accountId: UUID;
	readonly accountNumber: string;
	readonly accountName: string;
	readonly accountType: AccountType;
	readonly normalBalance: NormalBalance;
	readonly entityId: UUID;
	readonly periodDebitTotal: string;
	readonly periodCreditTotal: string;
	readonly periodNet: string;
	readonly ytdDebitTotal: string;
	readonly ytdCreditTotal: string;
	readonly ytdNet: string;
	readonly currencyCode: string;
}

/** Exchange rate for converting one currency to another. */
export interface ExchangeRateSnapshot {
	readonly fromCurrency: string;
	readonly toCurrency: string;
	readonly rate: string;
}

/** A trial balance row: one account with period totals. */
export interface TrialBalanceRow {
	readonly accountId: UUID;
	readonly accountNumber: string;
	readonly accountName: string;
	readonly accountType: AccountType;
	readonly debitTotal: string;
	readonly creditTotal: string;
	readonly netBalance: string;
}

/** Trial balance report. */
export interface TrialBalanceReport {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly reportingCurrency: string;
	readonly rows: readonly TrialBalanceRow[];
	readonly totalDebits: string;
	readonly totalCredits: string;
	readonly isBalanced: boolean;
}

/** Income statement line item. */
export interface IncomeStatementLine {
	readonly accountId: UUID;
	readonly accountNumber: string;
	readonly accountName: string;
	readonly amount: string;
}

/** Income statement report. */
export interface IncomeStatementReport {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly reportingCurrency: string;
	readonly revenueLines: readonly IncomeStatementLine[];
	readonly expenseLines: readonly IncomeStatementLine[];
	readonly totalRevenue: string;
	readonly totalExpenses: string;
	readonly netIncome: string;
}

/** Balance sheet section. */
export interface BalanceSheetLine {
	readonly accountId: UUID;
	readonly accountNumber: string;
	readonly accountName: string;
	readonly amount: string;
}

/** Balance sheet report. */
export interface BalanceSheetReport {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly reportingCurrency: string;
	readonly assetLines: readonly BalanceSheetLine[];
	readonly liabilityLines: readonly BalanceSheetLine[];
	readonly equityLines: readonly BalanceSheetLine[];
	readonly totalAssets: string;
	readonly totalLiabilitiesAndEquity: string;
	readonly isBalanced: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class ReportingError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ReportingError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers: micro-unit arithmetic for NUMERIC(19,6) amounts
// ─────────────────────────────────────────────────────────────────────────────

/** Convert NUMERIC(19,6) string to BigInt micro-units (6 decimal places). */
function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	const sign = intPart.startsWith("-") ? -1n : 1n;
	const absInt = intPart.replace("-", "");
	return sign * (BigInt(absInt) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6)));
}

/** Convert BigInt micro-units back to NUMERIC(19,6) string. */
function fromMicro(micro: bigint): string {
	const abs = micro < 0n ? -micro : micro;
	const sign = micro < 0n ? "-" : "";
	const intPart = abs / 1_000_000n;
	const decPart = (abs % 1_000_000n).toString().padStart(6, "0");
	return `${sign}${intPart}.${decPart}`;
}

/** Sum a list of NUMERIC(19,6) amount strings. */
function sumAmounts(amounts: readonly string[]): string {
	return fromMicro(amounts.reduce((acc, a) => acc + toMicro(a), 0n));
}

/** Subtract b from a (NUMERIC(19,6) strings). */
function subtractAmount(a: string, b: string): string {
	return fromMicro(toMicro(a) - toMicro(b));
}

/** Compare two NUMERIC(19,6) strings. Returns negative, zero, or positive. */
function compareAmounts(a: string, b: string): number {
	const diff = toMicro(a) - toMicro(b);
	return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** Absolute value of a NUMERIC(19,6) string. */
function absAmount(a: string): string {
	return a.startsWith("-") ? a.slice(1) : a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-currency conversion (FIN-005)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a NUMERIC(19,6) amount from one currency to another using the
 * supplied exchange rate.
 *
 * Uses 10-decimal precision for the rate (NUMERIC(18,10)) then rounds the
 * result to 6 decimal places (NUMERIC(19,6)).
 *
 * @param amount        Source amount as NUMERIC(19,6) string.
 * @param rate          Exchange rate as NUMERIC(18,10) string (to_currency per 1 from_currency).
 * @returns             Converted amount as NUMERIC(19,6) string.
 */
export function convertAmount(amount: string, rate: string): string {
	// Scale: amount × rate with 16-decimal intermediate precision, rounded to 6dp.
	// amount is 19,6; rate is 18,10 → product at 10dp, rounded to 6dp.
	const [amtInt = "0", amtDec = ""] = amount.replace("-", "").split(".");
	const sign = amount.startsWith("-") ? -1n : 1n;
	const amtMicro = BigInt(amtInt) * 1_000_000n + BigInt(amtDec.padEnd(6, "0").slice(0, 6));

	const [rateInt = "0", rateDec = ""] = rate.split(".");
	// Rate stored as 10dp; represent in 10dp units
	const rateTenDp =
		BigInt(rateInt) * 10_000_000_000n + BigInt(rateDec.padEnd(10, "0").slice(0, 10));

	// product = amtMicro (6dp) × rateTenDp (10dp) → 16dp units
	const product = amtMicro * rateTenDp;
	// Round to 6dp: divide by 10^10, rounding half-up
	const divisor = 10_000_000_000n;
	const quotient = product / divisor;
	const remainder = product % divisor;
	const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

	return fromMicro(sign * rounded);
}

/**
 * Look up an exchange rate for a currency pair.
 * Returns the rate, or throws EXCHANGE_RATE_NOT_FOUND.
 */
export function lookupExchangeRate(
	fromCurrency: string,
	toCurrency: string,
	rates: readonly ExchangeRateSnapshot[],
): string {
	if (fromCurrency === toCurrency) return "1.0000000000";

	const found = rates.find((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency);
	if (found) return found.rate;

	// Try inverse
	const inverse = rates.find((r) => r.fromCurrency === toCurrency && r.toCurrency === fromCurrency);
	if (inverse) {
		// invert: 1 / rate, computed as 10dp string
		const rateMicro = toMicro(inverse.rate);
		if (rateMicro === 0n) {
			throw new ReportingError(
				`Exchange rate for ${fromCurrency}/${toCurrency} is zero`,
				"EXCHANGE_RATE_ZERO",
			);
		}
		// 1 / rate: compute with 10dp precision using integer arithmetic
		// We want result in 10dp: (10^20) / rate(10dp units)
		const [rInt = "0", rDec = ""] = inverse.rate.split(".");
		const rate10dp = BigInt(rInt) * 10_000_000_000n + BigInt(rDec.padEnd(10, "0").slice(0, 10));
		const inv10dp = 100_000_000_000_000_000_000n / rate10dp; // 10^20 / rate10dp → 10dp result
		const integerPart = inv10dp / 10_000_000_000n;
		const fracPart = (inv10dp % 10_000_000_000n).toString().padStart(10, "0");
		return `${integerPart}.${fracPart}`;
	}

	throw new ReportingError(
		`Exchange rate not found for ${fromCurrency} → ${toCurrency}`,
		"EXCHANGE_RATE_NOT_FOUND",
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial balance (FIN-007)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a trial balance report from GL balance rows.
 *
 * Uses period totals (periodDebitTotal, periodCreditTotal, periodNet).
 * All rows must be in the reporting currency (caller converts first).
 *
 * @param entityId         Legal entity.
 * @param fiscalPeriodId   Period for the report.
 * @param reportingCurrency  ISO currency code for the report.
 * @param balances         GL balance rows for the period (same entity + period).
 */
export function buildTrialBalance(
	entityId: UUID,
	fiscalPeriodId: UUID,
	reportingCurrency: string,
	balances: readonly GLBalanceRow[],
): TrialBalanceReport {
	const rows: TrialBalanceRow[] = balances.map((b) => ({
		accountId: b.accountId,
		accountNumber: b.accountNumber,
		accountName: b.accountName,
		accountType: b.accountType,
		debitTotal: b.periodDebitTotal,
		creditTotal: b.periodCreditTotal,
		netBalance: b.periodNet,
	}));

	const totalDebits = sumAmounts(rows.map((r) => r.debitTotal));
	const totalCredits = sumAmounts(rows.map((r) => r.creditTotal));
	const isBalanced = compareAmounts(totalDebits, totalCredits) === 0;

	return {
		entityId,
		fiscalPeriodId,
		reportingCurrency,
		rows,
		totalDebits,
		totalCredits,
		isBalanced,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Income statement (FIN-007)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an income statement report from GL balance rows.
 *
 * Revenue accounts: credit-normal; positive amount = credit > debit.
 * Expense accounts: debit-normal; positive amount = debit > credit.
 * Net income = total revenue − total expenses.
 */
export function buildIncomeStatement(
	entityId: UUID,
	fiscalPeriodId: UUID,
	reportingCurrency: string,
	balances: readonly GLBalanceRow[],
): IncomeStatementReport {
	const revenueBalances = balances.filter((b) => b.accountType === "REVENUE");
	const expenseBalances = balances.filter((b) => b.accountType === "EXPENSE");

	const revenueLines: IncomeStatementLine[] = revenueBalances.map((b) => ({
		accountId: b.accountId,
		accountNumber: b.accountNumber,
		accountName: b.accountName,
		// Revenue normal balance is CREDIT; periodNet = credit - debit (positive = revenue earned)
		amount: absAmount(b.periodNet),
	}));

	const expenseLines: IncomeStatementLine[] = expenseBalances.map((b) => ({
		accountId: b.accountId,
		accountNumber: b.accountNumber,
		accountName: b.accountName,
		// Expense normal balance is DEBIT; periodNet = debit - credit (positive = expense incurred)
		amount: absAmount(b.periodNet),
	}));

	const totalRevenue = sumAmounts(revenueLines.map((l) => l.amount));
	const totalExpenses = sumAmounts(expenseLines.map((l) => l.amount));
	const netIncome = subtractAmount(totalRevenue, totalExpenses);

	return {
		entityId,
		fiscalPeriodId,
		reportingCurrency,
		revenueLines,
		expenseLines,
		totalRevenue,
		totalExpenses,
		netIncome,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance sheet (FIN-007)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a balance sheet from GL balance YTD rows.
 *
 * Assets = ASSET accounts (debit-normal, positive ytdNet = asset balance).
 * Liabilities = LIABILITY accounts (credit-normal, positive ytdNet = liability balance).
 * Equity = EQUITY accounts (credit-normal, positive ytdNet = equity balance).
 *
 * Balanced when: total assets = total liabilities + equity.
 */
export function buildBalanceSheet(
	entityId: UUID,
	fiscalPeriodId: UUID,
	reportingCurrency: string,
	balances: readonly GLBalanceRow[],
): BalanceSheetReport {
	const assetBalances = balances.filter((b) => b.accountType === "ASSET");
	const liabilityBalances = balances.filter((b) => b.accountType === "LIABILITY");
	const equityBalances = balances.filter((b) => b.accountType === "EQUITY");

	const toLine = (b: GLBalanceRow): BalanceSheetLine => ({
		accountId: b.accountId,
		accountNumber: b.accountNumber,
		accountName: b.accountName,
		amount: absAmount(b.ytdNet),
	});

	const assetLines = assetBalances.map(toLine);
	const liabilityLines = liabilityBalances.map(toLine);
	const equityLines = equityBalances.map(toLine);

	const totalAssets = sumAmounts(assetLines.map((l) => l.amount));
	const totalLiabilities = sumAmounts(liabilityLines.map((l) => l.amount));
	const totalEquity = sumAmounts(equityLines.map((l) => l.amount));
	const totalLiabilitiesAndEquity = sumAmounts([totalLiabilities, totalEquity]);
	const isBalanced = compareAmounts(totalAssets, totalLiabilitiesAndEquity) === 0;

	return {
		entityId,
		fiscalPeriodId,
		reportingCurrency,
		assetLines,
		liabilityLines,
		equityLines,
		totalAssets,
		totalLiabilitiesAndEquity,
		isBalanced,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercompany elimination (FIN-006)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal snapshot of an intercompany transaction. */
export interface IntercompanyTransactionSnapshot {
	readonly id: UUID;
	readonly amount: string;
	readonly currencyCode: string;
	readonly description: string;
}

/**
 * Build an elimination journal entry for an intercompany transaction.
 *
 * Intercompany eliminations cancel matched revenue (entity A) against
 * expense (entity B) so they don't inflate consolidated totals.
 *
 * The elimination entry is posted to a consolidation entity (a virtual
 * entity that holds only elimination entries).
 *
 * @param transaction         Intercompany transaction to eliminate.
 * @param revenueAccountId    Revenue account to credit-eliminate (DR elimination).
 * @param expenseAccountId    Expense account to debit-eliminate (CR elimination).
 * @param consolidationEntityId  Entity that holds consolidation entries.
 * @param fiscalPeriodId      Period to post the elimination into.
 * @param entryDate           Elimination entry date.
 */
export function buildEliminationEntry(
	transaction: IntercompanyTransactionSnapshot,
	revenueAccountId: UUID,
	expenseAccountId: UUID,
	consolidationEntityId: UUID,
	fiscalPeriodId: UUID,
	entryDate: string,
): CreateJournalEntryInput {
	if (compareAmounts(transaction.amount, "0.000000") <= 0) {
		throw new ReportingError(
			"Intercompany transaction amount must be greater than zero",
			"ELIMINATION_AMOUNT_ZERO",
		);
	}

	return {
		legalEntityId: consolidationEntityId,
		fiscalPeriodId,
		entryDate,
		reference: `ELIM-${transaction.id.slice(0, 8)}`,
		description: `Intercompany elimination: ${transaction.description}`,
		lines: [
			{
				// DR intercompany revenue (reduces inflated revenue)
				accountId: revenueAccountId,
				type: "DEBIT" as const,
				amount: transaction.amount,
				currencyCode: transaction.currencyCode as CurrencyCode,
				description: "Elimination DR — intercompany revenue",
			},
			{
				// CR intercompany expense (reduces inflated expense)
				accountId: expenseAccountId,
				type: "CREDIT" as const,
				amount: transaction.amount,
				currencyCode: transaction.currencyCode as CurrencyCode,
				description: "Elimination CR — intercompany expense",
			},
		],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated report (FIN-007)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate trial balance rows across multiple entities into a single
 * consolidated view by summing debit/credit totals per account number.
 *
 * Intended for use after intercompany eliminations have been applied.
 * All rows must already be in the same reporting currency.
 *
 * @param consolidationEntityId  Virtual entity ID for the consolidated entity.
 * @param fiscalPeriodId         Period for the consolidated report.
 * @param reportingCurrency      ISO currency code.
 * @param entityBalances         GL balance rows from all constituent entities.
 * @param eliminationBalances    GL balance rows representing elimination entries.
 */
export function buildConsolidatedTrialBalance(
	consolidationEntityId: UUID,
	fiscalPeriodId: UUID,
	reportingCurrency: string,
	entityBalances: readonly GLBalanceRow[],
	eliminationBalances: readonly GLBalanceRow[],
): TrialBalanceReport {
	// Merge all rows together
	const allBalances = [...entityBalances, ...eliminationBalances];

	// Aggregate by accountNumber (same chart of accounts across entities)
	const aggregated = new Map<
		string,
		{
			accountId: UUID;
			accountNumber: string;
			accountName: string;
			accountType: AccountType;
			debitMicro: bigint;
			creditMicro: bigint;
		}
	>();

	for (const b of allBalances) {
		const key = b.accountNumber;
		const existing = aggregated.get(key);
		if (existing) {
			existing.debitMicro += toMicro(b.periodDebitTotal);
			existing.creditMicro += toMicro(b.periodCreditTotal);
		} else {
			aggregated.set(key, {
				accountId: b.accountId,
				accountNumber: b.accountNumber,
				accountName: b.accountName,
				accountType: b.accountType,
				debitMicro: toMicro(b.periodDebitTotal),
				creditMicro: toMicro(b.periodCreditTotal),
			});
		}
	}

	const rows: TrialBalanceRow[] = Array.from(aggregated.values()).map((a) => {
		const debitTotal = fromMicro(a.debitMicro);
		const creditTotal = fromMicro(a.creditMicro);
		const netBalance = fromMicro(a.debitMicro - a.creditMicro);
		return {
			accountId: a.accountId,
			accountNumber: a.accountNumber,
			accountName: a.accountName,
			accountType: a.accountType,
			debitTotal,
			creditTotal,
			netBalance,
		};
	});

	const totalDebits = sumAmounts(rows.map((r) => r.debitTotal));
	const totalCredits = sumAmounts(rows.map((r) => r.creditTotal));
	const isBalanced = compareAmounts(totalDebits, totalCredits) === 0;

	return {
		entityId: consolidationEntityId,
		fiscalPeriodId,
		reportingCurrency,
		rows,
		totalDebits,
		totalCredits,
		isBalanced,
	};
}
