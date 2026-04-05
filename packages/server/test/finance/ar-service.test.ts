/**
 * AR Service unit tests.
 *
 * Covers FIN-004 (Accounts Receivable) acceptance criteria from SD-003-WP2:
 * - createCustomerInvoiceRecord: amount aggregation (subtotal, tax, total, balance due)
 * - buildInvoiceJournalEntry: balanced DR AR control / CR revenue entry
 * - buildARPaymentJournalEntry: balanced DR cash / CR AR control entry
 * - Workflow state machine: DRAFT → SENT → PARTIALLY_PAID/PAID + VOID, WRITTEN_OFF
 * - applyARPayment: partial and full payment, over-pay rejection
 * - voidInvoice: status restrictions
 * - writeOffInvoice: status restrictions
 *
 * Ref: SD-003-WP2 FIN-004, SD-002 §4.4, hx-267a4d5b
 */

import { describe, expect, test } from "bun:test";
import type { CreateCustomerInvoiceInput } from "@apogee/shared";
import {
	ARError,
	type CustomerInvoiceSnapshot,
	applyARPayment,
	buildARPaymentJournalEntry,
	buildInvoiceJournalEntry,
	createCustomerInvoiceRecord,
	sendInvoice,
	voidInvoice,
	writeOffInvoice,
} from "../../src/finance/ar-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const CUSTOMER_ID = "20000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as const;
const PERIOD_ID = "50000000-0000-0000-0000-000000000001" as const;
const AR_CONTROL_ACCOUNT_ID = "40000000-0000-0000-0000-000000000001" as const;
const REVENUE_ACCOUNT_ID = "40000000-0000-0000-0000-000000000002" as const;
const BANK_ACCOUNT_ID = "40000000-0000-0000-0000-000000000003" as const;
const INVOICE_ID = "60000000-0000-0000-0000-000000000001" as const;

/** Helper: assert a sync function throws ARError with the given code. */
function expectARError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error("expected ARError but function did not throw");
	} catch (e) {
		expect(e).toBeInstanceOf(ARError);
		expect((e as ARError).code).toBe(expectedCode);
	}
}

const invoiceInput: CreateCustomerInvoiceInput = {
	entityId: ENTITY_ID,
	customerId: CUSTOMER_ID,
	invoiceDate: "2026-04-01",
	dueDate: "2026-05-01",
	currencyCode: "USD",
	fiscalPeriodId: PERIOD_ID,
	paymentTerms: "NET30",
	lines: [
		{
			lineNumber: 1,
			description: "Satellite integration services",
			accountId: REVENUE_ACCOUNT_ID,
			unitPrice: "5000.000000",
			amount: "5000.000000",
			currencyCode: "USD",
			taxAmount: "400.000000",
		},
		{
			lineNumber: 2,
			description: "Ground station support",
			accountId: REVENUE_ACCOUNT_ID,
			unitPrice: "750.000000",
			amount: "750.000000",
			currencyCode: "USD",
		},
	],
};

function makeInvoiceSnapshot(
	status: CustomerInvoiceSnapshot["status"] = "SENT",
	balanceDue = "6150.000000",
): CustomerInvoiceSnapshot {
	return {
		id: INVOICE_ID,
		entityId: ENTITY_ID,
		customerId: CUSTOMER_ID,
		invoiceNumber: "INV-2026-001",
		status,
		totalAmount: "6150.000000",
		amountReceived: "0.000000",
		balanceDue,
		currencyCode: "USD",
		fiscalPeriodId: PERIOD_ID,
	};
}

// ── createCustomerInvoiceRecord ───────────────────────────────────────────────

describe("createCustomerInvoiceRecord", () => {
	test("aggregates subtotal, tax, total, and balance correctly", () => {
		const record = createCustomerInvoiceRecord(invoiceInput, "INV-2026-001", ACTOR_ID);

		// subtotal = 5000 + 750 = 5750
		expect(record.subtotalAmount).toBe("5750.000000");
		// taxTotal = 400 + 0 = 400
		expect(record.taxAmount).toBe("400.000000");
		// total = 5750 + 400 = 6150
		expect(record.totalAmount).toBe("6150.000000");
		// baseTotalAmount = total (exchange rate 1.0)
		expect(record.baseTotalAmount).toBe("6150.000000");
		// balanceDue = total (no payments yet)
		expect(record.balanceDue).toBe("6150.000000");
		// amountReceived = 0
		expect(record.amountReceived).toBe("0.000000");
	});

	test("sets status to DRAFT", () => {
		const record = createCustomerInvoiceRecord(invoiceInput, "INV-2026-001", ACTOR_ID);
		expect(record.status).toBe("DRAFT");
	});

	test("preserves customer, entity, invoice number from input", () => {
		const record = createCustomerInvoiceRecord(invoiceInput, "INV-2026-001", ACTOR_ID);
		expect(record.entityId).toBe(ENTITY_ID);
		expect(record.customerId).toBe(CUSTOMER_ID);
		expect(record.invoiceNumber).toBe("INV-2026-001");
		expect(record.createdBy).toBe(ACTOR_ID);
	});

	test("sets optional fields to null when not provided", () => {
		const minimalInput: CreateCustomerInvoiceInput = {
			...invoiceInput,
			fiscalPeriodId: undefined,
			salesOrderId: undefined,
			notes: undefined,
			paymentTerms: undefined,
		};
		const record = createCustomerInvoiceRecord(minimalInput, "INV-001", ACTOR_ID);
		expect(record.fiscalPeriodId).toBeNull();
		expect(record.salesOrderId).toBeNull();
		expect(record.notes).toBeNull();
		expect(record.paymentTerms).toBeNull();
	});
});

// ── buildInvoiceJournalEntry ──────────────────────────────────────────────────

describe("buildInvoiceJournalEntry", () => {
	const lines = [
		{
			accountId: REVENUE_ACCOUNT_ID,
			amount: "5000.000000",
			description: "Satellite integration services",
			currencyCode: "USD",
		},
		{
			accountId: REVENUE_ACCOUNT_ID,
			amount: "750.000000",
			description: "Ground station support",
			currencyCode: "USD",
		},
	] as const;

	const invoice = makeInvoiceSnapshot("SENT");

	test("creates balanced journal entry: one debit line + two credit lines", () => {
		const entry = buildInvoiceJournalEntry(invoice, lines, AR_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");

		expect(entry.lines.length).toBe(3);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");

		expect(debits.length).toBe(1);
		expect(credits.length).toBe(2);

		// Debit line is AR control account
		expect(debits[0]?.accountId).toBe(AR_CONTROL_ACCOUNT_ID);
		// Debit amount = sum of credits
		expect(debits[0]?.amount).toBe("5750.000000");
	});

	test("reference is AR-{invoiceNumber}", () => {
		const entry = buildInvoiceJournalEntry(invoice, lines, AR_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");
		expect(entry.reference).toBe("AR-INV-2026-001");
	});

	test("legalEntityId comes from invoice.entityId", () => {
		const entry = buildInvoiceJournalEntry(invoice, lines, AR_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");
		expect(entry.legalEntityId).toBe(ENTITY_ID);
	});

	test("throws INVOICE_NO_LINES when lines array is empty", () => {
		expectARError(
			() => buildInvoiceJournalEntry(invoice, [], AR_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01"),
			"INVOICE_NO_LINES",
		);
	});
});

// ── buildARPaymentJournalEntry ────────────────────────────────────────────────

describe("buildARPaymentJournalEntry", () => {
	const invoice = makeInvoiceSnapshot("SENT");

	test("creates balanced payment entry (DR cash, CR AR control)", () => {
		const entry = buildARPaymentJournalEntry(
			invoice,
			"2000.000000",
			"RCPT-001",
			AR_CONTROL_ACCOUNT_ID,
			BANK_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-15",
		);

		expect(entry.lines.length).toBe(2);

		const debit = entry.lines.find((l) => l.type === "DEBIT")!;
		const credit = entry.lines.find((l) => l.type === "CREDIT")!;

		expect(debit.accountId).toBe(BANK_ACCOUNT_ID);
		expect(credit.accountId).toBe(AR_CONTROL_ACCOUNT_ID);
		expect(debit.amount).toBe("2000.000000");
		expect(credit.amount).toBe("2000.000000");
	});

	test("throws PAYMENT_AMOUNT_ZERO for zero amount", () => {
		expectARError(
			() =>
				buildARPaymentJournalEntry(
					invoice,
					"0.000000",
					"RCPT-001",
					AR_CONTROL_ACCOUNT_ID,
					BANK_ACCOUNT_ID,
					PERIOD_ID,
					"2026-04-15",
				),
			"PAYMENT_AMOUNT_ZERO",
		);
	});

	test("throws PAYMENT_EXCEEDS_BALANCE for over-payment", () => {
		expectARError(
			() =>
				buildARPaymentJournalEntry(
					invoice,
					"9999.000000",
					"RCPT-001",
					AR_CONTROL_ACCOUNT_ID,
					BANK_ACCOUNT_ID,
					PERIOD_ID,
					"2026-04-15",
				),
			"PAYMENT_EXCEEDS_BALANCE",
		);
	});
});

// ── Workflow state machine ────────────────────────────────────────────────────

describe("customer invoice workflow", () => {
	test("DRAFT → SENT via sendInvoice", () => {
		const result = sendInvoice(makeInvoiceSnapshot("DRAFT"));
		expect(result.newStatus).toBe("SENT");
	});

	test("DRAFT → VOID via voidInvoice", () => {
		const result = voidInvoice(makeInvoiceSnapshot("DRAFT"));
		expect(result.newStatus).toBe("VOID");
	});

	test("SENT → VOID via voidInvoice", () => {
		const result = voidInvoice(makeInvoiceSnapshot("SENT"));
		expect(result.newStatus).toBe("VOID");
	});

	test("SENT → WRITTEN_OFF via writeOffInvoice", () => {
		const result = writeOffInvoice(makeInvoiceSnapshot("SENT"));
		expect(result.newStatus).toBe("WRITTEN_OFF");
	});

	test("PARTIALLY_PAID → WRITTEN_OFF via writeOffInvoice", () => {
		const result = writeOffInvoice(makeInvoiceSnapshot("PARTIALLY_PAID", "1000.000000"));
		expect(result.newStatus).toBe("WRITTEN_OFF");
	});

	test("invalid transition throws INVALID_INVOICE_TRANSITION", () => {
		expectARError(() => sendInvoice(makeInvoiceSnapshot("SENT")), "INVALID_INVOICE_TRANSITION");
	});

	test("cannot void a PAID invoice", () => {
		expectARError(() => voidInvoice(makeInvoiceSnapshot("PAID")), "INVALID_INVOICE_TRANSITION");
	});

	test("cannot void a PARTIALLY_PAID invoice", () => {
		expectARError(
			() => voidInvoice(makeInvoiceSnapshot("PARTIALLY_PAID")),
			"INVALID_INVOICE_TRANSITION",
		);
	});

	test("cannot write off a PAID invoice", () => {
		expectARError(() => writeOffInvoice(makeInvoiceSnapshot("PAID")), "INVALID_INVOICE_TRANSITION");
	});
});

// ── applyARPayment ────────────────────────────────────────────────────────────

describe("applyARPayment", () => {
	test("partial payment → PARTIALLY_PAID with correct remaining balance", () => {
		const invoice = makeInvoiceSnapshot("SENT", "6150.000000");
		const result = applyARPayment(invoice, "2000.000000");

		expect(result.newStatus).toBe("PARTIALLY_PAID");
		expect(result.remainingBalance).toBe("4150.000000");
		expect(result.fullyPaid).toBe(false);
	});

	test("exact payment → PAID with zero balance", () => {
		const invoice = makeInvoiceSnapshot("SENT", "6150.000000");
		const result = applyARPayment(invoice, "6150.000000");

		expect(result.newStatus).toBe("PAID");
		expect(result.remainingBalance).toBe("0.000000");
		expect(result.fullyPaid).toBe(true);
	});

	test("second partial payment on PARTIALLY_PAID invoice", () => {
		const invoice = makeInvoiceSnapshot("PARTIALLY_PAID", "4150.000000");
		const result = applyARPayment(invoice, "3000.000000");

		expect(result.newStatus).toBe("PARTIALLY_PAID");
		expect(result.remainingBalance).toBe("1150.000000");
	});

	test("final payment closes PARTIALLY_PAID → PAID", () => {
		const invoice = makeInvoiceSnapshot("PARTIALLY_PAID", "1150.000000");
		const result = applyARPayment(invoice, "1150.000000");

		expect(result.newStatus).toBe("PAID");
		expect(result.fullyPaid).toBe(true);
	});

	test("throws INVOICE_NOT_RECEIVABLE for DRAFT status", () => {
		expectARError(() => applyARPayment(makeInvoiceSnapshot("DRAFT"), "100.000000"), "INVOICE_NOT_RECEIVABLE");
	});

	test("throws INVOICE_NOT_RECEIVABLE for VOID status", () => {
		expectARError(() => applyARPayment(makeInvoiceSnapshot("VOID"), "100.000000"), "INVOICE_NOT_RECEIVABLE");
	});

	test("throws INVOICE_NOT_RECEIVABLE for WRITTEN_OFF status", () => {
		expectARError(
			() => applyARPayment(makeInvoiceSnapshot("WRITTEN_OFF"), "100.000000"),
			"INVOICE_NOT_RECEIVABLE",
		);
	});

	test("throws PAYMENT_EXCEEDS_BALANCE for over-payment", () => {
		const invoice = makeInvoiceSnapshot("SENT", "100.000000");
		expectARError(() => applyARPayment(invoice, "100.000001"), "PAYMENT_EXCEEDS_BALANCE");
	});

	test("throws PAYMENT_AMOUNT_ZERO for zero payment", () => {
		const invoice = makeInvoiceSnapshot("SENT");
		expectARError(() => applyARPayment(invoice, "0.000000"), "PAYMENT_AMOUNT_ZERO");
	});
});

// ── voidInvoice ───────────────────────────────────────────────────────────────

describe("voidInvoice", () => {
	test("can void DRAFT and SENT invoices", () => {
		for (const status of ["DRAFT", "SENT"] as const) {
			const result = voidInvoice(makeInvoiceSnapshot(status));
			expect(result.newStatus).toBe("VOID");
		}
	});

	test("throws INVALID_INVOICE_TRANSITION for PAID status", () => {
		expectARError(() => voidInvoice(makeInvoiceSnapshot("PAID")), "INVALID_INVOICE_TRANSITION");
	});

	test("throws INVALID_INVOICE_TRANSITION for already-VOID status", () => {
		expectARError(() => voidInvoice(makeInvoiceSnapshot("VOID")), "INVALID_INVOICE_TRANSITION");
	});

	test("throws INVALID_INVOICE_TRANSITION for WRITTEN_OFF status", () => {
		expectARError(
			() => voidInvoice(makeInvoiceSnapshot("WRITTEN_OFF")),
			"INVALID_INVOICE_TRANSITION",
		);
	});
});
