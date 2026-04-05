/**
 * Zod schemas for CRM entities — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §7: crm_company, crm_contact, company_relationship,
 * pipeline_stage, opportunity, opportunity_line, activity, lead.
 *
 * Covers CRM-001 (Contacts & companies), CRM-002 (Pipeline management),
 * CRM-003 (Activities).
 *
 * Layer 1 (structural) validation only. Layer 2 (duplicate detection,
 * pipeline stage transition rules, owner validation) runs server-side.
 */
import { z } from "zod";
import {
	CountryCodeSchema,
	CurrencyCodeSchema,
	MoneyAmountSchema,
	UUIDSchema,
} from "../schemas.js";

// ── CRM Company ─────────────────────────────────────────────────────────────────

export const CRM_LEAD_SOURCES = [
	"WEBSITE",
	"TRADE_SHOW",
	"REFERRAL",
	"COLD_OUTREACH",
	"PARTNER",
	"ADVERTISING",
	"OTHER",
] as const;
export type CrmLeadSource = (typeof CRM_LEAD_SOURCES)[number];

export const CreateCrmCompanySchema = z.object({
	entityId: UUIDSchema,
	name: z
		.string()
		.min(1, "Company name is required")
		.max(255, "Company name must be 255 characters or fewer"),
	domain: z.string().max(255, "Domain must be 255 characters or fewer").optional(),
	industry: z.string().max(100, "Industry must be 100 characters or fewer").optional(),
	employeeCountRange: z
		.string()
		.max(20, "Employee count range must be 20 characters or fewer")
		.optional(),
	annualRevenueRange: z
		.string()
		.max(30, "Annual revenue range must be 30 characters or fewer")
		.optional(),
	countryCode: CountryCodeSchema.optional(),
	phone: z.string().max(50, "Phone must be 50 characters or fewer").optional(),
	website: z.string().max(500, "Website must be 500 characters or fewer").optional(),
	customerId: UUIDSchema.optional(),
	vendorId: UUIDSchema.optional(),
	ownerUserId: UUIDSchema.optional(),
});

export type CreateCrmCompanyInput = z.infer<typeof CreateCrmCompanySchema>;

export const UpdateCrmCompanySchema = z.object({
	id: UUIDSchema,
	name: z.string().min(1).max(255).optional(),
	domain: z.string().max(255).optional(),
	industry: z.string().max(100).optional(),
	countryCode: CountryCodeSchema.optional(),
	phone: z.string().max(50).optional(),
	website: z.string().max(500).optional(),
	ownerUserId: UUIDSchema.optional(),
	customerId: UUIDSchema.optional(),
});

export type UpdateCrmCompanyInput = z.infer<typeof UpdateCrmCompanySchema>;

// ── CRM Contact ─────────────────────────────────────────────────────────────────

export const CreateCrmContactSchema = z.object({
	entityId: UUIDSchema,
	crmCompanyId: UUIDSchema.optional(),
	firstName: z
		.string()
		.min(1, "First name is required")
		.max(100, "First name must be 100 characters or fewer"),
	lastName: z
		.string()
		.min(1, "Last name is required")
		.max(100, "Last name must be 100 characters or fewer"),
	email: z.string().email("Must be a valid email address").max(255).optional(),
	phone: z.string().max(50, "Phone must be 50 characters or fewer").optional(),
	mobile: z.string().max(50, "Mobile must be 50 characters or fewer").optional(),
	jobTitle: z.string().max(100, "Job title must be 100 characters or fewer").optional(),
	department: z.string().max(100, "Department must be 100 characters or fewer").optional(),
	countryCode: CountryCodeSchema.optional(),
	doNotContact: z.boolean().default(false),
	ownerUserId: UUIDSchema.optional(),
	source: z.string().max(50, "Source must be 50 characters or fewer").optional(),
});

export type CreateCrmContactInput = z.infer<typeof CreateCrmContactSchema>;

// ── Company Relationship ────────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = [
	"PARENT",
	"SUBSIDIARY",
	"PARTNER",
	"JOINT_VENTURE",
	"RESELLER",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const CreateCompanyRelationshipSchema = z
	.object({
		entityId: UUIDSchema,
		parentCompanyId: UUIDSchema,
		childCompanyId: UUIDSchema,
		relationshipType: z.enum(RELATIONSHIP_TYPES, { error: "Invalid relationship type" }),
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveUntil: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
		notes: z.string().max(2000, "Notes must be 2000 characters or fewer").optional(),
	})
	.refine((data) => data.parentCompanyId !== data.childCompanyId, {
		message: "Parent and child company cannot be the same",
		path: ["childCompanyId"],
	})
	.refine(
		(data) => {
			if (data.effectiveUntil === undefined) return true;
			return new Date(data.effectiveUntil) > new Date(data.effectiveFrom);
		},
		{ message: "Effective-until date must be after effective-from date", path: ["effectiveUntil"] },
	);

export type CreateCompanyRelationshipInput = z.infer<typeof CreateCompanyRelationshipSchema>;

// ── Pipeline Stage ──────────────────────────────────────────────────────────────

export const CreatePipelineStageSchema = z
	.object({
		entityId: UUIDSchema,
		code: z
			.string()
			.min(1, "Stage code is required")
			.max(30, "Stage code must be 30 characters or fewer"),
		name: z
			.string()
			.min(1, "Stage name is required")
			.max(100, "Stage name must be 100 characters or fewer"),
		stageOrder: z
			.number()
			.int("Stage order must be an integer")
			.min(1, "Stage order must be at least 1"),
		winProbability: z
			.number()
			.min(0, "Win probability cannot be negative")
			.max(100, "Win probability cannot exceed 100")
			.optional(),
		isClosedWon: z.boolean().default(false),
		isClosedLost: z.boolean().default(false),
	})
	.refine((data) => !(data.isClosedWon && data.isClosedLost), {
		message: "A stage cannot be both closed-won and closed-lost",
		path: ["isClosedLost"],
	});

export type CreatePipelineStageInput = z.infer<typeof CreatePipelineStageSchema>;

// ── Opportunity ─────────────────────────────────────────────────────────────────

export const CreateOpportunityLineSchema = z.object({
	productId: UUIDSchema.optional(),
	description: z
		.string()
		.min(1, "Description is required")
		.max(500, "Description must be 500 characters or fewer"),
	quantity: z
		.string()
		.regex(/^\d{1,10}(\.\d{1,6})?$/, "Quantity must be a positive decimal number")
		.default("1"),
	unitPrice: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
});

export type CreateOpportunityLineInput = z.infer<typeof CreateOpportunityLineSchema>;

export const CreateOpportunitySchema = z
	.object({
		entityId: UUIDSchema,
		crmCompanyId: UUIDSchema.optional(),
		customerId: UUIDSchema.optional(),
		name: z
			.string()
			.min(1, "Opportunity name is required")
			.max(255, "Opportunity name must be 255 characters or fewer"),
		description: z.string().max(5000, "Description must be 5000 characters or fewer").optional(),
		pipelineStageId: UUIDSchema,
		amount: MoneyAmountSchema.optional(),
		currencyCode: CurrencyCodeSchema.optional(),
		probability: z
			.number()
			.min(0, "Probability cannot be negative")
			.max(100, "Probability cannot exceed 100")
			.optional(),
		expectedCloseDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
		ownerUserId: UUIDSchema.optional(),
		source: z.string().max(50).optional(),
		lines: z.array(CreateOpportunityLineSchema).max(200).optional(),
	})
	.refine(
		(data) => {
			// If amount is provided, currency must also be provided
			if (data.amount !== undefined) return data.currencyCode !== undefined;
			return true;
		},
		{
			message: "Currency code is required when amount is specified",
			path: ["currencyCode"],
		},
	)
	.refine(
		(data) => {
			// All opportunity lines must have the same currency as the opportunity header
			if (data.currencyCode === undefined || data.lines === undefined) return true;
			return data.lines.every((line) => line.currencyCode === data.currencyCode);
		},
		{
			message: "All opportunity line currencies must match the opportunity currency",
			path: ["lines"],
		},
	);

export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>;

// ── Activity ────────────────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "TASK", "NOTE"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const CreateActivitySchema = z
	.object({
		entityId: UUIDSchema,
		activityType: z.enum(ACTIVITY_TYPES, { error: "Invalid activity type" }),
		subject: z
			.string()
			.min(1, "Subject is required")
			.max(255, "Subject must be 255 characters or fewer"),
		description: z.string().max(10000, "Description must be 10000 characters or fewer").optional(),
		crmContactId: UUIDSchema.optional(),
		crmCompanyId: UUIDSchema.optional(),
		opportunityId: UUIDSchema.optional(),
		leadId: UUIDSchema.optional(),
		ownerUserId: UUIDSchema,
		dueDate: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }).optional(),
		isCompleted: z.boolean().default(false),
	})
	.refine(
		(data) => {
			// At least one target must be specified (contact, company, opportunity, or lead)
			return (
				data.crmContactId !== undefined ||
				data.crmCompanyId !== undefined ||
				data.opportunityId !== undefined ||
				data.leadId !== undefined
			);
		},
		{
			message:
				"Activity must be linked to at least one of: CRM contact, CRM company, opportunity, or lead",
			path: ["crmContactId"],
		},
	);

export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;

// ── Lead ────────────────────────────────────────────────────────────────────────

export const LEAD_STATUSES = [
	"NEW",
	"CONTACTED",
	"QUALIFIED",
	"CONVERTED",
	"DISQUALIFIED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CreateLeadSchema = z.object({
	entityId: UUIDSchema,
	firstName: z
		.string()
		.min(1, "First name is required")
		.max(100, "First name must be 100 characters or fewer"),
	lastName: z
		.string()
		.min(1, "Last name is required")
		.max(100, "Last name must be 100 characters or fewer"),
	email: z.string().email("Must be a valid email address").max(255).optional(),
	phone: z.string().max(50, "Phone must be 50 characters or fewer").optional(),
	companyName: z.string().max(255, "Company name must be 255 characters or fewer").optional(),
	jobTitle: z.string().max(100, "Job title must be 100 characters or fewer").optional(),
	source: z.string().max(50, "Source must be 50 characters or fewer").optional(),
	ownerUserId: UUIDSchema.optional(),
	notes: z.string().max(5000, "Notes must be 5000 characters or fewer").optional(),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = z.object({
	id: UUIDSchema,
	status: z.enum(LEAD_STATUSES, { error: "Invalid lead status" }).optional(),
	ownerUserId: UUIDSchema.optional(),
	notes: z.string().max(5000).optional(),
	convertedContactId: UUIDSchema.optional(),
	convertedOpportunityId: UUIDSchema.optional(),
});

export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
