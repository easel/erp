/**
 * Compliance test suite — WP-7: Integration & E2E Testing
 * Covers export control schema validation scenarios per SD-003-WP7 and SD-003 §7 (Testing Strategy).
 *
 * These tests exercise the Layer 1 (structural) Zod schemas that gate compliance workflows:
 *   - denied-party screening result lifecycle (CLEAR → POTENTIAL_MATCH → CONFIRMED_MATCH)
 *   - fuzzy match scoring constraints
 *   - compliance hold create / resolve lifecycle
 *   - ITAR / EAR product classification constraints
 *   - country restriction five-level model (EMBARGOED → UNRESTRICTED)
 *   - sub-national restricted region boundary types
 *   - bulk screening list ingestion validation
 *
 * Ref: SD-003-WP7, SD-003 §7, FEAT-006, EXP-001–EXP-004, EXP-006, EXP-012
 * Parent epic: erp-8f7d052b
 */
import { describe, expect, test } from "vitest";
import {
	CreateComplianceHoldSchema,
	CreateCountryRestrictionRuleSchema,
	CreateCountryRestrictionSchema,
	CreateDeniedPartyMatchSchema,
	CreateProductClassificationSchema,
	CreateRestrictedRegionSchema,
	CreateScreeningListEntrySchema,
	CreateScreeningListSchema,
	CreateScreeningResultSchema,
	IngestScreeningEntriesSchema,
	ResolveComplianceHoldSchema,
	ReviewScreeningResultSchema,
	UpdateProductClassificationSchema,
	UpdateRestrictedRegionSchema,
	UpdateScreeningListSchema,
} from "../src/entity-schemas/export-control.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";
const UUID3 = "00000000-0000-4000-8000-000000000003";

// ── Scenario 1: Product Classification (EXP-001) ───────────────────────────────

describe("Compliance Scenario: ITAR item classification", () => {
	test("ITAR item requires USML category", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "ITAR",
				classifiedBy: UUID2,
				effectiveFrom: "2026-01-01",
				// usmlCategory missing — should fail
			}),
		).toThrow(/USML category is required for ITAR/);
	});

	test("ITAR item with USML category is valid", () => {
		const result = CreateProductClassificationSchema.parse({
			productId: UUID,
			jurisdiction: "ITAR",
			usmlCategory: "XI",
			classifiedBy: UUID2,
			effectiveFrom: "2026-01-01",
		});
		expect(result.jurisdiction).toBe("ITAR");
		expect(result.usmlCategory).toBe("XI");
	});

	test("ITAR item with full classification metadata is valid", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "ITAR",
				usmlCategory: "XV",
				licenseRequirement: "LICENSE_REQUIRED",
				classificationBasis: "COMMODITY_JURISDICTION",
				classifiedBy: UUID2,
				reviewedBy: UUID3,
				reviewedAt: "2026-01-15T00:00:00Z",
				effectiveFrom: "2026-01-01",
				effectiveTo: "2027-01-01",
				notes: "Space-qualified transponder — Category XV ITAR",
			}),
		).not.toThrow();
	});

	test("effectiveTo must not precede effectiveFrom", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "ITAR",
				usmlCategory: "XI",
				classifiedBy: UUID2,
				effectiveFrom: "2026-06-01",
				effectiveTo: "2026-01-01", // before effectiveFrom
			}),
		).toThrow(/Effective-to date must be on or after effective-from/);
	});
});

describe("Compliance Scenario: EAR item classification", () => {
	test("EAR item requires ECCN", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "EAR",
				classifiedBy: UUID2,
				effectiveFrom: "2026-01-01",
				// eccn missing — should fail
			}),
		).toThrow(/ECCN is required for EAR/);
	});

	test("EAR item with ECCN is valid", () => {
		const result = CreateProductClassificationSchema.parse({
			productId: UUID,
			jurisdiction: "EAR",
			eccn: "3A001",
			licenseRequirement: "NLR",
			classifiedBy: UUID2,
			effectiveFrom: "2026-01-01",
		});
		expect(result.eccn).toBe("3A001");
	});

	test("NOT_CONTROLLED item requires no classification codes", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "NOT_CONTROLLED",
				classifiedBy: UUID2,
				effectiveFrom: "2026-01-01",
			}),
		).not.toThrow();
	});

	test("rejects invalid jurisdiction", () => {
		expect(() =>
			CreateProductClassificationSchema.parse({
				productId: UUID,
				jurisdiction: "WASENAAR",
				classifiedBy: UUID2,
				effectiveFrom: "2026-01-01",
			}),
		).toThrow();
	});
});

describe("UpdateProductClassificationSchema", () => {
	test("accepts partial update with notes only", () => {
		expect(() =>
			UpdateProductClassificationSchema.parse({
				id: UUID,
				notes: "Reclassified after CJ determination",
			}),
		).not.toThrow();
	});

	test("rejects missing id", () => {
		expect(() => UpdateProductClassificationSchema.parse({ notes: "Updated" })).toThrow();
	});
});

// ── Scenario 2: Screening List Management (EXP-002) ───────────────────────────

describe("Compliance Scenario: Screening list setup", () => {
	test("creates SDN screening list", () => {
		const result = CreateScreeningListSchema.parse({
			code: "SDN",
			name: "Specially Designated Nationals",
			sourceAuthority: "OFAC",
			sourceUrl: "https://ofac.treasury.gov/sdn-list",
		});
		expect(result.code).toBe("SDN");
	});

	test("creates entity list without URL", () => {
		expect(() =>
			CreateScreeningListSchema.parse({
				code: "ENTITY_LIST",
				name: "BIS Entity List",
				sourceAuthority: "BIS",
			}),
		).not.toThrow();
	});

	test("rejects list code with lowercase characters", () => {
		expect(() =>
			CreateScreeningListSchema.parse({
				code: "sdn_list",
				name: "Test",
				sourceAuthority: "Test Auth",
			}),
		).toThrow();
	});

	test("rejects invalid source URL", () => {
		expect(() =>
			CreateScreeningListSchema.parse({
				code: "SDN",
				name: "SDN List",
				sourceAuthority: "OFAC",
				sourceUrl: "not-a-url",
			}),
		).toThrow();
	});
});

describe("UpdateScreeningListSchema — screening list update triggers re-screening", () => {
	test("accepts updating lastUpdatedAt to reflect new list version", () => {
		expect(() =>
			UpdateScreeningListSchema.parse({
				id: UUID,
				lastUpdatedAt: "2026-04-05T00:00:00Z",
				isActive: true,
			}),
		).not.toThrow();
	});

	test("accepts deactivating a list", () => {
		expect(() =>
			UpdateScreeningListSchema.parse({
				id: UUID,
				isActive: false,
			}),
		).not.toThrow();
	});
});

// ── Scenario 3: Denied-Party Screening (EXP-002) ──────────────────────────────

describe("Compliance Scenario: Known denied party — exact match", () => {
	const deniedPartyEntry = {
		screeningListId: UUID,
		entryName: "Acme Rogue Industries",
		entityType: "ORGANIZATION" as const,
		countryCodes: ["IR"],
		remarks: "Sanctioned entity — SDN List",
	};

	test("creates a screening list entry for a known denied party", () => {
		const result = CreateScreeningListEntrySchema.parse(deniedPartyEntry);
		expect(result.entryName).toBe("Acme Rogue Industries");
		expect(result.countryCodes).toContain("IR");
	});

	test("creates a CONFIRMED_MATCH screening result for known denied party", () => {
		const result = CreateScreeningResultSchema.parse({
			entityId: UUID,
			screenedTable: "vendor",
			screenedRecordId: UUID2,
			screenedName: "Acme Rogue Industries",
			screeningType: "AUTOMATED",
			overallResult: "CONFIRMED_MATCH",
			matchCount: 1,
		});
		expect(result.overallResult).toBe("CONFIRMED_MATCH");
	});

	test("creates SCREENING_MATCH compliance hold for confirmed match", () => {
		const result = CreateComplianceHoldSchema.parse({
			entityId: UUID,
			heldTable: "vendor",
			heldRecordId: UUID2,
			holdReason: "SCREENING_MATCH",
			screeningResultId: UUID3,
		});
		expect(result.holdReason).toBe("SCREENING_MATCH");
	});
});

describe("Compliance Scenario: Near-miss fuzzy match — potential match hold", () => {
	test("creates POTENTIAL_MATCH result for near-miss fuzzy screening", () => {
		const result = CreateScreeningResultSchema.parse({
			entityId: UUID,
			screenedTable: "vendor",
			screenedRecordId: UUID2,
			screenedName: "Acme Rogu Indstries", // typo variant
			screeningType: "AUTOMATED",
			overallResult: "POTENTIAL_MATCH",
			matchCount: 2,
		});
		expect(result.overallResult).toBe("POTENTIAL_MATCH");
	});

	test("creates FUZZY denied party match with score 0.82 (near-miss range)", () => {
		const result = CreateDeniedPartyMatchSchema.parse({
			screeningResultId: UUID,
			screeningListEntryId: UUID2,
			matchScore: 0.82,
			matchAlgorithm: "FUZZY",
			matchedFields: { name: "Acme Rogu Indstries" },
		});
		expect(result.matchScore).toBe(0.82);
		expect(result.matchAlgorithm).toBe("FUZZY");
	});

	test("creates PHONETIC denied party match", () => {
		expect(() =>
			CreateDeniedPartyMatchSchema.parse({
				screeningResultId: UUID,
				screeningListEntryId: UUID2,
				matchScore: 0.75,
				matchAlgorithm: "PHONETIC",
			}),
		).not.toThrow();
	});

	test("rejects match score above 1.0", () => {
		expect(() =>
			CreateDeniedPartyMatchSchema.parse({
				screeningResultId: UUID,
				screeningListEntryId: UUID2,
				matchScore: 1.1,
				matchAlgorithm: "FUZZY",
			}),
		).toThrow(/Match score must be between 0 and 1/);
	});

	test("rejects match score below 0.0", () => {
		expect(() =>
			CreateDeniedPartyMatchSchema.parse({
				screeningResultId: UUID,
				screeningListEntryId: UUID2,
				matchScore: -0.1,
				matchAlgorithm: "FUZZY",
			}),
		).toThrow(/Match score must be between 0 and 1/);
	});
});

describe("Compliance Scenario: Cleared party — no hold", () => {
	test("creates CLEAR screening result for safe counterparty", () => {
		const result = CreateScreeningResultSchema.parse({
			entityId: UUID,
			screenedTable: "vendor",
			screenedRecordId: UUID2,
			screenedName: "Trusted Aerospace Ltd",
			screeningType: "AUTOMATED",
			overallResult: "CLEAR",
			matchCount: 0,
		});
		expect(result.overallResult).toBe("CLEAR");
		expect(result.matchCount).toBe(0);
	});

	test("creates manual CLEAR result after compliance officer review", () => {
		const result = CreateScreeningResultSchema.parse({
			entityId: UUID,
			screenedTable: "customer",
			screenedRecordId: UUID2,
			screenedName: "Allied Space Systems",
			screeningType: "MANUAL",
			overallResult: "CLEAR",
			matchCount: 0,
		});
		expect(result.screeningType).toBe("MANUAL");
	});
});

// ── Scenario 4: Hold lifecycle — release with justification (EXP-003) ────────

describe("Compliance Scenario: Hold release requires justification notes", () => {
	test("RELEASED hold requires non-empty resolution notes", () => {
		expect(() =>
			ResolveComplianceHoldSchema.parse({
				id: UUID,
				status: "RELEASED",
				// resolutionNotes missing — should fail
			}),
		).toThrow(/Resolution notes are required when releasing a hold/);
	});

	test("RELEASED hold with notes is valid", () => {
		const result = ResolveComplianceHoldSchema.parse({
			id: UUID,
			status: "RELEASED",
			resolutionNotes:
				"False positive — different entity with similar name. Customer is a US-based prime contractor.",
		});
		expect(result.status).toBe("RELEASED");
	});

	test("REJECTED hold does not require notes", () => {
		expect(() =>
			ResolveComplianceHoldSchema.parse({
				id: UUID,
				status: "REJECTED",
			}),
		).not.toThrow();
	});

	test("REJECTED hold with notes is also valid", () => {
		expect(() =>
			ResolveComplianceHoldSchema.parse({
				id: UUID,
				status: "REJECTED",
				resolutionNotes: "Confirmed match — vendor is on SDN list. Transaction rejected.",
			}),
		).not.toThrow();
	});

	test("rejects invalid resolution status (e.g., ACTIVE)", () => {
		expect(() =>
			ResolveComplianceHoldSchema.parse({
				id: UUID,
				status: "ACTIVE",
			}),
		).toThrow();
	});
});

describe("ReviewScreeningResultSchema — compliance officer decision", () => {
	test("officer clears potential match as false positive", () => {
		const result = ReviewScreeningResultSchema.parse({
			id: UUID,
			reviewDecision: "CLEARED",
			reviewNotes: "Name similarity only — different country, different entity.",
		});
		expect(result.reviewDecision).toBe("CLEARED");
	});

	test("officer escalates for further review", () => {
		expect(() =>
			ReviewScreeningResultSchema.parse({
				id: UUID,
				reviewDecision: "ESCALATED",
			}),
		).not.toThrow();
	});

	test("officer blocks confirmed match", () => {
		expect(() =>
			ReviewScreeningResultSchema.parse({
				id: UUID,
				reviewDecision: "BLOCKED",
				reviewNotes: "Confirmed SDN match — transaction blocked.",
			}),
		).not.toThrow();
	});

	test("rejects invalid review decision", () => {
		expect(() =>
			ReviewScreeningResultSchema.parse({
				id: UUID,
				reviewDecision: "APPROVED",
			}),
		).toThrow();
	});
});

// ── Scenario 5: Country Restrictions — embargo blocks (EXP-004, EXP-006) ─────

describe("Compliance Scenario: Country embargo — ITAR item to embargoed country", () => {
	const baseRestriction = {
		entityId: UUID,
		name: "OFAC Comprehensive Sanctions",
		description: "Comprehensive sanctions program per OFAC",
	};

	test("creates country restriction group", () => {
		const result = CreateCountryRestrictionSchema.parse(baseRestriction);
		expect(result.name).toBe("OFAC Comprehensive Sanctions");
	});

	test("creates EMBARGOED rule for Iran", () => {
		const result = CreateCountryRestrictionRuleSchema.parse({
			countryRestrictionId: UUID,
			countryCode: "IR",
			restrictionType: "EMBARGOED",
			effectiveFrom: "2012-01-01",
			notes: "OFAC comprehensive sanctions — Iran",
		});
		expect(result.restrictionType).toBe("EMBARGOED");
		expect(result.countryCode).toBe("IR");
	});

	test("creates HEAVILY_RESTRICTED rule for Russia", () => {
		expect(() =>
			CreateCountryRestrictionRuleSchema.parse({
				countryRestrictionId: UUID,
				countryCode: "RU",
				restrictionType: "HEAVILY_RESTRICTED",
				effectiveFrom: "2022-02-24",
				notes: "Post-Ukraine invasion export restrictions",
			}),
		).not.toThrow();
	});

	test("creates LICENSE_REQUIRED rule for China — ITAR to non-allied", () => {
		const result = CreateCountryRestrictionRuleSchema.parse({
			countryRestrictionId: UUID,
			countryCode: "CN",
			classificationType: "ITAR",
			restrictionType: "LICENSE_REQUIRED",
			effectiveFrom: "2026-01-01",
			notes: "ITAR license required for all controlled space items",
		});
		expect(result.restrictionType).toBe("LICENSE_REQUIRED");
		expect(result.classificationType).toBe("ITAR");
	});

	test("effectiveTo must not precede effectiveFrom", () => {
		expect(() =>
			CreateCountryRestrictionRuleSchema.parse({
				countryRestrictionId: UUID,
				countryCode: "IR",
				restrictionType: "EMBARGOED",
				effectiveFrom: "2026-06-01",
				effectiveTo: "2026-01-01",
			}),
		).toThrow(/Effective-to date must be on or after effective-from/);
	});
});

describe("Compliance Scenario: ITAR item to allied country — unrestricted pass", () => {
	test("creates UNRESTRICTED rule for UK (Five Eyes ally)", () => {
		const result = CreateCountryRestrictionRuleSchema.parse({
			countryRestrictionId: UUID,
			countryCode: "GB",
			classificationType: "ITAR",
			restrictionType: "UNRESTRICTED",
			effectiveFrom: "2026-01-01",
			notes: "UK — Five Eyes; ITAR license exception applies",
		});
		expect(result.restrictionType).toBe("UNRESTRICTED");
	});

	test("creates CAUTION rule for UAE — case-by-case review", () => {
		expect(() =>
			CreateCountryRestrictionRuleSchema.parse({
				countryRestrictionId: UUID,
				countryCode: "AE",
				restrictionType: "CAUTION",
				effectiveFrom: "2026-01-01",
				notes: "Re-export risk — review case-by-case",
			}),
		).not.toThrow();
	});

	test("rejects invalid restriction type", () => {
		expect(() =>
			CreateCountryRestrictionRuleSchema.parse({
				countryRestrictionId: UUID,
				countryCode: "GB",
				restrictionType: "BLOCKED",
				effectiveFrom: "2026-01-01",
			}),
		).toThrow();
	});
});

// ── Scenario 6: Sub-national restricted regions (EXP-012) ────────────────────

describe("Compliance Scenario: Sub-national restricted region (Crimea)", () => {
	test("creates ADMIN_DIVISION restricted region for Crimea", () => {
		const result = CreateRestrictedRegionSchema.parse({
			countryCode: "UA",
			regionName: "Crimea",
			regionCode: "UA-43",
			sanctionsRegime: "OFAC-UKRAINE",
			effectiveDate: "2014-03-27T00:00:00Z",
			sourceAuthority: "OFAC",
			boundaryType: "ADMIN_DIVISION",
			adminDivisions: [{ admin1: "Crimea", isoCode: "UA-43" }],
		});
		expect(result.regionName).toBe("Crimea");
		expect(result.boundaryType).toBe("ADMIN_DIVISION");
	});

	test("creates GEOJSON restricted region with boundary data", () => {
		expect(() =>
			CreateRestrictedRegionSchema.parse({
				countryCode: "UA",
				regionName: "Donetsk Occupation Zone",
				sanctionsRegime: "OFAC-UKRAINE",
				effectiveDate: "2022-09-30T00:00:00Z",
				sourceAuthority: "OFAC",
				boundaryType: "GEOJSON",
				geojsonBoundary: {
					type: "Polygon",
					coordinates: [
						[
							[37.0, 47.5],
							[38.5, 47.5],
							[38.5, 48.5],
							[37.0, 48.5],
							[37.0, 47.5],
						],
					],
				},
			}),
		).not.toThrow();
	});

	test("GEOJSON boundary type requires geojsonBoundary field", () => {
		expect(() =>
			CreateRestrictedRegionSchema.parse({
				countryCode: "UA",
				regionName: "Test Region",
				sanctionsRegime: "OFAC-UKRAINE",
				effectiveDate: "2026-01-01T00:00:00Z",
				sourceAuthority: "OFAC",
				boundaryType: "GEOJSON",
				// geojsonBoundary missing — should fail
			}),
		).toThrow(/GeoJSON boundary is required/);
	});

	test("ADMIN_DIVISION boundary type requires adminDivisions field", () => {
		expect(() =>
			CreateRestrictedRegionSchema.parse({
				countryCode: "RU",
				regionName: "Crimea (Russia-claimed)",
				sanctionsRegime: "OFAC",
				effectiveDate: "2014-03-27T00:00:00Z",
				sourceAuthority: "OFAC",
				boundaryType: "ADMIN_DIVISION",
				// adminDivisions missing — should fail
			}),
		).toThrow(/Admin divisions are required/);
	});

	test("expiration date must be after effective date", () => {
		expect(() =>
			CreateRestrictedRegionSchema.parse({
				countryCode: "UA",
				regionName: "Test",
				sanctionsRegime: "OFAC",
				effectiveDate: "2026-06-01T00:00:00Z",
				expirationDate: "2026-01-01T00:00:00Z", // before effectiveDate
				sourceAuthority: "OFAC",
			}),
		).toThrow(/Expiration date must be after effective date/);
	});

	test("creates BOTH boundary type with geojson and admin divisions", () => {
		expect(() =>
			CreateRestrictedRegionSchema.parse({
				countryCode: "UA",
				regionName: "Luhansk Occupation Zone",
				sanctionsRegime: "OFAC-UKRAINE",
				effectiveDate: "2022-09-30T00:00:00Z",
				sourceAuthority: "OFAC",
				boundaryType: "BOTH",
				adminDivisions: [{ admin1: "Luhansk", isoCode: "UA-09" }],
				geojsonBoundary: { type: "Polygon", coordinates: [] },
			}),
		).not.toThrow();
	});
});

describe("UpdateRestrictedRegionSchema", () => {
	test("accepts expiration date update (sanction lifted)", () => {
		expect(() =>
			UpdateRestrictedRegionSchema.parse({
				id: UUID,
				expirationDate: "2026-12-31T00:00:00Z",
			}),
		).not.toThrow();
	});

	test("accepts updated geojson boundary", () => {
		expect(() =>
			UpdateRestrictedRegionSchema.parse({
				id: UUID,
				geojsonBoundary: { type: "Polygon", coordinates: [] },
				boundaryType: "GEOJSON",
			}),
		).not.toThrow();
	});
});

// ── Scenario 7: Bulk screening list ingestion (EXP-002 — list pipeline) ──────

describe("Compliance Scenario: Screening list update — bulk ingestion", () => {
	const baseEntry = {
		entryName: "Example Sanctioned Entity",
		entityType: "ORGANIZATION" as const,
		countryCodes: ["IR"],
		listedDate: "2020-01-15",
	};

	test("ingests a batch of screening list entries (replace=false)", () => {
		const result = IngestScreeningEntriesSchema.parse({
			screeningListId: UUID,
			entries: [baseEntry, { ...baseEntry, entryName: "Another Sanctioned Co" }],
			replaceExisting: false,
		});
		expect(result.entries).toHaveLength(2);
		expect(result.replaceExisting).toBe(false);
	});

	test("ingests with replaceExisting=true for full list refresh", () => {
		const result = IngestScreeningEntriesSchema.parse({
			screeningListId: UUID,
			entries: [baseEntry],
			replaceExisting: true,
		});
		expect(result.replaceExisting).toBe(true);
	});

	test("defaults replaceExisting to false when omitted", () => {
		const result = IngestScreeningEntriesSchema.parse({
			screeningListId: UUID,
			entries: [baseEntry],
		});
		expect(result.replaceExisting).toBe(false);
	});

	test("rejects empty entries array (must have at least 1)", () => {
		expect(() =>
			IngestScreeningEntriesSchema.parse({
				screeningListId: UUID,
				entries: [],
			}),
		).toThrow(/At least one entry is required/);
	});

	test("rejects entries exceeding 10,000 limit", () => {
		const entries = Array.from({ length: 10001 }, (_, i) => ({
			entryName: `Entity ${i}`,
		}));
		expect(() =>
			IngestScreeningEntriesSchema.parse({
				screeningListId: UUID,
				entries,
			}),
		).toThrow(/Cannot exceed 10,000 entries per batch/);
	});

	test("accepts entry with aliases for fuzzy matching source data", () => {
		expect(() =>
			IngestScreeningEntriesSchema.parse({
				screeningListId: UUID,
				entries: [
					{
						entryName: "Rogue Industries International",
						aliases: ["Rogue Industries Intl", "RII Corp", "Rogue Ind. Intl."],
						entityType: "ORGANIZATION" as const,
						countryCodes: ["IR", "CN"],
					},
				],
			}),
		).not.toThrow();
	});

	test("accepts entry with identifiers and source metadata", () => {
		expect(() =>
			IngestScreeningEntriesSchema.parse({
				screeningListId: UUID,
				entries: [
					{
						entryName: "Sanctioned Individual",
						entityType: "INDIVIDUAL" as const,
						identifiers: {
							passport: "AB123456",
							nationalId: "IR-9876543",
						},
						sourceId: "SDN-20240115-001",
						listedDate: "2024-01-15",
					},
				],
			}),
		).not.toThrow();
	});

	test("accepts previously listed entry with delisted date (screening list update)", () => {
		expect(() =>
			IngestScreeningEntriesSchema.parse({
				screeningListId: UUID,
				entries: [
					{
						entryName: "Formerly Sanctioned Co",
						entityType: "ORGANIZATION" as const,
						listedDate: "2010-05-01",
						delistedDate: "2024-03-15",
					},
				],
			}),
		).not.toThrow();
	});
});

// ── Scenario 8: Compliance hold — classification required (EXP-003) ──────────

describe("Compliance Scenario: Hold for unclassified item", () => {
	test("creates CLASSIFICATION_REQUIRED hold for unclassified product", () => {
		const result = CreateComplianceHoldSchema.parse({
			entityId: UUID,
			heldTable: "inventory_item",
			heldRecordId: UUID2,
			holdReason: "CLASSIFICATION_REQUIRED",
		});
		expect(result.holdReason).toBe("CLASSIFICATION_REQUIRED");
	});

	test("creates COUNTRY_RESTRICTION hold for restricted destination", () => {
		const result = CreateComplianceHoldSchema.parse({
			entityId: UUID,
			heldTable: "shipment",
			heldRecordId: UUID2,
			holdReason: "COUNTRY_RESTRICTION",
		});
		expect(result.holdReason).toBe("COUNTRY_RESTRICTION");
	});

	test("creates AMBIGUOUS_REGION hold for sub-national region check", () => {
		expect(() =>
			CreateComplianceHoldSchema.parse({
				entityId: UUID,
				heldTable: "shipment",
				heldRecordId: UUID2,
				holdReason: "AMBIGUOUS_REGION",
			}),
		).not.toThrow();
	});

	test("creates MANUAL hold for officer-initiated review", () => {
		expect(() =>
			CreateComplianceHoldSchema.parse({
				entityId: UUID,
				heldTable: "purchase_order",
				heldRecordId: UUID2,
				holdReason: "MANUAL",
			}),
		).not.toThrow();
	});

	test("rejects invalid hold reason", () => {
		expect(() =>
			CreateComplianceHoldSchema.parse({
				entityId: UUID,
				heldTable: "vendor",
				heldRecordId: UUID2,
				holdReason: "SUSPICIOUS",
			}),
		).toThrow();
	});

	test("rejects held table name exceeding 50 chars", () => {
		expect(() =>
			CreateComplianceHoldSchema.parse({
				entityId: UUID,
				heldTable: "a".repeat(51),
				heldRecordId: UUID2,
				holdReason: "MANUAL",
			}),
		).toThrow();
	});
});
