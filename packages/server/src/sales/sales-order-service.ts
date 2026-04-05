/**
 * Sales Order Service — sales order lifecycle state machine.
 *
 * Implements SLS-002 (Sales Orders) from SD-003-WP5.
 *
 * State machine:
 *   DRAFT
 *     → CONFIRMED              (confirm: triggers compliance check)
 *     → CANCELLED              (cancel from DRAFT)
 *   CONFIRMED
 *     → PENDING_COMPLIANCE_CHECK  (triggerComplianceCheck)
 *     → CANCELLED
 *   PENDING_COMPLIANCE_CHECK
 *     → RELEASED_TO_FULFILLMENT  (releaseToFulfillment: compliance cleared)
 *     → CONFIRMED                (holdReleased: compliance hold released by officer)
 *     → CANCELLED                (rejectCompliance: compliance rejected)
 *   RELEASED_TO_FULFILLMENT
 *     → PARTIALLY_SHIPPED
 *     → SHIPPED
 *   PARTIALLY_SHIPPED
 *     → SHIPPED
 *   SHIPPED
 *     → INVOICED
 *   INVOICED
 *     → CLOSED
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - buildSalesOrderRecord: computes line totals and header amounts.
 * - All state transitions are enforced by assertSOTransition.
 *
 * Money arithmetic uses BigInt micro-units (NUMERIC 19,6).
 *
 * Ref: SD-002-data-model.md §6.4 (sales_order, sales_order_line),
 *      SD-003-WP5 SLS-002, ADR-011 (money amounts)
 * Issue: hx-31c83b3c
 */

import type { CreateSalesOrderInput } from "@apogee/shared";
import type { UUID } from "@apogee/shared";
import type { SalesOrderStatus } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesOrderSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly orderNumber: string;
	readonly status: SalesOrderStatus;
	readonly currencyCode: string;
	readonly totalAmount: string;
	readonly complianceStatus: "pending" | "cleared" | "held";
}

/** DB-ready record for sales_order INSERT. */
export interface SalesOrderRecord {
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly quoteId: UUID | null;
	readonly orderNumber: string;
	readonly orderDate: string;
	readonly requiredDate: string | null;
	readonly currencyCode: string;
	readonly exchangeRate: string;
	readonly subtotalAmount: string;
	readonly taxAmount: string;
	readonly totalAmount: string;
	readonly baseTotalAmount: string;
	readonly status: SalesOrderStatus;
	readonly shippingAddressId: UUID | null;
	readonly billingAddressId: UUID | null;
	readonly paymentTerms: string | null;
	readonly notes: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** DB-ready record for sales_order_line INSERT. */
export interface SalesOrderLineRecord {
	readonly lineNumber: number;
	readonly productId: UUID | null;
	readonly description: string;
	readonly quantityOrdered: string;
	readonly unitPrice: string;
	readonly discountPercent: number;
	readonly amount: string;
	readonly currencyCode: string;
	readonly taxCode: string | null;
	readonly taxAmount: string;
	readonly accountId: UUID | null;
}

/** Combined output of buildSalesOrderRecord. */
export interface SalesOrderBuildResult {
	readonly header: SalesOrderRecord;
	readonly lines: SalesOrderLineRecord[];
}

/** Result of a state transition. */
export interface SOTransitionResult {
	readonly newStatus: SalesOrderStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class SalesOrderError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "SalesOrderError";
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

function computeLineAmount(unitPrice: string, quantity: string, discountPercent: number): string {
	const priceMicro = toMicro(unitPrice);
	const qtyStr = quantity.includes(".") ? quantity : `${quantity}.000000`;
	const [qInt = "0", qDec = ""] = qtyStr.split(".");
	const qtyMicro = BigInt(qInt) * 1_000_000n + BigInt(qDec.padEnd(6, "0").slice(0, 6));
	const grossMicro2 = priceMicro * qtyMicro;
	const discountBP = BigInt(Math.round(discountPercent * 100));
	const netMicro2 = grossMicro2 * (10_000n - discountBP);
	const netMicro = netMicro2 / 10_000_000_000n;
	return fromMicro(netMicro);
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

const SO_TRANSITIONS: Record<string, readonly SalesOrderStatus[]> = {
	confirm: ["DRAFT"],
	triggerComplianceCheck: ["CONFIRMED"],
	releaseToFulfillment: ["PENDING_COMPLIANCE_CHECK"],
	holdReleased: ["PENDING_COMPLIANCE_CHECK"],
	rejectCompliance: ["PENDING_COMPLIANCE_CHECK"],
	recordPartialShipment: ["RELEASED_TO_FULFILLMENT"],
	recordFullShipment: ["RELEASED_TO_FULFILLMENT", "PARTIALLY_SHIPPED"],
	recordInvoice: ["SHIPPED"],
	close: ["INVOICED"],
	cancel: ["DRAFT", "CONFIRMED"],
} as const;

function assertSOTransition(order: SalesOrderSnapshot, action: string): void {
	const allowed = SO_TRANSITIONS[action];
	if (!allowed?.includes(order.status)) {
		throw new SalesOrderError(
			`Cannot '${action}' a sales order with status '${order.status}'. ` +
				`Allowed statuses: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_SO_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB-ready sales order record + line records from validated input.
 */
export function buildSalesOrderRecord(
	input: CreateSalesOrderInput,
	orderNumber: string,
	actorId: UUID,
	exchangeRate = "1.000000",
): SalesOrderBuildResult {
	const lines: SalesOrderLineRecord[] = input.lineItems.map((item, idx) => {
		const amount = computeLineAmount(
			item.unitPrice,
			item.quantityOrdered,
			item.discountPercent ?? 0,
		);
		return {
			lineNumber: idx + 1,
			productId: (item.productId as UUID | undefined) ?? null,
			description: item.description,
			quantityOrdered: item.quantityOrdered,
			unitPrice: item.unitPrice,
			discountPercent: item.discountPercent ?? 0,
			amount,
			currencyCode: item.currencyCode,
			taxCode: item.taxCode ?? null,
			taxAmount: "0.000000",
			accountId: (item.accountId as UUID | undefined) ?? null,
		};
	});

	const subtotalMicro = lines.reduce((acc, l) => acc + toMicro(l.amount), 0n);
	const subtotalAmount = fromMicro(subtotalMicro);
	const taxAmount = "0.000000";
	const totalAmount = subtotalAmount;
	const baseTotalMicro = (subtotalMicro * toMicro(exchangeRate)) / 1_000_000n;
	const baseTotalAmount = fromMicro(baseTotalMicro);

	const header: SalesOrderRecord = {
		entityId: input.entityId as UUID,
		customerId: input.customerId as UUID,
		quoteId: (input.quoteId as UUID | undefined) ?? null,
		orderNumber,
		orderDate: input.orderDate,
		requiredDate: input.requiredDate ?? null,
		currencyCode: input.currencyCode,
		exchangeRate,
		subtotalAmount,
		taxAmount,
		totalAmount,
		baseTotalAmount,
		status: "DRAFT",
		shippingAddressId: (input.shippingAddressId as UUID | undefined) ?? null,
		billingAddressId: (input.billingAddressId as UUID | undefined) ?? null,
		paymentTerms: input.paymentTerms ?? null,
		notes: input.notes ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};

	return { header, lines };
}

/**
 * Transition DRAFT → CONFIRMED.
 * Confirmation kicks off the compliance check pipeline.
 */
export function confirmSalesOrder(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "confirm");
	return { newStatus: "CONFIRMED" };
}

/**
 * Transition CONFIRMED → PENDING_COMPLIANCE_CHECK.
 */
export function triggerComplianceCheck(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "triggerComplianceCheck");
	return { newStatus: "PENDING_COMPLIANCE_CHECK" };
}

/**
 * Transition PENDING_COMPLIANCE_CHECK → RELEASED_TO_FULFILLMENT.
 * Compliance screening cleared — order can proceed to fulfillment.
 */
export function releaseToFulfillment(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "releaseToFulfillment");
	if (order.complianceStatus !== "cleared") {
		throw new SalesOrderError(
			`Cannot release order to fulfillment: compliance status is '${order.complianceStatus}', expected 'cleared'.`,
			"COMPLIANCE_NOT_CLEARED",
		);
	}
	return { newStatus: "RELEASED_TO_FULFILLMENT" };
}

/**
 * Transition PENDING_COMPLIANCE_CHECK → CONFIRMED (hold released by compliance officer).
 */
export function releaseComplianceHold(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "holdReleased");
	return { newStatus: "CONFIRMED" };
}

/**
 * Transition PENDING_COMPLIANCE_CHECK → CANCELLED (compliance rejected).
 */
export function rejectForCompliance(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "rejectCompliance");
	return { newStatus: "CANCELLED" };
}

/**
 * Transition RELEASED_TO_FULFILLMENT → PARTIALLY_SHIPPED.
 */
export function recordPartialShipment(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "recordPartialShipment");
	return { newStatus: "PARTIALLY_SHIPPED" };
}

/**
 * Transition RELEASED_TO_FULFILLMENT|PARTIALLY_SHIPPED → SHIPPED.
 */
export function recordFullShipment(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "recordFullShipment");
	return { newStatus: "SHIPPED" };
}

/**
 * Transition SHIPPED → INVOICED.
 */
export function recordInvoice(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "recordInvoice");
	return { newStatus: "INVOICED" };
}

/**
 * Transition INVOICED → CLOSED.
 */
export function closeSalesOrder(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "close");
	return { newStatus: "CLOSED" };
}

/**
 * Transition DRAFT|CONFIRMED → CANCELLED.
 */
export function cancelSalesOrder(order: SalesOrderSnapshot): SOTransitionResult {
	assertSOTransition(order, "cancel");
	return { newStatus: "CANCELLED" };
}
