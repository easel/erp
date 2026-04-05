/**
 * Zod schemas for Sales entities — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §6: customer, customer_address, product,
 * price_list, price_list_entry, quote, quote_line, sales_order,
 * sales_order_line, return_authorization, return_authorization_line.
 *
 * Covers SLS-001 (Quotes), SLS-002 (Sales Orders + RMA),
 * SLS-003 (Customer Master), SLS-004 (Product Catalog).
 *
 * Layer 1 (structural) validation only. Layer 2 (credit limit check,
 * compliance screening, inventory availability, fiscal period) runs server-side.
 */
import { z } from "zod";
import {
	CountryCodeSchema,
	CurrencyCodeSchema,
	MoneyAmountSchema,
	UUIDSchema,
} from "../schemas.js";

// ── Customer Master ─────────────────────────────────────────────────────────────

export const CUSTOMER_RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"] as const;
export type CustomerRiskRating = (typeof CUSTOMER_RISK_RATINGS)[number];

export const PAYMENT_TERMS = [
	"NET15",
	"NET30",
	"NET45",
	"NET60",
	"NET90",
	"DUE_ON_RECEIPT",
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const CreateCustomerSchema = z.object({
	entityId: UUIDSchema,
	customerCode: z
		.string()
		.min(1, "Customer code is required")
		.max(20, "Customer code must be 20 characters or fewer")
		.regex(
			/^[A-Z0-9_-]+$/,
			"Customer code must be uppercase alphanumeric, hyphens, or underscores",
		),
	legalName: z
		.string()
		.min(1, "Legal name is required")
		.max(255, "Legal name must be 255 characters or fewer"),
	tradeName: z.string().max(255, "Trade name must be 255 characters or fewer").optional(),
	countryCode: CountryCodeSchema,
	taxId: z.string().max(50, "Tax ID must be 50 characters or fewer").optional(),
	paymentTerms: z.string().max(30, "Payment terms must be 30 characters or fewer").default("NET30"),
	creditLimit: MoneyAmountSchema.optional(),
	creditLimitCurrency: CurrencyCodeSchema.optional(),
	defaultCurrencyCode: CurrencyCodeSchema,
	riskRating: z.enum(CUSTOMER_RISK_RATINGS, { error: "Invalid risk rating" }).optional(),
	website: z.string().max(500, "Website must be 500 characters or fewer").optional(),
	notes: z.string().max(5000, "Notes must be 5000 characters or fewer").optional(),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = z.object({
	id: UUIDSchema,
	legalName: z.string().min(1).max(255).optional(),
	tradeName: z.string().max(255).optional(),
	paymentTerms: z.string().max(30).optional(),
	creditLimit: MoneyAmountSchema.optional(),
	creditLimitCurrency: CurrencyCodeSchema.optional(),
	defaultCurrencyCode: CurrencyCodeSchema.optional(),
	riskRating: z.enum(CUSTOMER_RISK_RATINGS).optional(),
	website: z.string().max(500).optional(),
	notes: z.string().max(5000).optional(),
	isActive: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

export const ADDRESS_TYPES = ["BILLING", "SHIPPING", "BOTH"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const CreateCustomerAddressSchema = z.object({
	customerId: UUIDSchema,
	addressType: z.enum(ADDRESS_TYPES, { error: "Invalid address type" }),
	addressLine1: z
		.string()
		.min(1, "Address line 1 is required")
		.max(255, "Address line 1 must be 255 characters or fewer"),
	addressLine2: z.string().max(255, "Address line 2 must be 255 characters or fewer").optional(),
	city: z.string().min(1, "City is required").max(100, "City must be 100 characters or fewer"),
	stateProvince: z.string().max(100, "State/province must be 100 characters or fewer").optional(),
	postalCode: z.string().max(20, "Postal code must be 20 characters or fewer").optional(),
	countryCode: CountryCodeSchema,
	isDefault: z.boolean().default(false),
});

export type CreateCustomerAddressInput = z.infer<typeof CreateCustomerAddressSchema>;

// ── Product Catalog ─────────────────────────────────────────────────────────────

export const PRODUCT_TYPES = ["GOOD", "SERVICE", "SUBSCRIPTION"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const CreateProductSchema = z.object({
	entityId: UUIDSchema,
	productCode: z
		.string()
		.min(1, "Product code is required")
		.max(30, "Product code must be 30 characters or fewer")
		.regex(/^[A-Z0-9_-]+$/, "Product code must be uppercase alphanumeric, hyphens, or underscores"),
	name: z
		.string()
		.min(1, "Product name is required")
		.max(255, "Product name must be 255 characters or fewer"),
	description: z.string().max(5000, "Description must be 5000 characters or fewer").optional(),
	productType: z.enum(PRODUCT_TYPES, { error: "Invalid product type" }),
	unitOfMeasure: z.string().max(20, "Unit of measure must be 20 characters or fewer").default("EA"),
	revenueAccountId: UUIDSchema.optional(),
	cogsAccountId: UUIDSchema.optional(),
	inventoryItemId: UUIDSchema.optional(),
	itarCompartmentId: UUIDSchema.optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z.object({
	id: UUIDSchema,
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(5000).optional(),
	unitOfMeasure: z.string().max(20).optional(),
	revenueAccountId: UUIDSchema.optional(),
	cogsAccountId: UUIDSchema.optional(),
	isActive: z.boolean().optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const CreatePriceListSchema = z
	.object({
		entityId: UUIDSchema,
		code: z
			.string()
			.min(1, "Price list code is required")
			.max(30, "Price list code must be 30 characters or fewer"),
		name: z
			.string()
			.min(1, "Price list name is required")
			.max(100, "Price list name must be 100 characters or fewer"),
		currencyCode: CurrencyCodeSchema,
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	})
	.refine(
		(data) => {
			if (data.effectiveTo === undefined) return true;
			return new Date(data.effectiveTo) > new Date(data.effectiveFrom);
		},
		{ message: "Effective-to date must be after effective-from date", path: ["effectiveTo"] },
	);

export type CreatePriceListInput = z.infer<typeof CreatePriceListSchema>;

export const CreatePriceListEntrySchema = z
	.object({
		priceListId: UUIDSchema,
		productId: UUIDSchema,
		unitPrice: MoneyAmountSchema,
		minQuantity: z
			.string()
			.regex(/^\d{1,10}(\.\d{1,4})?$/, "Min quantity must be a positive decimal")
			.default("1"),
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	})
	.refine(
		(data) => {
			if (data.effectiveTo === undefined) return true;
			return new Date(data.effectiveTo) > new Date(data.effectiveFrom);
		},
		{ message: "Effective-to date must be after effective-from date", path: ["effectiveTo"] },
	);

export type CreatePriceListEntryInput = z.infer<typeof CreatePriceListEntrySchema>;

// ── Quote ───────────────────────────────────────────────────────────────────────

export const QUOTE_STATUSES = [
	"DRAFT",
	"SENT",
	"ACCEPTED",
	"REJECTED",
	"EXPIRED",
	"CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_LINE_TYPES = ["PRODUCT", "SERVICE", "LABOR", "FEE"] as const;
export type QuoteLineType = (typeof QUOTE_LINE_TYPES)[number];

export const CreateQuoteLineSchema = z.object({
	productId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantity: z
		.string()
		.regex(/^\d{1,10}(\.\d{1,6})?$/, "Quantity must be a positive decimal number")
		.refine((v) => Number(v) > 0, "Quantity must be greater than zero"),
	unitPrice: MoneyAmountSchema,
	discountPercent: z
		.number()
		.min(0, "Discount cannot be negative")
		.max(100, "Discount cannot exceed 100%")
		.default(0),
	taxCode: z.string().max(20, "Tax code must be 20 characters or fewer").optional(),
	currencyCode: CurrencyCodeSchema,
});

export type CreateQuoteLineInput = z.infer<typeof CreateQuoteLineSchema>;

export const CreateSalesQuoteSchema = z
	.object({
		entityId: UUIDSchema,
		customerId: UUIDSchema,
		currencyCode: CurrencyCodeSchema,
		quoteDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		validUntil: z
			.string()
			.date("Must be a valid date (YYYY-MM-DD)")
			.refine((d) => new Date(d) > new Date(), "Valid-until date must be in the future"),
		opportunityId: UUIDSchema.optional(),
		lineItems: z
			.array(CreateQuoteLineSchema)
			.min(1, "At least one line item is required")
			.max(500, "Cannot exceed 500 line items"),
		notes: z.string().max(2000, "Notes must be 2000 characters or fewer").optional(),
		reference: z.string().max(100, "Customer reference must be 100 characters or fewer").optional(),
	})
	.refine((data) => data.lineItems.every((item) => item.currencyCode === data.currencyCode), {
		message: "All line item currencies must match the quote currency",
		path: ["lineItems"],
	});

export type CreateSalesQuoteInput = z.infer<typeof CreateSalesQuoteSchema>;

// ── Sales Order ─────────────────────────────────────────────────────────────────

export const SALES_ORDER_STATUSES = [
	"DRAFT",
	"CONFIRMED",
	"PENDING_COMPLIANCE_CHECK",
	"RELEASED_TO_FULFILLMENT",
	"PARTIALLY_SHIPPED",
	"SHIPPED",
	"INVOICED",
	"CLOSED",
	"CANCELLED",
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const CreateSalesOrderLineSchema = z.object({
	productId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantityOrdered: z
		.string()
		.regex(/^\d{1,10}(\.\d{1,6})?$/, "Quantity must be a positive decimal number")
		.refine((v) => Number(v) > 0, "Quantity must be greater than zero"),
	unitPrice: MoneyAmountSchema,
	discountPercent: z
		.number()
		.min(0, "Discount cannot be negative")
		.max(100, "Discount cannot exceed 100%")
		.default(0),
	taxCode: z.string().max(20).optional(),
	currencyCode: CurrencyCodeSchema,
	accountId: UUIDSchema.optional(),
});

export type CreateSalesOrderLineInput = z.infer<typeof CreateSalesOrderLineSchema>;

export const CreateSalesOrderSchema = z
	.object({
		entityId: UUIDSchema,
		customerId: UUIDSchema,
		quoteId: UUIDSchema.optional(),
		currencyCode: CurrencyCodeSchema,
		orderDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		requiredDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
		shippingAddressId: UUIDSchema.optional(),
		billingAddressId: UUIDSchema.optional(),
		paymentTerms: z.string().max(30).optional(),
		lineItems: z
			.array(CreateSalesOrderLineSchema)
			.min(1, "At least one line item is required")
			.max(500, "Cannot exceed 500 line items"),
		notes: z.string().max(2000).optional(),
	})
	.refine(
		(data) => {
			if (data.requiredDate === undefined) return true;
			return new Date(data.requiredDate) >= new Date(data.orderDate);
		},
		{ message: "Required date must be on or after order date", path: ["requiredDate"] },
	)
	.refine((data) => data.lineItems.every((item) => item.currencyCode === data.currencyCode), {
		message: "All line item currencies must match the order currency",
		path: ["lineItems"],
	});

export type CreateSalesOrderInput = z.infer<typeof CreateSalesOrderSchema>;

// ── Return Merchandise Authorization ───────────────────────────────────────────

export const RETURN_STATUSES = [
	"REQUESTED",
	"APPROVED",
	"RECEIVED",
	"INSPECTED",
	"RESOLVED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_DISPOSITIONS = ["RESTOCK", "SCRAP", "REPAIR"] as const;
export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

export const CreateReturnAuthorizationLineSchema = z
	.object({
		salesOrderLineId: UUIDSchema,
		productId: UUIDSchema.optional(),
		quantityReturned: z
			.string()
			.regex(/^\d{1,10}(\.\d{1,6})?$/, "Quantity must be a positive decimal number"),
		disposition: z.enum(RETURN_DISPOSITIONS, { error: "Invalid disposition" }).optional(),
		creditAmount: MoneyAmountSchema.optional(),
		creditCurrencyCode: CurrencyCodeSchema.optional(),
	})
	.refine(
		(data) => {
			// If credit amount is specified, currency must also be specified
			if (data.creditAmount !== undefined) return data.creditCurrencyCode !== undefined;
			return true;
		},
		{
			message: "Credit currency code is required when credit amount is specified",
			path: ["creditCurrencyCode"],
		},
	);

export type CreateReturnAuthorizationLineInput = z.infer<
	typeof CreateReturnAuthorizationLineSchema
>;

export const CreateReturnAuthorizationSchema = z.object({
	entityId: UUIDSchema,
	salesOrderId: UUIDSchema,
	customerId: UUIDSchema,
	reason: z.string().max(2000, "Reason must be 2000 characters or fewer").optional(),
	lines: z
		.array(CreateReturnAuthorizationLineSchema)
		.min(1, "At least one return line is required")
		.max(200, "Cannot exceed 200 return lines"),
});

export type CreateReturnAuthorizationInput = z.infer<typeof CreateReturnAuthorizationSchema>;
