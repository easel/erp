/**
 * Zod schemas for Vendor entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §5.2 vendor table.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: compliance
 * screening, duplicate vendor_code check) runs server-side.
 */
import { z } from "zod";
import { CountryCodeSchema, CurrencyCodeSchema, UUIDSchema } from "../schemas.js";

const PAYMENT_METHODS = ["CHECK", "WIRE", "ACH"] as const;
const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"] as const;

export const CreateVendorSchema = z.object({
	entityId: UUIDSchema,
	vendorCode: z
		.string()
		.min(1, "Vendor code is required")
		.max(20, "Vendor code must be 20 characters or fewer")
		.regex(
			/^[A-Z0-9_-]+$/,
			"Vendor code must be uppercase alphanumeric with hyphens or underscores",
		),
	legalName: z
		.string()
		.min(1, "Legal name is required")
		.max(255, "Legal name must be 255 characters or fewer"),
	tradeName: z.string().max(255, "Trade name must be 255 characters or fewer").optional(),
	countryCode: CountryCodeSchema,
	taxId: z.string().max(50, "Tax ID must be 50 characters or fewer").optional(),
	paymentTerms: z.string().max(30, "Payment terms must be 30 characters or fewer").optional(),
	defaultCurrencyCode: CurrencyCodeSchema,
	defaultPaymentMethod: z.enum(PAYMENT_METHODS, { error: "Invalid payment method" }).optional(),
	riskRating: z.enum(RISK_RATINGS, { error: "Invalid risk rating" }).optional(),
	website: z.string().url("Must be a valid URL").max(500).optional(),
	notes: z.string().max(5000, "Notes must be 5000 characters or fewer").optional(),
});

export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = CreateVendorSchema.omit({ entityId: true, vendorCode: true })
	.partial()
	.extend({ id: UUIDSchema });

export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;

// ── Vendor Contact ────────────────────────────────────────────────────────────

export const CreateVendorContactSchema = z.object({
	vendorId: UUIDSchema,
	firstName: z.string().min(1).max(100),
	lastName: z.string().min(1).max(100),
	email: z.string().email("Must be a valid email address").optional(),
	phone: z
		.string()
		.regex(/^\+?[\d\s\-().]{7,25}$/, "Must be a valid phone number")
		.optional(),
	roleTitle: z.string().max(100).optional(),
	isPrimary: z.boolean().optional(),
});

export type CreateVendorContactInput = z.infer<typeof CreateVendorContactSchema>;

// ── Vendor Address ────────────────────────────────────────────────────────────

const ADDRESS_TYPES = ["BILLING", "REMITTANCE", "SHIPPING"] as const;

export const CreateVendorAddressSchema = z.object({
	vendorId: UUIDSchema,
	addressType: z.enum(ADDRESS_TYPES, { error: "Invalid address type" }),
	addressLine1: z.string().min(1).max(255),
	addressLine2: z.string().max(255).optional(),
	city: z.string().min(1).max(100),
	stateProvince: z.string().max(100).optional(),
	postalCode: z.string().max(20).optional(),
	countryCode: CountryCodeSchema,
	isPrimary: z.boolean().optional(),
});

export type CreateVendorAddressInput = z.infer<typeof CreateVendorAddressSchema>;
