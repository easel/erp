/**
 * Accounts Receivable (AR) Service — customer invoice lifecycle and posting.
 *
 * Implements FIN-004 (Accounts Receivable) from SD-003-WP2.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O. ARRepository is injected.
 * - Builds GL journal entries via buildInvoiceJournalEntry(), which the caller
 *   passes to the GL engine (postJournalEntry). The AR service does not call
 *   the GL engine directly to avoid coupling.
 * - State machine (DRAFT → SENT → PARTIALLY_PAID/PAID, VOID, WRITTEN_OFF) is
 *   enforced by pure functions, mirroring the AP workflow pattern.
 *
 * AR posting journal entry:
 *   DR AR control account (entity-level accounts-receivable ledger account × total)
 *   CR revenue accounts (per invoice line × amount)
 *
 * Payment journal entry:
 *   DR Cash/Bank account × payment amount
 *   CR AR control account × payment amount
 *
 * Ref: SD-002-data-model.md §4.4, SD-003-WP2 FIN-004, ADR-011 (money amounts)
 * Issue: hx-267a4d5b
 */

import type { CreateCustomerInvoiceInput } from "@apogee/shared";
import type { CurrencyCode, UUID } from "@apogee/shared";
import type { CreateJournalEntryInput } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type CustomerInvoiceStatus =
	| "DRAFT"
	| "SENT"
	| "PARTIALLY_PAID"
	| "PAID"
	| "VOID"
	| "WRITTEN_OFF";

/** Minimal snapshot of a customer invoice needed for state transitions. */
export interface CustomerInvoiceSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly invoiceNumber: string;
	readonly status: CustomerInvoiceStatus;
	readonly totalAmount: string;
	readonly amountReceived: string;
	readonly balanceDue: string;
	readonly currencyCode: string;
	readonly fiscalPeriodId: UUID | null;
}

/** Record ready for DB insertion into customer_invoice. */
export interface CustomerInvoiceRecord {
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly invoiceNumber: string;
	readonly invoiceDate: string;
	readonly dueDate: string;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly subtotalAmount: string;
	readonly taxAmount: string;
	readonly totalAmount: string;
	readonly baseTotalAmount: string;
	readonly amountReceived: string;
	readonly balanceDue: string;
	readonly status: CustomerInvoiceStatus;
	readonly fiscalPeriodId: UUID | null;
	readonly salesOrderId: UUID | null;
	readonly paymentTerms: string | null;
	readonly notes: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Result of a customer invoice state transition. */
export interface CustomerInvoiceTransitionResult {
	readonly newStatus: CustomerInvoiceStatus;
}

/** Result of a payment application to a customer invoice. */
export interface ARPaymentApplicationResult {
	readonly newStatus: CustomerInvoiceStatus;
	readonly remainingBalance: string;
	readonly fullyPaid: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class ARError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ARError";
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
const INVOICE_TRANSITIONS: Record<string, readonly CustomerInvoiceStatus[]> = {
	send: ["DRAFT"],
	void: ["DRAFT", "SENT"],
	writeOff: ["SENT", "PARTIALLY_PAID"],
} as const;

function assertInvoiceTransition(invoice: CustomerInvoiceSnapshot, action: string): void {
	const allowed = INVOICE_TRANSITIONS[action];
	if (!allowed?.includes(invoice.status)) {
		throw new ARError(
			`Cannot ${action} a customer invoice with status ${invoice.status}. Allowed: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_INVOICE_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// createCustomerInvoiceRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct a CustomerInvoiceRecord from CreateCustomerInvoiceInput.
 *
 * Computes derived amounts:
 * - subtotalAmount = sum of line amounts (excluding tax)
 * - taxAmount = sum of line taxAmounts
 * - totalAmount = subtotalAmount + taxAmount
 * - baseTotalAmount = totalAmount (at rate 1.0; FIN-005 multi-currency TBD)
 * - balanceDue = totalAmount (no payments yet)
 */
export function createCustomerInvoiceRecord(
	input: CreateCustomerInvoiceInput,
	invoiceNumber: string,
	actorId: UUID,
): CustomerInvoiceRecord {
	const lineAmounts = input.lines.map((l) => l.amount);
	const taxAmounts = input.lines.map((l) => l.taxAmount ?? "0.000000");
	const subtotal = sumAmounts(lineAmounts);
	const taxTotal = sumAmounts(taxAmounts);
	const total = sumAmounts([subtotal, taxTotal]);

	return {
		entityId: input.entityId as UUID,
		customerId: input.customerId as UUID,
		invoiceNumber,
		invoiceDate: input.invoiceDate,
		dueDate: input.dueDate,
		currencyCode: input.currencyCode,
		exchangeRate: "1.000000",
		subtotalAmount: subtotal,
		taxAmount: taxTotal,
		totalAmount: total,
		baseTotalAmount: total,
		amountReceived: "0.000000",
		balanceDue: total,
		status: "DRAFT",
		fiscalPeriodId: (input.fiscalPeriodId as UUID | undefined) ?? null,
		salesOrderId: (input.salesOrderId as UUID | undefined) ?? null,
		paymentTerms: input.paymentTerms ?? null,
		notes: input.notes ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInvoiceJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CreateJournalEntryInput for posting a customer invoice to the GL.
 *
 * Double-entry:
 *   DR AR control account × invoice total     (asset — amounts owed by customer)
 *   CR each invoice line's accountId × amount (revenue/income accounts)
 *
 * The returned input is passed to the GL engine's postJournalEntry().
 * The caller supplies the AR control account ID for the legal entity.
 *
 * @param invoice         CustomerInvoiceSnapshot to post.
 * @param lines           Invoice lines (accountId, amount per line).
 * @param arControlAccountId  AR control ledger account for this entity.
 * @param fiscalPeriodId  Fiscal period to post into.
 * @param entryDate       Posting date (YYYY-MM-DD).
 */
export function buildInvoiceJournalEntry(
	invoice: CustomerInvoiceSnapshot,
	lines: readonly { accountId: UUID; amount: string; description: string; currencyCode: string }[],
	arControlAccountId: UUID,
	fiscalPeriodId: UUID,
	entryDate: string,
): CreateJournalEntryInput {
	if (lines.length === 0) {
		throw new ARError("Customer invoice must have at least one line", "INVOICE_NO_LINES");
	}

	// Debit line: AR control account DR (total receivable)
	const totalAmount = sumAmounts(lines.map((l) => l.amount));
	const debitLine = {
		accountId: arControlAccountId,
		type: "DEBIT" as const,
		amount: totalAmount,
		currencyCode: invoice.currencyCode as CurrencyCode,
		description: `Accounts Receivable — ${invoice.invoiceNumber}`,
	};

	// Credit lines: each revenue line CR
	const creditLines = lines.map((line) => ({
		accountId: line.accountId,
		type: "CREDIT" as const,
		amount: line.amount,
		currencyCode: line.currencyCode as CurrencyCode,
		description: line.description,
	}));

	return {
		legalEntityId: invoice.entityId,
		fiscalPeriodId,
		entryDate,
		reference: `AR-${invoice.invoiceNumber}`,
		description: `Customer Invoice: ${invoice.invoiceNumber}`,
		lines: [debitLine, ...creditLines],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildARPaymentJournalEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CreateJournalEntryInput for posting a customer payment to the GL.
 *
 * Double-entry:
 *   DR Cash/Bank account  × payment amount     (increases asset)
 *   CR AR control account × payment amount     (reduces receivable)
 *
 * @param invoice         CustomerInvoiceSnapshot being paid.
 * @param paymentAmount   Amount being paid (NUMERIC(19,6) string).
 * @param paymentRef      Payment reference number.
 * @param arControlAccountId  AR control ledger account.
 * @param bankAccountId       Cash/bank ledger account.
 * @param fiscalPeriodId      Fiscal period to post into.
 * @param paymentDate         Payment date (YYYY-MM-DD).
 */
export function buildARPaymentJournalEntry(
	invoice: CustomerInvoiceSnapshot,
	paymentAmount: string,
	paymentRef: string,
	arControlAccountId: UUID,
	bankAccountId: UUID,
	fiscalPeriodId: UUID,
	paymentDate: string,
): CreateJournalEntryInput {
	if (compareAmounts(paymentAmount, "0.000000") <= 0) {
		throw new ARError("Payment amount must be greater than zero", "PAYMENT_AMOUNT_ZERO");
	}
	if (compareAmounts(paymentAmount, invoice.balanceDue) > 0) {
		throw new ARError(
			`Payment amount ${paymentAmount} exceeds invoice balance due ${invoice.balanceDue}`,
			"PAYMENT_EXCEEDS_BALANCE",
		);
	}

	return {
		legalEntityId: invoice.entityId,
		fiscalPeriodId,
		entryDate: paymentDate,
		reference: `RCPT-${paymentRef}`,
		description: `Payment received for invoice ${invoice.invoiceNumber}`,
		lines: [
			{
				accountId: bankAccountId,
				type: "DEBIT" as const,
				amount: paymentAmount,
				currencyCode: invoice.currencyCode as CurrencyCode,
				description: `Cash receipt — ${paymentRef}`,
			},
			{
				accountId: arControlAccountId,
				type: "CREDIT" as const,
				amount: paymentAmount,
				currencyCode: invoice.currencyCode as CurrencyCode,
				description: `AR payment — ${invoice.invoiceNumber}`,
			},
		],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow functions (pure state machine)
// ─────────────────────────────────────────────────────────────────────────────

/** Send a DRAFT invoice to the customer → SENT. */
export function sendInvoice(invoice: CustomerInvoiceSnapshot): CustomerInvoiceTransitionResult {
	assertInvoiceTransition(invoice, "send");
	return { newStatus: "SENT" };
}

/** Void a DRAFT or SENT invoice (e.g., billing error, duplicate). */
export function voidInvoice(invoice: CustomerInvoiceSnapshot): CustomerInvoiceTransitionResult {
	assertInvoiceTransition(invoice, "void");
	return { newStatus: "VOID" };
}

/** Write off an uncollectable SENT or PARTIALLY_PAID invoice. */
export function writeOffInvoice(invoice: CustomerInvoiceSnapshot): CustomerInvoiceTransitionResult {
	assertInvoiceTransition(invoice, "writeOff");
	return { newStatus: "WRITTEN_OFF" };
}

/**
 * Apply a customer payment to an invoice. Updates amountReceived and status.
 *
 * Transitions:
 *   SENT           → PARTIALLY_PAID  (partial)
 *   SENT           → PAID            (exact)
 *   PARTIALLY_PAID → PARTIALLY_PAID  (additional partial)
 *   PARTIALLY_PAID → PAID            (final payment)
 *
 * @throws ARError if invoice is not in a receivable status (SENT or PARTIALLY_PAID).
 */
export function applyARPayment(
	invoice: CustomerInvoiceSnapshot,
	paymentAmount: string,
): ARPaymentApplicationResult {
	if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") {
		throw new ARError(
			`Cannot apply payment to invoice with status ${invoice.status}. Invoice must be SENT or PARTIALLY_PAID.`,
			"INVOICE_NOT_RECEIVABLE",
		);
	}

	if (compareAmounts(paymentAmount, "0.000000") <= 0) {
		throw new ARError("Payment amount must be greater than zero", "PAYMENT_AMOUNT_ZERO");
	}

	if (compareAmounts(paymentAmount, invoice.balanceDue) > 0) {
		throw new ARError(
			`Payment amount ${paymentAmount} exceeds balance due ${invoice.balanceDue}`,
			"PAYMENT_EXCEEDS_BALANCE",
		);
	}

	const remaining = subtractAmount(invoice.balanceDue, paymentAmount);
	const fullyPaid = compareAmounts(remaining, "0.000000") === 0;
	return {
		newStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID",
		remainingBalance: remaining,
		fullyPaid,
	};
}
