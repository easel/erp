/**
 * Goods Receipt (GR) Service — AP accrual posting and three-way match.
 *
 * Implements SCM-004 (Goods Receipt AP Accrual + Three-Way Match) from SD-003-WP4.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - AP accrual is built as a CreateJournalEntryInput passed to the GL engine.
 * - Three-way match compares PO line, GR lines, and vendor bill line.
 * - State machine: DRAFT → POSTED (or CANCELLED).
 *
 * AP accrual journal entry (on DRAFT → POSTED):
 *   DR Inventory/Expense account × (qty_accepted × unit_price) per GR line
 *   CR AP Accrual/Control account × total accrual
 *
 * Three-way match:
 *   Quantity variance: GR qty_accepted vs PO qty_ordered
 *   Price variance:    Vendor bill unit price vs PO unit price
 *
 * Ref: SD-002-data-model.md §5, SD-003-WP4 SCM-004, ADR-011 (money amounts)
 * Issue: hx-3ec8596d
 */

import type { CurrencyCode, UUID } from "@apogee/shared";
import type { CreateJournalEntryInput } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED";

/** Minimal snapshot of a goods receipt needed for state transitions. */
export interface GoodsReceiptSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly purchaseOrderId: UUID;
	readonly receiptNumber: string;
	readonly status: GoodsReceiptStatus;
	readonly receiptDate: string;
	readonly currencyCode: string;
}

/** A single goods receipt line with PO line pricing for accrual calculation. */
export interface GoodsReceiptLineSnapshot {
	readonly id: UUID;
	readonly goodsReceiptId: UUID;
	readonly purchaseOrderLineId: UUID;
	readonly lineNumber: number;
	readonly quantityAccepted: string;
	/** Unit price from the PO line (NUMERIC(19,6) string). */
	readonly unitPrice: string;
	/** GL account for this line (inventory asset or expense account). */
	readonly accountId: UUID;
	readonly description: string;
}

/** Minimal snapshot of a PO line for three-way match. */
export interface POLineSnapshot {
	readonly id: UUID;
	readonly purchaseOrderId: UUID;
	readonly lineNumber: number;
	readonly quantityOrdered: string;
	readonly quantityReceived: string;
	readonly unitPrice: string;
	readonly amount: string;
	readonly currencyCode: string;
}

/** Minimal snapshot of a vendor bill line for three-way match. */
export interface BillLineSnapshot {
	readonly purchaseOrderLineId: UUID | null;
	readonly lineNumber: number;
	readonly amount: string;
	readonly unitPrice: string;
	readonly currencyCode: string;
}

/** Result of a three-way match for one PO line. */
export interface ThreeWayMatchLineResult {
	readonly purchaseOrderLineId: UUID;
	readonly poUnitPrice: string;
	readonly poQuantityOrdered: string;
	readonly totalQuantityReceived: string;
	readonly billUnitPrice: string | null;
	readonly billAmount: string | null;
	/** Quantity variance: qty received − qty ordered. Negative = under-received. */
	readonly quantityVariance: string;
	/** Price variance: (bill unit price − PO unit price) × qty received. */
	readonly priceVariance: string | null;
	readonly quantityMatch: "MATCH" | "UNDER" | "OVER";
	readonly priceMatch: "MATCH" | "VARIANCE" | "NO_BILL";
	readonly overallMatch: "MATCH" | "DISCREPANCY";
}

/** Result of a GR state transition. */
export interface GoodsReceiptTransitionResult {
	readonly newStatus: GoodsReceiptStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class GRError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "GRError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers: NUMERIC(19,6) arithmetic using BigInt micro-units
// ─────────────────────────────────────────────────────────────────────────────

/** Convert NUMERIC(19,6) string to BigInt micro-units. */
function toMicro(amount: string): bigint {
	const neg = amount.startsWith("-");
	const [intPart = "0", decPart = ""] = amount.replace("-", "").split(".");
	const val = BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
	return neg ? -val : val;
}

/** Convert BigInt micro-units to NUMERIC(19,6) string. */
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

/** Multiply a NUMERIC(19,6) quantity by a NUMERIC(19,6) unit price → NUMERIC(19,6) result.
 *  Uses 12dp intermediate precision (qty is 4dp, price is 6dp). */
function multiplyQtyPrice(qty: string, unitPrice: string): string {
	// qty: up to 16,4 — represent in 4dp units
	const [qInt = "0", qDec = ""] = qty.replace("-", "").split(".");
	const qNeg = qty.startsWith("-");
	const qFourDp = BigInt(qInt) * 10_000n + BigInt(qDec.padEnd(4, "0").slice(0, 4));

	// unitPrice: 19,6 — represent in 6dp units
	const pMicro = toMicro(unitPrice);

	// product: 4dp × 6dp = 10dp; round to 6dp (÷ 10^4)
	const product = qFourDp * pMicro;
	const divisor = 10_000n;
	const quotient = product / divisor;
	const remainder = product % divisor;
	const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

	return fromMicro(qNeg ? -rounded : rounded);
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

const GR_TRANSITIONS: Record<string, readonly GoodsReceiptStatus[]> = {
	post: ["DRAFT"],
	cancel: ["DRAFT"],
} as const;

function assertGRTransition(gr: GoodsReceiptSnapshot, action: string): void {
	const allowed = GR_TRANSITIONS[action];
	if (!allowed?.includes(gr.status)) {
		throw new GRError(
			`Cannot ${action} a goods receipt with status ${gr.status}. Allowed: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_GR_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// buildAPAccrualEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CreateJournalEntryInput for posting an AP accrual on goods receipt.
 *
 * On receipt posting, we accrue the liability for goods received but not yet
 * invoiced:
 *   DR Inventory/Expense account × (qty_accepted × unit_price) per GR line
 *   CR AP Accrual account (or AP Control) × total accrual
 *
 * @param receipt              GoodsReceiptSnapshot being posted.
 * @param lines                GR lines with accepted quantity and PO unit price.
 * @param apAccrualAccountId   AP accrual (or AP control) ledger account.
 * @param fiscalPeriodId       Fiscal period to post into.
 * @param entryDate            Posting date (YYYY-MM-DD).
 */
export function buildAPAccrualEntry(
	receipt: GoodsReceiptSnapshot,
	lines: readonly GoodsReceiptLineSnapshot[],
	apAccrualAccountId: UUID,
	fiscalPeriodId: UUID,
	entryDate: string,
): CreateJournalEntryInput {
	if (lines.length === 0) {
		throw new GRError("Goods receipt must have at least one line", "GR_NO_LINES");
	}

	// Compute accrual amount per line: qty_accepted × unit_price
	const debitLines = lines.map((line) => {
		const lineAmount = multiplyQtyPrice(line.quantityAccepted, line.unitPrice);
		if (compareAmounts(lineAmount, "0.000000") <= 0) {
			throw new GRError(
				`Goods receipt line ${line.lineNumber}: accrual amount must be positive (qty=${line.quantityAccepted}, price=${line.unitPrice})`,
				"GR_LINE_AMOUNT_ZERO",
			);
		}
		return {
			accountId: line.accountId,
			type: "DEBIT" as const,
			amount: lineAmount,
			currencyCode: receipt.currencyCode as CurrencyCode,
			description: line.description,
		};
	});

	// Credit: AP accrual account for total of all lines
	const totalAccrual = sumAmounts(debitLines.map((l) => l.amount));
	const creditLine = {
		accountId: apAccrualAccountId,
		type: "CREDIT" as const,
		amount: totalAccrual,
		currencyCode: receipt.currencyCode as CurrencyCode,
		description: `AP accrual — GR ${receipt.receiptNumber}`,
	};

	return {
		legalEntityId: receipt.entityId,
		fiscalPeriodId,
		entryDate,
		reference: `GR-${receipt.receiptNumber}`,
		description: `Goods Receipt: ${receipt.receiptNumber} (PO ${receipt.purchaseOrderId.slice(0, 8)})`,
		lines: [...debitLines, creditLine],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────────────────────

/** Post a DRAFT goods receipt → POSTED (after GL journal entry is persisted). */
export function postGoodsReceipt(gr: GoodsReceiptSnapshot): GoodsReceiptTransitionResult {
	assertGRTransition(gr, "post");
	return { newStatus: "POSTED" };
}

/** Cancel a DRAFT goods receipt → CANCELLED. */
export function cancelGoodsReceipt(gr: GoodsReceiptSnapshot): GoodsReceiptTransitionResult {
	assertGRTransition(gr, "cancel");
	return { newStatus: "CANCELLED" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Three-way match
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform a three-way match for a single PO line.
 *
 * Compares:
 * 1. PO line (ordered quantity + price) — the commitment
 * 2. GR lines (received + accepted quantity) — what arrived
 * 3. Bill line (invoiced amount + unit price) — what vendor charged
 *
 * Quantity match: total qty received across all GR lines vs PO qty ordered.
 * Price match: vendor bill unit price vs PO unit price.
 *
 * @param poLine        The purchase order line.
 * @param grLines       All goods receipt lines for this PO line (may span multiple GRs).
 * @param billLine      The vendor bill line (null if no bill yet).
 * @param tolerance     Price variance tolerance as NUMERIC(19,6) string (default "0.000000").
 */
export function performThreeWayMatch(
	poLine: POLineSnapshot,
	grLines: readonly GoodsReceiptLineSnapshot[],
	billLine: BillLineSnapshot | null,
	tolerance = "0.000000",
): ThreeWayMatchLineResult {
	// Total quantity accepted across all GR lines for this PO line
	const totalQuantityReceived = grLines.reduce(
		(sum, gr) => fromMicro(toMicro(sum) + toMicro(gr.quantityAccepted)),
		"0.000000",
	);

	// Quantity variance: received - ordered
	const quantityVariance = subtractAmount(totalQuantityReceived, poLine.quantityOrdered);
	const qtyCompare = compareAmounts(totalQuantityReceived, poLine.quantityOrdered);
	const quantityMatch: "MATCH" | "UNDER" | "OVER" =
		qtyCompare === 0 ? "MATCH" : qtyCompare < 0 ? "UNDER" : "OVER";

	// Price match: compare vendor bill price to PO price
	let billUnitPrice: string | null = null;
	let billAmount: string | null = null;
	let priceVariance: string | null = null;
	let priceMatch: "MATCH" | "VARIANCE" | "NO_BILL";

	if (billLine === null) {
		priceMatch = "NO_BILL";
	} else {
		billUnitPrice = billLine.unitPrice;
		billAmount = billLine.amount;

		// Price variance: (bill price - PO price) × qty received
		const priceDiff = subtractAmount(billLine.unitPrice, poLine.unitPrice);
		priceVariance = multiplyQtyPrice(totalQuantityReceived, priceDiff);

		// Compare variance to tolerance (absolute value)
		const absVariance = priceVariance.startsWith("-") ? priceVariance.slice(1) : priceVariance;
		priceMatch = compareAmounts(absVariance, tolerance) > 0 ? "VARIANCE" : "MATCH";
	}

	const overallMatch: "MATCH" | "DISCREPANCY" =
		quantityMatch === "MATCH" && priceMatch === "MATCH" ? "MATCH" : "DISCREPANCY";

	return {
		purchaseOrderLineId: poLine.id,
		poUnitPrice: poLine.unitPrice,
		poQuantityOrdered: poLine.quantityOrdered,
		totalQuantityReceived,
		billUnitPrice,
		billAmount,
		quantityVariance,
		priceVariance,
		quantityMatch,
		priceMatch,
		overallMatch,
	};
}
