/**
 * Sales Order Service unit tests.
 *
 * Covers SLS-002 acceptance criteria:
 * - buildSalesOrderRecord: line amount computation, totals
 * - State machine: DRAFT→CONFIRMED→PENDING_COMPLIANCE_CHECK→RELEASED_TO_FULFILLMENT
 * - Compliance guard on releaseToFulfillment
 * - Full shipment and invoice transitions
 * - Cancellation from DRAFT/CONFIRMED
 *
 * Ref: SD-003-WP5 SLS-002, hx-31c83b3c
 */

import { describe, expect, test } from "bun:test";
import {
	SalesOrderError,
	type SalesOrderSnapshot,
	buildSalesOrderRecord,
	cancelSalesOrder,
	closeSalesOrder,
	confirmSalesOrder,
	recordFullShipment,
	recordInvoice,
	recordPartialShipment,
	rejectForCompliance,
	releaseComplianceHold,
	releaseToFulfillment,
	triggerComplianceCheck,
} from "../../src/sales/sales-order-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const CUSTOMER_ID = "20000000-0000-0000-0000-000000000001" as const;
const ORDER_ID = "30000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "50000000-0000-0000-0000-000000000001" as const;

function makeOrder(
	status: SalesOrderSnapshot["status"] = "DRAFT",
	complianceStatus: SalesOrderSnapshot["complianceStatus"] = "pending",
): SalesOrderSnapshot {
	return {
		id: ORDER_ID,
		entityId: ENTITY_ID,
		customerId: CUSTOMER_ID,
		orderNumber: "SO-2026-001",
		status,
		currencyCode: "USD",
		totalAmount: "1000.000000",
		complianceStatus,
	};
}

const baseOrderInput = {
	entityId: ENTITY_ID,
	customerId: CUSTOMER_ID,
	currencyCode: "USD" as const,
	orderDate: "2026-04-01",
	lineItems: [
		{
			description: "Satellite component",
			quantityOrdered: "5",
			unitPrice: "200.000000",
			discountPercent: 0,
			currencyCode: "USD" as const,
		},
	],
};

// ── buildSalesOrderRecord ─────────────────────────────────────────────────────

describe("buildSalesOrderRecord", () => {
	test("computes line amount: qty=5, unitPrice=200, discount=0 → 1000.000000", () => {
		const result = buildSalesOrderRecord(baseOrderInput, "SO-2026-001", ACTOR_ID);
		expect(result.lines[0]?.amount).toBe("1000.000000");
		expect(result.header.totalAmount).toBe("1000.000000");
	});

	test("applies 20% discount", () => {
		const input = {
			...baseOrderInput,
			lineItems: [
				{
					description: "Discounted component",
					quantityOrdered: "1",
					unitPrice: "1000.000000",
					discountPercent: 20,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildSalesOrderRecord(input, "SO-2026-002", ACTOR_ID);
		// 1000 × 0.80 = 800
		expect(result.lines[0]?.amount).toBe("800.000000");
	});

	test("sums multiple lines for subtotal and total", () => {
		const input = {
			...baseOrderInput,
			lineItems: [
				{
					description: "A",
					quantityOrdered: "2",
					unitPrice: "100.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
				{
					description: "B",
					quantityOrdered: "3",
					unitPrice: "300.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildSalesOrderRecord(input, "SO-2026-003", ACTOR_ID);
		// 200 + 900 = 1100
		expect(result.header.subtotalAmount).toBe("1100.000000");
		expect(result.header.totalAmount).toBe("1100.000000");
	});

	test("header status defaults to DRAFT", () => {
		const result = buildSalesOrderRecord(baseOrderInput, "SO-2026-004", ACTOR_ID);
		expect(result.header.status).toBe("DRAFT");
	});

	test("assigns sequential line numbers", () => {
		const input = {
			...baseOrderInput,
			lineItems: [
				{
					description: "X",
					quantityOrdered: "1",
					unitPrice: "10.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
				{
					description: "Y",
					quantityOrdered: "1",
					unitPrice: "20.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildSalesOrderRecord(input, "SO-2026-005", ACTOR_ID);
		expect(result.lines.map((l) => l.lineNumber)).toEqual([1, 2]);
	});

	test("stores optional quoteId on header", () => {
		const quoteId = "60000000-0000-0000-0000-000000000001";
		const input = { ...baseOrderInput, quoteId };
		const result = buildSalesOrderRecord(input, "SO-2026-006", ACTOR_ID);
		expect(result.header.quoteId).toBe(quoteId);
	});
});

// ── State machine ─────────────────────────────────────────────────────────────

describe("confirmSalesOrder", () => {
	test("DRAFT → CONFIRMED", () => {
		expect(confirmSalesOrder(makeOrder("DRAFT")).newStatus).toBe("CONFIRMED");
	});

	test("rejects CONFIRMED order", () => {
		expect(() => confirmSalesOrder(makeOrder("CONFIRMED"))).toThrow(SalesOrderError);
	});
});

describe("triggerComplianceCheck", () => {
	test("CONFIRMED → PENDING_COMPLIANCE_CHECK", () => {
		expect(triggerComplianceCheck(makeOrder("CONFIRMED")).newStatus).toBe(
			"PENDING_COMPLIANCE_CHECK",
		);
	});

	test("rejects DRAFT order", () => {
		expect(() => triggerComplianceCheck(makeOrder("DRAFT"))).toThrow(SalesOrderError);
	});
});

describe("releaseToFulfillment", () => {
	test("PENDING_COMPLIANCE_CHECK + cleared → RELEASED_TO_FULFILLMENT", () => {
		const order = makeOrder("PENDING_COMPLIANCE_CHECK", "cleared");
		expect(releaseToFulfillment(order).newStatus).toBe("RELEASED_TO_FULFILLMENT");
	});

	test("throws when compliance not cleared", () => {
		const order = makeOrder("PENDING_COMPLIANCE_CHECK", "pending");
		expect(() => releaseToFulfillment(order)).toThrow(SalesOrderError);
	});

	test("throws when compliance held", () => {
		const order = makeOrder("PENDING_COMPLIANCE_CHECK", "held");
		expect(() => releaseToFulfillment(order)).toThrow(SalesOrderError);
	});

	test("rejects CONFIRMED order (not in compliance check)", () => {
		const order = makeOrder("CONFIRMED", "cleared");
		expect(() => releaseToFulfillment(order)).toThrow(SalesOrderError);
	});
});

describe("releaseComplianceHold", () => {
	test("PENDING_COMPLIANCE_CHECK → CONFIRMED", () => {
		expect(releaseComplianceHold(makeOrder("PENDING_COMPLIANCE_CHECK")).newStatus).toBe(
			"CONFIRMED",
		);
	});
});

describe("rejectForCompliance", () => {
	test("PENDING_COMPLIANCE_CHECK → CANCELLED", () => {
		expect(rejectForCompliance(makeOrder("PENDING_COMPLIANCE_CHECK")).newStatus).toBe("CANCELLED");
	});

	test("rejects CONFIRMED order", () => {
		expect(() => rejectForCompliance(makeOrder("CONFIRMED"))).toThrow(SalesOrderError);
	});
});

describe("shipment and invoicing transitions", () => {
	test("RELEASED_TO_FULFILLMENT → PARTIALLY_SHIPPED", () => {
		expect(recordPartialShipment(makeOrder("RELEASED_TO_FULFILLMENT")).newStatus).toBe(
			"PARTIALLY_SHIPPED",
		);
	});

	test("RELEASED_TO_FULFILLMENT → SHIPPED (full shipment)", () => {
		expect(recordFullShipment(makeOrder("RELEASED_TO_FULFILLMENT")).newStatus).toBe("SHIPPED");
	});

	test("PARTIALLY_SHIPPED → SHIPPED", () => {
		expect(recordFullShipment(makeOrder("PARTIALLY_SHIPPED")).newStatus).toBe("SHIPPED");
	});

	test("SHIPPED → INVOICED", () => {
		expect(recordInvoice(makeOrder("SHIPPED")).newStatus).toBe("INVOICED");
	});

	test("INVOICED → CLOSED", () => {
		expect(closeSalesOrder(makeOrder("INVOICED")).newStatus).toBe("CLOSED");
	});

	test("rejects partial shipment on non-RELEASED order", () => {
		expect(() => recordPartialShipment(makeOrder("CONFIRMED"))).toThrow(SalesOrderError);
	});
});

describe("cancelSalesOrder", () => {
	test("DRAFT → CANCELLED", () => {
		expect(cancelSalesOrder(makeOrder("DRAFT")).newStatus).toBe("CANCELLED");
	});

	test("CONFIRMED → CANCELLED", () => {
		expect(cancelSalesOrder(makeOrder("CONFIRMED")).newStatus).toBe("CANCELLED");
	});

	test("rejects RELEASED_TO_FULFILLMENT", () => {
		expect(() => cancelSalesOrder(makeOrder("RELEASED_TO_FULFILLMENT"))).toThrow(SalesOrderError);
	});

	test("rejects SHIPPED", () => {
		expect(() => cancelSalesOrder(makeOrder("SHIPPED"))).toThrow(SalesOrderError);
	});
});

// ── Full DRAFT→CONFIRMED→PENDING_COMPLIANCE_CHECK→RELEASED flow ───────────────

describe("DRAFT→CONFIRMED→PENDING_COMPLIANCE_CHECK→RELEASED_TO_FULFILLMENT flow", () => {
	test("follows the expected state sequence", () => {
		let order = makeOrder("DRAFT");

		const confirmResult = confirmSalesOrder(order);
		expect(confirmResult.newStatus).toBe("CONFIRMED");
		order = { ...order, status: "CONFIRMED" };

		const checkResult = triggerComplianceCheck(order);
		expect(checkResult.newStatus).toBe("PENDING_COMPLIANCE_CHECK");
		order = { ...order, status: "PENDING_COMPLIANCE_CHECK", complianceStatus: "cleared" };

		const releaseResult = releaseToFulfillment(order);
		expect(releaseResult.newStatus).toBe("RELEASED_TO_FULFILLMENT");
	});
});
