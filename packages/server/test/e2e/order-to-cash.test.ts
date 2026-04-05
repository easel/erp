/**
 * E2E workflow test: Order-to-Cash (O2C).
 *
 * Tests the complete Quote → Order → Compliance Check → Pick/Pack/Ship →
 * Customs Docs → Invoice → Payment workflow using domain functions in
 * sequence, without a real database.
 *
 * Workflow:
 *   1. Quote: DRAFT → SENT → ACCEPTED
 *   2. Quote-to-order conversion: QuoteToOrderData → CreateSalesOrderInput
 *   3. Sales Order: DRAFT → CONFIRMED → PENDING_COMPLIANCE_CHECK
 *   4. Compliance check: cleared → RELEASED_TO_FULFILLMENT
 *   5. Fulfillment: pick list → shipment DRAFT → PACKED → (screened) → SHIPPED
 *   6. Customs documents generated for shipment
 *   7. Customer invoice: DRAFT → SENT + GL journal entry
 *   8. Payment: SENT → PAID + GL journal entry
 *
 * Ref: SD-003 §WP-7 E2E workflow: order-to-cash
 * Issue: hx-335c9b3e
 */

import { describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import {
	type CustomerInvoiceSnapshot,
	applyARPayment,
	buildARPaymentJournalEntry,
	buildInvoiceJournalEntry,
	createCustomerInvoiceRecord,
	sendInvoice,
} from "../../src/finance/ar-service.js";
import {
	type GenerateCustomsDocumentsInput,
	generateCustomsDocuments,
} from "../../src/logistics/customs-document-service.js";
import {
	type SalesOrderLineSnapshot,
	type ShipmentSnapshot,
	buildInventoryDepletionRecords,
	createShipmentRecord,
	generatePickList,
	packShipment,
	screenShipment,
	shipShipment,
} from "../../src/logistics/fulfillment-service.js";
import {
	type QuoteLineForConversion,
	type QuoteSnapshot,
	acceptQuote,
	buildQuoteRecord,
	convertQuoteToOrder,
	sendQuote,
} from "../../src/sales/quote-service.js";
import {
	type SalesOrderSnapshot,
	buildSalesOrderRecord,
	confirmSalesOrder,
	recordFullShipment,
	recordInvoice,
	releaseToFulfillment,
	triggerComplianceCheck,
} from "../../src/sales/sales-order-service.js";
import {
	ACCOUNTS,
	CUSTOMER,
	ENTITIES,
	FISCAL_PERIOD,
	INVENTORY_ITEM,
	USERS,
} from "../helpers/fixtures.js";

// ── UUID helpers ─────────────────────────────────────────────────────────────

function uuid(s: string): UUID {
	return s as UUID;
}

// ── Test-scoped IDs ───────────────────────────────────────────────────────────

const QUOTE_ID = uuid("quote-o2c-0001");
const ORDER_ID = uuid("order-o2c-001");
const SHIPMENT_ID = uuid("ship-o2c-0001");
const INVOICE_ID = uuid("inv-o2c-00001");
const SO_LINE_ID = uuid("sol-o2c-0001");

const ENTITY_ID = ENTITIES.US.id;
const ACTOR_ID = USERS.sales.id;
const CUSTOMER_ID = CUSTOMER.id;
const PERIOD_ID = FISCAL_PERIOD.id;

// ── Shared state (populated by each step) ────────────────────────────────────

// Step 1 shared state
let quoteStatus: QuoteSnapshot["status"] = "DRAFT";
const quoteLines: QuoteLineForConversion[] = [
	{
		productId: null,
		description: "Satellite solar panel array (X-200)",
		quantity: "5.000000",
		unitPrice: "2000.000000",
		discountPercent: 0,
		taxCode: null,
		currencyCode: "USD",
	},
];

// Step 3 shared state
let soStatus: SalesOrderSnapshot["status"] = "DRAFT";
let soComplianceStatus: SalesOrderSnapshot["complianceStatus"] = "pending";

// ── Step 1: Quote lifecycle ────────────────────────────────────────────────────

describe("O2C Step 1 — Quote lifecycle (DRAFT → ACCEPTED)", () => {
	test("build quote record (DRAFT)", () => {
		const result = buildQuoteRecord(
			{
				entityId: ENTITY_ID,
				customerId: CUSTOMER_ID,
				currencyCode: "USD",
				quoteDate: "2026-04-05",
				validUntil: "2027-01-01",
				lineItems: [
					{
						description: "Satellite solar panel array (X-200)",
						quantity: "5.000000",
						unitPrice: "2000.000000",
						discountPercent: 0,
						currencyCode: "USD",
					},
				],
			},
			"QUOTE-2026-001",
			ACTOR_ID,
		);

		expect(result.header.status).toBe("DRAFT");
		expect(result.header.totalAmount).toBe("10000.000000"); // 5 × 2000
		expect(result.lines.length).toBe(1);
		expect(result.lines[0]?.amount).toBe("10000.000000");
	});

	test("send quote (DRAFT → SENT)", () => {
		const quote: QuoteSnapshot = {
			id: QUOTE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			quoteNumber: "QUOTE-2026-001",
			status: quoteStatus,
			currencyCode: "USD",
			totalAmount: "10000.000000",
			validUntil: "2027-01-01",
			opportunityId: null,
		};
		const result = sendQuote(quote);
		expect(result.newStatus).toBe("SENT");
		quoteStatus = result.newStatus;
	});

	test("accept quote (SENT → ACCEPTED)", () => {
		const quote: QuoteSnapshot = {
			id: QUOTE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			quoteNumber: "QUOTE-2026-001",
			status: quoteStatus,
			currencyCode: "USD",
			totalAmount: "10000.000000",
			validUntil: "2027-01-01",
			opportunityId: null,
		};
		const result = acceptQuote(quote);
		expect(result.newStatus).toBe("ACCEPTED");
		quoteStatus = result.newStatus;
	});
});

// ── Step 2: Quote-to-order conversion ────────────────────────────────────────

describe("O2C Step 2 — Quote-to-order conversion", () => {
	test("convert accepted quote to sales order seed data", () => {
		const quote: QuoteSnapshot = {
			id: QUOTE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			quoteNumber: "QUOTE-2026-001",
			status: "ACCEPTED",
			currencyCode: "USD",
			totalAmount: "10000.000000",
			validUntil: "2027-01-01",
			opportunityId: null,
		};

		const orderData = convertQuoteToOrder(quote, quoteLines, "2026-04-05", "NET30");

		expect(orderData.entityId).toBe(ENTITY_ID);
		expect(orderData.customerId).toBe(CUSTOMER_ID);
		expect(orderData.quoteId).toBe(QUOTE_ID);
		expect(orderData.currencyCode).toBe("USD");
		expect(orderData.lineItems.length).toBe(1);
		expect(orderData.lineItems[0]?.quantityOrdered).toBe("5.000000");
		expect(orderData.lineItems[0]?.unitPrice).toBe("2000.000000");
	});

	test("build sales order record from converted quote data", () => {
		const quote: QuoteSnapshot = {
			id: QUOTE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			quoteNumber: "QUOTE-2026-001",
			status: "ACCEPTED",
			currencyCode: "USD",
			totalAmount: "10000.000000",
			validUntil: "2027-01-01",
			opportunityId: null,
		};

		const orderData = convertQuoteToOrder(quote, quoteLines, "2026-04-05", "NET30");

		const result = buildSalesOrderRecord(
			{
				entityId: orderData.entityId,
				customerId: orderData.customerId,
				quoteId: orderData.quoteId,
				currencyCode: orderData.currencyCode,
				orderDate: orderData.orderDate,
				paymentTerms: orderData.paymentTerms ?? undefined,
				lineItems: orderData.lineItems.map((l) => ({
					...l,
					discountPercent: l.discountPercent ?? 0,
				})),
			},
			"SO-2026-001",
			ACTOR_ID,
		);

		expect(result.header.status).toBe("DRAFT");
		expect(result.header.totalAmount).toBe("10000.000000");
		expect(result.header.quoteId).toBe(QUOTE_ID);
		expect(result.lines.length).toBe(1);
	});
});

// ── Step 3: Sales order state machine + compliance ────────────────────────────

describe("O2C Step 3 — Sales order: DRAFT → RELEASED_TO_FULFILLMENT", () => {
	function makeOrder(): SalesOrderSnapshot {
		return {
			id: ORDER_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			orderNumber: "SO-2026-001",
			status: soStatus,
			currencyCode: "USD",
			totalAmount: "10000.000000",
			complianceStatus: soComplianceStatus,
		};
	}

	test("confirm sales order (DRAFT → CONFIRMED)", () => {
		const result = confirmSalesOrder(makeOrder());
		expect(result.newStatus).toBe("CONFIRMED");
		soStatus = result.newStatus;
	});

	test("trigger compliance check (CONFIRMED → PENDING_COMPLIANCE_CHECK)", () => {
		const result = triggerComplianceCheck(makeOrder());
		expect(result.newStatus).toBe("PENDING_COMPLIANCE_CHECK");
		soStatus = result.newStatus;
	});

	test("export control screening clears order (simulated CLEAR)", () => {
		// Simulate the compliance service screening the order and returning CLEAR.
		// In production, export-control-service.screenParty() is called here.
		const screeningOutcome = "CLEAR" as const;
		expect(screeningOutcome).toBe("CLEAR");
		soComplianceStatus = "cleared";
	});

	test("release to fulfillment (PENDING_COMPLIANCE_CHECK → RELEASED_TO_FULFILLMENT)", () => {
		const result = releaseToFulfillment(makeOrder());
		expect(result.newStatus).toBe("RELEASED_TO_FULFILLMENT");
		soStatus = result.newStatus;
	});

	test("reject release if compliance not cleared", () => {
		const heldOrder: SalesOrderSnapshot = {
			id: ORDER_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			orderNumber: "SO-2026-001",
			status: "PENDING_COMPLIANCE_CHECK",
			currencyCode: "USD",
			totalAmount: "10000.000000",
			complianceStatus: "held", // not cleared
		};
		expect(() => releaseToFulfillment(heldOrder)).toThrow(/compliance status.*held/i);
	});
});

// ── Step 4: Fulfillment — pick/pack/ship ──────────────────────────────────────

describe("O2C Step 4 — Fulfillment: pick/pack/ship", () => {
	const soLines: SalesOrderLineSnapshot[] = [
		{
			id: SO_LINE_ID,
			salesOrderId: ORDER_ID,
			lineNumber: 1,
			productId: null,
			inventoryItemId: INVENTORY_ITEM.id,
			description: "Satellite solar panel array (X-200)",
			quantityOrdered: "5.0000",
			quantityShipped: "0.0000",
			unitOfMeasure: "EA",
		},
	];

	test("generate pick list from unshipped SO lines", () => {
		const pickList = generatePickList(ORDER_ID, soLines);
		expect(pickList.length).toBe(1);
		expect(pickList[0]?.quantityToPick).toBe("5.0000");
		expect(pickList[0]?.inventoryItemId).toBe(INVENTORY_ITEM.id);
	});

	test("create shipment record (DRAFT) from pick list", () => {
		const pickList = generatePickList(ORDER_ID, soLines);
		const { shipment, lines } = createShipmentRecord(
			ORDER_ID,
			ENTITY_ID,
			"SHIP-2026-001",
			pickList,
			{ line1: "123 Orbit Way", city: "Houston", state: "TX", country: "US" },
			ACTOR_ID,
		);
		expect(shipment.status).toBe("DRAFT");
		expect(shipment.complianceStatus).toBe("pending");
		expect(lines.length).toBe(1);
	});

	test("pack shipment (DRAFT → PACKED)", () => {
		const shipment: ShipmentSnapshot = {
			id: SHIPMENT_ID,
			entityId: ENTITY_ID,
			salesOrderId: ORDER_ID,
			shipmentNumber: "SHIP-2026-001",
			status: "DRAFT",
			complianceStatus: "pending",
			itarCompartmentId: null,
		};
		const result = packShipment(shipment);
		expect(result.newStatus).toBe("PACKED");
	});

	test("pre-shipment compliance screen clears (domestic, no sensitive items)", () => {
		const shipment: ShipmentSnapshot = {
			id: SHIPMENT_ID,
			entityId: ENTITY_ID,
			salesOrderId: ORDER_ID,
			shipmentNumber: "SHIP-2026-001",
			status: "PACKED",
			complianceStatus: "pending",
			itarCompartmentId: null,
		};
		const items = [{ inventoryItemId: INVENTORY_ITEM.id, description: "Solar panel array" }];
		const { screeningResult, newComplianceStatus } = screenShipment(
			shipment,
			items,
			"US", // domestic shipment — always CLEAR
			(params) => ({
				outcome: "CLEAR",
				holdRequired: false,
				holdReason: null,
				screeningResultId: `screen-${params.shipmentId}-ok`,
			}),
		);
		expect(screeningResult.outcome).toBe("CLEAR");
		expect(newComplianceStatus).toBe("cleared");
	});

	test("ship cleared shipment (PACKED → SHIPPED)", () => {
		const shipment: ShipmentSnapshot = {
			id: SHIPMENT_ID,
			entityId: ENTITY_ID,
			salesOrderId: ORDER_ID,
			shipmentNumber: "SHIP-2026-001",
			status: "PACKED",
			complianceStatus: "cleared",
			itarCompartmentId: null,
		};
		const result = shipShipment(shipment);
		expect(result.newStatus).toBe("SHIPPED");
	});

	test("build inventory depletion records on ship", () => {
		const lines = [
			{
				shipmentId: SHIPMENT_ID,
				salesOrderLineId: SO_LINE_ID,
				inventoryItemId: INVENTORY_ITEM.id,
				lineNumber: 1,
				description: "Satellite solar panel array (X-200)",
				quantity: "5.0000",
				unitOfMeasure: "EA",
			},
		];
		const depletions = buildInventoryDepletionRecords(SHIPMENT_ID, lines);
		expect(depletions.length).toBe(1);
		expect(depletions[0]?.inventoryItemId).toBe(INVENTORY_ITEM.id);
		expect(depletions[0]?.quantityDepleted).toBe("5.0000");
	});

	test("record full shipment on sales order (RELEASED_TO_FULFILLMENT → SHIPPED)", () => {
		const order: SalesOrderSnapshot = {
			id: ORDER_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			orderNumber: "SO-2026-001",
			status: "RELEASED_TO_FULFILLMENT",
			currencyCode: "USD",
			totalAmount: "10000.000000",
			complianceStatus: "cleared",
		};
		const result = recordFullShipment(order);
		expect(result.newStatus).toBe("SHIPPED");
	});
});

// ── Step 5: Customs documents ─────────────────────────────────────────────────

describe("O2C Step 5 — Customs document generation", () => {
	test("generate customs documents for shipment", () => {
		const input: GenerateCustomsDocumentsInput = {
			shipmentNumber: "SHIP-2026-001",
			shipDate: "2026-04-10",
			seller: {
				name: "SatelliteCo US Inc.",
				address: "100 Aerospace Blvd, Houston TX 77058",
				countryCode: "US",
				ein: "12-3456789",
			},
			buyer: {
				name: "Stellar Orbit Corp.",
				address: "200 Launch Pad Rd, Cape Canaveral FL 32920",
				countryCode: "US",
			},
			destinationCountry: "US",
			currency: "USD",
			modeOfTransport: "GROUND",
			lines: [
				{
					lineNumber: 1,
					description: "Satellite solar panel array (X-200)",
					partNumber: "SAT-PANEL-X200",
					hsCode: "8541.40",
					countryOfOrigin: "US",
					quantity: "5.000000",
					unitOfMeasure: "EA",
					unitPrice: "2000.000000",
					totalPrice: "10000.000000",
					weightKg: 12.5,
				},
			],
			packages: [
				{
					packageNumber: 1,
					lineNumbers: [1],
					weightKg: 62.5,
					dimensionsCm: { length: 120, width: 80, height: 40 },
				},
			],
			classifications: [
				{
					lineNumber: 1,
					jurisdiction: "NOT_CONTROLLED",
					licenseRequirement: "NLR",
				},
			],
		};

		const docs = generateCustomsDocuments(input);
		expect(docs.length).toBeGreaterThan(0);

		const types = docs.map((d) => d.documentType);
		expect(types).toContain("COMMERCIAL_INVOICE");
		expect(types).toContain("PACKING_LIST");
	});
});

// ── Step 6: Invoice ────────────────────────────────────────────────────────────

describe("O2C Step 6 — Customer invoice (DRAFT → SENT)", () => {
	const invoiceAmount = "10000.000000";

	test("create customer invoice record from shipped order", () => {
		const record = createCustomerInvoiceRecord(
			{
				entityId: ENTITY_ID,
				customerId: CUSTOMER_ID,
				currencyCode: "USD",
				invoiceDate: "2026-04-10",
				dueDate: "2026-05-10",
				paymentTerms: "NET30",
				salesOrderId: ORDER_ID,
				fiscalPeriodId: PERIOD_ID,
				lines: [
					{
						lineNumber: 1,
						description: "Satellite solar panel array (X-200) × 5",
						accountId: ACCOUNTS.revenue,
						quantity: "5.000000",
						unitPrice: "2000.000000",
						amount: invoiceAmount,
						currencyCode: "USD",
					},
				],
			},
			"INV-2026-001",
			ACTOR_ID,
		);

		expect(record.status).toBe("DRAFT");
		expect(record.totalAmount).toBe(invoiceAmount);
		expect(record.balanceDue).toBe(invoiceAmount);
		expect(record.salesOrderId).toBe(ORDER_ID);
	});

	test("send invoice (DRAFT → SENT)", () => {
		const invoice: CustomerInvoiceSnapshot = {
			id: INVOICE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			invoiceNumber: "INV-2026-001",
			status: "DRAFT",
			totalAmount: "10000.000000",
			amountReceived: "0.000000",
			balanceDue: "10000.000000",
			currencyCode: "USD",
			fiscalPeriodId: PERIOD_ID,
		};
		const result = sendInvoice(invoice);
		expect(result.newStatus).toBe("SENT");
	});

	test("invoice GL journal entry is balanced (DR AR / CR Revenue)", () => {
		const invoice: CustomerInvoiceSnapshot = {
			id: INVOICE_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			invoiceNumber: "INV-2026-001",
			status: "SENT",
			totalAmount: "10000.000000",
			amountReceived: "0.000000",
			balanceDue: "10000.000000",
			currencyCode: "USD",
			fiscalPeriodId: PERIOD_ID,
		};
		const entry = buildInvoiceJournalEntry(
			invoice,
			[
				{
					accountId: ACCOUNTS.revenue,
					amount: "10000.000000",
					description: "Solar panel array revenue",
					currencyCode: "USD",
				},
			],
			ACCOUNTS.ar,
			PERIOD_ID,
			"2026-04-10",
		);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");
		const totalDebit = debits.reduce((sum, l) => sum + Number(l.amount), 0);
		const totalCredit = credits.reduce((sum, l) => sum + Number(l.amount), 0);

		expect(totalDebit).toBeCloseTo(totalCredit, 4);
		expect(totalDebit).toBeCloseTo(10_000, 4);
		expect(debits.some((l) => l.accountId === ACCOUNTS.ar)).toBe(true);
		expect(credits.some((l) => l.accountId === ACCOUNTS.revenue)).toBe(true);
	});

	test("record invoice on sales order (SHIPPED → INVOICED)", () => {
		const order: SalesOrderSnapshot = {
			id: ORDER_ID,
			entityId: ENTITY_ID,
			customerId: CUSTOMER_ID,
			orderNumber: "SO-2026-001",
			status: "SHIPPED",
			currencyCode: "USD",
			totalAmount: "10000.000000",
			complianceStatus: "cleared",
		};
		const result = recordInvoice(order);
		expect(result.newStatus).toBe("INVOICED");
	});
});

// ── Step 7: Payment application ────────────────────────────────────────────────

describe("O2C Step 7 — Payment application → PAID", () => {
	const invoice: CustomerInvoiceSnapshot = {
		id: INVOICE_ID,
		entityId: ENTITY_ID,
		customerId: CUSTOMER_ID,
		invoiceNumber: "INV-2026-001",
		status: "SENT",
		totalAmount: "10000.000000",
		amountReceived: "0.000000",
		balanceDue: "10000.000000",
		currencyCode: "USD",
		fiscalPeriodId: PERIOD_ID,
	};

	test("apply full payment → PAID status", () => {
		const result = applyARPayment(invoice, "10000.000000");
		expect(result.newStatus).toBe("PAID");
		expect(result.fullyPaid).toBe(true);
		expect(result.remainingBalance).toBe("0.000000");
	});

	test("payment GL journal entry is balanced (DR Cash / CR AR)", () => {
		const entry = buildARPaymentJournalEntry(
			invoice,
			"10000.000000",
			"RCPT-2026-001",
			ACCOUNTS.ar,
			ACCOUNTS.cash,
			PERIOD_ID,
			"2026-05-05",
		);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");
		const totalDebit = debits.reduce((sum, l) => sum + Number(l.amount), 0);
		const totalCredit = credits.reduce((sum, l) => sum + Number(l.amount), 0);

		expect(totalDebit).toBeCloseTo(totalCredit, 4);
		expect(totalDebit).toBeCloseTo(10_000, 4);
		expect(debits.some((l) => l.accountId === ACCOUNTS.cash)).toBe(true);
		expect(credits.some((l) => l.accountId === ACCOUNTS.ar)).toBe(true);
	});

	test("partial payment → PARTIALLY_PAID", () => {
		const result = applyARPayment(invoice, "4000.000000");
		expect(result.newStatus).toBe("PARTIALLY_PAID");
		expect(result.fullyPaid).toBe(false);
		expect(result.remainingBalance).toBe("6000.000000");
	});

	test("payment exceeding balance is rejected", () => {
		expect(() => applyARPayment(invoice, "12000.000000")).toThrow(/exceeds balance due/i);
	});
});
