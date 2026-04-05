/**
 * General Ledger Engine — journal posting, reversal, and period close.
 *
 * Implements FIN-002 (General Ledger) from SD-003-WP2.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O. GLRepository is injected.
 * - Caller is responsible for persisting returned records to the DB.
 * - Balance invariant (debits = credits) is enforced here in addition to the
 *   Zod Layer 1 check, so the engine is correct even when called outside the
 *   HTTP request path (e.g., from AP accrual or AR invoice posting).
 *
 * Key invariants:
 * - Fiscal period must be OPEN or SOFT_CLOSED to accept postings.
 *   HARD_CLOSED and FUTURE periods are rejected with GLError.
 * - All accounts must exist in the entity, be active, and NOT be header accounts.
 * - Every journal entry must be balanced: Σ debits == Σ credits (NUMERIC(19,6) safe
 *   comparison via BigInt micro-units to avoid floating-point errors).
 * - Reversal creates a new entry with swapped debit/credit amounts and records
 *   reversal_of_id pointing to the original entry.
 *
 * Ref: SD-002-data-model.md §4.2, SD-003-WP2 FIN-002, ADR-007 (period close)
 * Issue: hx-152c4f71
 */

import type { CreateJournalEntryInput } from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type FiscalPeriodStatus = "FUTURE" | "OPEN" | "SOFT_CLOSED" | "HARD_CLOSED";
export type JournalEntryStatus = "DRAFT" | "POSTED" | "REVERSED" | "VOID";

/** Minimal fiscal period snapshot needed by the GL engine. */
export interface FiscalPeriodSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly status: FiscalPeriodStatus;
	readonly periodLabel: string;
}

/** Minimal account snapshot needed to validate journal lines. */
export interface GLAccountSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly accountNumber: string;
	readonly isHeader: boolean;
	readonly isActive: boolean;
	readonly currencyCode: string | null;
}

/** Minimal journal entry snapshot (for reversals). */
export interface JournalEntrySnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly status: JournalEntryStatus;
	readonly entryNumber: string;
	readonly description: string;
	readonly fiscalPeriodId: UUID;
	readonly lines: readonly JournalLineSnapshot[];
}

export interface JournalLineSnapshot {
	readonly id: UUID;
	readonly accountId: UUID;
	readonly description: string | null;
	readonly debitAmount: string; // NUMERIC as string to avoid float errors
	readonly creditAmount: string;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly baseDebitAmount: string;
	readonly baseCreditAmount: string;
}

/** Context provided by the application layer for each posting operation. */
export interface PostingContext {
	readonly actorId: UUID;
	readonly actorEmail: string;
	/** Functional currency code of the legal entity (base_currency_code). */
	readonly entityCurrencyCode: string;
	/**
	 * Generate the next sequential entry number for the entity.
	 * Called once per posting; the number is included in the persisted record.
	 */
	generateEntryNumber(): Promise<string>;
}

/** Record ready for DB insertion into journal_entry. */
export interface JournalEntryRecord {
	readonly entityId: UUID;
	readonly entryNumber: string;
	readonly entryDate: string;
	readonly fiscalPeriodId: UUID;
	readonly description: string;
	readonly reference: string;
	readonly status: JournalEntryStatus;
	readonly sourceModule: string | null;
	readonly sourceDocumentId: UUID | null;
	readonly reversalOfId: UUID | null;
	readonly isAdjustment: boolean;
	readonly postedAt: Date;
	readonly postedBy: UUID;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Record ready for DB insertion into journal_entry_line. */
export interface JournalLineRecord {
	readonly lineNumber: number;
	readonly accountId: UUID;
	readonly description: string | null;
	readonly debitAmount: string;
	readonly creditAmount: string;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly baseDebitAmount: string;
	readonly baseCreditAmount: string;
}

/** Result of a successful posting. */
export interface GLPostingResult {
	readonly entry: JournalEntryRecord;
	readonly lines: readonly JournalLineRecord[];
}

/** Result of a period close operation. */
export interface PeriodCloseResult {
	readonly periodId: UUID;
	readonly previousStatus: FiscalPeriodStatus;
	readonly newStatus: FiscalPeriodStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface (injected — unit tests use stubs)
// ─────────────────────────────────────────────────────────────────────────────

export interface GLRepository {
	/** Fetch a fiscal period by (entityId, periodId). Returns null if not found. */
	findPeriod(entityId: UUID, periodId: UUID): Promise<FiscalPeriodSnapshot | null>;
	/**
	 * Fetch accounts by their primary keys.
	 * Returns a map from accountId → snapshot. Missing IDs map to undefined.
	 */
	findAccounts(entityId: UUID, accountIds: UUID[]): Promise<Map<UUID, GLAccountSnapshot>>;
	/** Fetch a journal entry with its lines. Returns null if not found. */
	findEntry(entityId: UUID, entryId: UUID): Promise<JournalEntrySnapshot | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class GLError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "GLError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses that accept new journal postings. */
const POSTABLE_STATUSES: FiscalPeriodStatus[] = ["OPEN", "SOFT_CLOSED"];

/**
 * Convert a NUMERIC(19,6) string amount to micro-units (BigInt) for exact arithmetic.
 * e.g. "1234.567890" → 1_234_567_890n
 */
function toMicroUnits(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	const padded = decPart.padEnd(6, "0").slice(0, 6);
	return BigInt(intPart) * 1_000_000n + BigInt(padded);
}

/**
 * Convert micro-units back to a NUMERIC(19,6) string.
 * e.g. 1_234_567_890n → "1234.567890"
 */
function fromMicroUnits(micro: bigint): string {
	const absVal = micro < 0n ? -micro : micro;
	const sign = micro < 0n ? "-" : "";
	const intPart = absVal / 1_000_000n;
	const decPart = (absVal % 1_000_000n).toString().padStart(6, "0");
	return `${sign}${intPart}.${decPart}`;
}

/** Verify that Σ debit == Σ credit in the input lines. */
function assertBalanced(lines: CreateJournalEntryInput["lines"]): void {
	let debitTotal = 0n;
	let creditTotal = 0n;
	for (const line of lines) {
		const micro = toMicroUnits(line.amount);
		if (line.type === "DEBIT") {
			debitTotal += micro;
		} else {
			creditTotal += micro;
		}
	}
	if (debitTotal !== creditTotal) {
		throw new GLError(
			`Journal entry is unbalanced: debits ${fromMicroUnits(debitTotal)} ≠ credits ${fromMicroUnits(creditTotal)}`,
			"UNBALANCED_ENTRY",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// postJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate input and construct records ready for DB insertion.
 *
 * Validation order:
 * 1. Fiscal period must be OPEN or SOFT_CLOSED.
 * 2. All account IDs must resolve to active, non-header accounts in the entity.
 * 3. Debits must equal credits (exact BigInt arithmetic).
 * 4. Generate entry number from PostingContext.
 *
 * @param input  Validated CreateJournalEntryInput (Zod Layer 1 must have run already).
 * @param ctx    Posting context: actor, entity currency, entry number generator.
 * @param repo   GLRepository for period and account lookups.
 * @returns GLPostingResult containing the entry and line records to persist.
 * @throws GLError if any business invariant is violated.
 */
export async function postJournalEntry(
	input: CreateJournalEntryInput,
	ctx: PostingContext,
	repo: GLRepository,
): Promise<GLPostingResult> {
	const entityId = input.legalEntityId as UUID;

	// 1. Fiscal period check
	const period = await repo.findPeriod(entityId, input.fiscalPeriodId as UUID);
	if (!period) {
		throw new GLError(
			`Fiscal period ${input.fiscalPeriodId} not found for entity ${entityId}`,
			"PERIOD_NOT_FOUND",
		);
	}
	if (!POSTABLE_STATUSES.includes(period.status)) {
		throw new GLError(
			`Cannot post to fiscal period "${period.periodLabel}" (${period.id}): status is ${period.status}. Only OPEN and SOFT_CLOSED periods accept postings.`,
			"PERIOD_NOT_POSTABLE",
		);
	}

	// 2. Account validation
	const uniqueAccountIds = [...new Set(input.lines.map((l) => l.accountId as UUID))];
	const accounts = await repo.findAccounts(entityId, uniqueAccountIds);

	for (const accountId of uniqueAccountIds) {
		const account = accounts.get(accountId);
		if (!account) {
			throw new GLError(
				`Account ${accountId} not found in entity ${entityId}`,
				"ACCOUNT_NOT_FOUND",
			);
		}
		if (!account.isActive) {
			throw new GLError(
				`Account ${account.accountNumber} (${accountId}) is inactive`,
				"ACCOUNT_INACTIVE",
			);
		}
		if (account.isHeader) {
			throw new GLError(
				`Account ${account.accountNumber} (${accountId}) is a header/summary account and cannot be posted to`,
				"ACCOUNT_IS_HEADER",
			);
		}
	}

	// 3. Balance check (defence-in-depth; Zod Layer 1 also checks this)
	assertBalanced(input.lines);

	// 4. Generate entry number
	const entryNumber = await ctx.generateEntryNumber();

	// 5. Build line records
	const now = new Date();
	const lines: JournalLineRecord[] = input.lines.map((line, idx) => {
		const isDebit = line.type === "DEBIT";
		const amount = line.amount;
		// For foreign currency lines: base amount = amount * exchange_rate.
		// In this phase, exchange_rate = 1.0 (same-currency posting).
		// Multi-currency conversion is FIN-005 scope.
		const exchangeRate = "1.000000";
		return {
			lineNumber: idx + 1,
			accountId: line.accountId as UUID,
			description: line.description ?? null,
			debitAmount: isDebit ? amount : "0.000000",
			creditAmount: isDebit ? "0.000000" : amount,
			currencyCode: line.currencyCode,
			exchangeRate,
			baseDebitAmount: isDebit ? amount : "0.000000",
			baseCreditAmount: isDebit ? "0.000000" : amount,
		};
	});

	const entry: JournalEntryRecord = {
		entityId,
		entryNumber,
		entryDate: input.entryDate,
		fiscalPeriodId: input.fiscalPeriodId as UUID,
		description: input.description,
		reference: input.reference,
		status: "POSTED",
		sourceModule: null,
		sourceDocumentId: null,
		reversalOfId: null,
		isAdjustment: false,
		postedAt: now,
		postedBy: ctx.actorId,
		createdBy: ctx.actorId,
		updatedBy: ctx.actorId,
	};

	return { entry, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// reverseJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a reversal entry for a previously POSTED journal entry.
 *
 * The reversal swaps debit/credit amounts on each line and sets reversal_of_id.
 * The original entry's status should be updated to REVERSED by the caller.
 *
 * Validation:
 * - Entry must be POSTED (cannot reverse DRAFT, REVERSED, or VOID).
 * - The period for the reversal entry must be OPEN or SOFT_CLOSED.
 *
 * @param entryId  ID of the entry to reverse.
 * @param reversalPeriodId  Fiscal period to post the reversal into.
 * @param reversalDate  Date for the reversal entry (YYYY-MM-DD).
 * @param ctx  Posting context.
 * @param repo  GL repository.
 * @returns GLPostingResult with the reversal entry and line records.
 */
export async function reverseJournalEntry(
	entryId: UUID,
	entityId: UUID,
	reversalPeriodId: UUID,
	reversalDate: string,
	ctx: PostingContext,
	repo: GLRepository,
): Promise<GLPostingResult> {
	// Load original entry
	const original = await repo.findEntry(entityId, entryId);
	if (!original) {
		throw new GLError(
			`Journal entry ${entryId} not found in entity ${entityId}`,
			"ENTRY_NOT_FOUND",
		);
	}
	if (original.status !== "POSTED") {
		throw new GLError(
			`Cannot reverse entry ${entryId}: status is ${original.status}. Only POSTED entries can be reversed.`,
			"ENTRY_NOT_REVERSIBLE",
		);
	}

	// Validate reversal period
	const period = await repo.findPeriod(entityId, reversalPeriodId);
	if (!period) {
		throw new GLError(
			`Reversal fiscal period ${reversalPeriodId} not found for entity ${entityId}`,
			"PERIOD_NOT_FOUND",
		);
	}
	if (!POSTABLE_STATUSES.includes(period.status)) {
		throw new GLError(
			`Cannot post reversal to fiscal period "${period.periodLabel}" (${period.id}): status is ${period.status}`,
			"PERIOD_NOT_POSTABLE",
		);
	}

	const entryNumber = await ctx.generateEntryNumber();
	const now = new Date();

	// Swap debit/credit amounts on every line
	const lines: JournalLineRecord[] = original.lines.map((line, idx) => ({
		lineNumber: idx + 1,
		accountId: line.accountId,
		description: line.description,
		debitAmount: line.creditAmount, // swapped
		creditAmount: line.debitAmount, // swapped
		currencyCode: line.currencyCode,
		exchangeRate: line.exchangeRate,
		baseDebitAmount: line.baseCreditAmount, // swapped
		baseCreditAmount: line.baseDebitAmount, // swapped
	}));

	const entry: JournalEntryRecord = {
		entityId,
		entryNumber,
		entryDate: reversalDate,
		fiscalPeriodId: reversalPeriodId,
		description: `REVERSAL of ${original.entryNumber}: ${original.description}`,
		reference: `REV-${original.entryNumber}`,
		status: "POSTED",
		sourceModule: null,
		sourceDocumentId: null,
		reversalOfId: entryId,
		isAdjustment: true,
		postedAt: now,
		postedBy: ctx.actorId,
		createdBy: ctx.actorId,
		updatedBy: ctx.actorId,
	};

	return { entry, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// closePeriod / reopenPeriod
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a period close transition.
 *
 * Allowed transitions:
 *   OPEN          → SOFT_CLOSED  (soft close: adjusting entries still allowed)
 *   OPEN          → HARD_CLOSED  (hard close: no more postings)
 *   SOFT_CLOSED   → HARD_CLOSED  (finalize close)
 *
 * @throws GLError if the transition is invalid.
 */
export function closePeriod(
	period: FiscalPeriodSnapshot,
	target: "SOFT_CLOSED" | "HARD_CLOSED",
): PeriodCloseResult {
	const valid = periodCloseAllowed(period.status, target);
	if (!valid) {
		throw new GLError(
			`Cannot transition period "${period.periodLabel}" from ${period.status} to ${target}`,
			"INVALID_PERIOD_TRANSITION",
		);
	}
	return {
		periodId: period.id,
		previousStatus: period.status,
		newStatus: target,
	};
}

/**
 * Validate a period reopen transition.
 *
 * Allowed:
 *   SOFT_CLOSED → OPEN  (reopen for additional postings)
 *
 * HARD_CLOSED periods cannot be reopened — this is an irreversible operation.
 *
 * @throws GLError if the transition is invalid.
 */
export function reopenPeriod(period: FiscalPeriodSnapshot): PeriodCloseResult {
	if (period.status !== "SOFT_CLOSED") {
		throw new GLError(
			`Cannot reopen period "${period.periodLabel}": status is ${period.status}. Only SOFT_CLOSED periods can be reopened.`,
			"INVALID_PERIOD_REOPEN",
		);
	}
	return {
		periodId: period.id,
		previousStatus: period.status,
		newStatus: "OPEN",
	};
}

/** Returns true if the close transition from current → target is permitted. */
function periodCloseAllowed(
	current: FiscalPeriodStatus,
	target: "SOFT_CLOSED" | "HARD_CLOSED",
): boolean {
	if (target === "SOFT_CLOSED") return current === "OPEN";
	if (target === "HARD_CLOSED") return current === "OPEN" || current === "SOFT_CLOSED";
	return false;
}
