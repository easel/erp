/**
 * Quote Service — quote lifecycle and quote-to-order conversion.
 *
 * Implements SLS-001 (Quotes) from SD-003-WP5.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - buildQuoteRecord: computes line totals and header amounts from input.
 * - Quote state machine: DRAFT → SENT → ACCEPTED/REJECTED/EXPIRED/CANCELLED.
 * - convertQuoteToOrder: builds a CreateSalesOrderInput-equivalent record
 *   from an ACCEPTED quote snapshot.
 *
 * Money arithmetic uses BigInt micro-units (NUMERIC 19,6 = 6 decimal places).
 *
 * Ref: SD-002-data-model.md §6.3 (quote, quote_line),
 *      SD-003-WP5 SLS-001, ADR-011 (money amounts)
 * Issue: hx-31c83b3c
 */

import type { CreateSalesQuoteInput } from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface QuoteSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly quoteNumber: string;
	readonly status: QuoteStatus;
	readonly currencyCode: string;
	readonly totalAmount: string;
	readonly validUntil: string;
	readonly opportunityId: UUID | null;
}

/** DB-ready record for quote INSERT. */
export interface QuoteRecord {
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly quoteNumber: string;
	readonly quoteDate: string;
	readonly validUntil: string;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly subtotalAmount: string;
	readonly taxAmount: string;
	readonly totalAmount: string;
	readonly baseTotalAmount: string;
	readonly status: QuoteStatus;
	readonly opportunityId: UUID | null;
	readonly notes: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** DB-ready record for quote_line INSERT. */
export interface QuoteLineRecord {
	readonly lineNumber: number;
	readonly productId: UUID | null;
	readonly description: string;
	readonly quantity: string;
	readonly unitPrice: string;
	readonly discountPercent: number;
	readonly amount: string;
	readonly currencyCode: string;
	readonly taxCode: string | null;
	readonly taxAmount: string;
}

/** Combined output of buildQuoteRecord. */
export interface QuoteBuildResult {
	readonly header: QuoteRecord;
	readonly lines: QuoteLineRecord[];
}

/** Sales-order-ready record produced by convertQuoteToOrder. */
export interface QuoteToOrderData {
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly quoteId: UUID;
	readonly currencyCode: string;
	readonly orderDate: string;
	readonly paymentTerms: string | null;
	readonly lineItems: Array<{
		readonly productId: UUID | null;
		readonly description: string;
		readonly quantityOrdered: string;
		readonly unitPrice: string;
		readonly discountPercent: number;
		readonly taxCode: string | null;
		readonly currencyCode: string;
	}>;
	readonly notes: string | null;
}

/** Result of a quote state transition. */
export interface QuoteTransitionResult {
	readonly newStatus: QuoteStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class QuoteError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "QuoteError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-unit arithmetic
// ─────────────────────────────────────────────────────────────────────────────

function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
}

function fromMicro(micro: bigint): string {
	const abs = micro < 0n ? -micro : micro;
	const sign = micro < 0n ? "-" : "";
	const intPart = abs / 1_000_000n;
	const decPart = (abs % 1_000_000n).toString().padStart(6, "0");
	return `${sign}${intPart}.${decPart}`;
}

/**
 * Compute line amount: unitPrice × quantity × (1 - discountPercent/100).
 * Rounds to 6 decimal places (micro-unit truncation).
 */
function computeLineAmount(unitPrice: string, quantity: string, discountPercent: number): string {
	const priceMicro = toMicro(unitPrice);
	// quantity may have up to 4 decimal places (NUMERIC 16,4); normalise to 6
	const qtyStr = quantity.includes(".") ? quantity : `${quantity}.000000`;
	const [qInt = "0", qDec = ""] = qtyStr.split(".");
	const qtyMicro = BigInt(qInt) * 1_000_000n + BigInt(qDec.padEnd(6, "0").slice(0, 6));

	// gross = price × qty (in micro² = 1e-12 units)
	const grossMicro2 = priceMicro * qtyMicro;

	// Apply discount: multiply by (10000 - discountBasisPoints) / 10000
	// discountPercent is 0-100 with up to 2 decimal places → use basis points (×100)
	const discountBP = BigInt(Math.round(discountPercent * 100));
	const netMicro2 = grossMicro2 * (10_000n - discountBP);

	// Convert back to micro (divide by 1e6 × 10000 = 1e10)
	const netMicro = netMicro2 / 10_000_000_000n;
	return fromMicro(netMicro);
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

const QUOTE_TRANSITIONS: Record<string, readonly QuoteStatus[]> = {
	send: ["DRAFT"],
	accept: ["SENT"],
	reject: ["SENT"],
	cancel: ["DRAFT", "SENT"],
	expire: ["SENT"],
} as const;

function assertQuoteTransition(quote: QuoteSnapshot, action: string): void {
	const allowed = QUOTE_TRANSITIONS[action];
	if (!allowed?.includes(quote.status)) {
		throw new QuoteError(
			`Cannot ${action} a quote with status '${quote.status}'. ` +
				`Allowed statuses: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_QUOTE_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB-ready quote record + line records from validated input.
 * Computes line amounts, subtotal, and total.
 *
 * @param quoteNumber  Caller-supplied sequence number (e.g., "QT-2026-001").
 * @param exchangeRate Functional-currency exchange rate (default "1.000000").
 */
export function buildQuoteRecord(
	input: CreateSalesQuoteInput,
	quoteNumber: string,
	actorId: UUID,
	exchangeRate = "1.000000",
): QuoteBuildResult {
	const lines: QuoteLineRecord[] = input.lineItems.map((item, idx) => {
		const amount = computeLineAmount(item.unitPrice, item.quantity, item.discountPercent ?? 0);
		return {
			lineNumber: idx + 1,
			productId: (item.productId as UUID | undefined) ?? null,
			description: item.description,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			discountPercent: item.discountPercent ?? 0,
			amount,
			currencyCode: item.currencyCode,
			taxCode: item.taxCode ?? null,
			taxAmount: "0.000000",
		};
	});

	const subtotalMicro = lines.reduce((acc, l) => acc + toMicro(l.amount), 0n);
	const subtotalAmount = fromMicro(subtotalMicro);
	const taxAmount = "0.000000";
	const totalAmount = subtotalAmount;
	const baseTotalMicro = (subtotalMicro * toMicro(exchangeRate)) / 1_000_000n;
	const baseTotalAmount = fromMicro(baseTotalMicro);

	const header: QuoteRecord = {
		entityId: input.entityId as UUID,
		customerId: input.customerId as UUID,
		quoteNumber,
		quoteDate: input.quoteDate,
		validUntil: input.validUntil,
		currencyCode: input.currencyCode,
		exchangeRate,
		subtotalAmount,
		taxAmount,
		totalAmount,
		baseTotalAmount,
		status: "DRAFT",
		opportunityId: (input.opportunityId as UUID | undefined) ?? null,
		notes: input.notes ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};

	return { header, lines };
}

/** Transition quote DRAFT → SENT. */
export function sendQuote(quote: QuoteSnapshot): QuoteTransitionResult {
	assertQuoteTransition(quote, "send");
	return { newStatus: "SENT" };
}

/** Transition quote SENT → ACCEPTED. */
export function acceptQuote(quote: QuoteSnapshot): QuoteTransitionResult {
	assertQuoteTransition(quote, "accept");
	return { newStatus: "ACCEPTED" };
}

/** Transition quote SENT → REJECTED. */
export function rejectQuote(quote: QuoteSnapshot): QuoteTransitionResult {
	assertQuoteTransition(quote, "reject");
	return { newStatus: "REJECTED" };
}

/** Transition quote DRAFT|SENT → CANCELLED. */
export function cancelQuote(quote: QuoteSnapshot): QuoteTransitionResult {
	assertQuoteTransition(quote, "cancel");
	return { newStatus: "CANCELLED" };
}

/** Transition quote SENT → EXPIRED. */
export function expireQuote(quote: QuoteSnapshot): QuoteTransitionResult {
	assertQuoteTransition(quote, "expire");
	return { newStatus: "EXPIRED" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote-to-order conversion
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteLineForConversion {
	readonly productId: UUID | null;
	readonly description: string;
	readonly quantity: string;
	readonly unitPrice: string;
	readonly discountPercent: number;
	readonly taxCode: string | null;
	readonly currencyCode: string;
}

/**
 * Convert an ACCEPTED quote to a sales order seed record.
 *
 * Acceptance rules:
 * - Quote must be in ACCEPTED status.
 * - All line items are copied with quantity → quantityOrdered.
 *
 * The caller is responsible for persisting the resulting sales order and
 * updating the quote FK (quote.sales_order_id is not tracked in the schema,
 * but the order FK quote_id links back).
 */
export function convertQuoteToOrder(
	quote: QuoteSnapshot,
	lines: QuoteLineForConversion[],
	orderDate: string,
	customerPaymentTerms: string | null = null,
): QuoteToOrderData {
	if (quote.status !== "ACCEPTED") {
		throw new QuoteError(
			`Cannot convert quote with status '${quote.status}' to order. Quote must be ACCEPTED.`,
			"QUOTE_NOT_ACCEPTED",
		);
	}
	if (lines.length === 0) {
		throw new QuoteError("Quote has no line items to convert.", "QUOTE_NO_LINES");
	}

	return {
		entityId: quote.entityId,
		customerId: quote.customerId,
		quoteId: quote.id,
		currencyCode: quote.currencyCode,
		orderDate,
		paymentTerms: customerPaymentTerms,
		lineItems: lines.map((l) => ({
			productId: l.productId,
			description: l.description,
			quantityOrdered: l.quantity,
			unitPrice: l.unitPrice,
			discountPercent: l.discountPercent,
			taxCode: l.taxCode,
			currencyCode: l.currencyCode,
		})),
		notes: null,
	};
}
