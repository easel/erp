/**
 * Tests for WP-4 procurement entity Zod schemas.
 * Covers Layer 1 structural validation for vendor, purchase order,
 * inventory, and goods receipt schemas.
 * Ref: SD-002-data-model.md §5, SD-003-WP4, hx-bf30b351
 */
import { describe, expect, test } from "vitest";
import {
	CreateGoodsReceiptSchema,
	CreateInventoryItemSchema,
	CreateInventoryLocationSchema,
	CreateLotSchema,
	CreatePurchaseOrderSchema,
	CreateSerialNumberSchema,
	CreateVendorAddressSchema,
	CreateVendorContactSchema,
	CreateVendorSchema,
	GoodsReceiptLineSchema,
	PurchaseOrderLineSchema,
	UpdatePurchaseOrderSchema,
	UpdateVendorSchema,
} from "../src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

// ── Vendor ────────────────────────────────────────────────────────────────────

describe("CreateVendorSchema", () => {
	const valid = {
		entityId: UUID,
		vendorCode: "ACME-001",
		legalName: "Acme Corporation",
		countryCode: "US",
		defaultCurrencyCode: "USD",
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateVendorSchema.parse(valid)).not.toThrow();
	});

	test("accepts full valid input", () => {
		const full = {
			...valid,
			tradeName: "Acme",
			taxId: "12-3456789",
			paymentTerms: "NET60",
			defaultPaymentMethod: "WIRE" as const,
			riskRating: "LOW" as const,
			website: "https://acme.example",
			notes: "Key supplier",
		};
		expect(() => CreateVendorSchema.parse(full)).not.toThrow();
	});

	test("rejects missing entityId", () => {
		const { entityId: _entityId, ...rest } = valid;
		expect(() => CreateVendorSchema.parse(rest)).toThrow();
	});

	test("rejects lowercase vendor code", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, vendorCode: "acme-001" })).toThrow();
	});

	test("rejects vendor code over 20 chars", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, vendorCode: "A".repeat(21) })).toThrow();
	});

	test("rejects invalid country code", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, countryCode: "usa" })).toThrow();
	});

	test("rejects invalid payment method", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, defaultPaymentMethod: "PAYPAL" })).toThrow();
	});

	test("rejects invalid risk rating", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, riskRating: "CRITICAL" })).toThrow();
	});

	test("rejects invalid URL for website", () => {
		expect(() => CreateVendorSchema.parse({ ...valid, website: "not-a-url" })).toThrow();
	});
});

describe("UpdateVendorSchema", () => {
	test("accepts partial update with just id", () => {
		expect(() => UpdateVendorSchema.parse({ id: UUID })).not.toThrow();
	});

	test("accepts updating notes only", () => {
		expect(() => UpdateVendorSchema.parse({ id: UUID, notes: "Updated notes" })).not.toThrow();
	});

	test("rejects missing id", () => {
		expect(() => UpdateVendorSchema.parse({ notes: "Updated" })).toThrow();
	});
});

describe("CreateVendorContactSchema", () => {
	const valid = {
		vendorId: UUID,
		firstName: "Alice",
		lastName: "Smith",
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateVendorContactSchema.parse(valid)).not.toThrow();
	});

	test("accepts with optional fields", () => {
		expect(() =>
			CreateVendorContactSchema.parse({
				...valid,
				email: "alice@acme.example",
				phone: "+1-555-0100",
				roleTitle: "Accounts Payable",
				isPrimary: true,
			}),
		).not.toThrow();
	});

	test("rejects invalid email", () => {
		expect(() => CreateVendorContactSchema.parse({ ...valid, email: "not-an-email" })).toThrow();
	});

	test("rejects invalid phone number", () => {
		expect(() => CreateVendorContactSchema.parse({ ...valid, phone: "123" })).toThrow();
	});
});

describe("CreateVendorAddressSchema", () => {
	const valid = {
		vendorId: UUID,
		addressType: "BILLING" as const,
		addressLine1: "123 Main St",
		city: "Springfield",
		countryCode: "US",
	};

	test("accepts valid BILLING address", () => {
		expect(() => CreateVendorAddressSchema.parse(valid)).not.toThrow();
	});

	test("accepts REMITTANCE and SHIPPING types", () => {
		expect(() =>
			CreateVendorAddressSchema.parse({ ...valid, addressType: "REMITTANCE" }),
		).not.toThrow();
		expect(() =>
			CreateVendorAddressSchema.parse({ ...valid, addressType: "SHIPPING" }),
		).not.toThrow();
	});

	test("rejects invalid address type", () => {
		expect(() => CreateVendorAddressSchema.parse({ ...valid, addressType: "MAILING" })).toThrow();
	});
});

// ── Purchase Order ────────────────────────────────────────────────────────────

describe("PurchaseOrderLineSchema", () => {
	const valid = {
		lineNumber: 1,
		description: "Widget A",
		quantityOrdered: "10",
		unitOfMeasure: "EA",
		unitPrice: "25.50",
		currencyCode: "USD",
	};

	test("accepts valid line", () => {
		expect(() => PurchaseOrderLineSchema.parse(valid)).not.toThrow();
	});

	test("accepts with optional inventoryItemId and accountId", () => {
		expect(() =>
			PurchaseOrderLineSchema.parse({
				...valid,
				inventoryItemId: UUID,
				accountId: UUID2,
				taxCode: "US-TAX",
				requiredDate: "2026-06-01",
			}),
		).not.toThrow();
	});

	test("rejects zero quantity", () => {
		expect(() => PurchaseOrderLineSchema.parse({ ...valid, quantityOrdered: "0" })).toThrow();
	});

	test("rejects negative quantity", () => {
		expect(() => PurchaseOrderLineSchema.parse({ ...valid, quantityOrdered: "-1" })).toThrow();
	});

	test("rejects non-positive line number", () => {
		expect(() => PurchaseOrderLineSchema.parse({ ...valid, lineNumber: 0 })).toThrow();
	});
});

describe("CreatePurchaseOrderSchema", () => {
	const validLine = {
		lineNumber: 1,
		description: "Widget A",
		quantityOrdered: "10",
		unitOfMeasure: "EA",
		unitPrice: "25.50",
		currencyCode: "USD",
	};

	const valid = {
		entityId: UUID,
		vendorId: UUID2,
		poNumber: "PO-2026-001",
		poDate: "2026-04-05",
		currencyCode: "USD",
		lineItems: [validLine],
	};

	test("accepts valid PO", () => {
		const result = CreatePurchaseOrderSchema.parse(valid);
		expect(result.poNumber).toBe("PO-2026-001");
	});

	test("rejects PO with no line items", () => {
		expect(() => CreatePurchaseOrderSchema.parse({ ...valid, lineItems: [] })).toThrow();
	});

	test("rejects line item with mismatched currency", () => {
		const mismatchedLine = { ...validLine, currencyCode: "EUR" };
		expect(() =>
			CreatePurchaseOrderSchema.parse({ ...valid, lineItems: [mismatchedLine] }),
		).toThrow();
	});

	test("rejects duplicate line numbers", () => {
		const dupLine = { ...validLine, lineNumber: 1 };
		expect(() =>
			CreatePurchaseOrderSchema.parse({ ...valid, lineItems: [validLine, dupLine] }),
		).toThrow();
	});

	test("accepts multiple lines with unique numbers", () => {
		const line2 = { ...validLine, lineNumber: 2 };
		expect(() =>
			CreatePurchaseOrderSchema.parse({ ...valid, lineItems: [validLine, line2] }),
		).not.toThrow();
	});

	test("rejects invalid poDate format", () => {
		expect(() => CreatePurchaseOrderSchema.parse({ ...valid, poDate: "04/05/2026" })).toThrow();
	});
});

describe("UpdatePurchaseOrderSchema", () => {
	test("accepts partial update", () => {
		expect(() =>
			UpdatePurchaseOrderSchema.parse({ id: UUID, notes: "Revised delivery terms" }),
		).not.toThrow();
	});

	test("rejects missing id", () => {
		expect(() => UpdatePurchaseOrderSchema.parse({ notes: "test" })).toThrow();
	});
});

// ── Inventory ─────────────────────────────────────────────────────────────────

describe("CreateInventoryItemSchema", () => {
	const valid = {
		entityId: UUID,
		itemCode: "SKU-001",
		name: "Satellite Transponder",
		unitOfMeasure: "EA",
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateInventoryItemSchema.parse(valid)).not.toThrow();
	});

	test("accepts serialized ITAR item", () => {
		expect(() =>
			CreateInventoryItemSchema.parse({
				...valid,
				isSerialized: true,
				itarCompartmentId: UUID2,
				standardCost: "15000.00",
				costCurrencyCode: "USD",
			}),
		).not.toThrow();
	});

	test("rejects lowercase item code", () => {
		expect(() => CreateInventoryItemSchema.parse({ ...valid, itemCode: "sku-001" })).toThrow();
	});

	test("rejects standardCost without costCurrencyCode", () => {
		expect(() => CreateInventoryItemSchema.parse({ ...valid, standardCost: "100.00" })).toThrow();
	});

	test("accepts costCurrencyCode without standardCost (optional combo)", () => {
		// costCurrencyCode alone is valid (no cross-field check in this direction)
		expect(() =>
			CreateInventoryItemSchema.parse({ ...valid, costCurrencyCode: "USD" }),
		).not.toThrow();
	});
});

describe("CreateInventoryLocationSchema", () => {
	const valid = {
		entityId: UUID,
		locationCode: "WH-US-A1",
		name: "US Warehouse - Aisle A1",
	};

	test("accepts valid location", () => {
		expect(() => CreateInventoryLocationSchema.parse(valid)).not.toThrow();
	});

	test("rejects lowercase location code", () => {
		expect(() =>
			CreateInventoryLocationSchema.parse({ ...valid, locationCode: "wh-us-a1" }),
		).toThrow();
	});
});

describe("CreateLotSchema", () => {
	const valid = {
		entityId: UUID,
		inventoryItemId: UUID2,
		lotNumber: "LOT-2026-001",
	};

	test("accepts valid lot", () => {
		expect(() => CreateLotSchema.parse(valid)).not.toThrow();
	});

	test("accepts lot with all optional fields", () => {
		expect(() =>
			CreateLotSchema.parse({
				...valid,
				manufactureDate: "2026-01-01",
				expiryDate: "2028-01-01",
				supplierLotNumber: "SUPP-LOT-42",
				status: "AVAILABLE" as const,
			}),
		).not.toThrow();
	});

	test("rejects invalid lot status", () => {
		expect(() => CreateLotSchema.parse({ ...valid, status: "ACTIVE" })).toThrow();
	});
});

describe("CreateSerialNumberSchema", () => {
	const valid = {
		entityId: UUID,
		inventoryItemId: UUID2,
		serialNumber: "SN-2026-XA42-001",
	};

	test("accepts valid serial number", () => {
		expect(() => CreateSerialNumberSchema.parse(valid)).not.toThrow();
	});

	test("rejects invalid status", () => {
		expect(() => CreateSerialNumberSchema.parse({ ...valid, status: "ACTIVE" })).toThrow();
	});
});

// ── Goods Receipt ─────────────────────────────────────────────────────────────

describe("GoodsReceiptLineSchema", () => {
	const valid = {
		purchaseOrderLineId: UUID,
		lineNumber: 1,
		quantityReceived: "10",
		quantityAccepted: "9",
		quantityRejected: "1",
	};

	test("accepts valid receipt line", () => {
		expect(() => GoodsReceiptLineSchema.parse(valid)).not.toThrow();
	});

	test("rejects when accepted + rejected > received", () => {
		expect(() =>
			GoodsReceiptLineSchema.parse({ ...valid, quantityAccepted: "10", quantityRejected: "1" }),
		).toThrow();
	});

	test("accepts when accepted == received and no rejected", () => {
		expect(() =>
			GoodsReceiptLineSchema.parse({
				...valid,
				quantityAccepted: "10",
				quantityRejected: "0",
			}),
		).not.toThrow();
	});

	test("rejects zero quantity received", () => {
		expect(() => GoodsReceiptLineSchema.parse({ ...valid, quantityReceived: "0" })).toThrow();
	});
});

describe("CreateGoodsReceiptSchema", () => {
	const validLine = {
		purchaseOrderLineId: UUID2,
		lineNumber: 1,
		quantityReceived: "5",
		quantityAccepted: "5",
	};

	const valid = {
		entityId: UUID,
		purchaseOrderId: UUID2,
		receiptNumber: "GR-2026-001",
		receiptDate: "2026-04-05",
		lines: [validLine],
	};

	test("accepts valid goods receipt", () => {
		const result = CreateGoodsReceiptSchema.parse(valid);
		expect(result.receiptNumber).toBe("GR-2026-001");
	});

	test("rejects with no lines", () => {
		expect(() => CreateGoodsReceiptSchema.parse({ ...valid, lines: [] })).toThrow();
	});

	test("rejects duplicate line numbers", () => {
		const dupLine = { ...validLine, lineNumber: 1 };
		expect(() =>
			CreateGoodsReceiptSchema.parse({ ...valid, lines: [validLine, dupLine] }),
		).toThrow();
	});

	test("accepts multiple lines with unique numbers", () => {
		const line2 = { ...validLine, lineNumber: 2 };
		expect(() =>
			CreateGoodsReceiptSchema.parse({ ...valid, lines: [validLine, line2] }),
		).not.toThrow();
	});

	test("rejects invalid receipt date", () => {
		expect(() => CreateGoodsReceiptSchema.parse({ ...valid, receiptDate: "not-a-date" })).toThrow();
	});
});
