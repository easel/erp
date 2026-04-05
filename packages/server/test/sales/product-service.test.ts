/**
 * Product Catalog Service unit tests.
 *
 * Covers SLS-004 acceptance criteria:
 * - buildProductRecord: duplicate detection, field mapping
 * - buildProductUpdateFields: partial update construction
 * - buildPriceListRecord / buildPriceListEntryRecord: field mapping
 * - lookupEffectivePrice: tier selection, date filtering, quantity threshold
 *
 * Ref: SD-003-WP5 SLS-004, hx-31c83b3c
 */

import { describe, expect, test } from "bun:test";
import {
	type PriceListEntrySnapshot,
	ProductError,
	type ProductRepository,
	type ProductSnapshot,
	buildPriceListEntryRecord,
	buildPriceListRecord,
	buildProductRecord,
	buildProductUpdateFields,
	lookupEffectivePrice,
} from "../../src/sales/product-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const PRODUCT_ID = "40000000-0000-0000-0000-000000000001" as const;
const PRICE_LIST_ID = "60000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "50000000-0000-0000-0000-000000000001" as const;

const baseProductInput = {
	entityId: ENTITY_ID,
	productCode: "SAT-XPNDR-001",
	name: "Satellite Transponder",
	productType: "GOOD" as const,
};

function makeProductSnapshot(overrides: Partial<ProductSnapshot> = {}): ProductSnapshot {
	return {
		id: PRODUCT_ID,
		entityId: ENTITY_ID,
		productCode: "SAT-XPNDR-001",
		name: "Satellite Transponder",
		productType: "GOOD",
		unitOfMeasure: "EA",
		isActive: true,
		...overrides,
	};
}

function makeNullRepo(): ProductRepository {
	return {
		async findByCode() {
			return null;
		},
		async findById() {
			return null;
		},
		async findPriceListEntries() {
			return [];
		},
	};
}

// ── buildProductRecord ────────────────────────────────────────────────────────

describe("buildProductRecord", () => {
	test("builds minimal product record", async () => {
		const record = await buildProductRecord(baseProductInput, ACTOR_ID, makeNullRepo());
		expect(record.entityId).toBe(ENTITY_ID);
		expect(record.productCode).toBe("SAT-XPNDR-001");
		expect(record.name).toBe("Satellite Transponder");
		expect(record.productType).toBe("GOOD");
		expect(record.unitOfMeasure).toBe("EA");
		expect(record.description).toBeNull();
		expect(record.createdBy).toBe(ACTOR_ID);
	});

	test("builds full product record with optional fields", async () => {
		const input = {
			...baseProductInput,
			description: "High-bandwidth transponder",
			unitOfMeasure: "UNIT",
			revenueAccountId: "70000000-0000-0000-0000-000000000001",
			cogsAccountId: "70000000-0000-0000-0000-000000000002",
			inventoryItemId: "70000000-0000-0000-0000-000000000003",
			itarCompartmentId: "70000000-0000-0000-0000-000000000004",
		};
		const record = await buildProductRecord(input, ACTOR_ID, makeNullRepo());
		expect(record.description).toBe("High-bandwidth transponder");
		expect(record.unitOfMeasure).toBe("UNIT");
		expect(record.revenueAccountId).toBe("70000000-0000-0000-0000-000000000001");
		expect(record.itarCompartmentId).toBe("70000000-0000-0000-0000-000000000004");
	});

	test("throws DUPLICATE_PRODUCT_CODE on conflict", async () => {
		const repo: ProductRepository = {
			async findByCode() {
				return makeProductSnapshot();
			},
			async findById() {
				return null;
			},
			async findPriceListEntries() {
				return [];
			},
		};
		try {
			await buildProductRecord(baseProductInput, ACTOR_ID, repo);
			throw new Error("Expected ProductError");
		} catch (e) {
			expect(e).toBeInstanceOf(ProductError);
			expect((e as ProductError).code).toBe("DUPLICATE_PRODUCT_CODE");
		}
	});
});

// ── buildProductUpdateFields ──────────────────────────────────────────────────

describe("buildProductUpdateFields", () => {
	test("builds partial update with only provided fields", () => {
		const result = buildProductUpdateFields({ id: PRODUCT_ID, name: "New Name" }, ACTOR_ID);
		expect(result.productId).toBe(PRODUCT_ID);
		expect(result.fields.name).toBe("New Name");
		expect("description" in result.fields).toBe(false);
	});

	test("includes isActive in update", () => {
		const result = buildProductUpdateFields({ id: PRODUCT_ID, isActive: false }, ACTOR_ID);
		expect(result.fields.isActive).toBe(false);
	});
});

// ── buildPriceListRecord ──────────────────────────────────────────────────────

describe("buildPriceListRecord", () => {
	test("builds a valid price list record", () => {
		const input = {
			entityId: ENTITY_ID,
			code: "STD-2026",
			name: "Standard 2026",
			currencyCode: "USD" as const,
			effectiveFrom: "2026-01-01",
		};
		const record = buildPriceListRecord(input, ACTOR_ID);
		expect(record.code).toBe("STD-2026");
		expect(record.currencyCode).toBe("USD");
		expect(record.effectiveTo).toBeNull();
	});
});

// ── buildPriceListEntryRecord ─────────────────────────────────────────────────

describe("buildPriceListEntryRecord", () => {
	test("builds a valid price list entry record", () => {
		const input = {
			priceListId: PRICE_LIST_ID,
			productId: PRODUCT_ID,
			unitPrice: "450.000000",
			effectiveFrom: "2026-01-01",
		};
		const record = buildPriceListEntryRecord(input, ACTOR_ID);
		expect(record.priceListId).toBe(PRICE_LIST_ID);
		expect(record.productId).toBe(PRODUCT_ID);
		expect(record.unitPrice).toBe("450.000000");
		expect(record.minQuantity).toBe("1");
		expect(record.effectiveTo).toBeNull();
	});
});

// ── lookupEffectivePrice ──────────────────────────────────────────────────────

describe("lookupEffectivePrice", () => {
	function makeEntry(overrides: Partial<PriceListEntrySnapshot>): PriceListEntrySnapshot {
		return {
			id: "60000000-0000-0000-0000-000000000001" as const,
			priceListId: PRICE_LIST_ID,
			productId: PRODUCT_ID,
			unitPrice: "500.000000",
			minQuantity: "1.000000",
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
			...overrides,
		};
	}

	test("returns null when no entries exist", async () => {
		const repo = makeNullRepo();
		const price = await lookupEffectivePrice(ENTITY_ID, PRODUCT_ID, "USD", "1", "2026-04-01", repo);
		expect(price).toBeNull();
	});

	test("returns the single matching entry's unitPrice", async () => {
		const repo: ProductRepository = {
			...makeNullRepo(),
			async findPriceListEntries() {
				return [makeEntry({ unitPrice: "450.000000" })];
			},
		};
		const price = await lookupEffectivePrice(ENTITY_ID, PRODUCT_ID, "USD", "1", "2026-04-01", repo);
		expect(price).toBe("450.000000");
	});

	test("selects highest minQuantity tier when quantity qualifies", async () => {
		// Tier 1: qty >= 1 → $500; Tier 10: qty >= 10 → $420; Tier 100: qty >= 100 → $380
		const repo: ProductRepository = {
			...makeNullRepo(),
			async findPriceListEntries() {
				return [
					makeEntry({ unitPrice: "500.000000", minQuantity: "1.000000" }),
					makeEntry({
						id: "60000000-0000-0000-0000-000000000002" as const,
						unitPrice: "420.000000",
						minQuantity: "10.000000",
					}),
					makeEntry({
						id: "60000000-0000-0000-0000-000000000003" as const,
						unitPrice: "380.000000",
						minQuantity: "100.000000",
					}),
				];
			},
		};
		// qty=50 → qualifies for tiers 1 and 10, picks tier 10 (highest min)
		const price = await lookupEffectivePrice(
			ENTITY_ID,
			PRODUCT_ID,
			"USD",
			"50",
			"2026-04-01",
			repo,
		);
		expect(price).toBe("420.000000");
	});

	test("returns null when quantity is less than all minimum quantities", async () => {
		const repo: ProductRepository = {
			...makeNullRepo(),
			async findPriceListEntries() {
				return [makeEntry({ minQuantity: "10.000000" })];
			},
		};
		// qty=5 < minQuantity=10 → no eligible entry
		const price = await lookupEffectivePrice(ENTITY_ID, PRODUCT_ID, "USD", "5", "2026-04-01", repo);
		expect(price).toBeNull();
	});
});
