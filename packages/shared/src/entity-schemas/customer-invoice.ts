/**
 * Zod schemas for Accounts Receivable entities: customer_invoice, customer_payment.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §4.4.
 *
 * Layer 1 (structural) validation only. Layer 2 (e.g., period open check,
 * credit limit validation, duplicate invoice number) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

const CUSTOMER_INVOICE_STATUSES = [
	"DRAFT",
	"SENT",
	"PARTIALLY_PAID",
	"PAID",
	"VOID",
	"WRITTEN_OFF",
] as const;

const AR_PAYMENT_METHODS = ["WIRE", "CHECK", "ACH", "CREDIT_CARD"] as const;

// ── Customer Invoice Line ─────────────────────────────────────────────────────

export const CustomerInvoiceLineSchema = z.object({
	lineNumber: z.number().int().min(1),
	productId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	accountId: UUIDSchema,
	quantity: z
		.string()
		.regex(/^\d{1,12}(\.\d{1,4})?$/, "Quantity must be a positive decimal")
		.refine((v) => Number.parseFloat(v) > 0, { message: "Quantity must be greater than zero" })
		.optional(),
	unitPrice: MoneyAmountSchema,
	discountPercent: z
		.number()
		.min(0, "Discount cannot be negative")
		.max(100, "Discount cannot exceed 100%")
		.optional()
		.default(0),
	amount: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
	taxCode: z.string().max(20).optional(),
	taxAmount: MoneyAmountSchema.optional(),
	segmentValues: z.record(z.string(), z.string()).optional().default({}),
});

export type CustomerInvoiceLineInput = z.infer<typeof CustomerInvoiceLineSchema>;

// ── Customer Invoice ──────────────────────────────────────────────────────────

export const CreateCustomerInvoiceSchema = z.object({
	entityId: UUIDSchema,
	customerId: UUIDSchema,
	invoiceDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	dueDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	currencyCode: CurrencyCodeSchema,
	fiscalPeriodId: UUIDSchema.optional(),
	salesOrderId: UUIDSchema.optional(),
	paymentTerms: z.string().max(30).optional(),
	notes: z.string().max(10000).optional(),
	lines: z
		.array(CustomerInvoiceLineSchema)
		.min(1, "An invoice must have at least one line")
		.max(200, "Cannot exceed 200 invoice lines"),
});

export type CreateCustomerInvoiceInput = z.infer<typeof CreateCustomerInvoiceSchema>;

export const UpdateCustomerInvoiceSchema = z.object({
	id: UUIDSchema,
	notes: z.string().max(10000).optional(),
	paymentTerms: z.string().max(30).optional(),
	dueDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
});

export type UpdateCustomerInvoiceInput = z.infer<typeof UpdateCustomerInvoiceSchema>;

export const VoidCustomerInvoiceSchema = z.object({
	id: UUIDSchema,
	reason: z.string().min(1, "Void reason is required").max(500),
});

export type VoidCustomerInvoiceInput = z.infer<typeof VoidCustomerInvoiceSchema>;

// ── Customer Payment ──────────────────────────────────────────────────────────

export const CreateCustomerPaymentSchema = z.object({
	entityId: UUIDSchema,
	customerId: UUIDSchema,
	paymentNumber: z
		.string()
		.min(1, "Payment number is required")
		.max(30, "Payment number must be 30 characters or fewer"),
	paymentDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	paymentMethod: z.enum(AR_PAYMENT_METHODS, { error: "Invalid payment method" }),
	currencyCode: CurrencyCodeSchema,
	amount: MoneyAmountSchema,
	reference: z.string().max(100).optional(),
	invoiceApplications: z
		.array(
			z.object({
				customerInvoiceId: UUIDSchema,
				appliedAmount: MoneyAmountSchema,
			}),
		)
		.max(100)
		.optional(),
});

export type CreateCustomerPaymentInput = z.infer<typeof CreateCustomerPaymentSchema>;

// Re-export enums for use in resolvers
export { CUSTOMER_INVOICE_STATUSES, AR_PAYMENT_METHODS };
