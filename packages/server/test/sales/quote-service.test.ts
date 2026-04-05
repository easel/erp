/**
 * Quote Service unit tests.
 *
 * Covers SLS-001 acceptance criteria:
 * - buildQuoteRecord: line amount computation, subtotal, total
 * - Quote state machine: DRAFT→SENT→ACCEPTED/REJECTED/CANCELLED/EXPIRED
 * - convertQuoteToOrder: ACCEPTED quote produces correct order seed data
 *
 * Ref: SD-003-WP5 SLS-001, hx-31c83b3c
 */

import { describe, expect, test } from "bun:test";
import {
	QuoteError,
	type QuoteLineForConversion,
	type QuoteSnapshot,
	acceptQuote,
	buildQuoteRecord,
	cancelQuote,
	convertQuoteToOrder,
	expireQuote,
	rejectQuote,
	sendQuote,
} from "../../src/sales/quote-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const CUSTOMER_ID = "20000000-0000-0000-0000-000000000001" as const;
const QUOTE_ID = "30000000-0000-0000-0000-000000000001" as const;
const PRODUCT_ID = "40000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "50000000-0000-0000-0000-000000000001" as const;

function makeQuote(status: QuoteSnapshot["status"] = "DRAFT"): QuoteSnapshot {
	return {
		id: QUOTE_ID,
		entityId: ENTITY_ID,
		customerId: CUSTOMER_ID,
		quoteNumber: "QT-2026-001",
		status,
		currencyCode: "USD",
		totalAmount: "1000.000000",
		validUntil: "2099-12-31",
		opportunityId: null,
	};
}

const baseQuoteInput = {
	entityId: ENTITY_ID,
	customerId: CUSTOMER_ID,
	currencyCode: "USD" as const,
	quoteDate: "2026-04-01",
	validUntil: "2099-12-31",
	lineItems: [
		{
			productId: PRODUCT_ID,
			description: "Satellite transponder",
			quantity: "2",
			unitPrice: "500.000000",
			discountPercent: 0,
			currencyCode: "USD" as const,
		},
	],
};

// ── buildQuoteRecord ──────────────────────────────────────────────────────────

describe("buildQuoteRecord", () => {
	test("computes line amount: qty=2, unitPrice=500, discount=0 → amount=1000.000000", () => {
		const result = buildQuoteRecord(baseQuoteInput, "QT-2026-001", ACTOR_ID);
		expect(result.lines[0]?.amount).toBe("1000.000000");
	});

	test("computes correct subtotal and total from multiple lines", () => {
		const input = {
			...baseQuoteInput,
			lineItems: [
				{
					description: "Line 1",
					quantity: "3",
					unitPrice: "100.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
				{
					description: "Line 2",
					quantity: "2",
					unitPrice: "250.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildQuoteRecord(input, "QT-2026-002", ACTOR_ID);
		// 3×100 + 2×250 = 300 + 500 = 800
		expect(result.header.subtotalAmount).toBe("800.000000");
		expect(result.header.totalAmount).toBe("800.000000");
		expect(result.lines).toHaveLength(2);
	});

	test("applies discount percent to line amount", () => {
		const input = {
			...baseQuoteInput,
			lineItems: [
				{
					description: "Discounted item",
					quantity: "1",
					unitPrice: "1000.000000",
					discountPercent: 10,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildQuoteRecord(input, "QT-2026-003", ACTOR_ID);
		// 1000 × (1 - 0.10) = 900
		expect(result.lines[0]?.amount).toBe("900.000000");
		expect(result.header.totalAmount).toBe("900.000000");
	});

	test("assigns sequential line numbers starting at 1", () => {
		const input = {
			...baseQuoteInput,
			lineItems: [
				{
					description: "A",
					quantity: "1",
					unitPrice: "10.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
				{
					description: "B",
					quantity: "1",
					unitPrice: "20.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
				{
					description: "C",
					quantity: "1",
					unitPrice: "30.000000",
					discountPercent: 0,
					currencyCode: "USD" as const,
				},
			],
		};
		const result = buildQuoteRecord(input, "QT-2026-004", ACTOR_ID);
		expect(result.lines.map((l) => l.lineNumber)).toEqual([1, 2, 3]);
	});

	test("header status defaults to DRAFT", () => {
		const result = buildQuoteRecord(baseQuoteInput, "QT-2026-005", ACTOR_ID);
		expect(result.header.status).toBe("DRAFT");
	});

	test("applies exchange rate to base total amount", () => {
		const result = buildQuoteRecord(baseQuoteInput, "QT-2026-006", ACTOR_ID, "1.250000");
		// total=1000, exchangeRate=1.25 → baseTotalAmount=1250
		expect(result.header.baseTotalAmount).toBe("1250.000000");
	});

	test("passes optional fields through to header", () => {
		const input = {
			...baseQuoteInput,
			notes: "Urgent",
			reference: "PO-123",
			opportunityId: "60000000-0000-0000-0000-000000000001",
		};
		const result = buildQuoteRecord(input, "QT-2026-007", ACTOR_ID);
		expect(result.header.notes).toBe("Urgent");
		expect(result.header.opportunityId).toBe("60000000-0000-0000-0000-000000000001");
	});
});

// ── State machine ─────────────────────────────────────────────────────────────

describe("sendQuote", () => {
	test("DRAFT → SENT", () => {
		expect(sendQuote(makeQuote("DRAFT")).newStatus).toBe("SENT");
	});

	test("rejects non-DRAFT status", () => {
		expect(() => sendQuote(makeQuote("SENT"))).toThrow(QuoteError);
		expect(() => sendQuote(makeQuote("ACCEPTED"))).toThrow(QuoteError);
	});
});

describe("acceptQuote", () => {
	test("SENT → ACCEPTED", () => {
		expect(acceptQuote(makeQuote("SENT")).newStatus).toBe("ACCEPTED");
	});

	test("rejects DRAFT quote", () => {
		expect(() => acceptQuote(makeQuote("DRAFT"))).toThrow(QuoteError);
	});
});

describe("rejectQuote", () => {
	test("SENT → REJECTED", () => {
		expect(rejectQuote(makeQuote("SENT")).newStatus).toBe("REJECTED");
	});
});

describe("cancelQuote", () => {
	test("DRAFT → CANCELLED", () => {
		expect(cancelQuote(makeQuote("DRAFT")).newStatus).toBe("CANCELLED");
	});

	test("SENT → CANCELLED", () => {
		expect(cancelQuote(makeQuote("SENT")).newStatus).toBe("CANCELLED");
	});

	test("rejects ACCEPTED quote", () => {
		expect(() => cancelQuote(makeQuote("ACCEPTED"))).toThrow(QuoteError);
	});
});

describe("expireQuote", () => {
	test("SENT → EXPIRED", () => {
		expect(expireQuote(makeQuote("SENT")).newStatus).toBe("EXPIRED");
	});

	test("rejects DRAFT quote", () => {
		expect(() => expireQuote(makeQuote("DRAFT"))).toThrow(QuoteError);
	});
});

// ── convertQuoteToOrder ───────────────────────────────────────────────────────

describe("convertQuoteToOrder", () => {
	const lines: QuoteLineForConversion[] = [
		{
			productId: PRODUCT_ID,
			description: "Satellite transponder",
			quantity: "2",
			unitPrice: "500.000000",
			discountPercent: 0,
			taxCode: null,
			currencyCode: "USD",
		},
	];

	test("converts ACCEPTED quote to order data", () => {
		const result = convertQuoteToOrder(makeQuote("ACCEPTED"), lines, "2026-04-05");
		expect(result.quoteId).toBe(QUOTE_ID);
		expect(result.customerId).toBe(CUSTOMER_ID);
		expect(result.entityId).toBe(ENTITY_ID);
		expect(result.currencyCode).toBe("USD");
		expect(result.orderDate).toBe("2026-04-05");
		expect(result.lineItems).toHaveLength(1);
		expect(result.lineItems[0]?.quantityOrdered).toBe("2");
		expect(result.lineItems[0]?.unitPrice).toBe("500.000000");
	});

	test("propagates payment terms to order", () => {
		const result = convertQuoteToOrder(makeQuote("ACCEPTED"), lines, "2026-04-05", "NET60");
		expect(result.paymentTerms).toBe("NET60");
	});

	test("throws QuoteError if quote is not ACCEPTED", () => {
		expect(() => convertQuoteToOrder(makeQuote("DRAFT"), lines, "2026-04-05")).toThrow(QuoteError);
		expect(() => convertQuoteToOrder(makeQuote("SENT"), lines, "2026-04-05")).toThrow(QuoteError);
		expect(() => convertQuoteToOrder(makeQuote("EXPIRED"), lines, "2026-04-05")).toThrow(
			QuoteError,
		);
	});

	test("throws QuoteError if quote has no lines", () => {
		expect(() => convertQuoteToOrder(makeQuote("ACCEPTED"), [], "2026-04-05")).toThrow(QuoteError);
	});
});
