/**
 * Zod schemas for Accounts Payable entities: vendor_bill, payment_batch, payment.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §4.3.
 *
 * Layer 1 (structural) validation only. Layer 2 (e.g., three-way match validation,
 * period open check, duplicate bill detection) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

const VENDOR_BILL_STATUSES = [
	"DRAFT",
	"PENDING_APPROVAL",
	"APPROVED",
	"POSTED",
	"PARTIALLY_PAID",
	"PAID",
	"VOID",
] as const;

const PAYMENT_METHODS = ["CHECK", "WIRE", "ACH", "CREDIT_CARD"] as const;

// ── Vendor Bill Line ──────────────────────────────────────────────────────────

export const VendorBillLineSchema = z.object({
	lineNumber: z.number().int().min(1),
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
	amount: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
	taxCode: z.string().max(20).optional(),
	taxAmount: MoneyAmountSchema.optional(),
	purchaseOrderLineId: UUIDSchema.optional(),
	segmentValues: z.record(z.string(), z.string()).optional().default({}),
});

export type VendorBillLineInput = z.infer<typeof VendorBillLineSchema>;

// ── Vendor Bill ───────────────────────────────────────────────────────────────

export const CreateVendorBillSchema = z.object({
	entityId: UUIDSchema,
	vendorId: UUIDSchema,
	billNumber: z
		.string()
		.min(1, "Bill number is required")
		.max(50, "Bill number must be 50 characters or fewer"),
	billDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	dueDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	currencyCode: CurrencyCodeSchema,
	fiscalPeriodId: UUIDSchema.optional(),
	purchaseOrderId: UUIDSchema.optional(),
	goodsReceiptId: UUIDSchema.optional(),
	paymentTerms: z.string().max(30).optional(),
	notes: z.string().max(10000).optional(),
	lines: z
		.array(VendorBillLineSchema)
		.min(1, "A vendor bill must have at least one line")
		.max(200, "Cannot exceed 200 bill lines"),
});

export type CreateVendorBillInput = z.infer<typeof CreateVendorBillSchema>;

export const UpdateVendorBillSchema = z.object({
	id: UUIDSchema,
	notes: z.string().max(10000).optional(),
	paymentTerms: z.string().max(30).optional(),
	dueDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
});

export type UpdateVendorBillInput = z.infer<typeof UpdateVendorBillSchema>;

export const ApproveVendorBillSchema = z.object({
	id: UUIDSchema,
	fiscalPeriodId: UUIDSchema,
});

export type ApproveVendorBillInput = z.infer<typeof ApproveVendorBillSchema>;

// ── Payment Batch ─────────────────────────────────────────────────────────────

export const CreatePaymentBatchSchema = z.object({
	entityId: UUIDSchema,
	batchNumber: z
		.string()
		.min(1, "Batch number is required")
		.max(30, "Batch number must be 30 characters or fewer"),
	paymentMethod: z.enum(PAYMENT_METHODS, { error: "Invalid payment method" }),
	currencyCode: CurrencyCodeSchema,
	paymentDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
});

export type CreatePaymentBatchInput = z.infer<typeof CreatePaymentBatchSchema>;

// ── Payment (AP) ──────────────────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
	entityId: UUIDSchema,
	vendorId: UUIDSchema,
	paymentNumber: z
		.string()
		.min(1, "Payment number is required")
		.max(30, "Payment number must be 30 characters or fewer"),
	paymentDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	paymentMethod: z.enum(PAYMENT_METHODS, { error: "Invalid payment method" }),
	currencyCode: CurrencyCodeSchema,
	amount: MoneyAmountSchema,
	paymentBatchId: UUIDSchema.optional(),
	reference: z.string().max(100).optional(),
	billApplications: z
		.array(
			z.object({
				vendorBillId: UUIDSchema,
				appliedAmount: MoneyAmountSchema,
			}),
		)
		.min(1, "Must apply payment to at least one bill")
		.max(100),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

export const VoidVendorBillSchema = z.object({
	id: UUIDSchema,
	reason: z.string().min(1, "Void reason is required").max(500),
});

export type VoidVendorBillInput = z.infer<typeof VoidVendorBillSchema>;

// Re-export status enum for use in resolvers
export { VENDOR_BILL_STATUSES, PAYMENT_METHODS };
