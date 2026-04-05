/**
 * Zod schemas for Purchase Order entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §5.3 purchase_order / purchase_order_line.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: vendor
 * compliance screening, period open check, duplicate po_number) runs server-side.
 *
 * PO approval triggers compliance screening (WP-3 integration, implemented in SCM-WORKFLOW).
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

/** NUMERIC(16,4) quantity — positive (> 0), up to 12 integer digits and 4 decimal places */
const QuantitySchema = z
	.string()
	.regex(
		/^\d{1,12}(\.\d{1,4})?$/,
		"Quantity must be a positive number with up to 12 integer digits and 4 decimal places",
	)
	.refine((v) => Number.parseFloat(v) > 0, "Quantity must be greater than zero");

/** NUMERIC(18,10) exchange rate — positive */
const ExchangeRateSchema = z
	.string()
	.regex(/^\d{1,8}(\.\d{1,10})?$/, "Exchange rate must be a positive decimal");

export const PurchaseOrderLineSchema = z.object({
	lineNumber: z.number().int().positive("Line number must be a positive integer"),
	inventoryItemId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantityOrdered: QuantitySchema,
	unitOfMeasure: z
		.string()
		.min(1, "Unit of measure is required")
		.max(20, "Unit of measure must be 20 characters or fewer"),
	unitPrice: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
	taxCode: z.string().max(20).optional(),
	// accountId: expense/asset GL account — FK enforced server-side (WP-2 account table)
	accountId: UUIDSchema.optional(),
	requiredDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
});

export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineSchema>;

export const CreatePurchaseOrderSchema = z
	.object({
		entityId: UUIDSchema,
		vendorId: UUIDSchema,
		poNumber: z
			.string()
			.min(1, "PO number is required")
			.max(30, "PO number must be 30 characters or fewer"),
		poDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		expectedDeliveryDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
		currencyCode: CurrencyCodeSchema,
		exchangeRate: ExchangeRateSchema.optional(),
		paymentTerms: z.string().max(30).optional(),
		shipToAddress: z.record(z.string(), z.unknown()).optional(),
		notes: z.string().max(5000).optional(),
		itarCompartmentId: UUIDSchema.optional(),
		lineItems: z
			.array(PurchaseOrderLineSchema)
			.min(1, "At least one line item is required")
			.max(500, "Cannot exceed 500 line items"),
	})
	.refine(
		(data) => {
			// All line items must use the same currency as the PO header
			return data.lineItems.every((item) => item.currencyCode === data.currencyCode);
		},
		{
			message: "All line item currencies must match the PO currency",
			path: ["lineItems"],
		},
	)
	.refine(
		(data) => {
			// Line numbers must be unique
			const lineNumbers = data.lineItems.map((l) => l.lineNumber);
			return new Set(lineNumbers).size === lineNumbers.length;
		},
		{
			message: "Line numbers must be unique within the purchase order",
			path: ["lineItems"],
		},
	);

export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

/** Full PO lifecycle statuses — state machine enforced server-side. */
export const PO_STATUSES = [
	"DRAFT",
	"PENDING_APPROVAL",
	"APPROVED",
	"SENT",
	"PARTIALLY_RECEIVED",
	"CLOSED",
	"CANCELLED",
	"ON_HOLD",
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

const PO_EDITABLE_STATUSES = ["DRAFT", "PENDING_APPROVAL"] as const;

export const UpdatePurchaseOrderSchema = z.object({
	id: UUIDSchema,
	expectedDeliveryDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	paymentTerms: z.string().max(30).optional(),
	shipToAddress: z.record(z.string(), z.unknown()).optional(),
	notes: z.string().max(5000).optional(),
	// Status transitions (DRAFT → PENDING_APPROVAL) validated here; full state
	// machine enforced server-side.
	status: z.enum(PO_EDITABLE_STATUSES).optional(),
});

export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>;

/**
 * ApprovePurchaseOrderSchema — action payload for the PO approval step.
 * Transitions the PO from PENDING_APPROVAL → APPROVED (or ON_HOLD if
 * vendor compliance screening flags a match).
 * Layer 1 validation only; state machine + screening runs server-side.
 */
export const ApprovePurchaseOrderSchema = z.object({
	/** PO to approve */
	id: UUIDSchema,
	/** User performing the approval */
	approverId: UUIDSchema,
	/** Optional approval notes */
	notes: z.string().max(5000).optional(),
});
export type ApprovePurchaseOrderInput = z.infer<typeof ApprovePurchaseOrderSchema>;

/**
 * SubmitPurchaseOrderSchema — submit a DRAFT PO for approval.
 * Transitions DRAFT → PENDING_APPROVAL.
 */
export const SubmitPurchaseOrderSchema = z.object({
	id: UUIDSchema,
	submittedBy: UUIDSchema,
});
export type SubmitPurchaseOrderInput = z.infer<typeof SubmitPurchaseOrderSchema>;

/**
 * SendPurchaseOrderSchema — send an APPROVED PO to the vendor.
 * Transitions APPROVED → SENT.
 */
export const SendPurchaseOrderSchema = z.object({
	id: UUIDSchema,
	sentBy: UUIDSchema,
});
export type SendPurchaseOrderInput = z.infer<typeof SendPurchaseOrderSchema>;
