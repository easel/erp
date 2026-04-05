/**
 * Zod schemas for Quote entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: credit limit,
 * compliance screening, fiscal period) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, UUIDSchema } from "../schemas.js";
import { MoneyAmountSchema } from "../schemas.js";

const QUOTE_LINE_ITEM_TYPES = ["PRODUCT", "SERVICE", "LABOR", "FEE"] as const;

export const QuoteLineItemSchema = z.object({
	productId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantity: z
		.string()
		.regex(/^\d{1,10}(\.\d{1,6})?$/, "Quantity must be a positive decimal number"),
	unitPrice: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
	type: z.enum(QUOTE_LINE_ITEM_TYPES, { error: "Invalid line item type" }),
});

export type QuoteLineItemInput = z.infer<typeof QuoteLineItemSchema>;

export const CreateQuoteSchema = z
	.object({
		customerId: UUIDSchema,
		legalEntityId: UUIDSchema,
		currencyCode: CurrencyCodeSchema,
		validUntil: z
			.string()
			.date("Must be a valid date (YYYY-MM-DD)")
			.refine((d) => new Date(d) > new Date(), "Valid-until date must be in the future"),
		lineItems: z
			.array(QuoteLineItemSchema)
			.min(1, "At least one line item is required")
			.max(500, "Cannot exceed 500 line items"),
		notes: z.string().max(2000, "Notes must be 2000 characters or fewer").optional(),
		reference: z.string().max(100, "Customer reference must be 100 characters or fewer").optional(),
	})
	.refine(
		(data) => {
			// All line items must use the same currency as the quote header
			return data.lineItems.every((item) => item.currencyCode === data.currencyCode);
		},
		{
			message: "All line item currencies must match the quote currency",
			path: ["lineItems"],
		},
	);

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

export const UpdateQuoteSchema = z.object({
	id: UUIDSchema,
	validUntil: z
		.string()
		.date("Must be a valid date (YYYY-MM-DD)")
		.refine((d) => new Date(d) > new Date(), "Valid-until date must be in the future")
		.optional(),
	lineItems: z
		.array(QuoteLineItemSchema)
		.min(1, "At least one line item is required")
		.max(500, "Cannot exceed 500 line items")
		.optional(),
	notes: z.string().max(2000, "Notes must be 2000 characters or fewer").optional(),
	reference: z.string().max(100, "Customer reference must be 100 characters or fewer").optional(),
});

export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>;
