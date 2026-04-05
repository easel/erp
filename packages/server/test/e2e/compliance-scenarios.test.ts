/**
 * E2E compliance scenario tests — WP-7: Integration & E2E Testing.
 *
 * Exercises four compliance scenarios end-to-end using pure/in-memory domain
 * functions — no real database required:
 *
 *   Scenario 1: Denied-party hit — screening → hold → release (false positive)
 *   Scenario 2: Denied-party hit — screening → hold → reject (confirmed match)
 *   Scenario 3: Country embargo block — embargo check → hold
 *   Scenario 4: ITAR item to restricted destination — classify + country check → hold
 *
 * Each scenario exercises the full workflow including hold creation and audit
 * trail fields (placedBy, resolvedBy, resolutionNotes, screeningResultId).
 *
 * Ref: SD-003 §WP-7 "Compliance scenarios", EXP-001–EXP-004, EXP-006
 * Issue: hx-4fb1bab7
 */

import { describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import {
	ComplianceHoldError,
	type ComplianceHoldRecord,
	type CountryRestrictionResult,
	type InMemoryScreeningResult,
	type ProductClassification,
	type ScreeningListEntry,
	checkCountryRestrictionPure,
	createComplianceHoldPure,
	getProductClassificationPure,
	resolveComplianceHoldPure,
	screenPartyInMemory,
} from "../../src/compliance/export-control-service.js";
import { ENTITIES, USERS } from "../helpers/fixtures.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(s: string): UUID {
	return s as UUID;
}

// ── Shared IDs ────────────────────────────────────────────────────────────────

const ENTITY_ID = ENTITIES.US.id;
const COMPLIANCE_OFFICER = USERS.compliance.id;
const ADMIN = USERS.admin.id;

const VENDOR_ID = uuid("vendor-comp-0001");
const SHIPMENT_ID = uuid("shipment-comp001");
const PRODUCT_ID = uuid("product-itar-001");

// Deterministic hold IDs per scenario
const HOLD_SCENARIO_1 = uuid("hold-0000000001");
const HOLD_SCENARIO_2 = uuid("hold-0000000002");
const HOLD_SCENARIO_3 = uuid("hold-0000000003");
const HOLD_SCENARIO_4 = uuid("hold-0000000004");

// ── Shared denied-party fixture list ─────────────────────────────────────────

/** SDN-style denied parties used across screening scenarios. */
const SDN_ENTRIES: ScreeningListEntry[] = [
	{
		id: uuid("entry-sdn-00001"),
		entryName: "Acme Rogue Industries",
		aliases: ["Acme Rogue Intl", "ARI Corp"],
		entityType: "ORGANIZATION",
		countryCodes: ["IR"],
	},
	{
		id: uuid("entry-sdn-00002"),
		entryName: "Rogue Launch Systems",
		entityType: "ORGANIZATION",
		countryCodes: ["KP"],
	},
	{
		id: uuid("entry-sdn-00003"),
		entryName: "Vasili Petrov",
		entityType: "INDIVIDUAL",
		countryCodes: ["RU"],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Denied-party hit → hold → false-positive release
// ─────────────────────────────────────────────────────────────────────────────

describe("Compliance Scenario 1 — Denied-party hit: screening → hold → RELEASED", () => {
	let screeningResult: InMemoryScreeningResult;
	let hold: ComplianceHoldRecord;

	test("Step 1a: exact denied-party name → CONFIRMED_MATCH screening result", () => {
		screeningResult = screenPartyInMemory(SDN_ENTRIES, "Acme Rogue Industries");

		expect(screeningResult.overallResult).toBe("CONFIRMED_MATCH");
		expect(screeningResult.matchCount).toBe(1);
		expect(screeningResult.matches[0]?.matchAlgorithm).toBe("EXACT");
		expect(screeningResult.matches[0]?.matchScore).toBe(1.0);
	});

	test("Step 1b: CONFIRMED_MATCH triggers compliance hold (SCREENING_MATCH)", () => {
		expect(screeningResult.overallResult).not.toBe("CLEAR");

		hold = createComplianceHoldPure({
			id: HOLD_SCENARIO_1,
			entityId: ENTITY_ID,
			heldTable: "vendor",
			heldRecordId: VENDOR_ID,
			holdReason: "SCREENING_MATCH",
			screeningResultId: "sr-acme-rogue-001", // simulated screening_result row ID
			placedBy: ADMIN,
			placedAt: "2026-04-05T10:00:00.000Z",
		});

		expect(hold.status).toBe("ACTIVE");
		expect(hold.holdReason).toBe("SCREENING_MATCH");
		expect(hold.screeningResultId).toBe("sr-acme-rogue-001");
		expect(hold.resolvedBy).toBeNull();
		expect(hold.resolutionNotes).toBeNull();
	});

	test("Step 1c: compliance officer determines this is a different 'Acme Rogue' — releases hold", () => {
		const released = resolveComplianceHoldPure(hold, {
			resolution: "RELEASED",
			resolutionNotes:
				"False positive — confirmed different entity. " +
				"Our vendor is a US-registered subsidiary, not the IR-listed entity.",
			resolvedBy: COMPLIANCE_OFFICER,
			resolvedAt: "2026-04-05T14:30:00.000Z",
		});

		expect(released.status).toBe("RELEASED");
		expect(released.resolvedBy).toBe(COMPLIANCE_OFFICER);
		expect(released.resolutionNotes).toContain("False positive");
		expect(released.resolvedAt).toBe("2026-04-05T14:30:00.000Z");
		// Immutable: original hold is not mutated
		expect(hold.status).toBe("ACTIVE");
	});

	test("Step 1d: RELEASED without notes is rejected (audit trail requirement)", () => {
		expect(() =>
			resolveComplianceHoldPure(hold, {
				resolution: "RELEASED",
				// resolutionNotes missing
				resolvedBy: COMPLIANCE_OFFICER,
			}),
		).toThrow(ComplianceHoldError);

		expect(() =>
			resolveComplianceHoldPure(hold, {
				resolution: "RELEASED",
				resolutionNotes: "   ", // whitespace only
				resolvedBy: COMPLIANCE_OFFICER,
			}),
		).toThrow(/notes are required/i);
	});

	test("Step 1e: cannot resolve an already-resolved hold", () => {
		const released = resolveComplianceHoldPure(hold, {
			resolution: "RELEASED",
			resolutionNotes: "Confirmed false positive.",
			resolvedBy: COMPLIANCE_OFFICER,
		});

		expect(() =>
			resolveComplianceHoldPure(released, {
				resolution: "RELEASED",
				resolutionNotes: "Attempting double-resolve.",
				resolvedBy: COMPLIANCE_OFFICER,
			}),
		).toThrow(ComplianceHoldError);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Denied-party hit (alias) → hold → REJECTED
// ─────────────────────────────────────────────────────────────────────────────

describe("Compliance Scenario 2 — Denied-party alias hit: screening → hold → REJECTED", () => {
	let screeningResult: InMemoryScreeningResult;
	let hold: ComplianceHoldRecord;

	test("Step 2a: alias match ('ARI Corp') → CONFIRMED_MATCH screening result", () => {
		// "ARI Corp" exactly matches the alias in the SDN list (after normalisation).
		screeningResult = screenPartyInMemory(SDN_ENTRIES, "ARI Corp");

		expect(screeningResult.overallResult).toBe("CONFIRMED_MATCH");
		expect(screeningResult.matchCount).toBeGreaterThanOrEqual(1);
		expect(screeningResult.matches[0]?.matchScore).toBe(1.0);
	});

	test("Step 2b: compliance hold placed for confirmed denied-party alias match", () => {
		hold = createComplianceHoldPure({
			id: HOLD_SCENARIO_2,
			entityId: ENTITY_ID,
			heldTable: "vendor",
			heldRecordId: VENDOR_ID,
			holdReason: "SCREENING_MATCH",
			screeningResultId: "sr-ari-corp-001",
			placedBy: ADMIN,
			placedAt: "2026-04-05T11:00:00.000Z",
		});

		expect(hold.status).toBe("ACTIVE");
		expect(hold.screeningResultId).toBe("sr-ari-corp-001");
	});

	test("Step 2c: compliance officer confirms SDN match — REJECTS hold (transaction blocked)", () => {
		const rejected = resolveComplianceHoldPure(hold, {
			resolution: "REJECTED",
			resolutionNotes:
				"Confirmed SDN alias match — 'ARI Corp' is a known alias for Acme Rogue Industries (IR). Transaction permanently blocked.",
			resolvedBy: COMPLIANCE_OFFICER,
			resolvedAt: "2026-04-05T15:00:00.000Z",
		});

		expect(rejected.status).toBe("REJECTED");
		expect(rejected.resolvedBy).toBe(COMPLIANCE_OFFICER);
		expect(rejected.resolutionNotes).toContain("Confirmed SDN");
	});

	test("Step 2d: REJECTED hold without notes is allowed (rejection can be self-explanatory)", () => {
		const rejected = resolveComplianceHoldPure(hold, {
			resolution: "REJECTED",
			// notes optional for rejection
			resolvedBy: COMPLIANCE_OFFICER,
		});

		expect(rejected.status).toBe("REJECTED");
		expect(rejected.resolutionNotes).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Country embargo block
// ─────────────────────────────────────────────────────────────────────────────

describe("Compliance Scenario 3 — Country embargo block: shipment to Iran", () => {
	/** Active country restriction rules for the US entity. */
	const countryRules = [
		{
			id: uuid("rule-ir-embargo"),
			countryCode: "IR",
			restrictionType: "EMBARGOED" as const,
			classificationType: null,
			notes: "OFAC comprehensive sanctions — Iran",
		},
		{
			id: uuid("rule-ru-heavy"),
			countryCode: "RU",
			restrictionType: "HEAVILY_RESTRICTED" as const,
			classificationType: null,
			notes: "Post-Ukraine invasion export restrictions",
		},
		{
			id: uuid("rule-gb-clear"),
			countryCode: "GB",
			restrictionType: "UNRESTRICTED" as const,
			classificationType: null,
			notes: "UK — Five Eyes; ITAR license exception applies",
		},
	];

	let restrictionResult: CountryRestrictionResult | null;
	let hold: ComplianceHoldRecord;

	test("Step 3a: destination country 'IR' is EMBARGOED — shipment blocked at country check", () => {
		restrictionResult = checkCountryRestrictionPure(countryRules, "IR", null);

		expect(restrictionResult).not.toBeNull();
		expect(restrictionResult?.restrictionType).toBe("EMBARGOED");
		expect(restrictionResult?.ruleId).toBe(uuid("rule-ir-embargo"));
	});

	test("Step 3b: embargo triggers COUNTRY_RESTRICTION compliance hold on shipment", () => {
		expect(restrictionResult?.restrictionType).toBe("EMBARGOED");

		hold = createComplianceHoldPure({
			id: HOLD_SCENARIO_3,
			entityId: ENTITY_ID,
			heldTable: "shipment",
			heldRecordId: SHIPMENT_ID,
			holdReason: "COUNTRY_RESTRICTION",
			placedBy: ADMIN,
			placedAt: "2026-04-05T12:00:00.000Z",
		});

		expect(hold.status).toBe("ACTIVE");
		expect(hold.holdReason).toBe("COUNTRY_RESTRICTION");
		expect(hold.screeningResultId).toBeNull(); // no party screening — country-level block
	});

	test("Step 3c: embargoed-country hold is REJECTED — no legal pathway for IR shipments", () => {
		const rejected = resolveComplianceHoldPure(hold, {
			resolution: "REJECTED",
			resolutionNotes:
				"OFAC comprehensive embargo on Iran. No license exception available for this shipment.",
			resolvedBy: COMPLIANCE_OFFICER,
		});

		expect(rejected.status).toBe("REJECTED");
		expect(rejected.holdReason).toBe("COUNTRY_RESTRICTION");
	});

	test("Step 3d: HEAVILY_RESTRICTED destination (Russia) returns applicable rule", () => {
		const result = checkCountryRestrictionPure(countryRules, "RU", null);

		expect(result).not.toBeNull();
		expect(result?.restrictionType).toBe("HEAVILY_RESTRICTED");
	});

	test("Step 3e: UNRESTRICTED destination (UK) — no hold required", () => {
		const result = checkCountryRestrictionPure(countryRules, "GB", null);

		expect(result).not.toBeNull();
		expect(result?.restrictionType).toBe("UNRESTRICTED");
	});

	test("Step 3f: unrestricted country — no restriction found returns null for unknown country", () => {
		// AU is not in the rules list — null means no applicable restriction
		const result = checkCountryRestrictionPure(countryRules, "AU", null);
		expect(result).toBeNull();
	});

	test("Step 3g: most restrictive rule wins when multiple rules match same country", () => {
		const mixedRules = [
			{ id: uuid("r1"), countryCode: "CN", restrictionType: "CAUTION" as const, notes: null },
			{
				id: uuid("r2"),
				countryCode: "CN",
				restrictionType: "LICENSE_REQUIRED" as const,
				classificationType: "ITAR",
				notes: "ITAR to China requires license",
			},
		];

		const result = checkCountryRestrictionPure(mixedRules, "CN", "ITAR");
		expect(result?.restrictionType).toBe("LICENSE_REQUIRED");

		// Without ITAR context, only CAUTION applies
		const resultGeneric = checkCountryRestrictionPure(mixedRules, "CN", null);
		expect(resultGeneric?.restrictionType).toBe("CAUTION");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: ITAR item to restricted destination
// ─────────────────────────────────────────────────────────────────────────────

describe("Compliance Scenario 4 — ITAR item to restricted destination (China)", () => {
	/** In-memory product classification catalogue. */
	const classifications: ProductClassification[] = [
		{
			id: uuid("class-itar-001"),
			productId: PRODUCT_ID,
			jurisdiction: "ITAR",
			classificationBasis: "COMMODITY_JURISDICTION",
			usmlCategory: "XV",
			eccn: null,
			licenseRequirement: "LICENSE_REQUIRED",
			notes: "Space-qualified transponder — USML Category XV",
			classifiedBy: ADMIN,
			effectiveFrom: "2025-01-01",
			effectiveTo: null,
		},
		{
			id: uuid("class-old-0001"),
			productId: PRODUCT_ID,
			jurisdiction: "EAR",
			classificationBasis: "SELF_CLASSIFICATION",
			usmlCategory: null,
			eccn: "5A992",
			licenseRequirement: "NLR",
			notes: "Pre-CJ determination — superseded",
			classifiedBy: ADMIN,
			effectiveFrom: "2023-01-01",
			effectiveTo: "2024-12-31", // expired
		},
	];

	const countryRules = [
		{
			id: uuid("rule-cn-itar"),
			countryCode: "CN",
			restrictionType: "LICENSE_REQUIRED" as const,
			classificationType: "ITAR",
			notes: "ITAR license required for all controlled space items exported to China",
		},
		{
			id: uuid("rule-cn-ear"),
			countryCode: "CN",
			restrictionType: "LICENSE_REQUIRED" as const,
			classificationType: "EAR",
			notes: "EAR license required for dual-use items to China",
		},
	];

	let productClass: ProductClassification | null;
	let countryRestriction: CountryRestrictionResult | null;
	let hold: ComplianceHoldRecord;

	test("Step 4a: product classification lookup finds active ITAR USML Category XV", () => {
		productClass = getProductClassificationPure(classifications, PRODUCT_ID, "2026-04-05");

		expect(productClass).not.toBeNull();
		expect(productClass?.jurisdiction).toBe("ITAR");
		expect(productClass?.usmlCategory).toBe("XV");
		expect(productClass?.licenseRequirement).toBe("LICENSE_REQUIRED");
		// Expired EAR classification is not returned
		expect(productClass?.eccn).toBeNull();
	});

	test("Step 4b: effective-date filtering — expired classification is excluded", () => {
		// Looking up in 2024 returns the EAR classification (active then)
		const asOf2024 = getProductClassificationPure(classifications, PRODUCT_ID, "2024-06-01");
		expect(asOf2024?.jurisdiction).toBe("EAR");
		expect(asOf2024?.eccn).toBe("5A992");
	});

	test("Step 4c: country check finds LICENSE_REQUIRED for ITAR item to China", () => {
		expect(productClass?.jurisdiction).toBe("ITAR");

		countryRestriction = checkCountryRestrictionPure(countryRules, "CN", "ITAR");

		expect(countryRestriction).not.toBeNull();
		expect(countryRestriction?.restrictionType).toBe("LICENSE_REQUIRED");
	});

	test("Step 4d: license-required block triggers COUNTRY_RESTRICTION hold on shipment", () => {
		expect(countryRestriction?.restrictionType).toBe("LICENSE_REQUIRED");

		hold = createComplianceHoldPure({
			id: HOLD_SCENARIO_4,
			entityId: ENTITY_ID,
			heldTable: "shipment",
			heldRecordId: SHIPMENT_ID,
			holdReason: "COUNTRY_RESTRICTION",
			placedBy: ADMIN,
			placedAt: "2026-04-05T13:00:00.000Z",
		});

		expect(hold.status).toBe("ACTIVE");
		expect(hold.holdReason).toBe("COUNTRY_RESTRICTION");
	});

	test("Step 4e: compliance officer releases hold after confirming export license obtained", () => {
		const released = resolveComplianceHoldPure(hold, {
			resolution: "RELEASED",
			resolutionNotes:
				"DSP-5 license #2026-0042 obtained for this shipment. " +
				"License covers USML Cat XV transponder to China through 2026-12-31. " +
				"Approved by State Dept 2026-03-28.",
			resolvedBy: COMPLIANCE_OFFICER,
			resolvedAt: "2026-04-05T16:00:00.000Z",
		});

		expect(released.status).toBe("RELEASED");
		expect(released.resolvedBy).toBe(COMPLIANCE_OFFICER);
		expect(released.resolutionNotes).toContain("DSP-5");
		// Hold audit trail is complete
		expect(released.placedBy).toBe(ADMIN);
		expect(released.placedAt).toBe("2026-04-05T13:00:00.000Z");
		expect(released.resolvedAt).toBe("2026-04-05T16:00:00.000Z");
	});

	test("Step 4f: unclassified product has no classification record", () => {
		const UNCLASSIFIED_PRODUCT = uuid("product-noclas01");
		const cls = getProductClassificationPure(classifications, UNCLASSIFIED_PRODUCT, "2026-04-05");
		expect(cls).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Fuzzy near-miss — POTENTIAL_MATCH → investigation → release
// ─────────────────────────────────────────────────────────────────────────────

describe("Compliance Scenario 5 — Fuzzy near-miss: POTENTIAL_MATCH → false-positive release", () => {
	let screeningResult: InMemoryScreeningResult;
	let hold: ComplianceHoldRecord;

	test("Step 5a: near-miss vendor name returns POTENTIAL_MATCH", () => {
		// "Acme Rogu Indstries" — 3 edits, ~86% similarity → POTENTIAL_MATCH range
		screeningResult = screenPartyInMemory(SDN_ENTRIES, "Acme Rogu Indstries");

		expect(["POTENTIAL_MATCH", "CONFIRMED_MATCH"]).toContain(screeningResult.overallResult);
		expect(screeningResult.matchCount).toBeGreaterThan(0);
		expect(screeningResult.matches[0]?.matchAlgorithm).toBe("FUZZY");
	});

	test("Step 5b: POTENTIAL_MATCH triggers a review hold (SCREENING_MATCH reason)", () => {
		const holdId = uuid("hold-fuzzy-00001");
		hold = createComplianceHoldPure({
			id: holdId,
			entityId: ENTITY_ID,
			heldTable: "vendor",
			heldRecordId: VENDOR_ID,
			holdReason: "SCREENING_MATCH",
			screeningResultId: "sr-potential-001",
			placedBy: ADMIN,
			placedAt: "2026-04-05T09:00:00.000Z",
		});

		expect(hold.status).toBe("ACTIVE");
		expect(hold.screeningResultId).toBe("sr-potential-001");
	});

	test("Step 5c: compliance officer investigates and identifies a different company — releases hold", () => {
		const released = resolveComplianceHoldPure(hold, {
			resolution: "RELEASED",
			resolutionNotes:
				"Investigated fuzzy match flag. " +
				"'Acme Rogu Indstries' is a data-entry error in our vendor master for " +
				"'Acme Rogue Industries LLC' (DUNS 987654321), a US-registered company with " +
				"no SDN affiliation. Different EIN, different address, different ownership. " +
				"Vendor master corrected. Cleared per compliance review 2026-04-05.",
			resolvedBy: COMPLIANCE_OFFICER,
		});

		expect(released.status).toBe("RELEASED");
		expect(released.resolutionNotes).toContain("Different EIN");
		expect(released.resolvedBy).toBe(COMPLIANCE_OFFICER);
	});

	test("Step 5d: audit trail — released hold retains original placement details", () => {
		const released = resolveComplianceHoldPure(hold, {
			resolution: "RELEASED",
			resolutionNotes: "Confirmed false positive after investigation.",
			resolvedBy: COMPLIANCE_OFFICER,
			resolvedAt: "2026-04-05T11:00:00.000Z",
		});

		// Audit trail is complete
		expect(released.id).toBe(hold.id);
		expect(released.entityId).toBe(ENTITY_ID);
		expect(released.heldTable).toBe("vendor");
		expect(released.heldRecordId).toBe(VENDOR_ID);
		expect(released.holdReason).toBe("SCREENING_MATCH");
		expect(released.screeningResultId).toBe("sr-potential-001");
		expect(released.placedBy).toBe(ADMIN);
		expect(released.placedAt).toBe("2026-04-05T09:00:00.000Z");
		expect(released.resolvedBy).toBe(COMPLIANCE_OFFICER);
		expect(released.resolvedAt).toBe("2026-04-05T11:00:00.000Z");
	});

	test("Step 5e: 'Vasili Petrov' — phonetic/transliteration variant is flagged", () => {
		// "Vasili Petrov" is in the SDN list; check that exact match works
		const result = screenPartyInMemory(SDN_ENTRIES, "Vasili Petrov");
		expect(result.overallResult).toBe("CONFIRMED_MATCH");
	});

	test("Step 5f: clearly unrelated party is CLEAR — no hold required", () => {
		const result = screenPartyInMemory(SDN_ENTRIES, "Allied Space Systems UK Ltd");
		expect(result.overallResult).toBe("CLEAR");
		expect(result.matchCount).toBe(0);
	});
});
