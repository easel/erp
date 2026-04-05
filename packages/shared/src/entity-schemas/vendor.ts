/**
 * Zod schemas for Vendor entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent) runs server-side.
 */
import { z } from "zod";
import { CountryCodeSchema, CurrencyCodeSchema, UUIDSchema } from "../schemas.js";

const VENDOR_TYPES = ["SUPPLIER", "CONTRACTOR", "CONSULTANT", "PARTNER"] as const;
const PAYMENT_TERMS = ["NET_15", "NET_30", "NET_45", "NET_60", "NET_90", "IMMEDIATE"] as const;

export const CreateVendorSchema = z.object({
	name: z
		.string()
		.min(1, "Vendor name is required")
		.max(255, "Name must be 255 characters or fewer"),
	legalName: z
		.string()
		.min(1, "Legal name is required")
		.max(255, "Legal name must be 255 characters or fewer"),
	vendorType: z.enum(VENDOR_TYPES, { error: "Invalid vendor type" }),
	taxId: z.string().max(50, "Tax ID must be 50 characters or fewer").optional(),
	countryCode: CountryCodeSchema,
	currencyCode: CurrencyCodeSchema,
	paymentTerms: z.enum(PAYMENT_TERMS, { error: "Invalid payment terms" }),
	email: z.string().email("Must be a valid email address").optional(),
	phone: z
		.string()
		.regex(/^\+?[\d\s\-().]{7,25}$/, "Must be a valid phone number")
		.optional(),
	address: z
		.object({
			line1: z.string().min(1, "Address line 1 is required").max(255),
			line2: z.string().max(255).optional(),
			city: z.string().min(1, "City is required").max(100),
			region: z.string().max(100).optional(),
			postalCode: z.string().max(20, "Postal code must be 20 characters or fewer").optional(),
			countryCode: CountryCodeSchema,
		})
		.optional(),
	notes: z.string().max(2000, "Notes must be 2000 characters or fewer").optional(),
});

export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = CreateVendorSchema.partial().extend({
	id: UUIDSchema,
});

export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
