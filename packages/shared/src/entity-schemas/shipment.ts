/**
 * Zod schemas for Logistics entities — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §9: carrier, carrier_service, shipment,
 * shipment_line, customs_document.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: pre-shipment
 * compliance check, inventory availability, FK resolution for sales_order and
 * customer) runs server-side and requires WP-3 and WP-5 to be complete.
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

// ── Carrier ───────────────────────────────────────────────────────────────────

const CARRIER_TYPES = ["AIR", "OCEAN", "GROUND", "COURIER", "MULTIMODAL"] as const;

const CarrierBaseSchema = z.object({
	entityId: UUIDSchema,
	code: z
		.string()
		.min(1, "Carrier code is required")
		.max(20, "Carrier code must be 20 characters or fewer")
		.regex(
			/^[A-Z0-9_-]+$/,
			"Carrier code must be uppercase alphanumeric with hyphens or underscores",
		),
	name: z
		.string()
		.min(1, "Carrier name is required")
		.max(255, "Carrier name must be 255 characters or fewer"),
	carrierType: z.enum(CARRIER_TYPES, { error: "Invalid carrier type" }),
	accountNumber: z.string().max(50).optional(),
	website: z.string().url("Must be a valid URL").max(500).optional(),
	trackingUrlTemplate: z.string().max(500).optional(),
});

export const CreateCarrierSchema = CarrierBaseSchema;
export type CreateCarrierInput = z.infer<typeof CreateCarrierSchema>;

export const UpdateCarrierSchema = CarrierBaseSchema.omit({ entityId: true, code: true })
	.partial()
	.extend({ id: UUIDSchema });
export type UpdateCarrierInput = z.infer<typeof UpdateCarrierSchema>;

// ── Carrier Service ───────────────────────────────────────────────────────────

export const CreateCarrierServiceSchema = z.object({
	carrierId: UUIDSchema,
	code: z
		.string()
		.min(1, "Service code is required")
		.max(30, "Service code must be 30 characters or fewer"),
	name: z
		.string()
		.min(1, "Service name is required")
		.max(100, "Service name must be 100 characters or fewer"),
	transitDaysEstimate: z
		.number()
		.int()
		.positive("Transit days must be a positive integer")
		.optional(),
});
export type CreateCarrierServiceInput = z.infer<typeof CreateCarrierServiceSchema>;

// ── Shipment ──────────────────────────────────────────────────────────────────

const SHIPMENT_STATUSES = [
	"DRAFT",
	"PACKED",
	"SHIPPED",
	"IN_TRANSIT",
	"DELIVERED",
	"RETURNED",
	"CANCELLED",
] as const;

const INCOTERMS = [
	"EXW",
	"FCA",
	"CPT",
	"CIP",
	"DAP",
	"DPU",
	"DDP",
	"FAS",
	"FOB",
	"CFR",
	"CIF",
] as const;

/** NUMERIC(12,4) weight — positive */
const WeightSchema = z
	.string()
	.regex(
		/^\d{1,8}(\.\d{1,4})?$/,
		"Weight must be a positive number with up to 8 integer digits and 4 decimal places",
	)
	.refine((v) => Number.parseFloat(v) > 0, "Weight must be greater than zero");

/** NUMERIC(16,4) quantity — positive */
const QuantitySchema = z
	.string()
	.regex(
		/^\d{1,12}(\.\d{1,4})?$/,
		"Quantity must be a positive number with up to 12 integer digits and 4 decimal places",
	)
	.refine((v) => Number.parseFloat(v) > 0, "Quantity must be greater than zero");

const AddressSchema = z.record(z.string(), z.unknown());

const ShipmentBaseSchema = z.object({
	entityId: UUIDSchema,
	shipmentNumber: z
		.string()
		.min(1, "Shipment number is required")
		.max(30, "Shipment number must be 30 characters or fewer"),
	// salesOrderId: FK enforced server-side when WP-5 Sales is complete
	salesOrderId: UUIDSchema.optional(),
	// customerId: FK enforced server-side when WP-5 Sales is complete
	customerId: UUIDSchema.optional(),
	carrierServiceId: UUIDSchema.optional(),
	trackingNumber: z.string().max(100).optional(),
	shipDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	expectedDeliveryDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	shipFromAddress: AddressSchema.optional(),
	shipToAddress: AddressSchema,
	weightKg: WeightSchema.optional(),
	dimensionsCm: z
		.object({
			length: z.number().positive(),
			width: z.number().positive(),
			height: z.number().positive(),
		})
		.optional(),
	shippingCost: MoneyAmountSchema.optional(),
	shippingCostCurrency: CurrencyCodeSchema.optional(),
	insuranceValue: MoneyAmountSchema.optional(),
	insuranceCurrency: CurrencyCodeSchema.optional(),
	incoterm: z.enum(INCOTERMS, { error: "Invalid Incoterm" }).optional(),
	itarCompartmentId: UUIDSchema.optional(),
	notes: z.string().max(5000).optional(),
});

const shippingCostCurrencyRefinement = (data: {
	shippingCost?: string | undefined;
	shippingCostCurrency?: string | undefined;
}): boolean => {
	if (data.shippingCost !== undefined) return data.shippingCostCurrency !== undefined;
	return true;
};

const insuranceCurrencyRefinement = (data: {
	insuranceValue?: string | undefined;
	insuranceCurrency?: string | undefined;
}): boolean => {
	if (data.insuranceValue !== undefined) return data.insuranceCurrency !== undefined;
	return true;
};

export const CreateShipmentSchema = ShipmentBaseSchema.refine(shippingCostCurrencyRefinement, {
	message: "Shipping cost currency is required when shipping cost is provided",
	path: ["shippingCostCurrency"],
}).refine(insuranceCurrencyRefinement, {
	message: "Insurance currency is required when insurance value is provided",
	path: ["insuranceCurrency"],
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

export const UpdateShipmentSchema = ShipmentBaseSchema.omit({
	entityId: true,
	shipmentNumber: true,
})
	.partial()
	.extend({
		id: UUIDSchema,
		status: z.enum(SHIPMENT_STATUSES, { error: "Invalid shipment status" }).optional(),
	})
	.refine(shippingCostCurrencyRefinement, {
		message: "Shipping cost currency is required when shipping cost is provided",
		path: ["shippingCostCurrency"],
	})
	.refine(insuranceCurrencyRefinement, {
		message: "Insurance currency is required when insurance value is provided",
		path: ["insuranceCurrency"],
	});
export type UpdateShipmentInput = z.infer<typeof UpdateShipmentSchema>;

// ── Shipment Line ─────────────────────────────────────────────────────────────

export const ShipmentLineSchema = z.object({
	// salesOrderLineId: FK enforced server-side when WP-5 is complete
	salesOrderLineId: UUIDSchema.optional(),
	inventoryItemId: UUIDSchema.optional(),
	lineNumber: z.number().int().positive("Line number must be a positive integer"),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantity: QuantitySchema,
	unitOfMeasure: z
		.string()
		.min(1, "Unit of measure is required")
		.max(20, "Unit of measure must be 20 characters or fewer"),
	lotId: UUIDSchema.optional(),
	serialNumberId: UUIDSchema.optional(),
});
export type ShipmentLineInput = z.infer<typeof ShipmentLineSchema>;

export const CreateShipmentWithLinesSchema = CreateShipmentSchema.and(
	z.object({
		lines: z
			.array(ShipmentLineSchema)
			.min(1, "At least one shipment line is required")
			.max(500, "Cannot exceed 500 shipment lines"),
	}),
);
export type CreateShipmentWithLinesInput = z.infer<typeof CreateShipmentWithLinesSchema>;

// ── Customs Document ──────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
	"COMMERCIAL_INVOICE",
	"PACKING_LIST",
	"CERTIFICATE_OF_ORIGIN",
	"EXPORT_LICENSE",
	"AES_FILING",
	"CUSTOMS_DECLARATION",
] as const;

const DOCUMENT_STATUSES = ["DRAFT", "FILED", "ACCEPTED", "REJECTED"] as const;

export const CreateCustomsDocumentSchema = z.object({
	shipmentId: UUIDSchema,
	documentType: z.enum(DOCUMENT_TYPES, { error: "Invalid document type" }),
	documentNumber: z.string().max(50).optional(),
	filingDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	documentData: z.record(z.string(), z.unknown()).optional(),
	fileReference: z.string().max(500).optional(),
	itnNumber: z
		.string()
		.max(30)
		.regex(/^X\d{14}$/, "ITN must be in format X followed by 14 digits")
		.optional(),
	htsCodes: z
		.array(
			z
				.string()
				.regex(/^\d{4,10}(\.\d{2})?$/, "HTS code must be 4–10 digits with optional 2-digit suffix"),
		)
		.max(50)
		.optional(),
	declaredValue: MoneyAmountSchema.optional(),
	declaredValueCurrency: CurrencyCodeSchema.optional(),
	notes: z.string().max(5000).optional(),
});
export type CreateCustomsDocumentInput = z.infer<typeof CreateCustomsDocumentSchema>;

export const UpdateCustomsDocumentSchema = CreateCustomsDocumentSchema.omit({
	shipmentId: true,
	documentType: true,
})
	.partial()
	.extend({
		id: UUIDSchema,
		status: z.enum(DOCUMENT_STATUSES, { error: "Invalid document status" }).optional(),
	})
	.refine(
		(data) => {
			if (data.declaredValue !== undefined) return data.declaredValueCurrency !== undefined;
			return true;
		},
		{
			message: "Declared value currency is required when declared value is provided",
			path: ["declaredValueCurrency"],
		},
	);
export type UpdateCustomsDocumentInput = z.infer<typeof UpdateCustomsDocumentSchema>;

// ── Tracking Event ────────────────────────────────────────────────────────────

const TRACKING_EVENT_TYPES = [
	"PICKED_UP",
	"IN_TRANSIT",
	"OUT_FOR_DELIVERY",
	"DELIVERED",
	"EXCEPTION",
	"CUSTOMS_HOLD",
	"CUSTOMS_CLEARED",
] as const;

const TRACKING_SOURCES = ["MANUAL", "CARRIER_API", "EDI"] as const;

export const CreateTrackingEventSchema = z.object({
	shipmentId: UUIDSchema,
	eventTimestamp: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }),
	eventType: z.enum(TRACKING_EVENT_TYPES, { error: "Invalid tracking event type" }),
	location: z.string().max(255).optional(),
	description: z.string().max(500).optional(),
	source: z.enum(TRACKING_SOURCES).optional(),
	rawData: z.record(z.string(), z.unknown()).optional(),
});
export type CreateTrackingEventInput = z.infer<typeof CreateTrackingEventSchema>;
