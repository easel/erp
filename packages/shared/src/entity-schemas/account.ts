/**
 * Zod schemas for Chart of Accounts (COA) entities.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §4.1.
 *
 * Layer 1 (structural) validation only. Layer 2 (e.g., circular parent check,
 * duplicate account_number) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, UUIDSchema } from "../schemas.js";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const;

export const CreateAccountSchema = z.object({
	entityId: UUIDSchema,
	accountNumber: z
		.string()
		.min(1, "Account number is required")
		.max(30, "Account number must be 30 characters or fewer"),
	name: z
		.string()
		.min(1, "Account name is required")
		.max(255, "Account name must be 255 characters or fewer"),
	accountType: z.enum(ACCOUNT_TYPES, { error: "Invalid account type" }),
	normalBalance: z.enum(NORMAL_BALANCES, { error: "Normal balance must be DEBIT or CREDIT" }),
	parentAccountId: UUIDSchema.optional(),
	isHeader: z.boolean().optional().default(false),
	currencyCode: CurrencyCodeSchema.optional(),
	itarCompartmentId: UUIDSchema.optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = z.object({
	id: UUIDSchema,
	name: z
		.string()
		.min(1, "Account name is required")
		.max(255, "Account name must be 255 characters or fewer")
		.optional(),
	isHeader: z.boolean().optional(),
	isActive: z.boolean().optional(),
	parentAccountId: UUIDSchema.optional(),
	itarCompartmentId: UUIDSchema.optional(),
});

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

// ── Account Segment ───────────────────────────────────────────────────────────

export const CreateAccountSegmentSchema = z.object({
	entityId: UUIDSchema,
	code: z
		.string()
		.min(1, "Segment code is required")
		.max(30, "Segment code must be 30 characters or fewer"),
	name: z
		.string()
		.min(1, "Segment name is required")
		.max(100, "Segment name must be 100 characters or fewer"),
	displayOrder: z.number().int().min(0).optional().default(0),
	isRequired: z.boolean().optional().default(false),
});

export type CreateAccountSegmentInput = z.infer<typeof CreateAccountSegmentSchema>;

export const CreateAccountSegmentValueSchema = z.object({
	segmentId: UUIDSchema,
	code: z.string().min(1, "Code is required").max(30, "Code must be 30 characters or fewer"),
	name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
});

export type CreateAccountSegmentValueInput = z.infer<typeof CreateAccountSegmentValueSchema>;

// ── Account Mapping ───────────────────────────────────────────────────────────

export const CreateAccountMappingSchema = z
	.object({
		sourceEntityId: UUIDSchema,
		sourceAccountId: UUIDSchema,
		targetEntityId: UUIDSchema,
		targetAccountId: UUIDSchema,
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	})
	.refine((data) => data.sourceEntityId !== data.targetEntityId, {
		message: "Source and target entities must differ",
		path: ["targetEntityId"],
	});

export type CreateAccountMappingInput = z.infer<typeof CreateAccountMappingSchema>;
