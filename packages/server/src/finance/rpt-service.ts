/**
 * Financial Reporting Service — multi-currency exchange rates, intercompany
 * elimination entries, and financial statement builders.
 *
 * Implements FIN-005, FIN-006, FIN-007 from SD-003-WP2.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - All monetary amounts use NUMERIC(19,6) string representation (BigInt
 *   micro-units internally) to match ADR-011.
 * - Exchange rate values use NUMERIC(18,10) strings (10 decimal places).
 * - Report builders accept pre-loaded snapshots; callers are responsible for
 *   DB queries and passing results here.
 *
 * ── FIN-005: Multi-Currency ──────────────────────────────────────────────────
 * - lookupExchangeRate: find the best rate for a currency pair on a given date.
 * - convertAmount: apply a rate to an amount (rounds to 6 decimal places).
 * - calculateFxGainLoss: realised FX gain/loss on settlement.
 *
 * ── FIN-006: Intercompany ────────────────────────────────────────────────────
 * - buildIntercompanyTransactionRecord: DB record for intercompany_transaction.
 * - buildEliminationJournalEntry: CreateJournalEntryInput for the elimination
 *   journal entry posted at the consolidation entity.
 *
 * ── FIN-007: Financial Reporting ─────────────────────────────────────────────
 * - buildTrialBalance: derive TrialBalance from gl_balance snapshots.
 * - buildIncomeStatement: revenue / expense split from TrialBalance.
 * - buildBalanceSheet: asset / liability / equity from TrialBalance.
 * - buildConsolidatedReport: merge per-entity reports, apply eliminations.
 *
 * Ref: SD-002-data-model.md §4.5, §4.6, SD-003-WP2 FIN-005..007, ADR-011
 * Issue: hx-4ecfb70d
 */

import type { CurrencyCode, UUID } from "@apogee/shared";
import type { CreateJournalEntryInput } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Shared arithmetic helpers (NUMERIC(19,6) via BigInt micro-units)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert NUMERIC(19,6) string to BigInt micro-units (1e-6). */
function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
}

/** Convert BigInt micro-units back to NUMERIC(19,6) string. */
function fromMicro(micro: bigint): string {
	const neg = micro < 0n;
	const abs = neg ? -micro : micro;
	const intPart = abs / 1_000_000n;
	const decPart = (abs % 1_000_000n).toString().padStart(6, "0");
	return `${neg ? "-" : ""}${intPart}.${decPart}`;
}

/** Add two NUMERIC(19,6) strings. */
function addAmounts(a: string, b: string): string {
	return fromMicro(toMicro(a) + toMicro(b));
}

/** Subtract b from a (NUMERIC(19,6) strings). */
function subtractAmounts(a: string, b: string): string {
	return fromMicro(toMicro(a) - toMicro(b));
}

/** Sum a list of NUMERIC(19,6) amount strings. */
function sumAmounts(amounts: string[]): string {
	return fromMicro(amounts.reduce((acc, a) => acc + toMicro(a), 0n));
}

/** Compare two NUMERIC(19,6) strings. Returns -1, 0, or 1. */
function compareAmounts(a: string, b: string): number {
	const diff = toMicro(a) - toMicro(b);
	return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/**
 * Multiply a NUMERIC(19,6) amount by a NUMERIC(18,10) exchange rate.
 * Result is rounded to 6 decimal places (standard ROUND_HALF_UP via BigInt).
 */
function multiplyByRate(amount: string, rate: string): string {
	// Work in micro-units × rate × 1e10 to preserve full precision before rounding.
	const micro = toMicro(amount); // 1e6 units
	// Parse rate as integer with 10 implicit decimal places
	const [rateInt = "0", rateDec = ""] = rate.split(".");
	const rateMicro =
		BigInt(rateInt) * 10_000_000_000n + BigInt(rateDec.padEnd(10, "0").slice(0, 10));
	// product is in units of 1e6 (amount) × 1e10 (rate) = 1e16
	const product = micro * rateMicro;
	// Round to 1e10 (i.e., keep 6 decimal places of amount × rate):
	// We want product / 1e10, rounded half-up
	const divisor = 10_000_000_000n;
	const quotient = product / divisor;
	const remainder = product % divisor;
	const roundedUp = remainder * 2n >= divisor ? quotient + 1n : quotient;
	return fromMicro(roundedUp);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class RPTError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "RPTError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FIN-005: Multi-Currency Exchange Rate Service
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal snapshot of an exchange_rate row loaded from the DB. */
export interface ExchangeRateSnapshot {
	readonly id: UUID;
	readonly rateTypeCode: string;
	readonly fromCurrency: string;
	readonly toCurrency: string;
	/** NUMERIC(18,10) as string */
	readonly rate: string;
	/** ISO date string YYYY-MM-DD */
	readonly effectiveDate: string;
}

/**
 * Find the most-applicable exchange rate for a currency pair.
 *
 * Selection rules (in priority order):
 * 1. Exact date match for the requested rateTypeCode (or SPOT if omitted).
 * 2. The most-recent rate on or before asOfDate for the same rate type.
 * 3. Fallback to SPOT if a non-SPOT rate type is requested but not found.
 *
 * If from === to, returns a synthetic rate of "1.0000000000" without
 * consulting the snapshot list.
 *
 * @throws RPTError(RATE_NOT_FOUND) when no applicable rate exists.
 */
export function lookupExchangeRate(
	rates: readonly ExchangeRateSnapshot[],
	fromCurrency: string,
	toCurrency: string,
	asOfDate: string,
	rateTypeCode = "SPOT",
): ExchangeRateSnapshot {
	if (fromCurrency === toCurrency) {
		return {
			id: "00000000-0000-0000-0000-000000000000" as UUID,
			rateTypeCode,
			fromCurrency,
			toCurrency,
			rate: "1.0000000000",
			effectiveDate: asOfDate,
		};
	}

	// Filter to matching currency pair on or before asOfDate
	const candidates = rates.filter(
		(r) =>
			r.fromCurrency === fromCurrency && r.toCurrency === toCurrency && r.effectiveDate <= asOfDate,
	);

	// Try the requested rate type first, then fall back to SPOT
	const typeOrder = rateTypeCode === "SPOT" ? ["SPOT"] : [rateTypeCode, "SPOT"];

	for (const typeCode of typeOrder) {
		const typed = candidates.filter((r) => r.rateTypeCode === typeCode);
		if (typed.length === 0) continue;
		// Return the most recent (latest effectiveDate)
		typed.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
		const best = typed[0];
		if (!best) continue;
		return best;
	}

	throw new RPTError(
		`No exchange rate found for ${fromCurrency}→${toCurrency} on or before ${asOfDate} (type: ${rateTypeCode})`,
		"RATE_NOT_FOUND",
	);
}

/**
 * Convert a NUMERIC(19,6) amount from one currency to another using the
 * given rate snapshot.
 *
 * @returns Converted amount as NUMERIC(19,6) string.
 */
export function convertAmount(amount: string, rate: ExchangeRateSnapshot): string {
	if (rate.fromCurrency === rate.toCurrency) return amount;
	return multiplyByRate(amount, rate.rate);
}

/** Result of an FX gain/loss calculation. */
export interface FxGainLossResult {
	/** Positive = gain, negative = loss. NUMERIC(19,6) string. */
	readonly gainLossAmount: string;
	/** True when gainLossAmount > 0. */
	readonly isGain: boolean;
	/** True when gainLossAmount < 0. */
	readonly isLoss: boolean;
	/** True when gainLossAmount === "0.000000". */
	readonly isNeutral: boolean;
}

/**
 * Calculate the realised FX gain or loss when a foreign-currency transaction
 * is settled at a different rate than it was originally booked.
 *
 * Formula:
 *   FX gain/loss = amount × (settlementRate − bookingRate)
 *   Positive result = gain (home currency appreciated)
 *   Negative result = loss (home currency depreciated)
 *
 * Both rates must be "from foreign currency to functional currency" rates
 * expressed as NUMERIC(18,10) strings.
 *
 * @param amount         Transaction amount in the foreign currency (NUMERIC(19,6)).
 * @param bookingRate    Rate at original transaction booking date (NUMERIC(18,10)).
 * @param settlementRate Rate at settlement date (NUMERIC(18,10)).
 */
export function calculateFxGainLoss(
	amount: string,
	bookingRate: string,
	settlementRate: string,
): FxGainLossResult {
	const bookedBase = multiplyByRate(amount, bookingRate);
	const settledBase = multiplyByRate(amount, settlementRate);
	const gainLossAmount = subtractAmounts(settledBase, bookedBase);
	const cmp = compareAmounts(gainLossAmount, "0.000000");
	return {
		gainLossAmount,
		isGain: cmp > 0,
		isLoss: cmp < 0,
		isNeutral: cmp === 0,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// FIN-006: Intercompany Eliminations
// ─────────────────────────────────────────────────────────────────────────────

/** Record ready for DB insertion into intercompany_transaction. */
export interface IntercompanyTransactionRecord {
	readonly agreementId: UUID | null;
	readonly transactionDate: string;
	readonly description: string;
	readonly entityAJournalEntryId: UUID;
	readonly entityBJournalEntryId: UUID;
	/** NUMERIC(19,6) string */
	readonly amount: string;
	readonly currencyCode: string;
	readonly status: "PENDING";
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/**
 * Build a record for intercompany_transaction.
 *
 * Both journal entries (one per entity) must have been posted before calling.
 * The amount should be the gross transaction amount in the stated currency.
 */
export function buildIntercompanyTransactionRecord(
	transactionDate: string,
	description: string,
	entityAJournalEntryId: UUID,
	entityBJournalEntryId: UUID,
	amount: string,
	currencyCode: string,
	actorId: UUID,
	agreementId?: UUID,
): IntercompanyTransactionRecord {
	if (compareAmounts(amount, "0.000000") <= 0) {
		throw new RPTError(
			"Intercompany transaction amount must be greater than zero",
			"IC_AMOUNT_ZERO",
		);
	}
	return {
		agreementId: agreementId ?? null,
		transactionDate,
		description,
		entityAJournalEntryId,
		entityBJournalEntryId,
		amount,
		currencyCode,
		status: "PENDING",
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Build the GL journal entry that eliminates an intercompany transaction.
 *
 * At consolidation, the IC transaction is eliminated by reversing the
 * revenue/expense balances recorded in both entities:
 *
 *   DR IC Revenue account   × amount   (eliminates IC revenue booked by entity A)
 *   CR IC Expense account   × amount   (eliminates IC expense booked by entity B)
 *
 * Both lines belong to the consolidation entity; the caller supplies both
 * account IDs (they are typically the intercompany payable / receivable
 * control accounts for the consolidation level).
 *
 * @param icTransactionId        intercompany_transaction.id
 * @param amount                 Amount to eliminate (NUMERIC(19,6)).
 * @param currencyCode           Transaction currency.
 * @param icRevenueAccountId     Account to debit (eliminates IC revenue / AR).
 * @param icExpenseAccountId     Account to credit (eliminates IC expense / AP).
 * @param consolidationEntityId  Legal entity representing the consolidation group.
 * @param fiscalPeriodId         Period for the elimination entry.
 * @param entryDate              Posting date (YYYY-MM-DD).
 * @param actorId                Actor performing the consolidation run.
 */
export function buildEliminationJournalEntry(
	icTransactionId: UUID,
	amount: string,
	currencyCode: string,
	icRevenueAccountId: UUID,
	icExpenseAccountId: UUID,
	consolidationEntityId: UUID,
	fiscalPeriodId: UUID,
	entryDate: string,
): CreateJournalEntryInput {
	if (compareAmounts(amount, "0.000000") <= 0) {
		throw new RPTError("Elimination amount must be greater than zero", "ELIM_AMOUNT_ZERO");
	}
	return {
		legalEntityId: consolidationEntityId,
		fiscalPeriodId,
		entryDate,
		reference: `ELIM-${icTransactionId}`,
		description: `Intercompany elimination — ${icTransactionId}`,
		lines: [
			{
				accountId: icRevenueAccountId,
				type: "DEBIT" as const,
				amount,
				currencyCode: currencyCode as CurrencyCode,
				description: "IC elimination — debit revenue",
			},
			{
				accountId: icExpenseAccountId,
				type: "CREDIT" as const,
				amount,
				currencyCode: currencyCode as CurrencyCode,
				description: "IC elimination — credit expense",
			},
		],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// FIN-007: Financial Reporting
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

/**
 * Minimal account snapshot needed to build reports.
 * Callers load this from the `account` table.
 */
export interface ReportAccountSnapshot {
	readonly id: UUID;
	readonly accountNumber: string;
	readonly name: string;
	readonly accountType: AccountType;
	/** Normal balance side. Asset/Expense = DEBIT; Liability/Equity/Revenue = CREDIT. */
	readonly normalBalance: "DEBIT" | "CREDIT";
}

/**
 * gl_balance row snapshot loaded by the caller.
 * The caller aggregates across currency_code for a given account+period
 * before passing here (or passes multi-currency rows and the report sums them).
 */
export interface GLBalanceSnapshot {
	readonly entityId: UUID;
	readonly accountId: UUID;
	readonly fiscalPeriodId: UUID;
	/** NUMERIC(19,6) */
	readonly periodDebitTotal: string;
	/** NUMERIC(19,6) */
	readonly periodCreditTotal: string;
	/** NUMERIC(19,6) */
	readonly periodNet: string;
	/** NUMERIC(19,6) */
	readonly ytdDebitTotal: string;
	/** NUMERIC(19,6) */
	readonly ytdCreditTotal: string;
	/** NUMERIC(19,6) */
	readonly ytdNet: string;
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

export interface TrialBalanceLine {
	readonly accountId: UUID;
	readonly accountNumber: string;
	readonly accountName: string;
	readonly accountType: AccountType;
	/** Sum of all debit postings in the period. */
	readonly periodDebitTotal: string;
	/** Sum of all credit postings in the period. */
	readonly periodCreditTotal: string;
	/** Net = debit − credit (positive = net debit, negative = net credit). */
	readonly periodNet: string;
	readonly ytdDebitTotal: string;
	readonly ytdCreditTotal: string;
	readonly ytdNet: string;
}

export interface TrialBalance {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly lines: readonly TrialBalanceLine[];
	/** Sum of all period debit totals. */
	readonly totalDebits: string;
	/** Sum of all period credit totals. */
	readonly totalCredits: string;
	/** True when totalDebits === totalCredits (double-entry invariant). */
	readonly isBalanced: boolean;
}

/**
 * Build a trial balance from gl_balance snapshots and their account metadata.
 *
 * The caller loads gl_balance rows for a given (entityId, fiscalPeriodId) and
 * provides the corresponding account snapshots. Rows for accounts that have no
 * snapshot entry are silently skipped (orphaned balance rows).
 *
 * Multiple gl_balance rows for the same account (e.g., different currency_code
 * values) are aggregated by summing their debit/credit/net totals.
 *
 * Lines are sorted by accountNumber ascending.
 */
export function buildTrialBalance(
	entityId: UUID,
	fiscalPeriodId: UUID,
	balances: readonly GLBalanceSnapshot[],
	accounts: ReadonlyMap<UUID, ReportAccountSnapshot>,
): TrialBalance {
	// Aggregate multi-currency rows per account
	const aggregated = new Map<
		UUID,
		{
			periodDebitTotal: bigint;
			periodCreditTotal: bigint;
			periodNet: bigint;
			ytdDebitTotal: bigint;
			ytdCreditTotal: bigint;
			ytdNet: bigint;
		}
	>();

	for (const row of balances) {
		const existing = aggregated.get(row.accountId);
		if (existing) {
			existing.periodDebitTotal += toMicro(row.periodDebitTotal);
			existing.periodCreditTotal += toMicro(row.periodCreditTotal);
			existing.periodNet += toMicro(row.periodNet);
			existing.ytdDebitTotal += toMicro(row.ytdDebitTotal);
			existing.ytdCreditTotal += toMicro(row.ytdCreditTotal);
			existing.ytdNet += toMicro(row.ytdNet);
		} else {
			aggregated.set(row.accountId, {
				periodDebitTotal: toMicro(row.periodDebitTotal),
				periodCreditTotal: toMicro(row.periodCreditTotal),
				periodNet: toMicro(row.periodNet),
				ytdDebitTotal: toMicro(row.ytdDebitTotal),
				ytdCreditTotal: toMicro(row.ytdCreditTotal),
				ytdNet: toMicro(row.ytdNet),
			});
		}
	}

	// Build lines
	const lines: TrialBalanceLine[] = [];
	for (const [accountId, agg] of aggregated) {
		const account = accounts.get(accountId);
		if (!account) continue; // orphaned balance row — skip
		lines.push({
			accountId,
			accountNumber: account.accountNumber,
			accountName: account.name,
			accountType: account.accountType,
			periodDebitTotal: fromMicro(agg.periodDebitTotal),
			periodCreditTotal: fromMicro(agg.periodCreditTotal),
			periodNet: fromMicro(agg.periodNet),
			ytdDebitTotal: fromMicro(agg.ytdDebitTotal),
			ytdCreditTotal: fromMicro(agg.ytdCreditTotal),
			ytdNet: fromMicro(agg.ytdNet),
		});
	}

	// Sort by accountNumber ascending
	lines.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

	const totalDebits = sumAmounts(lines.map((l) => l.periodDebitTotal));
	const totalCredits = sumAmounts(lines.map((l) => l.periodCreditTotal));

	return {
		entityId,
		fiscalPeriodId,
		lines,
		totalDebits,
		totalCredits,
		isBalanced: compareAmounts(totalDebits, totalCredits) === 0,
	};
}

// ── Income Statement ──────────────────────────────────────────────────────────

export interface IncomeStatementSection {
	readonly lines: readonly TrialBalanceLine[];
	/** Positive total amount for the section. */
	readonly total: string;
}

export interface IncomeStatement {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly revenue: IncomeStatementSection;
	readonly expenses: IncomeStatementSection;
	/**
	 * Net income = revenue.total − expenses.total.
	 * Positive = net income; negative = net loss.
	 */
	readonly netIncome: string;
}

/**
 * Derive an income statement from a TrialBalance.
 *
 * Revenue total: sum of (periodCreditTotal − periodDebitTotal) for REVENUE accounts.
 * Expense total: sum of (periodDebitTotal − periodCreditTotal) for EXPENSE accounts.
 * Net income = revenue − expenses.
 */
export function buildIncomeStatement(tb: TrialBalance): IncomeStatement {
	const revenueLines = tb.lines.filter((l) => l.accountType === "REVENUE");
	const expenseLines = tb.lines.filter((l) => l.accountType === "EXPENSE");

	// Revenue: credit-normal → net credit = credit − debit
	const revenueTotal = sumAmounts(
		revenueLines.map((l) => subtractAmounts(l.periodCreditTotal, l.periodDebitTotal)),
	);
	// Expense: debit-normal → net debit = debit − credit
	const expenseTotal = sumAmounts(
		expenseLines.map((l) => subtractAmounts(l.periodDebitTotal, l.periodCreditTotal)),
	);

	return {
		entityId: tb.entityId,
		fiscalPeriodId: tb.fiscalPeriodId,
		revenue: { lines: revenueLines, total: revenueTotal },
		expenses: { lines: expenseLines, total: expenseTotal },
		netIncome: subtractAmounts(revenueTotal, expenseTotal),
	};
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

export interface BalanceSheetSection {
	readonly lines: readonly TrialBalanceLine[];
	readonly total: string;
}

export interface BalanceSheet {
	readonly entityId: UUID;
	readonly fiscalPeriodId: UUID;
	readonly assets: BalanceSheetSection;
	readonly liabilities: BalanceSheetSection;
	readonly equity: BalanceSheetSection;
	/**
	 * Total liabilities + equity. Should equal assets.total when balanced.
	 * In a correctly closed set of books: assets = liabilities + equity.
	 */
	readonly liabilitiesAndEquity: string;
	/** True when assets.total === liabilitiesAndEquity. */
	readonly isBalanced: boolean;
}

/**
 * Derive a balance sheet from a TrialBalance.
 *
 * Asset total:     sum of (ytdDebitTotal − ytdCreditTotal) for ASSET accounts.
 * Liability total: sum of (ytdCreditTotal − ytdDebitTotal) for LIABILITY accounts.
 * Equity total:    sum of (ytdCreditTotal − ytdDebitTotal) for EQUITY accounts.
 *
 * Uses YTD figures because the balance sheet is a cumulative position report.
 */
export function buildBalanceSheet(tb: TrialBalance): BalanceSheet {
	const assetLines = tb.lines.filter((l) => l.accountType === "ASSET");
	const liabilityLines = tb.lines.filter((l) => l.accountType === "LIABILITY");
	const equityLines = tb.lines.filter((l) => l.accountType === "EQUITY");

	// Assets: debit-normal → net debit = debit − credit
	const assetTotal = sumAmounts(
		assetLines.map((l) => subtractAmounts(l.ytdDebitTotal, l.ytdCreditTotal)),
	);
	// Liabilities: credit-normal → net credit = credit − debit
	const liabilityTotal = sumAmounts(
		liabilityLines.map((l) => subtractAmounts(l.ytdCreditTotal, l.ytdDebitTotal)),
	);
	// Equity: credit-normal → net credit = credit − debit
	const equityTotal = sumAmounts(
		equityLines.map((l) => subtractAmounts(l.ytdCreditTotal, l.ytdDebitTotal)),
	);

	const liabilitiesAndEquity = addAmounts(liabilityTotal, equityTotal);

	return {
		entityId: tb.entityId,
		fiscalPeriodId: tb.fiscalPeriodId,
		assets: { lines: assetLines, total: assetTotal },
		liabilities: { lines: liabilityLines, total: liabilityTotal },
		equity: { lines: equityLines, total: equityTotal },
		liabilitiesAndEquity,
		isBalanced: compareAmounts(assetTotal, liabilitiesAndEquity) === 0,
	};
}

// ── Consolidated Report ───────────────────────────────────────────────────────

/**
 * An elimination adjustment applied during consolidation.
 *
 * Represents one side of the intercompany elimination: the amount that should
 * be subtracted from the combined entity total for a specific account type.
 *
 * The caller creates two EliminationAdjustment entries per IC transaction:
 *  1. type "REVENUE"  − reduces combined revenue by the IC amount.
 *  2. type "EXPENSE"  − reduces combined expense by the IC amount.
 */
export interface EliminationAdjustment {
	/** The account type whose combined total this adjustment reduces. */
	readonly accountType: AccountType;
	/** Amount to eliminate (always positive NUMERIC(19,6)). */
	readonly amount: string;
	/** Describes the IC transaction being eliminated. */
	readonly description: string;
}

export interface ConsolidatedTrialBalance {
	/** IDs of the entities included in this consolidation. */
	readonly entityIds: readonly UUID[];
	readonly fiscalPeriodId: UUID;
	/**
	 * Per-account-type combined totals before eliminations.
	 * Map key is account type.
	 */
	readonly combinedTotals: ReadonlyMap<AccountType, string>;
	/**
	 * Per-account-type totals after applying all eliminations.
	 */
	readonly eliminatedTotals: ReadonlyMap<AccountType, string>;
	/** Net revenue after eliminations (REVENUE − eliminations). */
	readonly consolidatedRevenue: string;
	/** Net expenses after eliminations (EXPENSE − eliminations). */
	readonly consolidatedExpenses: string;
	/** Consolidated net income = consolidatedRevenue − consolidatedExpenses. */
	readonly consolidatedNetIncome: string;
	/**
	 * True when the consolidated trial balance is balanced.
	 * Uses combined debit/credit totals before eliminations.
	 */
	readonly isBalanced: boolean;
	/** Total debit sum across all entity trial balances. */
	readonly totalDebits: string;
	/** Total credit sum across all entity trial balances. */
	readonly totalCredits: string;
}

/**
 * Build a consolidated trial balance by combining per-entity trial balances
 * and applying intercompany elimination adjustments.
 *
 * All entity trial balances must reference the same fiscal period.
 *
 * @throws RPTError(PERIOD_MISMATCH) if any entity trial balance uses a different
 *         fiscal period than the first.
 */
export function buildConsolidatedReport(
	entityTrialBalances: readonly TrialBalance[],
	eliminations: readonly EliminationAdjustment[],
): ConsolidatedTrialBalance {
	const firstTb = entityTrialBalances[0];
	if (!firstTb) {
		throw new RPTError("At least one entity trial balance is required", "NO_ENTITIES");
	}

	const fiscalPeriodId = firstTb.fiscalPeriodId;
	for (const tb of entityTrialBalances) {
		if (tb.fiscalPeriodId !== fiscalPeriodId) {
			throw new RPTError(
				`Entity ${tb.entityId} uses fiscal period ${tb.fiscalPeriodId} but expected ${fiscalPeriodId}`,
				"PERIOD_MISMATCH",
			);
		}
	}

	// Sum debit/credit totals across all entities
	const totalDebits = sumAmounts(entityTrialBalances.map((tb) => tb.totalDebits));
	const totalCredits = sumAmounts(entityTrialBalances.map((tb) => tb.totalCredits));
	const isBalanced = compareAmounts(totalDebits, totalCredits) === 0;

	// Compute combined totals per account type
	const accountTypes: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
	const combinedTotals = new Map<AccountType, string>();

	for (const type of accountTypes) {
		const amounts: string[] = [];
		for (const tb of entityTrialBalances) {
			for (const line of tb.lines) {
				if (line.accountType !== type) continue;
				// Use period net magnitude for income-statement types;
				// use YTD net magnitude for balance-sheet types.
				if (type === "REVENUE") {
					amounts.push(subtractAmounts(line.periodCreditTotal, line.periodDebitTotal));
				} else if (type === "EXPENSE") {
					amounts.push(subtractAmounts(line.periodDebitTotal, line.periodCreditTotal));
				} else {
					// ASSET: debit-normal; LIABILITY/EQUITY: credit-normal
					if (type === "ASSET") {
						amounts.push(subtractAmounts(line.ytdDebitTotal, line.ytdCreditTotal));
					} else {
						amounts.push(subtractAmounts(line.ytdCreditTotal, line.ytdDebitTotal));
					}
				}
			}
		}
		combinedTotals.set(type, sumAmounts(amounts));
	}

	// Apply eliminations
	const eliminatedTotals = new Map<AccountType, string>(combinedTotals);
	for (const elim of eliminations) {
		const current = eliminatedTotals.get(elim.accountType) ?? "0.000000";
		eliminatedTotals.set(elim.accountType, subtractAmounts(current, elim.amount));
	}

	const consolidatedRevenue = eliminatedTotals.get("REVENUE") ?? "0.000000";
	const consolidatedExpenses = eliminatedTotals.get("EXPENSE") ?? "0.000000";
	const consolidatedNetIncome = subtractAmounts(consolidatedRevenue, consolidatedExpenses);

	return {
		entityIds: entityTrialBalances.map((tb) => tb.entityId),
		fiscalPeriodId,
		combinedTotals,
		eliminatedTotals,
		consolidatedRevenue,
		consolidatedExpenses,
		consolidatedNetIncome,
		isBalanced,
		totalDebits,
		totalCredits,
	};
}
