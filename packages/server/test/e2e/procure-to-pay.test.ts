/**
 * E2E workflow test: Procure-to-Pay (P2P).
 *
 * Tests the complete PO → Goods Receipt → AP Accrual → Three-Way Match → Payment
 * workflow using domain functions in sequence, without a real database.
 *
 * Workflow:
 *   1. PO: DRAFT → submit → approve (vendor cleared) → SENT
 *   2. Goods Receipt: DRAFT → POSTED (with AP accrual journal entry)
 *   3. Three-way match: PO line vs GR lines vs vendor bill
 *   4. Vendor bill: DRAFT → submit → approve → post → payment applied
 *
 * Ref: SD-003 §7 E2E Tests (PO→goods receipt→three-way match→payment)
 * Issue: hx-73a58e2b
 */

import { describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import {
	type VendorBillSnapshot,
	applyPayment,
	approveBill,
	buildBillJournalEntry,
	buildPaymentJournalEntry,
	createVendorBillRecord,
	markBillPosted,
	submitBillForApproval,
} from "../../src/finance/ap-service.js";
import {
	type BillLineSnapshot,
	type GoodsReceiptLineSnapshot,
	type GoodsReceiptSnapshot,
	type POLineSnapshot,
	buildAPAccrualEntry,
	performThreeWayMatch,
	postGoodsReceipt,
} from "../../src/procurement/gr-service.js";
import {
	type POStatus,
	approve,
	send,
	submitForApproval,
} from "../../src/procurement/po-approval-workflow.js";
import { ACCOUNTS, ENTITIES, FISCAL_PERIOD, USERS, VENDOR } from "../helpers/fixtures.js";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function uuid(s: string): UUID {
	return s as UUID;
}

const PO_ID = uuid("po-e2e-00001");
const GR_ID = uuid("gr-e2e-00001");
const BILL_ID = uuid("bill-e2e001");
const PO_LINE_ID = uuid("pol-e2e-001");
const PERIOD_ID = FISCAL_PERIOD.id;
const ENTITY_ID = ENTITIES.US.id;
const ACTOR_ID = USERS.finance.id;
const VENDOR_ID = VENDOR.id;

/** A cleared vendor screening stub. */
const clearVendorScreening = () => ({
	outcome: "CLEAR" as const,
	holdRequired: false,
	holdReason: null,
	screenedAt: new Date().toISOString(),
	screeningVersion: "1.0",
});

function makeGR(status: GoodsReceiptSnapshot["status"] = "DRAFT"): GoodsReceiptSnapshot {
	return {
		id: GR_ID,
		entityId: ENTITY_ID,
		purchaseOrderId: PO_ID,
		receiptNumber: "GR-2026-001",
		status,
		receiptDate: "2026-02-15",
		currencyCode: "USD",
	};
}

function makeGRLine(): GoodsReceiptLineSnapshot {
	return {
		id: uuid("grl-e2e-001"),
		goodsReceiptId: GR_ID,
		purchaseOrderLineId: PO_LINE_ID,
		lineNumber: 1,
		description: "Satellite solar panel (X-200)",
		quantityAccepted: "10.0000",
		unitPrice: "1500.000000",
		accountId: ACCOUNTS.inventory,
	};
}

function makePOLine(): POLineSnapshot {
	return {
		id: PO_LINE_ID,
		purchaseOrderId: PO_ID,
		lineNumber: 1,
		quantityOrdered: "10.0000",
		quantityReceived: "10.0000",
		unitPrice: "1500.000000",
		amount: "15000.000000",
		currencyCode: "USD",
	};
}

// ── Step 1: PO lifecycle ──────────────────────────────────────────────────────

describe("P2P Step 1 — PO lifecycle (DRAFT → SENT)", () => {
	let currentStatus: POStatus = "DRAFT";

	test("submit PO for approval (DRAFT → PENDING_APPROVAL)", () => {
		const po = {
			id: PO_ID,
			entityId: ENTITY_ID,
			vendorId: VENDOR_ID,
			vendorName: VENDOR.name,
			status: currentStatus,
		};
		const result = submitForApproval(po);
		expect(result.newStatus).toBe("PENDING_APPROVAL");
		currentStatus = result.newStatus;
	});

	test("approve PO with clear vendor screening (PENDING_APPROVAL → APPROVED)", () => {
		const po = {
			id: PO_ID,
			entityId: ENTITY_ID,
			vendorId: VENDOR_ID,
			vendorName: VENDOR.name,
			status: currentStatus,
		};
		const result = approve(po, ACTOR_ID, clearVendorScreening);
		expect(result.newStatus).toBe("APPROVED");
		currentStatus = result.newStatus;
	});

	test("send PO to vendor (APPROVED → SENT)", () => {
		const po = {
			id: PO_ID,
			entityId: ENTITY_ID,
			vendorId: VENDOR_ID,
			vendorName: VENDOR.name,
			status: currentStatus,
		};
		const result = send(po);
		expect(result.newStatus).toBe("SENT");
	});
});

// ── Step 2: Goods receipt ─────────────────────────────────────────────────────

describe("P2P Step 2 — Goods receipt posting", () => {
	const gr = makeGR("DRAFT");
	const grLines = [makeGRLine()];

	test("post goods receipt (DRAFT → POSTED)", () => {
		const result = postGoodsReceipt(gr);
		expect(result.newStatus).toBe("POSTED");
	});

	test("build AP accrual journal entry on posting", () => {
		const entry = buildAPAccrualEntry(gr, grLines, ACCOUNTS.apAccrual, PERIOD_ID, "2026-02-15");

		// Balanced double-entry
		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");
		expect(debits.length).toBeGreaterThan(0);
		expect(credits.length).toBeGreaterThan(0);

		// Total debit === total credit (15,000.000000 for 10 × 1500)
		const totalDebit = debits.reduce((sum, l) => sum + Number(l.amount), 0);
		const totalCredit = credits.reduce((sum, l) => sum + Number(l.amount), 0);
		expect(totalDebit).toBeCloseTo(totalCredit, 4);
		expect(totalDebit).toBeCloseTo(15_000, 4);

		// DR to inventory account
		expect(debits.some((l) => l.accountId === ACCOUNTS.inventory)).toBe(true);
		// CR to AP accrual account
		expect(credits.some((l) => l.accountId === ACCOUNTS.apAccrual)).toBe(true);
	});
});

// ── Step 3: Three-way match ────────────────────────────────────────────────────

describe("P2P Step 3 — Three-way match", () => {
	const grLine = makeGRLine();
	const poLine = makePOLine();

	test("three-way match passes for matching qty and price", () => {
		const billLine: BillLineSnapshot = {
			purchaseOrderLineId: PO_LINE_ID,
			lineNumber: 1,
			amount: "15000.000000",
			unitPrice: "1500.000000",
			currencyCode: "USD",
		};
		const result = performThreeWayMatch(poLine, [grLine], billLine);
		expect(result.overallMatch).toBe("MATCH");
		expect(result.quantityVariance).toBe("0.000000");
		expect(result.priceVariance).toBe("0.000000");
	});

	test("three-way match detects price variance", () => {
		const billWithHigherPrice: BillLineSnapshot = {
			purchaseOrderLineId: PO_LINE_ID,
			lineNumber: 1,
			amount: "16000.000000",
			unitPrice: "1600.000000", // 100 above PO price
			currencyCode: "USD",
		};
		const result = performThreeWayMatch(poLine, [grLine], billWithHigherPrice);
		expect(result.overallMatch).toBe("DISCREPANCY");
		expect(result.priceMatch).toBe("VARIANCE");
		if (result.priceVariance !== null) {
			expect(Number(result.priceVariance)).toBeGreaterThan(0);
		}
	});
});

// ── Step 4: Vendor bill lifecycle + payment ────────────────────────────────────

describe("P2P Step 4 — Vendor bill and payment", () => {
	const billLineAmount = "15000.000000"; // 10 × 1500

	const billRecord = createVendorBillRecord(
		{
			entityId: ENTITY_ID,
			vendorId: VENDOR_ID,
			billNumber: "BILL-2026-001",
			billDate: "2026-02-20",
			dueDate: "2026-03-22",
			currencyCode: "USD",
			purchaseOrderId: PO_ID,
			lines: [
				{
					lineNumber: 1,
					description: "Satellite solar panel (X-200)",
					accountId: ACCOUNTS.inventory,
					quantity: "10.0000",
					unitPrice: "1500.000000",
					amount: billLineAmount,
					currencyCode: "USD",
					purchaseOrderLineId: PO_LINE_ID,
				},
			],
		},
		"INT-REF-2026-001",
		ACTOR_ID,
	);

	const bill: VendorBillSnapshot = {
		id: BILL_ID,
		entityId: ENTITY_ID,
		vendorId: VENDOR_ID,
		billNumber: "BILL-2026-001",
		status: "DRAFT",
		totalAmount: "15000.000000",
		amountPaid: "0.000000",
		balanceDue: "15000.000000",
		currencyCode: "USD",
		fiscalPeriodId: PERIOD_ID,
	};

	test("bill record creation has correct total", () => {
		expect(billRecord.totalAmount).toBe("15000.000000");
		expect(billRecord.status).toBe("DRAFT");
	});

	test("DRAFT → submit → approve → post transitions", () => {
		const submitted = submitBillForApproval(bill);
		expect(submitted.newStatus).toBe("PENDING_APPROVAL");

		const approved = approveBill({ ...bill, status: "PENDING_APPROVAL" });
		expect(approved.newStatus).toBe("APPROVED");

		const posted = markBillPosted({ ...bill, status: "APPROVED" });
		expect(posted.newStatus).toBe("POSTED");
	});

	test("posted bill journal entry is balanced", () => {
		const entry = buildBillJournalEntry(
			{ ...bill, status: "POSTED" },
			[
				{
					accountId: ACCOUNTS.inventory,
					amount: billLineAmount,
					description: "Satellite solar panel (X-200)",
					currencyCode: "USD",
				},
			],
			ACCOUNTS.ap,
			PERIOD_ID,
			"2026-02-20",
		);
		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");
		const totalDebit = debits.reduce((sum, l) => sum + Number(l.amount), 0);
		const totalCredit = credits.reduce((sum, l) => sum + Number(l.amount), 0);
		expect(totalDebit).toBeCloseTo(totalCredit, 4);
	});

	test("apply full payment → PAID status", () => {
		const postedBill: VendorBillSnapshot = { ...bill, status: "POSTED" };
		const result = applyPayment(postedBill, "15000.000000");
		expect(result.newStatus).toBe("PAID");
		expect(result.fullyPaid).toBe(true);
	});

	test("payment journal entry is balanced (DR AP / CR Cash)", () => {
		const entry = buildPaymentJournalEntry(
			{ ...bill, status: "POSTED" },
			"15000.000000",
			"PMT-2026-001",
			ACCOUNTS.ap,
			ACCOUNTS.cash,
			PERIOD_ID,
			"2026-03-20",
		);
		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");
		const totalDebit = debits.reduce((sum, l) => sum + Number(l.amount), 0);
		const totalCredit = credits.reduce((sum, l) => sum + Number(l.amount), 0);
		expect(totalDebit).toBeCloseTo(totalCredit, 4);
		expect(debits.some((l) => l.accountId === ACCOUNTS.ap)).toBe(true);
		expect(credits.some((l) => l.accountId === ACCOUNTS.cash)).toBe(true);
	});
});
