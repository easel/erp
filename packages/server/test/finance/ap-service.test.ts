/**
 * AP Service unit tests.
 *
 * Covers FIN-003 (Accounts Payable) acceptance criteria from SD-003-WP2:
 * - createVendorBillRecord: amount aggregation (subtotal, tax, total, balance due)
 * - buildBillJournalEntry: balanced DR expense / CR AP control entry
 * - buildPaymentJournalEntry: balanced DR AP control / CR cash entry
 * - Workflow state machine: DRAFT → PENDING_APPROVAL → APPROVED → POSTED → PAID
 * - applyPayment: partial and full payment, over-pay rejection
 * - voidBill: status restrictions
 *
 * Ref: SD-003-WP2 FIN-003, SD-002 §4.3, hx-29d07b28
 */

import { describe, expect, test } from "bun:test";
import type { CreateVendorBillInput } from "@apogee/shared";
import {
	APError,
	type VendorBillSnapshot,
	applyPayment,
	approveBill,
	buildBillJournalEntry,
	buildPaymentJournalEntry,
	createVendorBillRecord,
	markBillPosted,
	rejectBillToDraft,
	submitBillForApproval,
	voidBill,
} from "../../src/finance/ap-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const VENDOR_ID = "20000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as const;
const PERIOD_ID = "50000000-0000-0000-0000-000000000001" as const;
const AP_CONTROL_ACCOUNT_ID = "40000000-0000-0000-0000-000000000001" as const;
const EXPENSE_ACCOUNT_ID = "40000000-0000-0000-0000-000000000002" as const;
const BANK_ACCOUNT_ID = "40000000-0000-0000-0000-000000000003" as const;
const BILL_ID = "60000000-0000-0000-0000-000000000001" as const;

/** Helper: assert a sync function throws APError with the given code. */
function expectAPError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error("expected APError but function did not throw");
	} catch (e) {
		expect(e).toBeInstanceOf(APError);
		expect((e as APError).code).toBe(expectedCode);
	}
}

const billInput: CreateVendorBillInput = {
	entityId: ENTITY_ID,
	vendorId: VENDOR_ID,
	billNumber: "INV-2026-001",
	billDate: "2026-04-01",
	dueDate: "2026-05-01",
	currencyCode: "USD",
	fiscalPeriodId: PERIOD_ID,
	paymentTerms: "NET30",
	lines: [
		{
			lineNumber: 1,
			description: "Satellite components",
			accountId: EXPENSE_ACCOUNT_ID,
			unitPrice: "1000.000000",
			amount: "1000.000000",
			currencyCode: "USD",
			taxAmount: "80.000000",
		},
		{
			lineNumber: 2,
			description: "Shipping fee",
			accountId: EXPENSE_ACCOUNT_ID,
			unitPrice: "50.000000",
			amount: "50.000000",
			currencyCode: "USD",
		},
	],
};

function makeBillSnapshot(
	status: VendorBillSnapshot["status"] = "POSTED",
	balanceDue = "1130.000000",
): VendorBillSnapshot {
	return {
		id: BILL_ID,
		entityId: ENTITY_ID,
		vendorId: VENDOR_ID,
		billNumber: "INV-2026-001",
		status,
		totalAmount: "1130.000000",
		amountPaid: "0.000000",
		currencyCode: "USD",
		fiscalPeriodId: PERIOD_ID,
		balanceDue,
	};
}

// ── createVendorBillRecord ────────────────────────────────────────────────────

describe("createVendorBillRecord", () => {
	test("aggregates subtotal, tax, total, and balance correctly", () => {
		const record = createVendorBillRecord(billInput, "AP-2026-00001", ACTOR_ID);

		// subtotal = 1000 + 50 = 1050
		expect(record.subtotalAmount).toBe("1050.000000");
		// taxTotal = 80 + 0 = 80
		expect(record.taxAmount).toBe("80.000000");
		// total = 1050 + 80 = 1130
		expect(record.totalAmount).toBe("1130.000000");
		// baseTotalAmount = total (exchange rate 1.0)
		expect(record.baseTotalAmount).toBe("1130.000000");
		// balanceDue = total (no payments yet)
		expect(record.balanceDue).toBe("1130.000000");
	});

	test("sets status to DRAFT", () => {
		const record = createVendorBillRecord(billInput, "AP-2026-00001", ACTOR_ID);
		expect(record.status).toBe("DRAFT");
	});

	test("preserves vendor, entity, bill number from input", () => {
		const record = createVendorBillRecord(billInput, "AP-2026-00001", ACTOR_ID);
		expect(record.entityId).toBe(ENTITY_ID);
		expect(record.vendorId).toBe(VENDOR_ID);
		expect(record.billNumber).toBe("INV-2026-001");
		expect(record.internalRef).toBe("AP-2026-00001");
		expect(record.createdBy).toBe(ACTOR_ID);
	});

	test("sets optional fields to null when not provided", () => {
		const minimalInput: CreateVendorBillInput = {
			...billInput,
			fiscalPeriodId: undefined,
			purchaseOrderId: undefined,
			goodsReceiptId: undefined,
			notes: undefined,
			paymentTerms: undefined,
		};
		const record = createVendorBillRecord(minimalInput, "AP-001", ACTOR_ID);
		expect(record.fiscalPeriodId).toBeNull();
		expect(record.purchaseOrderId).toBeNull();
		expect(record.goodsReceiptId).toBeNull();
		expect(record.notes).toBeNull();
	});
});

// ── buildBillJournalEntry ─────────────────────────────────────────────────────

describe("buildBillJournalEntry", () => {
	const lines = [
		{
			accountId: EXPENSE_ACCOUNT_ID,
			amount: "1000.000000",
			description: "Satellite components",
			currencyCode: "USD",
		},
		{
			accountId: EXPENSE_ACCOUNT_ID,
			amount: "50.000000",
			description: "Shipping fee",
			currencyCode: "USD",
		},
	] as const;

	const bill = makeBillSnapshot("APPROVED");

	test("creates balanced journal entry: two debit lines + one credit line", () => {
		const entry = buildBillJournalEntry(bill, lines, AP_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");

		expect(entry.lines.length).toBe(3);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");

		expect(debits.length).toBe(2);
		expect(credits.length).toBe(1);

		// Credit line is AP control account
		expect(credits[0]?.accountId).toBe(AP_CONTROL_ACCOUNT_ID);
		// Credit amount = sum of debits
		expect(credits[0]?.amount).toBe("1050.000000");
	});

	test("reference is AP-{billNumber}", () => {
		const entry = buildBillJournalEntry(bill, lines, AP_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");
		expect(entry.reference).toBe("AP-INV-2026-001");
	});

	test("legalEntityId comes from bill.entityId", () => {
		const entry = buildBillJournalEntry(bill, lines, AP_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01");
		expect(entry.legalEntityId).toBe(ENTITY_ID);
	});

	test("throws BILL_NO_LINES when lines array is empty", () => {
		expectAPError(
			() => buildBillJournalEntry(bill, [], AP_CONTROL_ACCOUNT_ID, PERIOD_ID, "2026-04-01"),
			"BILL_NO_LINES",
		);
	});
});

// ── buildPaymentJournalEntry ──────────────────────────────────────────────────

describe("buildPaymentJournalEntry", () => {
	const bill = makeBillSnapshot("POSTED");

	test("creates balanced payment entry (DR AP control, CR cash)", () => {
		const entry = buildPaymentJournalEntry(
			bill,
			"500.000000",
			"CHK-001",
			AP_CONTROL_ACCOUNT_ID,
			BANK_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-15",
		);

		expect(entry.lines.length).toBe(2);

		const debit = entry.lines.find((l) => l.type === "DEBIT")!;
		const credit = entry.lines.find((l) => l.type === "CREDIT")!;

		expect(debit.accountId).toBe(AP_CONTROL_ACCOUNT_ID);
		expect(credit.accountId).toBe(BANK_ACCOUNT_ID);
		expect(debit.amount).toBe("500.000000");
		expect(credit.amount).toBe("500.000000");
	});

	test("throws PAYMENT_AMOUNT_ZERO for zero amount", () => {
		expectAPError(
			() =>
				buildPaymentJournalEntry(
					bill,
					"0.000000",
					"CHK-001",
					AP_CONTROL_ACCOUNT_ID,
					BANK_ACCOUNT_ID,
					PERIOD_ID,
					"2026-04-15",
				),
			"PAYMENT_AMOUNT_ZERO",
		);
	});

	test("throws PAYMENT_EXCEEDS_BALANCE for over-payment", () => {
		expectAPError(
			() =>
				buildPaymentJournalEntry(
					bill,
					"9999.000000",
					"CHK-001",
					AP_CONTROL_ACCOUNT_ID,
					BANK_ACCOUNT_ID,
					PERIOD_ID,
					"2026-04-15",
				),
			"PAYMENT_EXCEEDS_BALANCE",
		);
	});
});

// ── Workflow state machine ────────────────────────────────────────────────────

describe("vendor bill workflow", () => {
	test("DRAFT → PENDING_APPROVAL via submitBillForApproval", () => {
		const result = submitBillForApproval(makeBillSnapshot("DRAFT"));
		expect(result.newStatus).toBe("PENDING_APPROVAL");
	});

	test("PENDING_APPROVAL → APPROVED via approveBill", () => {
		const result = approveBill(makeBillSnapshot("PENDING_APPROVAL"));
		expect(result.newStatus).toBe("APPROVED");
	});

	test("PENDING_APPROVAL → DRAFT via rejectBillToDraft", () => {
		const result = rejectBillToDraft(makeBillSnapshot("PENDING_APPROVAL"));
		expect(result.newStatus).toBe("DRAFT");
	});

	test("APPROVED → POSTED via markBillPosted", () => {
		const result = markBillPosted(makeBillSnapshot("APPROVED"));
		expect(result.newStatus).toBe("POSTED");
	});

	test("invalid transition throws INVALID_BILL_TRANSITION", () => {
		expect(() => submitBillForApproval(makeBillSnapshot("POSTED"))).toThrow(APError);
		expectAPError(() => submitBillForApproval(makeBillSnapshot("POSTED")), "INVALID_BILL_TRANSITION");
	});

	test("approveBill throws for DRAFT status", () => {
		expectAPError(() => approveBill(makeBillSnapshot("DRAFT")), "INVALID_BILL_TRANSITION");
	});

	test("markBillPosted throws for non-APPROVED status", () => {
		expectAPError(() => markBillPosted(makeBillSnapshot("DRAFT")), "INVALID_BILL_TRANSITION");
	});
});

// ── applyPayment ──────────────────────────────────────────────────────────────

describe("applyPayment", () => {
	test("partial payment → PARTIALLY_PAID with correct remaining balance", () => {
		const bill = makeBillSnapshot("POSTED", "1130.000000");
		const result = applyPayment(bill, "500.000000");

		expect(result.newStatus).toBe("PARTIALLY_PAID");
		expect(result.remainingBalance).toBe("630.000000");
		expect(result.fullyPaid).toBe(false);
	});

	test("exact payment → PAID with zero balance", () => {
		const bill = makeBillSnapshot("POSTED", "1130.000000");
		const result = applyPayment(bill, "1130.000000");

		expect(result.newStatus).toBe("PAID");
		expect(result.remainingBalance).toBe("0.000000");
		expect(result.fullyPaid).toBe(true);
	});

	test("second partial payment on PARTIALLY_PAID bill", () => {
		const bill = makeBillSnapshot("PARTIALLY_PAID", "630.000000");
		const result = applyPayment(bill, "500.000000");

		expect(result.newStatus).toBe("PARTIALLY_PAID");
		expect(result.remainingBalance).toBe("130.000000");
	});

	test("final payment closes PARTIALLY_PAID → PAID", () => {
		const bill = makeBillSnapshot("PARTIALLY_PAID", "130.000000");
		const result = applyPayment(bill, "130.000000");

		expect(result.newStatus).toBe("PAID");
		expect(result.fullyPaid).toBe(true);
	});

	test("throws BILL_NOT_PAYABLE for DRAFT status", () => {
		expectAPError(() => applyPayment(makeBillSnapshot("DRAFT"), "100.000000"), "BILL_NOT_PAYABLE");
	});

	test("throws BILL_NOT_PAYABLE for APPROVED status", () => {
		expectAPError(
			() => applyPayment(makeBillSnapshot("APPROVED"), "100.000000"),
			"BILL_NOT_PAYABLE",
		);
	});

	test("throws BILL_NOT_PAYABLE for VOID status", () => {
		expectAPError(() => applyPayment(makeBillSnapshot("VOID"), "100.000000"), "BILL_NOT_PAYABLE");
	});

	test("throws PAYMENT_EXCEEDS_BALANCE for over-payment", () => {
		const bill = makeBillSnapshot("POSTED", "100.000000");
		expectAPError(() => applyPayment(bill, "100.000001"), "PAYMENT_EXCEEDS_BALANCE");
	});

	test("throws PAYMENT_AMOUNT_ZERO for zero payment", () => {
		const bill = makeBillSnapshot("POSTED");
		expectAPError(() => applyPayment(bill, "0.000000"), "PAYMENT_AMOUNT_ZERO");
	});
});

// ── voidBill ──────────────────────────────────────────────────────────────────

describe("voidBill", () => {
	test("can void DRAFT, PENDING_APPROVAL, APPROVED, POSTED bills", () => {
		for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"] as const) {
			const result = voidBill(makeBillSnapshot(status));
			expect(result.newStatus).toBe("VOID");
		}
	});

	test("throws INVALID_BILL_TRANSITION for PAID status", () => {
		expectAPError(() => voidBill(makeBillSnapshot("PAID")), "INVALID_BILL_TRANSITION");
	});

	test("throws INVALID_BILL_TRANSITION for already-VOID status", () => {
		expectAPError(() => voidBill(makeBillSnapshot("VOID")), "INVALID_BILL_TRANSITION");
	});
});
