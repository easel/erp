/**
 * Goods Receipt Service unit tests.
 *
 * Covers SCM-004 acceptance criteria from SD-003-WP4:
 * - buildAPAccrualEntry: balanced DR inventory/expense / CR AP accrual entry
 * - postGoodsReceipt / cancelGoodsReceipt: state machine transitions
 * - performThreeWayMatch: quantity match, price match, variance detection
 *
 * Ref: SD-003-WP4 SCM-004, SD-002 §5, hx-3ec8596d
 */

import { describe, expect, test } from "bun:test";
import {
	type BillLineSnapshot,
	GRError,
	type GoodsReceiptLineSnapshot,
	type GoodsReceiptSnapshot,
	type POLineSnapshot,
	buildAPAccrualEntry,
	cancelGoodsReceipt,
	performThreeWayMatch,
	postGoodsReceipt,
} from "../../src/procurement/gr-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const PO_ID = "20000000-0000-0000-0000-000000000001" as const;
const GR_ID = "30000000-0000-0000-0000-000000000001" as const;
const PERIOD_ID = "50000000-0000-0000-0000-000000000001" as const;
const AP_ACCRUAL_ACCOUNT_ID = "40000000-0000-0000-0000-000000000001" as const;
const INVENTORY_ACCOUNT_ID = "40000000-0000-0000-0000-000000000002" as const;
const PO_LINE_ID_1 = "60000000-0000-0000-0000-000000000001" as const;
const PO_LINE_ID_2 = "60000000-0000-0000-0000-000000000002" as const;
const GR_LINE_ID_1 = "70000000-0000-0000-0000-000000000001" as const;
const GR_LINE_ID_2 = "70000000-0000-0000-0000-000000000002" as const;

/** Helper: assert a sync function throws GRError with the given code. */
function expectGRError(fn: () => unknown, expectedCode: string): void {
	try {
		fn();
		throw new Error("expected GRError but function did not throw");
	} catch (e) {
		expect(e).toBeInstanceOf(GRError);
		expect((e as GRError).code).toBe(expectedCode);
	}
}

function makeGR(status: GoodsReceiptSnapshot["status"] = "DRAFT"): GoodsReceiptSnapshot {
	return {
		id: GR_ID,
		entityId: ENTITY_ID,
		purchaseOrderId: PO_ID,
		receiptNumber: "GR-2026-001",
		status,
		receiptDate: "2026-04-10",
		currencyCode: "USD",
	};
}

const grLines: GoodsReceiptLineSnapshot[] = [
	{
		id: GR_LINE_ID_1,
		goodsReceiptId: GR_ID,
		purchaseOrderLineId: PO_LINE_ID_1,
		lineNumber: 1,
		quantityAccepted: "10.0000",
		unitPrice: "100.000000",
		accountId: INVENTORY_ACCOUNT_ID,
		description: "Satellite component A",
	},
	{
		id: GR_LINE_ID_2,
		goodsReceiptId: GR_ID,
		purchaseOrderLineId: PO_LINE_ID_2,
		lineNumber: 2,
		quantityAccepted: "5.0000",
		unitPrice: "200.000000",
		accountId: INVENTORY_ACCOUNT_ID,
		description: "Satellite component B",
	},
];

// ── buildAPAccrualEntry ───────────────────────────────────────────────────────

describe("buildAPAccrualEntry", () => {
	test("creates balanced accrual entry: two DR lines + one CR line", () => {
		const entry = buildAPAccrualEntry(
			makeGR(),
			grLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);

		expect(entry.lines.length).toBe(3);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		const credits = entry.lines.filter((l) => l.type === "CREDIT");

		expect(debits.length).toBe(2);
		expect(credits.length).toBe(1);

		// Credit = AP accrual account
		expect(credits[0]?.accountId).toBe(AP_ACCRUAL_ACCOUNT_ID);
	});

	test("computes line amounts as qty × unit price", () => {
		const entry = buildAPAccrualEntry(
			makeGR(),
			grLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);

		const debits = entry.lines.filter((l) => l.type === "DEBIT");
		// Line 1: 10 × 100 = 1000
		expect(debits[0]?.amount).toBe("1000.000000");
		// Line 2: 5 × 200 = 1000
		expect(debits[1]?.amount).toBe("1000.000000");
	});

	test("credit amount equals sum of debit amounts", () => {
		const entry = buildAPAccrualEntry(
			makeGR(),
			grLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);

		const totalDebits = entry.lines
			.filter((l) => l.type === "DEBIT")
			.reduce((sum, l) => {
				const [i = "0", d = ""] = l.amount.split(".");
				return sum + BigInt(i) * 1_000_000n + BigInt(d.padEnd(6, "0").slice(0, 6));
			}, 0n);

		const creditLine = entry.lines.find((l) => l.type === "CREDIT")!;
		const [ci = "0", cd = ""] = creditLine.amount.split(".");
		const creditMicro = BigInt(ci) * 1_000_000n + BigInt(cd.padEnd(6, "0").slice(0, 6));

		expect(totalDebits).toBe(creditMicro);
		// 1000 + 1000 = 2000
		expect(creditLine.amount).toBe("2000.000000");
	});

	test("reference is GR-{receiptNumber}", () => {
		const entry = buildAPAccrualEntry(
			makeGR(),
			grLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);
		expect(entry.reference).toBe("GR-GR-2026-001");
	});

	test("legalEntityId comes from receipt.entityId", () => {
		const entry = buildAPAccrualEntry(
			makeGR(),
			grLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);
		expect(entry.legalEntityId).toBe(ENTITY_ID);
	});

	test("throws GR_NO_LINES when lines array is empty", () => {
		expectGRError(
			() => buildAPAccrualEntry(makeGR(), [], AP_ACCRUAL_ACCOUNT_ID, PERIOD_ID, "2026-04-10"),
			"GR_NO_LINES",
		);
	});

	test("handles fractional quantities correctly (2.5 × 100 = 250)", () => {
		const fractionalLines: GoodsReceiptLineSnapshot[] = [
			{
				...grLines[0]!,
				quantityAccepted: "2.5000",
				unitPrice: "100.000000",
			},
		];
		const entry = buildAPAccrualEntry(
			makeGR(),
			fractionalLines,
			AP_ACCRUAL_ACCOUNT_ID,
			PERIOD_ID,
			"2026-04-10",
		);
		const debit = entry.lines.find((l) => l.type === "DEBIT")!;
		expect(debit.amount).toBe("250.000000");
	});
});

// ── postGoodsReceipt / cancelGoodsReceipt ─────────────────────────────────────

describe("goods receipt workflow", () => {
	test("DRAFT → POSTED via postGoodsReceipt", () => {
		const result = postGoodsReceipt(makeGR("DRAFT"));
		expect(result.newStatus).toBe("POSTED");
	});

	test("DRAFT → CANCELLED via cancelGoodsReceipt", () => {
		const result = cancelGoodsReceipt(makeGR("DRAFT"));
		expect(result.newStatus).toBe("CANCELLED");
	});

	test("throws INVALID_GR_TRANSITION when posting an already-POSTED GR", () => {
		expectGRError(() => postGoodsReceipt(makeGR("POSTED")), "INVALID_GR_TRANSITION");
	});

	test("throws INVALID_GR_TRANSITION when cancelling an already-POSTED GR", () => {
		expectGRError(() => cancelGoodsReceipt(makeGR("POSTED")), "INVALID_GR_TRANSITION");
	});

	test("throws INVALID_GR_TRANSITION when cancelling a CANCELLED GR", () => {
		expectGRError(() => cancelGoodsReceipt(makeGR("CANCELLED")), "INVALID_GR_TRANSITION");
	});
});

// ── performThreeWayMatch ──────────────────────────────────────────────────────

const poLine: POLineSnapshot = {
	id: PO_LINE_ID_1,
	purchaseOrderId: PO_ID,
	lineNumber: 1,
	quantityOrdered: "10.0000",
	quantityReceived: "10.0000",
	unitPrice: "100.000000",
	amount: "1000.000000",
	currencyCode: "USD",
};

const grLine: GoodsReceiptLineSnapshot = {
	id: GR_LINE_ID_1,
	goodsReceiptId: GR_ID,
	purchaseOrderLineId: PO_LINE_ID_1,
	lineNumber: 1,
	quantityAccepted: "10.0000",
	unitPrice: "100.000000",
	accountId: INVENTORY_ACCOUNT_ID,
	description: "Component A",
};

const billLine: BillLineSnapshot = {
	purchaseOrderLineId: PO_LINE_ID_1,
	lineNumber: 1,
	amount: "1000.000000",
	unitPrice: "100.000000",
	currencyCode: "USD",
};

describe("performThreeWayMatch", () => {
	test("full match: qty matches, price matches → MATCH", () => {
		const result = performThreeWayMatch(poLine, [grLine], billLine);

		expect(result.quantityMatch).toBe("MATCH");
		expect(result.priceMatch).toBe("MATCH");
		expect(result.overallMatch).toBe("MATCH");
		expect(result.quantityVariance).toBe("0.000000");
		expect(result.priceVariance).toBe("0.000000");
	});

	test("quantity under-received → UNDER discrepancy", () => {
		const partialGRLine: GoodsReceiptLineSnapshot = {
			...grLine,
			quantityAccepted: "7.0000",
		};
		const result = performThreeWayMatch(poLine, [partialGRLine], null);

		expect(result.quantityMatch).toBe("UNDER");
		expect(result.overallMatch).toBe("DISCREPANCY");
		// variance = 7 - 10 = -3
		expect(result.quantityVariance).toBe("-3.000000");
	});

	test("quantity over-received → OVER discrepancy", () => {
		const overGRLine: GoodsReceiptLineSnapshot = {
			...grLine,
			quantityAccepted: "12.0000",
		};
		const result = performThreeWayMatch(poLine, [overGRLine], null);

		expect(result.quantityMatch).toBe("OVER");
		expect(result.overallMatch).toBe("DISCREPANCY");
		expect(result.quantityVariance).toBe("2.000000");
	});

	test("price variance → VARIANCE discrepancy", () => {
		const highPriceBillLine: BillLineSnapshot = {
			...billLine,
			unitPrice: "105.000000",
			amount: "1050.000000",
		};
		const result = performThreeWayMatch(poLine, [grLine], highPriceBillLine);

		expect(result.priceMatch).toBe("VARIANCE");
		expect(result.overallMatch).toBe("DISCREPANCY");
		// price variance = (105 - 100) × 10 = 50
		expect(result.priceVariance).toBe("50.000000");
	});

	test("price variance within tolerance → MATCH", () => {
		const slightlyHighBillLine: BillLineSnapshot = {
			...billLine,
			unitPrice: "100.500000",
			amount: "1005.000000",
		};
		// tolerance = 10.000000 → variance 5 < 10 → MATCH
		const result = performThreeWayMatch(poLine, [grLine], slightlyHighBillLine, "10.000000");

		expect(result.priceMatch).toBe("MATCH");
		expect(result.overallMatch).toBe("MATCH");
	});

	test("no bill line → priceMatch=NO_BILL, overall DISCREPANCY", () => {
		const result = performThreeWayMatch(poLine, [grLine], null);

		expect(result.priceMatch).toBe("NO_BILL");
		expect(result.overallMatch).toBe("DISCREPANCY");
		expect(result.billUnitPrice).toBeNull();
		expect(result.billAmount).toBeNull();
	});

	test("multiple GR lines aggregated for same PO line", () => {
		// Two GRs each receiving 5 units (total 10 = PO qty)
		const gr1: GoodsReceiptLineSnapshot = {
			...grLine,
			id: GR_LINE_ID_1,
			quantityAccepted: "5.0000",
		};
		const gr2: GoodsReceiptLineSnapshot = {
			...grLine,
			id: GR_LINE_ID_2,
			quantityAccepted: "5.0000",
		};
		const result = performThreeWayMatch(poLine, [gr1, gr2], billLine);

		expect(result.totalQuantityReceived).toBe("10.000000");
		expect(result.quantityMatch).toBe("MATCH");
	});

	test("negative price variance (bill is lower than PO) is still flagged", () => {
		const lowPriceBillLine: BillLineSnapshot = {
			...billLine,
			unitPrice: "90.000000",
			amount: "900.000000",
		};
		const result = performThreeWayMatch(poLine, [grLine], lowPriceBillLine);

		expect(result.priceMatch).toBe("VARIANCE");
		// variance = (90 - 100) × 10 = -100
		expect(result.priceVariance).toBe("-100.000000");
	});
});
