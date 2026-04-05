/**
 * Product Catalog Service — product and price list CRUD.
 *
 * Implements SLS-004 (Product Catalog) from SD-003-WP5.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - buildProductRecord: validates uniqueness of product code per entity.
 * - buildPriceListRecord / buildPriceListEntryRecord: construct DB-ready records.
 * - lookupEffectivePrice: finds the best-match price list entry for a product
 *   given a currency, quantity, and date.
 *
 * Ref: SD-002-data-model.md §6.2 (product, price_list, price_list_entry),
 *      SD-003-WP5 SLS-004, ADR-011 (money amounts as NUMERIC(19,6) strings)
 * Issue: hx-31c83b3c
 */

import type {
	CreatePriceListEntryInput,
	CreatePriceListInput,
	CreateProductInput,
	UpdateProductInput,
} from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly productCode: string;
	readonly name: string;
	readonly productType: string;
	readonly unitOfMeasure: string;
	readonly isActive: boolean;
}

export interface PriceListEntrySnapshot {
	readonly id: UUID;
	readonly priceListId: UUID;
	readonly productId: UUID;
	readonly unitPrice: string;
	readonly minQuantity: string;
	readonly effectiveFrom: string;
	readonly effectiveTo: string | null;
}

export interface ProductRepository {
	findByCode(entityId: UUID, productCode: string): Promise<ProductSnapshot | null>;
	findById(entityId: UUID, productId: UUID): Promise<ProductSnapshot | null>;
	findPriceListEntries(
		entityId: UUID,
		productId: UUID,
		currencyCode: string,
		asOfDate: string,
	): Promise<PriceListEntrySnapshot[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB record types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductRecord {
	readonly entityId: UUID;
	readonly productCode: string;
	readonly name: string;
	readonly description: string | null;
	readonly productType: string;
	readonly unitOfMeasure: string;
	readonly revenueAccountId: UUID | null;
	readonly cogsAccountId: UUID | null;
	readonly inventoryItemId: UUID | null;
	readonly itarCompartmentId: UUID | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

export interface ProductUpdateFields {
	readonly name?: string;
	readonly description?: string | null;
	readonly unitOfMeasure?: string;
	readonly revenueAccountId?: UUID | null;
	readonly cogsAccountId?: UUID | null;
	readonly isActive?: boolean;
	readonly updatedBy: UUID;
}

export interface PriceListRecord {
	readonly entityId: UUID;
	readonly code: string;
	readonly name: string;
	readonly currencyCode: string;
	readonly effectiveFrom: string;
	readonly effectiveTo: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

export interface PriceListEntryRecord {
	readonly priceListId: UUID;
	readonly productId: UUID;
	readonly unitPrice: string;
	readonly minQuantity: string;
	readonly effectiveFrom: string;
	readonly effectiveTo: string | null;
	readonly createdBy: UUID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class ProductError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ProductError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-unit arithmetic (NUMERIC(19,6) strings → BigInt)
// ─────────────────────────────────────────────────────────────────────────────

function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB-ready product record from validated CreateProductInput.
 * Throws ProductError if a product with the same code already exists.
 */
export async function buildProductRecord(
	input: CreateProductInput,
	actorId: UUID,
	repo: ProductRepository,
): Promise<ProductRecord> {
	const existing = await repo.findByCode(input.entityId as UUID, input.productCode);
	if (existing) {
		throw new ProductError(
			`Product code '${input.productCode}' already exists in entity ${input.entityId}.`,
			"DUPLICATE_PRODUCT_CODE",
		);
	}
	return {
		entityId: input.entityId as UUID,
		productCode: input.productCode,
		name: input.name,
		description: input.description ?? null,
		productType: input.productType,
		unitOfMeasure: input.unitOfMeasure ?? "EA",
		revenueAccountId: (input.revenueAccountId as UUID | undefined) ?? null,
		cogsAccountId: (input.cogsAccountId as UUID | undefined) ?? null,
		inventoryItemId: (input.inventoryItemId as UUID | undefined) ?? null,
		itarCompartmentId: (input.itarCompartmentId as UUID | undefined) ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Build update fields from validated UpdateProductInput.
 */
export function buildProductUpdateFields(
	input: UpdateProductInput,
	actorId: UUID,
): { productId: UUID; fields: ProductUpdateFields } {
	const fields: ProductUpdateFields = {
		...(input.name !== undefined && { name: input.name }),
		...(input.description !== undefined && { description: input.description ?? null }),
		...(input.unitOfMeasure !== undefined && { unitOfMeasure: input.unitOfMeasure }),
		...(input.revenueAccountId !== undefined && {
			revenueAccountId: (input.revenueAccountId as UUID | undefined) ?? null,
		}),
		...(input.cogsAccountId !== undefined && {
			cogsAccountId: (input.cogsAccountId as UUID | undefined) ?? null,
		}),
		...(input.isActive !== undefined && { isActive: input.isActive }),
		updatedBy: actorId,
	};
	return { productId: input.id as UUID, fields };
}

/**
 * Build a DB-ready price list record.
 */
export function buildPriceListRecord(input: CreatePriceListInput, actorId: UUID): PriceListRecord {
	return {
		entityId: input.entityId as UUID,
		code: input.code,
		name: input.name,
		currencyCode: input.currencyCode,
		effectiveFrom: input.effectiveFrom,
		effectiveTo: input.effectiveTo ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Build a DB-ready price list entry record.
 */
export function buildPriceListEntryRecord(
	input: CreatePriceListEntryInput,
	actorId: UUID,
): PriceListEntryRecord {
	return {
		priceListId: input.priceListId as UUID,
		productId: input.productId as UUID,
		unitPrice: input.unitPrice,
		minQuantity: input.minQuantity ?? "1",
		effectiveFrom: input.effectiveFrom,
		effectiveTo: input.effectiveTo ?? null,
		createdBy: actorId,
	};
}

/**
 * Look up the effective unit price for a product on a given date and quantity.
 *
 * Selection rules:
 * 1. Only entries effective on asOfDate (effectiveFrom <= asOfDate, effectiveTo IS NULL or >= asOfDate)
 * 2. Only entries where minQuantity <= requestedQuantity
 * 3. Among remaining candidates, pick the entry with the highest minQuantity (best tiered price)
 *
 * Returns null if no matching price list entry exists.
 */
export async function lookupEffectivePrice(
	entityId: UUID,
	productId: UUID,
	currencyCode: string,
	quantity: string,
	asOfDate: string,
	repo: ProductRepository,
): Promise<string | null> {
	const entries = await repo.findPriceListEntries(entityId, productId, currencyCode, asOfDate);
	if (entries.length === 0) return null;

	const requestedQty = toMicro(quantity.includes(".") ? quantity : `${quantity}.000000`);

	// Filter entries where minQuantity <= requestedQuantity
	const eligible = entries.filter((e) => {
		const minQty = toMicro(e.minQuantity.includes(".") ? e.minQuantity : `${e.minQuantity}.000000`);
		return minQty <= requestedQty;
	});

	if (eligible.length === 0) return null;

	// Pick entry with highest minQuantity (most specific tier)
	const best = eligible.reduce((prev, curr) => {
		const prevMin = toMicro(
			prev.minQuantity.includes(".") ? prev.minQuantity : `${prev.minQuantity}.000000`,
		);
		const currMin = toMicro(
			curr.minQuantity.includes(".") ? curr.minQuantity : `${curr.minQuantity}.000000`,
		);
		return currMin > prevMin ? curr : prev;
	});

	return best.unitPrice;
}
