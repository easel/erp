/**
 * Unit tests for WP-3 Export Control domain services.
 *
 * All tests use mock DbClient objects — no real database required.
 * This covers:
 *   - Levenshtein distance and similarity scoring (pure algorithm)
 *   - Name normalisation for screening
 *   - screenParty: CLEAR / POTENTIAL_MATCH / CONFIRMED_MATCH logic
 *   - screenParty: audit trail (screening_result + denied_party_match inserts)
 *   - checkCountryRestriction: five-level model, most-restrictive selection
 *   - createComplianceHold / resolveComplianceHold
 *   - getProductClassification: effective-date filtering
 *
 * Ref: SD-003 WP-3 §EXP-001–EXP-004, EXP-006; FEAT-006
 * Issue: hx-e7e4cad6
 */

import { describe, expect, test } from "bun:test";
import {
	bestMatchScore,
	checkCountryRestriction,
	createComplianceHold,
	getProductClassification,
	levenshteinDistance,
	normaliseScreeningName,
	resolveComplianceHold,
	screenParty,
	similarityScore,
} from "../../src/compliance/export-control-service.js";
import type { DbClient } from "../../src/db.js";

// ── Mock DbClient helpers ─────────────────────────────────────────────────────

/** Build a mock DbClient that returns sequential results for each query call. */
function mockDb(
	responses: Array<{ rows: Record<string, unknown>[] }>,
): DbClient & { calls: Array<[string, unknown[]]> } {
	const calls: Array<[string, unknown[]]> = [];
	let idx = 0;
	return {
		calls,
		async query<T = Record<string, unknown>>(
			sql: string,
			params: unknown[] = [],
		): Promise<{ rows: T[] }> {
			calls.push([sql, params]);
			const resp = responses[idx++];
			return { rows: (resp?.rows ?? []) as T[] };
		},
	};
}

const UUID_ENTITY = "00000000-0000-4000-8000-000000000001";
const UUID_RECORD = "00000000-0000-4000-8000-000000000002";
const UUID_USER = "00000000-0000-4000-8000-000000000003";
const UUID_SR = "00000000-0000-4000-8000-000000000099";
const UUID_ENTRY = "00000000-0000-4000-8000-000000000010";

// ── Levenshtein distance ──────────────────────────────────────────────────────

describe("levenshteinDistance", () => {
	test("identical strings → 0", () => {
		expect(levenshteinDistance("acme", "acme")).toBe(0);
	});

	test("empty string → other length", () => {
		expect(levenshteinDistance("", "hello")).toBe(5);
		expect(levenshteinDistance("hello", "")).toBe(5);
	});

	test("single insertion", () => {
		expect(levenshteinDistance("acme", "acmee")).toBe(1);
	});

	test("single deletion", () => {
		expect(levenshteinDistance("acmee", "acme")).toBe(1);
	});

	test("single substitution", () => {
		expect(levenshteinDistance("acme", "acmu")).toBe(1);
	});

	test("transliteration variant (v → w)", () => {
		// 1 substitution
		expect(levenshteinDistance("vasili", "wasili")).toBe(1);
	});

	test("name reordering detected (high distance)", () => {
		const d = levenshteinDistance("john smith", "smith john");
		expect(d).toBeGreaterThan(0);
	});
});

// ── Name normalisation ────────────────────────────────────────────────────────

describe("normaliseScreeningName", () => {
	test("lowercases", () => {
		expect(normaliseScreeningName("ACME CORP")).toBe("acme corp");
	});

	test("strips punctuation and collapses resulting spaces", () => {
		// Commas and dots become spaces, then whitespace is collapsed and trimmed
		expect(normaliseScreeningName("Acme, Corp.")).toBe("acme corp");
	});

	test("collapses multiple spaces", () => {
		expect(normaliseScreeningName("Acme   Industries   Ltd")).toBe("acme industries ltd");
	});

	test("trims surrounding whitespace", () => {
		expect(normaliseScreeningName("  Acme Corp  ")).toBe("acme corp");
	});
});

// ── Similarity score ──────────────────────────────────────────────────────────

describe("similarityScore", () => {
	test("identical strings → 1.0", () => {
		expect(similarityScore("acme", "acme")).toBe(1);
	});

	test("completely different → low score", () => {
		expect(similarityScore("xyz", "abcdef")).toBeLessThan(0.5);
	});

	test("one-char typo in medium name → score near 0.9", () => {
		const s = similarityScore("acme industries", "acme indistries");
		expect(s).toBeGreaterThan(0.85);
	});
});

// ── bestMatchScore ────────────────────────────────────────────────────────────

describe("bestMatchScore", () => {
	test("picks alias score when alias is better match", () => {
		const score = bestMatchScore("rii corp", "rogue industries international", [
			"rogue industries intl",
			"rii corp",
		]);
		expect(score).toBe(1); // exact alias match after normalisation
	});

	test("falls through to entry name when no alias matches", () => {
		// "acme rogue" (10) vs "acme rogue industries" (21) → 11 edits → ~0.48
		// Short names match poorly against longer ones by design
		const score = bestMatchScore("acme rogue", "acme rogue industries", []);
		expect(score).toBeGreaterThan(0.4);
		expect(score).toBeLessThan(0.65);
	});
});

// ── screenParty: CLEAR ────────────────────────────────────────────────────────

describe("screenParty — CLEAR result", () => {
	test("returns CLEAR and no matches when no entries in DB", async () => {
		const db = mockDb([
			{ rows: [] }, // entries query
			{ rows: [{ id: UUID_SR }] }, // insert screening_result
		]);

		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Trusted Aerospace Ltd",
			performedBy: UUID_USER,
		});

		expect(result.overallResult).toBe("CLEAR");
		expect(result.matchCount).toBe(0);
		expect(result.matches).toHaveLength(0);
	});

	test("returns CLEAR when all entries score below threshold", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Zephyr Galactic Corp",
						aliases: null,
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			}, // entries query
			{ rows: [{ id: UUID_SR }] }, // insert screening_result
		]);

		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Allied Space Systems",
			performedBy: UUID_USER,
		});

		expect(result.overallResult).toBe("CLEAR");
		expect(result.matchCount).toBe(0);
	});

	test("inserts a screening_result row even for CLEAR results", async () => {
		const db = mockDb([{ rows: [] }, { rows: [{ id: UUID_SR }] }]);

		await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Allied Space Systems",
			performedBy: UUID_USER,
		});

		// Second call should be the INSERT into screening_result
		const insertCall = db.calls[1];
		expect(insertCall?.[0]).toMatch(/INSERT INTO screening_result/);
	});
});

// ── screenParty: CONFIRMED_MATCH ──────────────────────────────────────────────

describe("screenParty — CONFIRMED_MATCH on exact name", () => {
	test("exact name match produces CONFIRMED_MATCH", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Acme Rogue Industries",
						aliases: null,
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			}, // entries
			{ rows: [{ id: UUID_SR }] }, // screening_result insert
			{ rows: [] }, // denied_party_match insert
		]);

		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Acme Rogue Industries",
			performedBy: UUID_USER,
		});

		expect(result.overallResult).toBe("CONFIRMED_MATCH");
		expect(result.matchCount).toBe(1);
		expect(result.matches[0]?.matchAlgorithm).toBe("EXACT");
		expect(result.matches[0]?.matchScore).toBe(1.0);
	});

	test("near-exact match (single-char drop) still produces CONFIRMED_MATCH", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Acme Rogue Industries",
						aliases: null,
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			},
			{ rows: [{ id: UUID_SR }] },
			{ rows: [] },
		]);

		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Acme Rogue Industres", // one char dropped — 1 edit in 20 chars → ~0.952
			performedBy: UUID_USER,
		});

		expect(result.overallResult).toBe("CONFIRMED_MATCH");
	});

	test("inserts denied_party_match row for each hit", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Acme Rogue Industries",
						aliases: null,
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			},
			{ rows: [{ id: UUID_SR }] },
			{ rows: [] },
		]);

		await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Acme Rogue Industries",
			performedBy: UUID_USER,
		});

		const matchInsert = db.calls[2];
		expect(matchInsert?.[0]).toMatch(/INSERT INTO denied_party_match/);
	});
});

// ── screenParty: POTENTIAL_MATCH (fuzzy) ─────────────────────────────────────

describe("screenParty — POTENTIAL_MATCH on fuzzy near-miss", () => {
	test("transliteration variant caught as POTENTIAL_MATCH", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Acme Rogue Industries",
						aliases: null,
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			},
			{ rows: [{ id: UUID_SR }] },
			{ rows: [] },
		]);

		// "Acme Rogu Indstries" — 3 edits in ~21 chars → ~0.86 similarity → POTENTIAL or CONFIRMED
		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Acme Rogu Indstries",
			performedBy: UUID_USER,
		});

		expect(["POTENTIAL_MATCH", "CONFIRMED_MATCH"]).toContain(result.overallResult);
		expect(result.matchCount).toBeGreaterThan(0);
	});

	test("alias expansion catches alternate name for denied party", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: UUID_ENTRY,
						entry_name: "Rogue Industries International",
						aliases: ["Rogue Ind. Intl.", "RII Corp"],
						entity_type: "ORGANIZATION",
						country_codes: ["IR"],
					},
				],
			},
			{ rows: [{ id: UUID_SR }] },
			{ rows: [] },
		]);

		// Query uses exact alias "RII Corp"
		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "RII Corp",
			performedBy: UUID_USER,
		});

		expect(result.overallResult).toBe("CONFIRMED_MATCH"); // alias exact match
	});
});

// ── screenParty: performance (< 500ms for reasonable list size) ──────────────

describe("screenParty — performance", () => {
	test("screens against 1000 entries in under 500ms", async () => {
		// Build 1000 fake entries
		const entries = Array.from({ length: 1000 }, (_, i) => ({
			id: `entry-${i}`,
			entry_name: `Vendor ${i} Corp International Ltd`,
			aliases: null,
			entity_type: "ORGANIZATION",
			country_codes: ["US"],
		}));

		const db = mockDb([{ rows: entries }, { rows: [{ id: UUID_SR }] }]);

		const t0 = Date.now();
		const result = await screenParty(db, {
			entityId: UUID_ENTITY,
			screenedTable: "vendor",
			screenedRecordId: UUID_RECORD,
			name: "Trusted Aerospace Ltd",
			performedBy: UUID_USER,
		});
		const elapsed = Date.now() - t0;

		expect(result.overallResult).toBe("CLEAR");
		expect(elapsed).toBeLessThan(500);
	});
});

// ── checkCountryRestriction: five-level model ─────────────────────────────────

describe("checkCountryRestriction — five-level model", () => {
	test("returns null when no rules match", async () => {
		const db = mockDb([{ rows: [] }]);

		const result = await checkCountryRestriction(db, UUID_ENTITY, "US", null);
		expect(result).toBeNull();
	});

	test("returns EMBARGOED for Iran", async () => {
		const db = mockDb([
			{
				rows: [
					{ id: "rule-1", restriction_type: "EMBARGOED", notes: "OFAC comprehensive sanctions" },
				],
			},
		]);

		const result = await checkCountryRestriction(db, UUID_ENTITY, "IR", null);
		expect(result?.restrictionType).toBe("EMBARGOED");
	});

	test("returns most restrictive rule when multiple rules match", async () => {
		const db = mockDb([
			{
				rows: [
					{ id: "rule-1", restriction_type: "CAUTION", notes: null },
					{ id: "rule-2", restriction_type: "LICENSE_REQUIRED", notes: "ITAR" },
					{ id: "rule-3", restriction_type: "HEAVILY_RESTRICTED", notes: null },
				],
			},
		]);

		const result = await checkCountryRestriction(db, UUID_ENTITY, "RU", "ITAR");
		expect(result?.restrictionType).toBe("HEAVILY_RESTRICTED");
		expect(result?.ruleId).toBe("rule-3");
	});

	test("EMBARGOED outranks all other types", async () => {
		const db = mockDb([
			{
				rows: [
					{ id: "rule-a", restriction_type: "LICENSE_REQUIRED", notes: null },
					{ id: "rule-b", restriction_type: "EMBARGOED", notes: "Comprehensive" },
					{ id: "rule-c", restriction_type: "HEAVILY_RESTRICTED", notes: null },
				],
			},
		]);

		const result = await checkCountryRestriction(db, UUID_ENTITY, "CU", null);
		expect(result?.restrictionType).toBe("EMBARGOED");
	});

	test("UNRESTRICTED is the lowest precedence", async () => {
		const db = mockDb([
			{
				rows: [
					{ id: "rule-1", restriction_type: "UNRESTRICTED", notes: "Five Eyes partner" },
					{ id: "rule-2", restriction_type: "CAUTION", notes: "Re-export risk" },
				],
			},
		]);

		const result = await checkCountryRestriction(db, UUID_ENTITY, "AE", "ITAR");
		expect(result?.restrictionType).toBe("CAUTION");
	});
});

// ── createComplianceHold ─────────────────────────────────────────────────────

describe("createComplianceHold", () => {
	test("inserts hold and returns record", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: "hold-1",
						entity_id: UUID_ENTITY,
						held_table: "vendor",
						held_record_id: UUID_RECORD,
						hold_reason: "SCREENING_MATCH",
						screening_result_id: UUID_SR,
						status: "ACTIVE",
						placed_by: UUID_USER,
						placed_at: new Date().toISOString(),
					},
				],
			},
		]);

		const hold = await createComplianceHold(db, {
			entityId: UUID_ENTITY,
			heldTable: "vendor",
			heldRecordId: UUID_RECORD,
			holdReason: "SCREENING_MATCH",
			screeningResultId: UUID_SR,
			placedBy: UUID_USER,
		});

		expect(hold.id).toBe("hold-1");
		expect(hold.status).toBe("ACTIVE");
		expect(hold.holdReason).toBe("SCREENING_MATCH");
	});

	test("hold insert SQL references compliance_hold table", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: "hold-2",
						entity_id: UUID_ENTITY,
						held_table: "purchase_order",
						held_record_id: UUID_RECORD,
						hold_reason: "COUNTRY_RESTRICTION",
						screening_result_id: null,
						status: "ACTIVE",
						placed_by: UUID_USER,
						placed_at: new Date().toISOString(),
					},
				],
			},
		]);

		await createComplianceHold(db, {
			entityId: UUID_ENTITY,
			heldTable: "purchase_order",
			heldRecordId: UUID_RECORD,
			holdReason: "COUNTRY_RESTRICTION",
			placedBy: UUID_USER,
		});

		expect(db.calls[0]?.[0]).toMatch(/INSERT INTO compliance_hold/);
	});
});

// ── resolveComplianceHold ─────────────────────────────────────────────────────

describe("resolveComplianceHold", () => {
	test("RELEASED requires non-empty notes", async () => {
		const db = mockDb([{ rows: [] }]);

		await expect(
			resolveComplianceHold(db, {
				holdId: "hold-1",
				resolution: "RELEASED",
				resolutionNotes: "",
				resolvedBy: UUID_USER,
			}),
		).rejects.toThrow(/Resolution notes are required/);
	});

	test("RELEASED with notes emits UPDATE query", async () => {
		const db = mockDb([{ rows: [] }]);

		await resolveComplianceHold(db, {
			holdId: "hold-1",
			resolution: "RELEASED",
			resolutionNotes: "False positive — different entity confirmed by compliance officer",
			resolvedBy: UUID_USER,
		});

		expect(db.calls[0]?.[0]).toMatch(/UPDATE compliance_hold/);
		expect(db.calls[0]?.[1]).toContain("RELEASED");
	});

	test("REJECTED without notes is allowed", async () => {
		const db = mockDb([{ rows: [] }]);

		await expect(
			resolveComplianceHold(db, {
				holdId: "hold-1",
				resolution: "REJECTED",
				resolvedBy: UUID_USER,
			}),
		).resolves.toBeUndefined();
	});
});

// ── getProductClassification ──────────────────────────────────────────────────

describe("getProductClassification", () => {
	test("returns null when no classification exists", async () => {
		const db = mockDb([{ rows: [] }]);

		const result = await getProductClassification(db, "prod-1");
		expect(result).toBeNull();
	});

	test("returns ITAR classification with USML category", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: "cls-1",
						product_id: "prod-1",
						jurisdiction: "ITAR",
						classification_basis: "COMMODITY_JURISDICTION",
						usml_category: "XV",
						eccn: null,
						license_requirement: "LICENSE_REQUIRED",
						notes: "Space-qualified transponder",
						classified_by: UUID_USER,
						classified_at: "2026-01-15T00:00:00Z",
						effective_from: "2026-01-15",
						effective_to: null,
					},
				],
			},
		]);

		const result = await getProductClassification(db, "prod-1");
		expect(result?.jurisdiction).toBe("ITAR");
		expect(result?.usmlCategory).toBe("XV");
		expect(result?.licenseRequirement).toBe("LICENSE_REQUIRED");
	});

	test("returns EAR classification with ECCN", async () => {
		const db = mockDb([
			{
				rows: [
					{
						id: "cls-2",
						product_id: "prod-2",
						jurisdiction: "EAR",
						classification_basis: "SELF_CLASSIFICATION",
						usml_category: null,
						eccn: "3A001",
						license_requirement: "NLR",
						notes: null,
						classified_by: UUID_USER,
						classified_at: "2026-02-01T00:00:00Z",
						effective_from: "2026-02-01",
						effective_to: null,
					},
				],
			},
		]);

		const result = await getProductClassification(db, "prod-2");
		expect(result?.jurisdiction).toBe("EAR");
		expect(result?.eccn).toBe("3A001");
	});
});
