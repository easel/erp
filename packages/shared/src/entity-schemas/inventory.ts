/**
 * Zod schemas for Inventory entities — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §5.1 inventory_item, inventory_location,
 * inventory_level, lot, serial_number.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: duplicate
 * item_code, ITAR compartment access, concurrent stock updates) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

/** NUMERIC(16,4) quantity — non-negative */
const StockQuantitySchema = z
	.string()
	.regex(
		/^\d{1,12}(\.\d{1,4})?$/,
		"Quantity must be a non-negative number with up to 12 integer digits and 4 decimal places",
	);

// ── Inventory Item ────────────────────────────────────────────────────────────

const InventoryItemBaseSchema = z.object({
	entityId: UUIDSchema,
	itemCode: z
		.string()
		.min(1, "Item code is required")
		.max(30, "Item code must be 30 characters or fewer")
		.regex(/^[A-Z0-9_-]+$/, "Item code must be uppercase alphanumeric with hyphens or underscores"),
	name: z
		.string()
		.min(1, "Item name is required")
		.max(255, "Item name must be 255 characters or fewer"),
	description: z.string().optional(),
	category: z.string().max(50).optional(),
	unitOfMeasure: z
		.string()
		.min(1, "Unit of measure is required")
		.max(20, "Unit of measure must be 20 characters or fewer"),
	isSerialized: z.boolean().optional(),
	isLotTracked: z.boolean().optional(),
	standardCost: MoneyAmountSchema.optional(),
	costCurrencyCode: CurrencyCodeSchema.optional(),
	reorderPoint: StockQuantitySchema.optional(),
	reorderQuantity: StockQuantitySchema.optional(),
	itarCompartmentId: UUIDSchema.optional(),
});

const costCurrencyRefinement = (data: {
	standardCost?: string | undefined;
	costCurrencyCode?: string | undefined;
}): boolean => {
	if (data.standardCost !== undefined) return data.costCurrencyCode !== undefined;
	return true;
};
const costCurrencyError = {
	message: "Cost currency code is required when standard cost is provided",
	path: ["costCurrencyCode"],
};

export const CreateInventoryItemSchema = InventoryItemBaseSchema.refine(
	costCurrencyRefinement,
	costCurrencyError,
);

export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

export const UpdateInventoryItemSchema = InventoryItemBaseSchema.omit({
	entityId: true,
	itemCode: true,
})
	.partial()
	.extend({ id: UUIDSchema })
	.refine(costCurrencyRefinement, costCurrencyError);

export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

// ── Inventory Location ────────────────────────────────────────────────────────

export const CreateInventoryLocationSchema = z.object({
	entityId: UUIDSchema,
	locationCode: z
		.string()
		.min(1, "Location code is required")
		.max(30, "Location code must be 30 characters or fewer")
		.regex(
			/^[A-Z0-9_-]+$/,
			"Location code must be uppercase alphanumeric with hyphens or underscores",
		),
	name: z
		.string()
		.min(1, "Location name is required")
		.max(255, "Location name must be 255 characters or fewer"),
	address: z.record(z.string(), z.unknown()).optional(),
	itarCompartmentId: UUIDSchema.optional(),
});

export type CreateInventoryLocationInput = z.infer<typeof CreateInventoryLocationSchema>;

// ── Lot ───────────────────────────────────────────────────────────────────────

const LOT_STATUSES = ["AVAILABLE", "QUARANTINED", "EXPIRED", "CONSUMED"] as const;

export const CreateLotSchema = z.object({
	entityId: UUIDSchema,
	inventoryItemId: UUIDSchema,
	lotNumber: z
		.string()
		.min(1, "Lot number is required")
		.max(50, "Lot number must be 50 characters or fewer"),
	manufactureDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	expiryDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	supplierLotNumber: z.string().max(50).optional(),
	status: z.enum(LOT_STATUSES, { error: "Invalid lot status" }).optional(),
});

export type CreateLotInput = z.infer<typeof CreateLotSchema>;

// ── Serial Number ─────────────────────────────────────────────────────────────

const SERIAL_STATUSES = ["IN_STOCK", "RESERVED", "SHIPPED", "RETURNED", "SCRAPPED"] as const;

export const CreateSerialNumberSchema = z.object({
	entityId: UUIDSchema,
	inventoryItemId: UUIDSchema,
	serialNumber: z
		.string()
		.min(1, "Serial number is required")
		.max(100, "Serial number must be 100 characters or fewer"),
	lotId: UUIDSchema.optional(),
	locationId: UUIDSchema.optional(),
	status: z.enum(SERIAL_STATUSES, { error: "Invalid serial number status" }).optional(),
});

export type CreateSerialNumberInput = z.infer<typeof CreateSerialNumberSchema>;
