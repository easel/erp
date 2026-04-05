/**
 * Accounts Payable (AP) Service — vendor bill lifecycle and posting.
 *
 * Implements FIN-003 (Accounts Payable) from SD-003-WP2.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O. APRepository is injected.
 * - Builds GL journal entries via buildBillJournalEntry(), which the caller
 *   passes to the GL engine (postJournalEntry). The AP service does not call
 *   the GL engine directly to avoid coupling.
 * - State machine (DRAFT → PENDING_APPROVAL → APPROVED → POSTED → PAID) is
 *   enforced by pure functions, mirroring the PO approval workflow pattern.
 *
 * AP posting journal entry:
 *   DR expense/asset accounts (per bill line × amount)
 *   CR AP control account (entity-level accounts-payable ledger account × total)
 *
 * Payment journal entry:
 *   DR AP control account × payment amount
 *   CR Cash/Bank account × payment amount
 *
 * Ref: SD-002-data-model.md §4.3, SD-003-WP2 FIN-003, ADR-011 (money amounts)
 * Issue: hx-29d07b28
 */

import type { CreateVendorBillInput } from "@apogee/shared";
import type { CurrencyCode, UUID } from "@apogee/shared";
import type { CreateJournalEntryInput } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type VendorBillStatus =
	| "DRAFT"
	| "PENDING_APPROVAL"
	| "APPROVED"
	| "POSTED"
	| "PARTIALLY_PAID"
	| "PAID"
	| "VOID";

/** Minimal snapshot of a vendor bill needed for state transitions. */
export interface VendorBillSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly vendorId: UUID;
	readonly billNumber: string;
	readonly status: VendorBillStatus;
	readonly totalAmount: string;
	readonly amountPaid: string;
	readonly balanceDue: string;
	readonly currencyCode: string;
	readonly fiscalPeriodId: UUID | null;
}

/** Record ready for DB insertion into vendor_bill. */
export interface VendorBillRecord {
	readonly entityId: UUID;
	readonly vendorId: UUID;
	readonly billNumber: string;
	readonly internalRef: string;
	readonly billDate: string;
	readonly dueDate: string;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly subtotalAmount: string;
	readonly taxAmount: string;
	readonly totalAmount: string;
	readonly baseTotalAmount: string;
	readonly balanceDue: string;
	readonly status: VendorBillStatus;
	readonly fiscalPeriodId: UUID | null;
	readonly purchaseOrderId: UUID | null;
	readonly goodsReceiptId: UUID | null;
	readonly paymentTerms: string | null;
	readonly notes: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Result of a vendor bill state transition. */
export interface VendorBillTransitionResult {
	readonly newStatus: VendorBillStatus;
}

/** Result of a payment application. */
export interface PaymentApplicationResult {
	readonly newStatus: VendorBillStatus;
	readonly remainingBalance: string;
	readonly fullyPaid: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class APError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "APError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers: micro-unit arithmetic for NUMERIC(19,6) amounts
// ─────────────────────────────────────────────────────────────────────────────

/** Convert NUMERIC(19,6) string to BigInt micro-units (6 decimal places). */
function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
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
function sumAmounts(amounts: string[]): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// State machine helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Valid source statuses per action. */
const BILL_TRANSITIONS: Record<string, readonly VendorBillStatus[]> = {
	submitForApproval: ["DRAFT"],
	approve: ["PENDING_APPROVAL"],
	rejectToDraft: ["PENDING_APPROVAL"],
	post: ["APPROVED"],
	void: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"],
} as const;

function assertBillTransition(bill: VendorBillSnapshot, action: string): void {
	const allowed = BILL_TRANSITIONS[action];
	if (!allowed?.includes(bill.status)) {
		throw new APError(
			`Cannot ${action} a vendor bill with status ${bill.status}. Allowed: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_BILL_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// createVendorBillRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct a VendorBillRecord from CreateVendorBillInput.
 *
 * Computes derived amounts:
 * - subtotalAmount = sum of line amounts (excluding tax)
 * - taxAmount = sum of line taxAmounts
 * - totalAmount = subtotalAmount + taxAmount
 * - baseTotalAmount = totalAmount (at rate 1.0; FIN-005 multi-currency TBD)
 * - balanceDue = totalAmount (no payments yet)
 */
export function createVendorBillRecord(
	input: CreateVendorBillInput,
	internalRef: string,
	actorId: UUID,
): VendorBillRecord {
	const lineAmounts = input.lines.map((l) => l.amount);
	const taxAmounts = input.lines.map((l) => l.taxAmount ?? "0.000000");
	const subtotal = sumAmounts(lineAmounts);
	const taxTotal = sumAmounts(taxAmounts);
	const total = sumAmounts([subtotal, taxTotal]);

	return {
		entityId: input.entityId as UUID,
		vendorId: input.vendorId as UUID,
		billNumber: input.billNumber,
		internalRef,
		billDate: input.billDate,
		dueDate: input.dueDate,
		currencyCode: input.currencyCode,
		exchangeRate: "1.000000",
		subtotalAmount: subtotal,
		taxAmount: taxTotal,
		totalAmount: total,
		baseTotalAmount: total,
		balanceDue: total,
		status: "DRAFT",
		fiscalPeriodId: (input.fiscalPeriodId as UUID | undefined) ?? null,
		purchaseOrderId: (input.purchaseOrderId as UUID | undefined) ?? null,
		goodsReceiptId: (input.goodsReceiptId as UUID | undefined) ?? null,
		paymentTerms: input.paymentTerms ?? null,
		notes: input.notes ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildBillJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CreateJournalEntryInput for posting a vendor bill to the GL.
 *
 * Double-entry:
 *   DR each bill line's accountId × line amount  (expense/asset accounts)
 *   CR AP control account × bill total            (liability)
 *
 * The returned input is passed to the GL engine's postJournalEntry().
 * The caller supplies the AP control account ID for the legal entity.
 *
 * @param bill    Approved VendorBillSnapshot to post.
 * @param lines   Bill lines (accountId, amount per line).
 * @param apControlAccountId  AP control ledger account for this entity.
 * @param fiscalPeriodId  Fiscal period to post into.
 * @param entryDate  Posting date (YYYY-MM-DD).
 */
export function buildBillJournalEntry(
	bill: VendorBillSnapshot,
	lines: readonly { accountId: UUID; amount: string; description: string; currencyCode: string }[],
	apControlAccountId: UUID,
	fiscalPeriodId: UUID,
	entryDate: string,
): CreateJournalEntryInput {
	if (lines.length === 0) {
		throw new APError("Vendor bill must have at least one line", "BILL_NO_LINES");
	}

	// Debit lines: each bill line DR
	const debitLines = lines.map((line) => ({
		accountId: line.accountId,
		type: "DEBIT" as const,
		amount: line.amount,
		currencyCode: line.currencyCode as CurrencyCode,
		description: line.description,
	}));

	// Credit line: AP control account CR (total of all lines)
	const totalAmount = sumAmounts(lines.map((l) => l.amount));
	const creditLine = {
		accountId: apControlAccountId,
		type: "CREDIT" as const,
		amount: totalAmount,
		currencyCode: bill.currencyCode as CurrencyCode,
		description: `Accounts Payable — ${bill.billNumber}`,
	};

	return {
		legalEntityId: bill.entityId,
		fiscalPeriodId,
		entryDate,
		reference: `AP-${bill.billNumber}`,
		description: `Vendor Bill: ${bill.billNumber}`,
		lines: [...debitLines, creditLine],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPaymentJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CreateJournalEntryInput for posting a vendor payment to the GL.
 *
 * Double-entry:
 *   DR AP control account × payment amount     (reduces liability)
 *   CR Cash/Bank account  × payment amount     (reduces asset)
 *
 * @param bill          VendorBillSnapshot being paid.
 * @param paymentAmount Amount being paid (NUMERIC(19,6) string).
 * @param paymentRef    Payment reference number.
 * @param apControlAccountId  AP control ledger account.
 * @param bankAccountId       Cash/bank ledger account.
 * @param fiscalPeriodId      Fiscal period to post into.
 * @param paymentDate         Payment date (YYYY-MM-DD).
 */
export function buildPaymentJournalEntry(
	bill: VendorBillSnapshot,
	paymentAmount: string,
	paymentRef: string,
	apControlAccountId: UUID,
	bankAccountId: UUID,
	fiscalPeriodId: UUID,
	paymentDate: string,
): CreateJournalEntryInput {
	if (compareAmounts(paymentAmount, "0.000000") <= 0) {
		throw new APError("Payment amount must be greater than zero", "PAYMENT_AMOUNT_ZERO");
	}
	if (compareAmounts(paymentAmount, bill.balanceDue) > 0) {
		throw new APError(
			`Payment amount ${paymentAmount} exceeds bill balance due ${bill.balanceDue}`,
			"PAYMENT_EXCEEDS_BALANCE",
		);
	}

	return {
		legalEntityId: bill.entityId,
		fiscalPeriodId,
		entryDate: paymentDate,
		reference: `PMT-${paymentRef}`,
		description: `Payment for bill ${bill.billNumber}`,
		lines: [
			{
				accountId: apControlAccountId,
				type: "DEBIT" as const,
				amount: paymentAmount,
				currencyCode: bill.currencyCode as CurrencyCode,
				description: `AP payment — ${bill.billNumber}`,
			},
			{
				accountId: bankAccountId,
				type: "CREDIT" as const,
				amount: paymentAmount,
				currencyCode: bill.currencyCode as CurrencyCode,
				description: `Cash disbursement — ${paymentRef}`,
			},
		],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow functions (pure state machine)
// ─────────────────────────────────────────────────────────────────────────────

/** Submit a DRAFT bill for approval → PENDING_APPROVAL. */
export function submitBillForApproval(bill: VendorBillSnapshot): VendorBillTransitionResult {
	assertBillTransition(bill, "submitForApproval");
	return { newStatus: "PENDING_APPROVAL" };
}

/** Approve a PENDING_APPROVAL bill → APPROVED. */
export function approveBill(bill: VendorBillSnapshot): VendorBillTransitionResult {
	assertBillTransition(bill, "approve");
	return { newStatus: "APPROVED" };
}

/** Reject a PENDING_APPROVAL bill back to DRAFT. */
export function rejectBillToDraft(bill: VendorBillSnapshot): VendorBillTransitionResult {
	assertBillTransition(bill, "rejectToDraft");
	return { newStatus: "DRAFT" };
}

/** Mark an APPROVED bill as POSTED (after GL journal entry is persisted). */
export function markBillPosted(bill: VendorBillSnapshot): VendorBillTransitionResult {
	assertBillTransition(bill, "post");
	return { newStatus: "POSTED" };
}

/**
 * Apply a payment to a bill. Updates amountPaid and status.
 *
 * Transitions:
 *   POSTED          → PARTIALLY_PAID  (partial)
 *   POSTED          → PAID            (exact or over-pay capped to balance)
 *   PARTIALLY_PAID  → PARTIALLY_PAID  (additional partial)
 *   PARTIALLY_PAID  → PAID            (final payment)
 *
 * @throws APError if bill is not in a payable status (POSTED or PARTIALLY_PAID).
 */
export function applyPayment(
	bill: VendorBillSnapshot,
	paymentAmount: string,
): PaymentApplicationResult {
	if (bill.status !== "POSTED" && bill.status !== "PARTIALLY_PAID") {
		throw new APError(
			`Cannot apply payment to bill with status ${bill.status}. Bill must be POSTED or PARTIALLY_PAID.`,
			"BILL_NOT_PAYABLE",
		);
	}

	if (compareAmounts(paymentAmount, "0.000000") <= 0) {
		throw new APError("Payment amount must be greater than zero", "PAYMENT_AMOUNT_ZERO");
	}

	if (compareAmounts(paymentAmount, bill.balanceDue) > 0) {
		throw new APError(
			`Payment amount ${paymentAmount} exceeds balance due ${bill.balanceDue}`,
			"PAYMENT_EXCEEDS_BALANCE",
		);
	}

	const remaining = subtractAmount(bill.balanceDue, paymentAmount);
	const fullyPaid = compareAmounts(remaining, "0.000000") === 0;
	return {
		newStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID",
		remainingBalance: remaining,
		fullyPaid,
	};
}

/** Void a bill (must not be in PAID status). */
export function voidBill(bill: VendorBillSnapshot): VendorBillTransitionResult {
	assertBillTransition(bill, "void");
	return { newStatus: "VOID" };
}
