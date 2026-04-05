/**
 * Zod schemas for Export Control entities — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §8: product_classification, screening_list,
 * screening_list_entry, screening_result, denied_party_match, compliance_hold,
 * country_restriction, country_restriction_rule, restricted_region.
 *
 * Covers EXP-001 (classification), EXP-002 (screening), EXP-003 (holds),
 * EXP-004 + EXP-006 (country/region restrictions), EXP-012 (sub-national regions).
 *
 * Layer 1 (structural) validation only. Layer 2 (FK resolution, screening
 * list freshness, hold lifecycle transitions) runs server-side.
 *
 * ADR-001: Classification inheritance is NOT implemented — Phase 1 requires
 * explicit per-item classification only. Pending ITAR counsel review.
 */
import { z } from "zod";
import { CountryCodeSchema, UUIDSchema } from "../schemas.js";

// ── Classification ─────────────────────────────────────────────────────────────

export const JURISDICTIONS = ["ITAR", "EAR", "NOT_CONTROLLED"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const LICENSE_REQUIREMENTS = ["LICENSE_REQUIRED", "LICENSE_EXCEPTION", "NLR"] as const;
export type LicenseRequirement = (typeof LICENSE_REQUIREMENTS)[number];

export const CLASSIFICATION_BASES = [
	"TECHNICAL_ASSESSMENT",
	"SELF_CLASSIFICATION",
	"COMMODITY_JURISDICTION",
] as const;
export type ClassificationBasis = (typeof CLASSIFICATION_BASES)[number];

/** ECCN format: X9X99.X9  (alphanumeric, 1–20 chars) */
const EccnSchema = z
	.string()
	.min(1, "ECCN is required")
	.max(20, "ECCN must be 20 characters or fewer")
	.regex(/^[A-Z0-9]{1,4}[A-Z0-9.]{0,16}$/, "Invalid ECCN format");

/** USML category: Roman numeral or alpha (e.g. I, II, XX, XXI) */
const UsmlCategorySchema = z
	.string()
	.min(1, "USML category is required")
	.max(20, "USML category must be 20 characters or fewer")
	.regex(/^[IVXivx]+$|^[A-Z]{1,3}$/, "Invalid USML category format");

export const CreateProductClassificationSchema = z
	.object({
		productId: UUIDSchema,
		jurisdiction: z.enum(JURISDICTIONS, { error: "Invalid jurisdiction" }),
		classificationBasis: z
			.enum(CLASSIFICATION_BASES, { error: "Invalid classification basis" })
			.optional(),
		usmlCategory: UsmlCategorySchema.optional(),
		eccn: EccnSchema.optional(),
		licenseRequirement: z
			.enum(LICENSE_REQUIREMENTS, { error: "Invalid license requirement" })
			.optional(),
		notes: z.string().max(5000).optional(),
		classifiedBy: UUIDSchema,
		reviewedBy: UUIDSchema.optional(),
		reviewedAt: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }).optional(),
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	})
	.refine(
		(data) => {
			if (data.jurisdiction === "ITAR") return data.usmlCategory !== undefined;
			return true;
		},
		{ message: "USML category is required for ITAR jurisdiction", path: ["usmlCategory"] },
	)
	.refine(
		(data) => {
			if (data.jurisdiction === "EAR") return data.eccn !== undefined;
			return true;
		},
		{ message: "ECCN is required for EAR jurisdiction", path: ["eccn"] },
	)
	.refine(
		(data) => {
			if (data.effectiveTo !== undefined) return data.effectiveTo >= data.effectiveFrom;
			return true;
		},
		{ message: "Effective-to date must be on or after effective-from", path: ["effectiveTo"] },
	);
export type CreateProductClassificationInput = z.infer<typeof CreateProductClassificationSchema>;

export const UpdateProductClassificationSchema = z.object({
	id: UUIDSchema,
	classificationBasis: z
		.enum(CLASSIFICATION_BASES, { error: "Invalid classification basis" })
		.optional(),
	usmlCategory: UsmlCategorySchema.optional(),
	eccn: EccnSchema.optional(),
	licenseRequirement: z
		.enum(LICENSE_REQUIREMENTS, { error: "Invalid license requirement" })
		.optional(),
	notes: z.string().max(5000).optional(),
	reviewedBy: UUIDSchema.optional(),
	reviewedAt: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }).optional(),
	effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
});
export type UpdateProductClassificationInput = z.infer<typeof UpdateProductClassificationSchema>;

// ── Screening List ─────────────────────────────────────────────────────────────

export const SCREENING_LIST_CODES = [
	"SDN",
	"DPL",
	"ENTITY_LIST",
	"UNVERIFIED",
	"EU_SANCTIONS",
	"UN_SANCTIONS",
] as const;
export type ScreeningListCode = (typeof SCREENING_LIST_CODES)[number];

export const CreateScreeningListSchema = z.object({
	code: z
		.string()
		.min(1, "List code is required")
		.max(30, "List code must be 30 characters or fewer")
		.regex(/^[A-Z0-9_]+$/, "List code must be uppercase alphanumeric with underscores"),
	name: z
		.string()
		.min(1, "List name is required")
		.max(255, "List name must be 255 characters or fewer"),
	sourceAuthority: z
		.string()
		.min(1, "Source authority is required")
		.max(100, "Source authority must be 100 characters or fewer"),
	sourceUrl: z.string().url("Must be a valid URL").max(500).optional(),
});
export type CreateScreeningListInput = z.infer<typeof CreateScreeningListSchema>;

export const UpdateScreeningListSchema = z.object({
	id: UUIDSchema,
	name: z.string().min(1).max(255).optional(),
	sourceAuthority: z.string().min(1).max(100).optional(),
	sourceUrl: z.string().url("Must be a valid URL").max(500).optional(),
	lastUpdatedAt: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }).optional(),
	isActive: z.boolean().optional(),
});
export type UpdateScreeningListInput = z.infer<typeof UpdateScreeningListSchema>;

// ── Screening List Entry ───────────────────────────────────────────────────────

export const ENTITY_TYPES = ["INDIVIDUAL", "ORGANIZATION", "VESSEL", "AIRCRAFT"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const CreateScreeningListEntrySchema = z.object({
	screeningListId: UUIDSchema,
	entryName: z
		.string()
		.min(1, "Entry name is required")
		.max(500, "Entry name must be 500 characters or fewer"),
	aliases: z.array(z.string().min(1).max(500)).max(100).optional(),
	entityType: z.enum(ENTITY_TYPES, { error: "Invalid entity type" }).optional(),
	countryCodes: z.array(CountryCodeSchema).max(50).optional(),
	identifiers: z.record(z.string(), z.unknown()).optional(),
	remarks: z.string().max(5000).optional(),
	sourceId: z.string().max(100).optional(),
	listedDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
	delistedDate: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
});
export type CreateScreeningListEntryInput = z.infer<typeof CreateScreeningListEntrySchema>;

// Bulk ingestion schema for screening list pipeline
export const IngestScreeningEntriesSchema = z.object({
	screeningListId: UUIDSchema,
	entries: z
		.array(CreateScreeningListEntrySchema.omit({ screeningListId: true }))
		.min(1, "At least one entry is required")
		.max(10000, "Cannot exceed 10,000 entries per batch"),
	replaceExisting: z.boolean().optional().default(false),
});
export type IngestScreeningEntriesInput = z.infer<typeof IngestScreeningEntriesSchema>;

// ── Screening Result ───────────────────────────────────────────────────────────

export const SCREENING_TYPES = ["AUTOMATED", "MANUAL"] as const;
export type ScreeningType = (typeof SCREENING_TYPES)[number];

export const OVERALL_RESULTS = ["CLEAR", "POTENTIAL_MATCH", "CONFIRMED_MATCH"] as const;
export type OverallResult = (typeof OVERALL_RESULTS)[number];

export const REVIEW_DECISIONS = ["CLEARED", "ESCALATED", "BLOCKED"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const CreateScreeningResultSchema = z.object({
	entityId: UUIDSchema,
	screenedTable: z
		.string()
		.min(1, "Screened table name is required")
		.max(50, "Screened table must be 50 characters or fewer"),
	screenedRecordId: UUIDSchema,
	screenedName: z
		.string()
		.min(1, "Screened name is required")
		.max(500, "Screened name must be 500 characters or fewer"),
	screeningType: z.enum(SCREENING_TYPES, { error: "Invalid screening type" }),
	overallResult: z.enum(OVERALL_RESULTS, { error: "Invalid overall result" }),
	matchCount: z.number().int().min(0, "Match count must be non-negative"),
});
export type CreateScreeningResultInput = z.infer<typeof CreateScreeningResultSchema>;

export const ReviewScreeningResultSchema = z.object({
	id: UUIDSchema,
	reviewDecision: z.enum(REVIEW_DECISIONS, { error: "Invalid review decision" }),
	reviewNotes: z.string().max(5000).optional(),
});
export type ReviewScreeningResultInput = z.infer<typeof ReviewScreeningResultSchema>;

// ── Denied Party Match ─────────────────────────────────────────────────────────

export const MATCH_ALGORITHMS = ["FUZZY", "EXACT", "PHONETIC"] as const;
export type MatchAlgorithm = (typeof MATCH_ALGORITHMS)[number];

export const CreateDeniedPartyMatchSchema = z.object({
	screeningResultId: UUIDSchema,
	screeningListEntryId: UUIDSchema,
	matchScore: z
		.number()
		.min(0, "Match score must be between 0 and 1")
		.max(1, "Match score must be between 0 and 1"),
	matchAlgorithm: z.enum(MATCH_ALGORITHMS, { error: "Invalid match algorithm" }).optional(),
	matchedFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDeniedPartyMatchInput = z.infer<typeof CreateDeniedPartyMatchSchema>;

// ── Compliance Hold ────────────────────────────────────────────────────────────

export const HOLD_REASONS = [
	"SCREENING_MATCH",
	"CLASSIFICATION_REQUIRED",
	"COUNTRY_RESTRICTION",
	"AMBIGUOUS_REGION",
	"MANUAL",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const HOLD_STATUSES = ["ACTIVE", "RELEASED", "REJECTED"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

export const CreateComplianceHoldSchema = z.object({
	entityId: UUIDSchema,
	heldTable: z
		.string()
		.min(1, "Held table name is required")
		.max(50, "Held table must be 50 characters or fewer"),
	heldRecordId: UUIDSchema,
	holdReason: z.enum(HOLD_REASONS, { error: "Invalid hold reason" }),
	screeningResultId: UUIDSchema.optional(),
});
export type CreateComplianceHoldInput = z.infer<typeof CreateComplianceHoldSchema>;

export const ResolveComplianceHoldSchema = z
	.object({
		id: UUIDSchema,
		status: z.enum(["RELEASED", "REJECTED"] as const, {
			error: "Hold resolution must be RELEASED or REJECTED",
		}),
		resolutionNotes: z.string().max(5000).optional(),
	})
	.refine(
		(data) => {
			if (data.status === "RELEASED") return (data.resolutionNotes?.trim().length ?? 0) > 0;
			return true;
		},
		{ message: "Resolution notes are required when releasing a hold", path: ["resolutionNotes"] },
	);
export type ResolveComplianceHoldInput = z.infer<typeof ResolveComplianceHoldSchema>;

// ── Country Restriction ────────────────────────────────────────────────────────

export const CreateCountryRestrictionSchema = z.object({
	entityId: UUIDSchema,
	name: z
		.string()
		.min(1, "Restriction name is required")
		.max(255, "Restriction name must be 255 characters or fewer"),
	description: z.string().max(5000).optional(),
});
export type CreateCountryRestrictionInput = z.infer<typeof CreateCountryRestrictionSchema>;

export const UpdateCountryRestrictionSchema = z.object({
	id: UUIDSchema,
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(5000).optional(),
	isActive: z.boolean().optional(),
});
export type UpdateCountryRestrictionInput = z.infer<typeof UpdateCountryRestrictionSchema>;

// ── Country Restriction Rule ───────────────────────────────────────────────────
// Five-level model per FEAT-006 / EXP-006.

export const RESTRICTION_TYPES = [
	"EMBARGOED",
	"HEAVILY_RESTRICTED",
	"LICENSE_REQUIRED",
	"CAUTION",
	"UNRESTRICTED",
] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export const CreateCountryRestrictionRuleSchema = z
	.object({
		countryRestrictionId: UUIDSchema,
		countryCode: CountryCodeSchema,
		classificationType: z
			.string()
			.max(20, "Classification type must be 20 characters or fewer")
			.optional(),
		restrictionType: z.enum(RESTRICTION_TYPES, { error: "Invalid restriction type" }),
		effectiveFrom: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		effectiveTo: z.string().date("Must be a valid date (YYYY-MM-DD)").optional(),
		notes: z.string().max(5000).optional(),
	})
	.refine(
		(data) => {
			if (data.effectiveTo !== undefined) return data.effectiveTo >= data.effectiveFrom;
			return true;
		},
		{ message: "Effective-to date must be on or after effective-from", path: ["effectiveTo"] },
	);
export type CreateCountryRestrictionRuleInput = z.infer<typeof CreateCountryRestrictionRuleSchema>;

// ── Restricted Region ──────────────────────────────────────────────────────────

export const BOUNDARY_TYPES = ["ADMIN_DIVISION", "GEOJSON", "BOTH"] as const;
export type BoundaryType = (typeof BOUNDARY_TYPES)[number];

export const CreateRestrictedRegionSchema = z
	.object({
		countryCode: CountryCodeSchema,
		regionName: z
			.string()
			.min(1, "Region name is required")
			.max(255, "Region name must be 255 characters or fewer"),
		regionCode: z.string().max(20, "Region code must be 20 characters or fewer").optional(),
		sanctionsRegime: z
			.string()
			.min(1, "Sanctions regime is required")
			.max(100, "Sanctions regime must be 100 characters or fewer"),
		effectiveDate: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }),
		expirationDate: z
			.string()
			.datetime({ message: "Must be a valid ISO 8601 datetime" })
			.optional(),
		sourceAuthority: z
			.string()
			.min(1, "Source authority is required")
			.max(100, "Source authority must be 100 characters or fewer"),
		adminDivisions: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
		geojsonBoundary: z.record(z.string(), z.unknown()).optional(),
		boundaryType: z.enum(BOUNDARY_TYPES, { error: "Invalid boundary type" }).optional(),
	})
	.refine(
		(data) => {
			if (data.expirationDate !== undefined) return data.expirationDate > data.effectiveDate;
			return true;
		},
		{ message: "Expiration date must be after effective date", path: ["expirationDate"] },
	)
	.refine(
		(data) => {
			if (data.boundaryType === "GEOJSON" || data.boundaryType === "BOTH") {
				return data.geojsonBoundary !== undefined;
			}
			return true;
		},
		{
			message: "GeoJSON boundary is required for GEOJSON or BOTH boundary types",
			path: ["geojsonBoundary"],
		},
	)
	.refine(
		(data) => {
			if (data.boundaryType === "ADMIN_DIVISION" || data.boundaryType === "BOTH") {
				return (data.adminDivisions?.length ?? 0) > 0;
			}
			return true;
		},
		{
			message: "Admin divisions are required for ADMIN_DIVISION or BOTH boundary types",
			path: ["adminDivisions"],
		},
	);
export type CreateRestrictedRegionInput = z.infer<typeof CreateRestrictedRegionSchema>;

export const UpdateRestrictedRegionSchema = z.object({
	id: UUIDSchema,
	expirationDate: z.string().datetime({ message: "Must be a valid ISO 8601 datetime" }).optional(),
	adminDivisions: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
	geojsonBoundary: z.record(z.string(), z.unknown()).optional(),
	boundaryType: z.enum(BOUNDARY_TYPES, { error: "Invalid boundary type" }).optional(),
});
export type UpdateRestrictedRegionInput = z.infer<typeof UpdateRestrictedRegionSchema>;
