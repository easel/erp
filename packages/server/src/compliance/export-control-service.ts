/**
 * Export Control domain services — WP-3: Classification, Denied-Party Screening,
 * Country Restriction, and Compliance Hold management.
 *
 * All services accept a DbClient so they can be unit-tested with mock clients
 * and used in production with the real pg.Pool.
 *
 * Screening algorithm:
 *   1. Normalise the query name (lowercase, strip punctuation, collapse whitespace).
 *   2. Compute Levenshtein similarity against every active entry's name + aliases.
 *   3. Best score >= CONFIRMED_THRESHOLD → CONFIRMED_MATCH.
 *   4. Best score >= POTENTIAL_THRESHOLD → POTENTIAL_MATCH.
 *   5. Otherwise → CLEAR.
 *
 * Performance: active-list scan is O(N * L) where N = entry count and L = max name
 * length. For Phase 1 list sizes (<100K entries) this stays well under 500ms.
 * A pg_trgm GIN index can be added in a follow-on issue for larger lists.
 *
 * Ref: SD-003 WP-3 §EXP-001–EXP-004, EXP-006, EXP-012
 * Issue: hx-e7e4cad6
 */

import type { DbClient } from "../db.js";

// ── Thresholds ─────────────────────────────────────────────────────────────────

/** Minimum similarity score for a CONFIRMED_MATCH (essentially exact). */
const CONFIRMED_THRESHOLD = 0.92;
/** Minimum similarity score for a POTENTIAL_MATCH (near-miss). */
const POTENTIAL_THRESHOLD = 0.72;

// ── Levenshtein distance (pure TS, no external deps) ──────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses a two-row rolling array to keep memory at O(min(m,n)).
 */
export function levenshteinDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// Ensure a is the shorter string for memory efficiency
	if (a.length > b.length) return levenshteinDistance(b, a);

	const m = a.length;
	const n = b.length;

	let prev = Array.from({ length: m + 1 }, (_, i) => i);
	let curr = new Array<number>(m + 1);

	for (let j = 1; j <= n; j++) {
		curr[0] = j;
		for (let i = 1; i <= m; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const prevI: number = prev[i] ?? m;
			const currPrev: number = curr[i - 1] ?? m;
			const prevPrev: number = prev[i - 1] ?? m;
			curr[i] = Math.min(
				prevI + 1, // deletion
				currPrev + 1, // insertion
				prevPrev + cost, // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[m] ?? 0;
}

/**
 * Normalise a party name for screening comparison:
 *   - Lowercase
 *   - Strip punctuation (keep letters, digits, spaces)
 *   - Collapse multiple spaces
 *   - Trim
 */
export function normaliseScreeningName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Compute a similarity score in [0, 1] between two normalised strings.
 * Score = 1 - (editDistance / max(len_a, len_b)).
 * Returns 1.0 for identical strings, 0.0 when completely different.
 */
export function similarityScore(a: string, b: string): number {
	const dist = levenshteinDistance(a, b);
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;
	return 1 - dist / maxLen;
}

/**
 * Compute the best match score for a query name against an entry name and its aliases.
 * Returns the highest similarity score found.
 */
export function bestMatchScore(
	queryNorm: string,
	entryNorm: string,
	aliasesNorm: string[],
): number {
	let best = similarityScore(queryNorm, entryNorm);
	for (const alias of aliasesNorm) {
		const s = similarityScore(queryNorm, alias);
		if (s > best) best = s;
	}
	return best;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface ScreeningListEntryRow {
	id: string;
	entry_name: string;
	aliases: string[] | null;
	entity_type: string | null;
	country_codes: string[] | null;
}

interface ScreeningResultRow {
	id: string;
}

interface CountryRestrictionRuleRow {
	id: string;
	restriction_type: string;
	notes: string | null;
}

interface ProductClassificationRow {
	id: string;
	product_id: string;
	jurisdiction: string;
	classification_basis: string | null;
	usml_category: string | null;
	eccn: string | null;
	license_requirement: string | null;
	notes: string | null;
	classified_by: string;
	classified_at: string;
	effective_from: string;
	effective_to: string | null;
}

// ── Screening result types ────────────────────────────────────────────────────

export type OverallResult = "CLEAR" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH";
export type MatchAlgorithm = "EXACT" | "FUZZY";

export interface ScreeningMatch {
	/** UUID of the matching screening_list_entry row. */
	entryId: string;
	/** Listed name of the matching entry. */
	entryName: string;
	/** Similarity score in [0, 1]. */
	matchScore: number;
	/** Which algorithm produced the match. */
	matchAlgorithm: MatchAlgorithm;
	/** Field(s) that produced the match. */
	matchedFields: Record<string, string>;
}

export interface DbScreeningResult {
	screeningResultId: string;
	overallResult: OverallResult;
	matchCount: number;
	matches: ScreeningMatch[];
	/** Duration of the DB query + scoring, in milliseconds. */
	durationMs: number;
}

// ── DeniedPartyScreeningService ───────────────────────────────────────────────

export interface ScreenPartyParams {
	/** Legal entity context (required for screening_result FK). */
	entityId: string;
	/** Table name of the record being screened (e.g. "vendor", "customer"). */
	screenedTable: string;
	/** UUID of the record being screened. */
	screenedRecordId: string;
	/** The name to screen. */
	name: string;
	/** UUID of the user or system performing the screening. */
	performedBy: string;
}

/**
 * Screen a party name against all active denied-party lists in the database.
 *
 * Writes a `screening_result` row (and `denied_party_match` rows for hits)
 * providing a full audit trail. Returns the composite result.
 *
 * Performance: the active-entry fetch is indexed on screening_list_id and
 * entry_name. In-memory Levenshtein scoring runs in a single synchronous pass
 * once the rows are loaded.
 */
export async function screenParty(
	db: DbClient,
	params: ScreenPartyParams,
): Promise<DbScreeningResult> {
	const t0 = Date.now();
	const { entityId, screenedTable, screenedRecordId, name, performedBy } = params;

	// 1. Fetch all active, non-delisted screening list entries
	const entriesResult = await db.query<ScreeningListEntryRow>(
		`SELECT sle.id, sle.entry_name, sle.aliases, sle.entity_type, sle.country_codes
		 FROM screening_list_entry sle
		 JOIN screening_list sl ON sl.id = sle.screening_list_id
		 WHERE sl.is_active = TRUE
		   AND (sle.delisted_date IS NULL OR sle.delisted_date > CURRENT_DATE)`,
	);

	// 2. Score each entry
	const queryNorm = normaliseScreeningName(name);
	const matches: ScreeningMatch[] = [];

	for (const row of entriesResult.rows) {
		const entryNorm = normaliseScreeningName(row.entry_name);
		const aliasesNorm = (row.aliases ?? []).map(normaliseScreeningName);

		// Check exact first (fast path)
		if (queryNorm === entryNorm || aliasesNorm.includes(queryNorm)) {
			matches.push({
				entryId: row.id,
				entryName: row.entry_name,
				matchScore: 1.0,
				matchAlgorithm: "EXACT",
				matchedFields: { name: name },
			});
			continue;
		}

		const score = bestMatchScore(queryNorm, entryNorm, aliasesNorm);
		if (score >= POTENTIAL_THRESHOLD) {
			const isAlias =
				aliasesNorm.some((a) => similarityScore(queryNorm, a) >= POTENTIAL_THRESHOLD) &&
				similarityScore(queryNorm, entryNorm) < similarityScore(queryNorm, aliasesNorm[0] ?? "");
			matches.push({
				entryId: row.id,
				entryName: row.entry_name,
				matchScore: score,
				matchAlgorithm: "FUZZY",
				matchedFields: isAlias ? { alias: name } : { name: name },
			});
		}
	}

	// 3. Determine overall result
	const overallResult: OverallResult = matches.some((m) => m.matchScore >= CONFIRMED_THRESHOLD)
		? "CONFIRMED_MATCH"
		: matches.length > 0
			? "POTENTIAL_MATCH"
			: "CLEAR";

	// 4. Persist screening result
	const srResult = await db.query<ScreeningResultRow>(
		`INSERT INTO screening_result
		   (entity_id, screened_table, screened_record_id, screened_name,
		    screening_type, overall_result, match_count, created_by)
		 VALUES ($1, $2, $3, $4, 'AUTOMATED', $5, $6, $7)
		 RETURNING id`,
		[entityId, screenedTable, screenedRecordId, name, overallResult, matches.length, performedBy],
	);
	const screeningResultId = srResult.rows[0]?.id ?? crypto.randomUUID();

	// 5. Persist denied_party_match rows for each hit
	for (const match of matches) {
		await db.query(
			`INSERT INTO denied_party_match
			   (screening_result_id, screening_list_entry_id,
			    match_score, match_algorithm, matched_fields)
			 VALUES ($1, $2, $3, $4, $5)`,
			[
				screeningResultId,
				match.entryId,
				match.matchScore.toFixed(4),
				match.matchAlgorithm,
				JSON.stringify(match.matchedFields),
			],
		);
	}

	return {
		screeningResultId,
		overallResult,
		matchCount: matches.length,
		matches,
		durationMs: Date.now() - t0,
	};
}

// ── ClassificationEngine ──────────────────────────────────────────────────────

export type Jurisdiction = "ITAR" | "EAR" | "NOT_CONTROLLED";

export interface ProductClassification {
	id: string;
	productId: string;
	jurisdiction: Jurisdiction;
	classificationBasis: string | null;
	usmlCategory: string | null;
	eccn: string | null;
	licenseRequirement: string | null;
	notes: string | null;
	classifiedBy: string;
	classifiedAt: Date;
	effectiveFrom: string;
	effectiveTo: string | null;
}

/**
 * Retrieve the current effective product classification (if any).
 *
 * Returns the most recently effective classification that has not yet expired
 * as of the given date (defaults to today).
 */
export async function getProductClassification(
	db: DbClient,
	productId: string,
	asOf: Date = new Date(),
): Promise<ProductClassification | null> {
	const asOfStr = asOf.toISOString().slice(0, 10); // YYYY-MM-DD

	const result = await db.query<ProductClassificationRow>(
		`SELECT id, product_id, jurisdiction, classification_basis,
		        usml_category, eccn, license_requirement, notes,
		        classified_by, classified_at, effective_from, effective_to
		 FROM product_classification
		 WHERE product_id = $1
		   AND effective_from <= $2
		   AND (effective_to IS NULL OR effective_to >= $2)
		 ORDER BY effective_from DESC
		 LIMIT 1`,
		[productId, asOfStr],
	);

	const row = result.rows[0];
	if (!row) return null;

	return {
		id: row.id,
		productId: row.product_id,
		jurisdiction: row.jurisdiction as Jurisdiction,
		classificationBasis: row.classification_basis,
		usmlCategory: row.usml_category,
		eccn: row.eccn,
		licenseRequirement: row.license_requirement,
		notes: row.notes,
		classifiedBy: row.classified_by,
		classifiedAt: new Date(row.classified_at),
		effectiveFrom: row.effective_from,
		effectiveTo: row.effective_to,
	};
}

// ── CountryRestrictionService ─────────────────────────────────────────────────

export type RestrictionType =
	| "EMBARGOED"
	| "HEAVILY_RESTRICTED"
	| "LICENSE_REQUIRED"
	| "CAUTION"
	| "UNRESTRICTED";

export interface CountryRestrictionResult {
	ruleId: string;
	restrictionType: RestrictionType;
	notes: string | null;
}

/**
 * Precedence order for restriction types (highest = most restrictive).
 * Used to select the most restrictive applicable rule when multiple match.
 */
const RESTRICTION_PRECEDENCE: Record<RestrictionType, number> = {
	EMBARGOED: 5,
	HEAVILY_RESTRICTED: 4,
	LICENSE_REQUIRED: 3,
	CAUTION: 2,
	UNRESTRICTED: 1,
};

/**
 * Determine the applicable restriction level for a given country and
 * (optional) classification type.
 *
 * Checks all active country restriction sets for the entity, looking for rules
 * that apply to the given country code. When a classification type is supplied
 * (e.g. "ITAR"), type-specific rules take precedence over generic (NULL) rules.
 * Returns the most restrictive applicable rule, or null if none match.
 */
export async function checkCountryRestriction(
	db: DbClient,
	entityId: string,
	countryCode: string,
	classificationType: string | null,
	asOf: Date = new Date(),
): Promise<CountryRestrictionResult | null> {
	const asOfStr = asOf.toISOString().slice(0, 10);

	// Fetch rules matching the country code, optionally filtered by classification type.
	// We load both typed and generic rules and pick the most restrictive below.
	const result = await db.query<CountryRestrictionRuleRow>(
		`SELECT crr.id, crr.restriction_type, crr.notes
		 FROM country_restriction_rule crr
		 JOIN country_restriction cr ON cr.id = crr.country_restriction_id
		 WHERE cr.entity_id = $1
		   AND cr.is_active = TRUE
		   AND crr.country_code = $2
		   AND crr.effective_from <= $3
		   AND (crr.effective_to IS NULL OR crr.effective_to >= $3)
		   AND (crr.classification_type IS NULL
		        OR crr.classification_type = $4)
		 ORDER BY crr.effective_from DESC`,
		[entityId, countryCode, asOfStr, classificationType],
	);

	if (result.rows.length === 0) return null;

	// Select the most restrictive rule
	let best: CountryRestrictionRuleRow | null = null;
	for (const row of result.rows) {
		if (best === null) {
			best = row;
			continue;
		}
		const bestPrec = RESTRICTION_PRECEDENCE[best.restriction_type as RestrictionType] ?? 0;
		const rowPrec = RESTRICTION_PRECEDENCE[row.restriction_type as RestrictionType] ?? 0;
		if (rowPrec > bestPrec) best = row;
	}

	if (!best) return null;
	return {
		ruleId: best.id,
		restrictionType: best.restriction_type as RestrictionType,
		notes: best.notes,
	};
}

// ── ComplianceHoldService ─────────────────────────────────────────────────────

export type HoldReason =
	| "SCREENING_MATCH"
	| "CLASSIFICATION_REQUIRED"
	| "COUNTRY_RESTRICTION"
	| "AMBIGUOUS_REGION"
	| "MANUAL";

export interface ComplianceHoldRecord {
	id: string;
	entityId: string;
	heldTable: string;
	heldRecordId: string;
	holdReason: HoldReason;
	screeningResultId: string | null;
	status: "ACTIVE" | "RELEASED" | "REJECTED";
	placedBy: string;
	placedAt: Date;
}

export interface CreateHoldParams {
	entityId: string;
	heldTable: string;
	heldRecordId: string;
	holdReason: HoldReason;
	screeningResultId?: string | null;
	placedBy: string;
}

interface HoldRow {
	id: string;
	entity_id: string;
	held_table: string;
	held_record_id: string;
	hold_reason: string;
	screening_result_id: string | null;
	status: string;
	placed_by: string;
	placed_at: string;
}

/**
 * Create a new ACTIVE compliance hold for a record.
 *
 * A hold blocks further processing of the held record until a compliance
 * officer resolves it (RELEASED or REJECTED).
 */
export async function createComplianceHold(
	db: DbClient,
	params: CreateHoldParams,
): Promise<ComplianceHoldRecord> {
	const { entityId, heldTable, heldRecordId, holdReason, screeningResultId, placedBy } = params;

	const result = await db.query<HoldRow>(
		`INSERT INTO compliance_hold
		   (entity_id, held_table, held_record_id, hold_reason,
		    screening_result_id, placed_by, created_by, updated_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
		 RETURNING id, entity_id, held_table, held_record_id, hold_reason,
		           screening_result_id, status, placed_by, placed_at`,
		[entityId, heldTable, heldRecordId, holdReason, screeningResultId ?? null, placedBy],
	);

	const row = result.rows[0];
	if (!row) throw new Error("Failed to create compliance hold");

	return {
		id: row.id,
		entityId: row.entity_id,
		heldTable: row.held_table,
		heldRecordId: row.held_record_id,
		holdReason: row.hold_reason as HoldReason,
		screeningResultId: row.screening_result_id,
		status: row.status as "ACTIVE",
		placedBy: row.placed_by,
		placedAt: new Date(row.placed_at),
	};
}

export interface ResolveHoldParams {
	holdId: string;
	/** RELEASED (cleared) or REJECTED (confirmed denied). */
	resolution: "RELEASED" | "REJECTED";
	resolutionNotes?: string;
	resolvedBy: string;
}

/**
 * Resolve a compliance hold (RELEASED or REJECTED) with an audit trail.
 * RELEASED requires non-empty resolution notes per EXP-003.
 */
export async function resolveComplianceHold(
	db: DbClient,
	params: ResolveHoldParams,
): Promise<void> {
	const { holdId, resolution, resolutionNotes, resolvedBy } = params;

	if (resolution === "RELEASED" && !resolutionNotes?.trim()) {
		throw new Error("Resolution notes are required when releasing a compliance hold");
	}

	await db.query(
		`UPDATE compliance_hold
		 SET status = $1,
		     resolved_by = $2,
		     resolved_at = NOW(),
		     resolution_notes = $3,
		     updated_by = $2
		 WHERE id = $4 AND status = 'ACTIVE'`,
		[resolution, resolvedBy, resolutionNotes ?? null, holdId],
	);
}
