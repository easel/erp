/**
 * Fulfillment Service — pick/pack/ship workflow for sales order fulfillment.
 *
 * Implements LOG-001 (Pick/Pack/Ship Workflow) from SD-003-WP6.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - State machine: DRAFT → PACKED → SHIPPED (→ IN_TRANSIT → DELIVERED).
 * - Pre-shipment compliance check injected as a parameter (mirrors PO workflow).
 * - Inventory depletion records returned to caller for DB persistence.
 *
 * Fulfillment workflow:
 * 1. Query fulfillment queue: RELEASED_TO_FULFILLMENT sales orders.
 * 2. Generate pick list from unshipped SO lines.
 * 3. Create shipment (DRAFT) with picked items.
 * 4. Pack confirmation: DRAFT → PACKED.
 * 5. Pre-shipment compliance check (ITAR/EAR screening).
 * 6. Ship: PACKED → SHIPPED (if cleared) or → compliance_status=held.
 * 7. Inventory depletion records generated on ship.
 *
 * Ref: SD-002-data-model.md §9, SD-003-WP6 LOG-001
 * Issue: hx-066360e2
 */

import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type ShipmentStatus =
	| "DRAFT"
	| "PACKED"
	| "SHIPPED"
	| "IN_TRANSIT"
	| "DELIVERED"
	| "RETURNED"
	| "CANCELLED";

export type ShipmentComplianceStatus = "pending" | "cleared" | "held";

export type SalesOrderStatus =
	| "DRAFT"
	| "CONFIRMED"
	| "PENDING_COMPLIANCE_CHECK"
	| "RELEASED_TO_FULFILLMENT"
	| "PARTIALLY_SHIPPED"
	| "SHIPPED"
	| "INVOICED"
	| "CLOSED"
	| "CANCELLED";

/** Minimal snapshot of a sales order for fulfillment queue. */
export interface SalesOrderSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly orderNumber: string;
	readonly status: SalesOrderStatus;
	readonly currencyCode: string;
	readonly itarCompartmentId: UUID | null;
}

/** Minimal snapshot of a sales order line for pick list generation. */
export interface SalesOrderLineSnapshot {
	readonly id: UUID;
	readonly salesOrderId: UUID;
	readonly lineNumber: number;
	readonly productId: UUID | null;
	readonly inventoryItemId: UUID | null;
	readonly description: string;
	readonly quantityOrdered: string;
	readonly quantityShipped: string;
	readonly unitOfMeasure: string;
}

/** Minimal snapshot of a shipment for state transitions. */
export interface ShipmentSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly salesOrderId: UUID | null;
	readonly shipmentNumber: string;
	readonly status: ShipmentStatus;
	readonly complianceStatus: ShipmentComplianceStatus;
	readonly itarCompartmentId: UUID | null;
}

/** A single item on the pick list. */
export interface PickListItem {
	readonly salesOrderLineId: UUID;
	readonly salesOrderId: UUID;
	readonly lineNumber: number;
	readonly inventoryItemId: UUID | null;
	readonly description: string;
	readonly quantityToPick: string;
	readonly unitOfMeasure: string;
}

/** Record ready for DB insertion into shipment_line. */
export interface ShipmentLineRecord {
	readonly shipmentId: UUID;
	readonly salesOrderLineId: UUID | null;
	readonly inventoryItemId: UUID | null;
	readonly lineNumber: number;
	readonly description: string;
	readonly quantity: string;
	readonly unitOfMeasure: string;
}

/** Record ready for DB insertion into shipment. */
export interface ShipmentRecord {
	readonly entityId: UUID;
	readonly salesOrderId: UUID;
	readonly shipmentNumber: string;
	readonly status: ShipmentStatus;
	readonly complianceStatus: ShipmentComplianceStatus;
	readonly shipToAddress: Record<string, unknown>;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Inventory depletion record — maps to inventory_item quantity reduction. */
export interface InventoryDepletionRecord {
	readonly inventoryItemId: UUID;
	readonly shipmentId: UUID;
	readonly shipmentLineId: UUID | null;
	readonly quantityDepleted: string;
	readonly unitOfMeasure: string;
}

/** Result of a shipment state transition. */
export interface ShipmentTransitionResult {
	readonly newStatus: ShipmentStatus;
	readonly newComplianceStatus?: ShipmentComplianceStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance screening interface (injectable)
// ─────────────────────────────────────────────────────────────────────────────

/** Outcome of a pre-shipment compliance check. */
export type ShipmentScreeningOutcome = "CLEAR" | "HELD";

/** Parameters for screening a shipment for export compliance. */
export interface ScreenShipmentParams {
	readonly shipmentId: UUID;
	readonly entityId: UUID;
	readonly customerId: UUID;
	readonly itarCompartmentId: UUID | null;
	readonly destinationCountry: string;
	readonly items: readonly { inventoryItemId: UUID | null; description: string }[];
}

/** Result of a pre-shipment compliance screen. */
export interface ShipmentScreeningResult {
	readonly outcome: ShipmentScreeningOutcome;
	readonly holdRequired: boolean;
	readonly holdReason: string | null;
	readonly screeningResultId: string;
}

/** Compliance screening function type — injectable for testing. */
export type ShipmentScreeningFn = (params: ScreenShipmentParams) => ShipmentScreeningResult;

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class FulfillmentError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "FulfillmentError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert NUMERIC(16,4) quantity string to micro-units (4dp). */
function toQtyMicro(qty: string): bigint {
	const [intPart = "0", decPart = ""] = qty.split(".");
	return BigInt(intPart) * 10_000n + BigInt(decPart.padEnd(4, "0").slice(0, 4));
}

/** Convert quantity micro-units back to NUMERIC(16,4) string. */
function fromQtyMicro(micro: bigint): string {
	const intPart = micro / 10_000n;
	const decPart = (micro % 10_000n).toString().padStart(4, "0");
	return `${intPart}.${decPart}`;
}

/** Subtract b from a (NUMERIC(16,4) quantity strings). */
function subtractQty(a: string, b: string): string {
	return fromQtyMicro(toQtyMicro(a) - toQtyMicro(b));
}

/** Compare two NUMERIC(16,4) quantities. */
function compareQty(a: string, b: string): number {
	const diff = toQtyMicro(a) - toQtyMicro(b);
	return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

const SHIPMENT_TRANSITIONS: Record<string, readonly ShipmentStatus[]> = {
	pack: ["DRAFT"],
	ship: ["PACKED"],
	markInTransit: ["SHIPPED"],
	markDelivered: ["SHIPPED", "IN_TRANSIT"],
	cancel: ["DRAFT", "PACKED"],
} as const;

function assertShipmentTransition(shipment: ShipmentSnapshot, action: string): void {
	const allowed = SHIPMENT_TRANSITIONS[action];
	if (!allowed?.includes(shipment.status)) {
		throw new FulfillmentError(
			`Cannot ${action} a shipment with status ${shipment.status}. Allowed: ${allowed?.join(", ") ?? "none"}.`,
			"INVALID_SHIPMENT_TRANSITION",
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Fulfillment queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return sales orders that are ready for fulfillment.
 * Fulfillable orders have status RELEASED_TO_FULFILLMENT.
 */
export function getFulfillmentQueue(orders: readonly SalesOrderSnapshot[]): SalesOrderSnapshot[] {
	return orders.filter((o) => o.status === "RELEASED_TO_FULFILLMENT");
}

// ─────────────────────────────────────────────────────────────────────────────
// Pick list generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a pick list for unshipped sales order lines.
 *
 * A pick list item is generated for each line where:
 *   quantityOrdered > quantityShipped  (i.e., there is remaining quantity to ship)
 *
 * @param salesOrderId  Sales order being picked.
 * @param lines         Lines of the sales order.
 */
export function generatePickList(
	salesOrderId: UUID,
	lines: readonly SalesOrderLineSnapshot[],
): PickListItem[] {
	const pickItems: PickListItem[] = [];

	for (const line of lines) {
		const remainingQty = subtractQty(line.quantityOrdered, line.quantityShipped);
		if (compareQty(remainingQty, "0.0000") <= 0) continue; // Already fully shipped

		pickItems.push({
			salesOrderLineId: line.id,
			salesOrderId,
			lineNumber: line.lineNumber,
			inventoryItemId: line.inventoryItemId,
			description: line.description,
			quantityToPick: remainingQty,
			unitOfMeasure: line.unitOfMeasure,
		});
	}

	if (pickItems.length === 0) {
		throw new FulfillmentError(
			"No unshipped lines found for pick list generation",
			"PICK_LIST_EMPTY",
		);
	}

	return pickItems;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipment record creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a ShipmentRecord (DRAFT) from picked sales order lines.
 *
 * @param salesOrderId   Sales order being shipped.
 * @param shipmentNumber Externally assigned shipment number.
 * @param pickItems      Pick list items being included in this shipment.
 * @param shipToAddress  Shipping destination address (JSON).
 * @param actorId        User creating the shipment.
 */
export function createShipmentRecord(
	salesOrderId: UUID,
	entityId: UUID,
	shipmentNumber: string,
	pickItems: readonly PickListItem[],
	shipToAddress: Record<string, unknown>,
	actorId: UUID,
): { shipment: ShipmentRecord; lines: ShipmentLineRecord[] } {
	if (pickItems.length === 0) {
		throw new FulfillmentError("Shipment must include at least one line", "SHIPMENT_NO_LINES");
	}

	const shipment: ShipmentRecord = {
		entityId,
		salesOrderId,
		shipmentNumber,
		status: "DRAFT",
		complianceStatus: "pending",
		shipToAddress,
		createdBy: actorId,
		updatedBy: actorId,
	};

	const lines: ShipmentLineRecord[] = pickItems.map((item, idx) => ({
		shipmentId: "pending" as UUID, // Will be set by DB on INSERT
		salesOrderLineId: item.salesOrderLineId,
		inventoryItemId: item.inventoryItemId,
		lineNumber: idx + 1,
		description: item.description,
		quantity: item.quantityToPick,
		unitOfMeasure: item.unitOfMeasure,
	}));

	return { shipment, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow transitions
// ─────────────────────────────────────────────────────────────────────────────

/** Confirm packing of a DRAFT shipment → PACKED. */
export function packShipment(shipment: ShipmentSnapshot): ShipmentTransitionResult {
	assertShipmentTransition(shipment, "pack");
	return { newStatus: "PACKED" };
}

/**
 * Run pre-shipment compliance screening.
 *
 * Called between PACKED and SHIPPED. If the screening returns HELD, the
 * shipment compliance_status is set to "held" but the status remains PACKED.
 *
 * @param shipment          PACKED shipment to screen.
 * @param items             Shipment line items (inventory IDs + descriptions).
 * @param destinationCountry  ISO 3166-1 alpha-2 destination country code.
 * @param screeningFn       Injected compliance screening function.
 */
export function screenShipment(
	shipment: ShipmentSnapshot,
	items: readonly { inventoryItemId: UUID | null; description: string }[],
	destinationCountry: string,
	screeningFn: ShipmentScreeningFn,
): { screeningResult: ShipmentScreeningResult; newComplianceStatus: ShipmentComplianceStatus } {
	if (shipment.status !== "PACKED") {
		throw new FulfillmentError(
			`Cannot screen shipment with status ${shipment.status}. Must be PACKED.`,
			"SHIPMENT_NOT_PACKED",
		);
	}

	const result = screeningFn({
		shipmentId: shipment.id,
		entityId: shipment.entityId,
		customerId: "pending" as UUID, // Caller supplies actual customerId if needed
		itarCompartmentId: shipment.itarCompartmentId,
		destinationCountry,
		items,
	});

	const newComplianceStatus: ShipmentComplianceStatus = result.holdRequired ? "held" : "cleared";

	return { screeningResult: result, newComplianceStatus };
}

/**
 * Ship a PACKED shipment that has been compliance-cleared → SHIPPED.
 *
 * @throws FulfillmentError SHIPMENT_COMPLIANCE_HELD if compliance not cleared.
 */
export function shipShipment(shipment: ShipmentSnapshot): ShipmentTransitionResult {
	assertShipmentTransition(shipment, "ship");

	if (shipment.complianceStatus !== "cleared") {
		throw new FulfillmentError(
			`Cannot ship shipment ${shipment.id}: compliance status is "${shipment.complianceStatus}", must be "cleared".`,
			"SHIPMENT_COMPLIANCE_HELD",
		);
	}

	return { newStatus: "SHIPPED" };
}

/** Mark a SHIPPED shipment as IN_TRANSIT. */
export function markShipmentInTransit(shipment: ShipmentSnapshot): ShipmentTransitionResult {
	assertShipmentTransition(shipment, "markInTransit");
	return { newStatus: "IN_TRANSIT" };
}

/** Mark a SHIPPED or IN_TRANSIT shipment as DELIVERED. */
export function markShipmentDelivered(shipment: ShipmentSnapshot): ShipmentTransitionResult {
	assertShipmentTransition(shipment, "markDelivered");
	return { newStatus: "DELIVERED" };
}

/** Cancel a DRAFT or PACKED shipment. */
export function cancelShipment(shipment: ShipmentSnapshot): ShipmentTransitionResult {
	assertShipmentTransition(shipment, "cancel");
	return { newStatus: "CANCELLED" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory depletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build inventory depletion records for a shipped shipment.
 *
 * A depletion record is generated for each shipment line with a non-null
 * inventoryItemId. Lines without an inventoryItemId (e.g., services) are
 * skipped.
 *
 * @param shipmentId  UUID of the shipped shipment.
 * @param lines       Shipment lines (post-INSERT, shipmentId populated).
 */
export function buildInventoryDepletionRecords(
	shipmentId: UUID,
	lines: readonly (ShipmentLineRecord & { id?: UUID })[],
): InventoryDepletionRecord[] {
	return lines
		.filter((line) => line.inventoryItemId !== null)
		.map((line) => ({
			// inventoryItemId is guaranteed non-null by the filter above
			inventoryItemId: line.inventoryItemId as UUID,
			shipmentId,
			shipmentLineId: line.id ?? null,
			quantityDepleted: line.quantity,
			unitOfMeasure: line.unitOfMeasure,
		}));
}

// ─────────────────────────────────────────────────────────────────────────────
// Default stub compliance screening (for testing and Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default pre-shipment compliance screening stub.
 *
 * Screens for ITAR-controlled items based on description keywords.
 * Production: replace with real query against itar_commodity_jurisdiction + EAR ECCN tables.
 */
export const defaultShipmentScreeningFn: ShipmentScreeningFn = (
	params: ScreenShipmentParams,
): ShipmentScreeningResult => {
	// Items flagged if any description contains ITAR/EAR keywords
	const sensitiveKeywords = ["satellite", "munition", "weapon", "missile", "itar", "classified"];
	const flaggedItem = params.items.find((item) =>
		sensitiveKeywords.some((kw) => item.description.toLowerCase().includes(kw)),
	);

	// US domestic shipments are always cleared (no export license required)
	if (params.destinationCountry === "US") {
		return {
			outcome: "CLEAR",
			holdRequired: false,
			holdReason: null,
			screeningResultId: `screen-${params.shipmentId}-clear`,
		};
	}

	if (flaggedItem) {
		return {
			outcome: "HELD",
			holdRequired: true,
			holdReason: `Item "${flaggedItem.description}" may require export license`,
			screeningResultId: `screen-${params.shipmentId}-held`,
		};
	}

	return {
		outcome: "CLEAR",
		holdRequired: false,
		holdReason: null,
		screeningResultId: `screen-${params.shipmentId}-clear`,
	};
};
