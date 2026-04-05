/**
 * Unit tests: Fulfillment Service — pick/pack/ship workflow.
 *
 * Coverage:
 *   - getFulfillmentQueue: filters to RELEASED_TO_FULFILLMENT orders
 *   - generatePickList: unshipped quantity calculation, PICK_LIST_EMPTY guard
 *   - createShipmentRecord: DRAFT record + shipment lines
 *   - packShipment: DRAFT → PACKED transition
 *   - screenShipment: compliance screening with injectable fn
 *   - shipShipment: PACKED + cleared → SHIPPED; SHIPMENT_COMPLIANCE_HELD guard
 *   - markShipmentInTransit / markShipmentDelivered: lifecycle transitions
 *   - cancelShipment: DRAFT or PACKED cancellation
 *   - buildInventoryDepletionRecords: only non-null inventoryItemId lines
 *   - State machine: invalid transitions throw INVALID_SHIPMENT_TRANSITION
 *
 * Ref: SD-003-WP6 LOG-001, SD-002-data-model.md §9
 * Issue: hx-066360e2
 */

import { describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import {
	type PickListItem,
	type SalesOrderLineSnapshot,
	type SalesOrderSnapshot,
	type ShipmentLineRecord,
	type ShipmentScreeningFn,
	type ShipmentSnapshot,
	buildInventoryDepletionRecords,
	cancelShipment,
	createShipmentRecord,
	generatePickList,
	getFulfillmentQueue,
	markShipmentDelivered,
	markShipmentInTransit,
	packShipment,
	screenShipment,
	shipShipment,
} from "../../src/logistics/fulfillment-service.js";
import { FulfillmentError } from "../../src/logistics/fulfillment-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Assert a sync function throws FulfillmentError with the given code. */
function expectFulfillmentError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error(`Expected FulfillmentError with code ${expectedCode} but no error was thrown`);
	} catch (e) {
		expect(e).toBeInstanceOf(FulfillmentError);
		expect((e as FulfillmentError).code).toBe(expectedCode);
	}
}

function uuid(suffix: string): UUID {
	return `00000000-0000-0000-0000-${suffix.padStart(12, "0")}` as UUID;
}

function makeSalesOrder(overrides: Partial<SalesOrderSnapshot> = {}): SalesOrderSnapshot {
	return {
		id: uuid("order1"),
		entityId: uuid("entity1"),
		customerId: uuid("customer1"),
		orderNumber: "SO-2026-001",
		status: "RELEASED_TO_FULFILLMENT",
		currencyCode: "USD",
		itarCompartmentId: null,
		...overrides,
	};
}

function makeLine(overrides: Partial<SalesOrderLineSnapshot> = {}): SalesOrderLineSnapshot {
	return {
		id: uuid("line1"),
		salesOrderId: uuid("order1"),
		lineNumber: 1,
		productId: uuid("product1"),
		inventoryItemId: uuid("item1"),
		description: "Satellite transponder",
		quantityOrdered: "10.0000",
		quantityShipped: "0.0000",
		unitOfMeasure: "EA",
		...overrides,
	};
}

function makeShipment(overrides: Partial<ShipmentSnapshot> = {}): ShipmentSnapshot {
	return {
		id: uuid("shipment1"),
		entityId: uuid("entity1"),
		salesOrderId: uuid("order1"),
		shipmentNumber: "SHP-2026-001",
		status: "DRAFT",
		complianceStatus: "pending",
		itarCompartmentId: null,
		...overrides,
	};
}

const clearScreeningFn: ShipmentScreeningFn = () => ({
	outcome: "CLEAR",
	holdRequired: false,
	holdReason: null,
	screeningResultId: "screen-clear-001",
});

const holdScreeningFn: ShipmentScreeningFn = () => ({
	outcome: "HELD",
	holdRequired: true,
	holdReason: "ITAR-controlled item detected",
	screeningResultId: "screen-hold-001",
});

// ── getFulfillmentQueue ───────────────────────────────────────────────────────

describe("getFulfillmentQueue", () => {
	test("returns only RELEASED_TO_FULFILLMENT orders", () => {
		const orders: SalesOrderSnapshot[] = [
			makeSalesOrder({ status: "RELEASED_TO_FULFILLMENT" }),
			makeSalesOrder({ id: uuid("order2"), status: "CONFIRMED" }),
			makeSalesOrder({ id: uuid("order3"), status: "SHIPPED" }),
			makeSalesOrder({ id: uuid("order4"), status: "RELEASED_TO_FULFILLMENT" }),
		];
		const queue = getFulfillmentQueue(orders);
		expect(queue).toHaveLength(2);
		for (const o of queue) {
			expect(o.status).toBe("RELEASED_TO_FULFILLMENT");
		}
	});

	test("returns empty array when no orders are ready", () => {
		const orders: SalesOrderSnapshot[] = [
			makeSalesOrder({ status: "CONFIRMED" }),
			makeSalesOrder({ id: uuid("order2"), status: "DRAFT" }),
		];
		expect(getFulfillmentQueue(orders)).toHaveLength(0);
	});
});

// ── generatePickList ──────────────────────────────────────────────────────────

describe("generatePickList", () => {
	const salesOrderId = uuid("order1");

	test("creates pick item for each unshipped line", () => {
		const lines = [
			makeLine({
				id: uuid("l1"),
				lineNumber: 1,
				quantityOrdered: "5.0000",
				quantityShipped: "0.0000",
			}),
			makeLine({
				id: uuid("l2"),
				lineNumber: 2,
				quantityOrdered: "3.0000",
				quantityShipped: "0.0000",
			}),
		];
		const items = generatePickList(salesOrderId, lines);
		expect(items).toHaveLength(2);
		expect(items[0]?.quantityToPick).toBe("5.0000");
		expect(items[1]?.quantityToPick).toBe("3.0000");
	});

	test("calculates remaining quantity correctly (partial shipment)", () => {
		const line = makeLine({ quantityOrdered: "10.0000", quantityShipped: "4.0000" });
		const items = generatePickList(salesOrderId, [line]);
		expect(items).toHaveLength(1);
		expect(items[0]?.quantityToPick).toBe("6.0000");
	});

	test("skips fully shipped lines", () => {
		const fullyShipped = makeLine({
			id: uuid("l1"),
			quantityOrdered: "5.0000",
			quantityShipped: "5.0000",
		});
		const remaining = makeLine({
			id: uuid("l2"),
			lineNumber: 2,
			quantityOrdered: "3.0000",
			quantityShipped: "0.0000",
		});
		const items = generatePickList(salesOrderId, [fullyShipped, remaining]);
		expect(items).toHaveLength(1);
		expect(items[0]?.salesOrderLineId).toBe(uuid("l2"));
	});

	test("throws PICK_LIST_EMPTY when all lines are fully shipped", () => {
		const line = makeLine({ quantityOrdered: "5.0000", quantityShipped: "5.0000" });
		expectFulfillmentError(() => generatePickList(salesOrderId, [line]), "PICK_LIST_EMPTY");
	});

	test("throws PICK_LIST_EMPTY for empty lines array", () => {
		expectFulfillmentError(() => generatePickList(salesOrderId, []), "PICK_LIST_EMPTY");
	});

	test("pick item inherits line fields", () => {
		const line = makeLine({ id: uuid("l1"), lineNumber: 3, description: "Solar panel array" });
		const items = generatePickList(salesOrderId, [line]);
		const item = items[0];
		if (!item) throw new Error("Expected pick item");
		expect(item.salesOrderLineId).toBe(uuid("l1"));
		expect(item.salesOrderId).toBe(salesOrderId);
		expect(item.lineNumber).toBe(3);
		expect(item.description).toBe("Solar panel array");
	});
});

// ── createShipmentRecord ──────────────────────────────────────────────────────

describe("createShipmentRecord", () => {
	const salesOrderId = uuid("order1");
	const entityId = uuid("entity1");
	const actorId = uuid("actor1");
	const shipTo = { country: "US", zip: "10001" };

	function makePickItem(overrides: Partial<PickListItem> = {}): PickListItem {
		return {
			salesOrderLineId: uuid("l1"),
			salesOrderId,
			lineNumber: 1,
			inventoryItemId: uuid("item1"),
			description: "Satellite panel",
			quantityToPick: "2.0000",
			unitOfMeasure: "EA",
			...overrides,
		};
	}

	test("creates DRAFT shipment record with correct fields", () => {
		const { shipment } = createShipmentRecord(
			salesOrderId,
			entityId,
			"SHP-001",
			[makePickItem()],
			shipTo,
			actorId,
		);
		expect(shipment.status).toBe("DRAFT");
		expect(shipment.complianceStatus).toBe("pending");
		expect(shipment.salesOrderId).toBe(salesOrderId);
		expect(shipment.entityId).toBe(entityId);
		expect(shipment.shipmentNumber).toBe("SHP-001");
		expect(shipment.createdBy).toBe(actorId);
	});

	test("creates one line per pick item", () => {
		const items = [
			makePickItem({ salesOrderLineId: uuid("l1"), lineNumber: 1 }),
			makePickItem({ salesOrderLineId: uuid("l2"), lineNumber: 2, quantityToPick: "3.0000" }),
		];
		const { lines } = createShipmentRecord(
			salesOrderId,
			entityId,
			"SHP-001",
			items,
			shipTo,
			actorId,
		);
		expect(lines).toHaveLength(2);
		expect(lines[1]?.quantity).toBe("3.0000");
	});

	test("throws SHIPMENT_NO_LINES for empty pick list", () => {
		expectFulfillmentError(
			() => createShipmentRecord(salesOrderId, entityId, "SHP-001", [], shipTo, actorId),
			"SHIPMENT_NO_LINES",
		);
	});
});

// ── packShipment ──────────────────────────────────────────────────────────────

describe("packShipment", () => {
	test("transitions DRAFT → PACKED", () => {
		const result = packShipment(makeShipment({ status: "DRAFT" }));
		expect(result.newStatus).toBe("PACKED");
	});

	test("throws INVALID_SHIPMENT_TRANSITION when not DRAFT", () => {
		expectFulfillmentError(
			() => packShipment(makeShipment({ status: "PACKED" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
		expectFulfillmentError(
			() => packShipment(makeShipment({ status: "SHIPPED" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
	});
});

// ── screenShipment ────────────────────────────────────────────────────────────

describe("screenShipment", () => {
	const packedShipment = makeShipment({ status: "PACKED" });
	const items = [{ inventoryItemId: uuid("item1"), description: "Solar panel" }];

	test("returns cleared when screening fn returns CLEAR", () => {
		const { newComplianceStatus, screeningResult } = screenShipment(
			packedShipment,
			items,
			"US",
			clearScreeningFn,
		);
		expect(newComplianceStatus).toBe("cleared");
		expect(screeningResult.outcome).toBe("CLEAR");
		expect(screeningResult.holdRequired).toBe(false);
	});

	test("returns held when screening fn returns HELD", () => {
		const { newComplianceStatus, screeningResult } = screenShipment(
			packedShipment,
			items,
			"RU",
			holdScreeningFn,
		);
		expect(newComplianceStatus).toBe("held");
		expect(screeningResult.holdRequired).toBe(true);
		expect(screeningResult.holdReason).toContain("ITAR");
	});

	test("throws SHIPMENT_NOT_PACKED when shipment is not PACKED", () => {
		expectFulfillmentError(
			() => screenShipment(makeShipment({ status: "DRAFT" }), items, "US", clearScreeningFn),
			"SHIPMENT_NOT_PACKED",
		);
	});
});

// ── shipShipment ──────────────────────────────────────────────────────────────

describe("shipShipment", () => {
	test("transitions PACKED + cleared → SHIPPED", () => {
		const shipment = makeShipment({ status: "PACKED", complianceStatus: "cleared" });
		const result = shipShipment(shipment);
		expect(result.newStatus).toBe("SHIPPED");
	});

	test("throws SHIPMENT_COMPLIANCE_HELD when compliance not cleared", () => {
		expectFulfillmentError(
			() => shipShipment(makeShipment({ status: "PACKED", complianceStatus: "held" })),
			"SHIPMENT_COMPLIANCE_HELD",
		);
		expectFulfillmentError(
			() => shipShipment(makeShipment({ status: "PACKED", complianceStatus: "pending" })),
			"SHIPMENT_COMPLIANCE_HELD",
		);
	});

	test("throws INVALID_SHIPMENT_TRANSITION when not PACKED", () => {
		expectFulfillmentError(
			() => shipShipment(makeShipment({ status: "DRAFT", complianceStatus: "cleared" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
	});
});

// ── markShipmentInTransit / markShipmentDelivered ─────────────────────────────

describe("markShipmentInTransit", () => {
	test("transitions SHIPPED → IN_TRANSIT", () => {
		const result = markShipmentInTransit(makeShipment({ status: "SHIPPED" }));
		expect(result.newStatus).toBe("IN_TRANSIT");
	});

	test("throws when not SHIPPED", () => {
		expectFulfillmentError(
			() => markShipmentInTransit(makeShipment({ status: "PACKED" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
	});
});

describe("markShipmentDelivered", () => {
	test("transitions SHIPPED → DELIVERED", () => {
		const result = markShipmentDelivered(makeShipment({ status: "SHIPPED" }));
		expect(result.newStatus).toBe("DELIVERED");
	});

	test("transitions IN_TRANSIT → DELIVERED", () => {
		const result = markShipmentDelivered(makeShipment({ status: "IN_TRANSIT" }));
		expect(result.newStatus).toBe("DELIVERED");
	});

	test("throws when not SHIPPED or IN_TRANSIT", () => {
		expectFulfillmentError(
			() => markShipmentDelivered(makeShipment({ status: "DRAFT" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
	});
});

// ── cancelShipment ────────────────────────────────────────────────────────────

describe("cancelShipment", () => {
	test("cancels DRAFT shipment", () => {
		const result = cancelShipment(makeShipment({ status: "DRAFT" }));
		expect(result.newStatus).toBe("CANCELLED");
	});

	test("cancels PACKED shipment", () => {
		const result = cancelShipment(makeShipment({ status: "PACKED" }));
		expect(result.newStatus).toBe("CANCELLED");
	});

	test("throws INVALID_SHIPMENT_TRANSITION for SHIPPED shipment", () => {
		expectFulfillmentError(
			() => cancelShipment(makeShipment({ status: "SHIPPED" })),
			"INVALID_SHIPMENT_TRANSITION",
		);
	});
});

// ── buildInventoryDepletionRecords ────────────────────────────────────────────

describe("buildInventoryDepletionRecords", () => {
	const shipmentId = uuid("shipment1");

	function makeShipmentLine(
		overrides: Partial<ShipmentLineRecord & { id?: UUID }> = {},
	): ShipmentLineRecord & { id?: UUID } {
		return {
			shipmentId,
			salesOrderLineId: uuid("l1"),
			inventoryItemId: uuid("item1"),
			lineNumber: 1,
			description: "Satellite panel",
			quantity: "5.0000",
			unitOfMeasure: "EA",
			...overrides,
		};
	}

	test("creates depletion record for each line with inventoryItemId", () => {
		const lines = [
			makeShipmentLine({ id: uuid("sl1"), inventoryItemId: uuid("item1"), quantity: "3.0000" }),
			makeShipmentLine({
				id: uuid("sl2"),
				lineNumber: 2,
				inventoryItemId: uuid("item2"),
				quantity: "7.0000",
			}),
		];
		const records = buildInventoryDepletionRecords(shipmentId, lines);
		expect(records).toHaveLength(2);
		expect(records[0]?.quantityDepleted).toBe("3.0000");
		expect(records[1]?.quantityDepleted).toBe("7.0000");
	});

	test("skips lines with null inventoryItemId (service lines)", () => {
		const lines = [
			makeShipmentLine({ id: uuid("sl1"), inventoryItemId: uuid("item1") }),
			makeShipmentLine({ id: uuid("sl2"), lineNumber: 2, inventoryItemId: null }),
		];
		const records = buildInventoryDepletionRecords(shipmentId, lines);
		expect(records).toHaveLength(1);
		expect(records[0]?.inventoryItemId).toBe(uuid("item1"));
	});

	test("returns empty array when no lines have inventoryItemId", () => {
		const lines = [makeShipmentLine({ inventoryItemId: null })];
		const records = buildInventoryDepletionRecords(shipmentId, lines);
		expect(records).toHaveLength(0);
	});

	test("depletion record shipmentLineId matches line id", () => {
		const line = makeShipmentLine({ id: uuid("sl1") });
		const records = buildInventoryDepletionRecords(shipmentId, [line]);
		const record = records[0];
		if (!record) throw new Error("Expected depletion record");
		expect(record.shipmentLineId).toBe(uuid("sl1"));
		expect(record.shipmentId).toBe(shipmentId);
	});
});
