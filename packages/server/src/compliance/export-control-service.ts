/**
 * Export Control domain services — WP-3: Classification, Denied-Party Screening,
 * Country Restriction, and Compliance Hold management.
 *
 * Exports two tiers:
 *   - Pure / in-memory functions (no I/O): suitable for unit and E2E scenario
 *     tests without a database.
 *   - DB-backed async functions (accept DbClient): used by production resolvers.
 *
 * Screening algorithm:
 *   1. Normalise the query name (lowercase, strip punctuation, collapse whitespace).
 *   2. Compute Levenshtein similarity against every active entry's name + aliases.
 *   3. Best score >= CONFIRMED_THRESHOLD → CONFIRMED_MATCH.
 *   4. Best score >= POTENTIAL_THRESHOLD → POTENTIAL_MATCH.
 *   5. Otherwise → CLEAR.
 *
 * Ref: SD-003 WP-3 §EXP-001–EXP-004, EXP-006, EXP-012
 * Issue: hx-4fb1bab7 (E2E compliance scenario tests)
 */

import type { DbClient } from "../db.js";

// ── Thresholds ─────────────────────────────────────────────────────────────────

/** Minimum similarity score for a CONFIRMED_MATCH (essentially exact). */
export const CONFIRMED_THRESHOLD = 0.92;
/** Minimum similarity score for a POTENTIAL_MATCH (near-miss). */
export const POTENTIAL_THRESHOLD = 0.72;

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

// ── Pure / in-memory screening ─────────────────────────────────────────────────

export type OverallResult = "CLEAR" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH";
export type MatchAlgorithm = "EXACT" | "FUZZY";

export interface ScreeningListEntry {
	id: string;
	entryName: string;
	aliases?: string[];
	entityType?: string;
	countryCodes?: string[];
}

export interface ScreeningMatch {
	entryId: string;
	entryName: string;
	matchScore: number;
	matchAlgorithm: MatchAlgorithm;
	matchedFields: Record<string, string>;
}

export interface InMemoryScreeningResult {
	overallResult: OverallResult;
	matchCount: number;
	matches: ScreeningMatch[];
}

/**
 * Screen a party name against an in-memory list of screening entries.
 * Pure function — no I/O, suitable for unit and E2E scenario tests.
 */
export function screenPartyInMemory(
	entries: ScreeningListEntry[],
	name: string,
): InMemoryScreeningResult {
	const queryNorm = normaliseScreeningName(name);
	const matches: ScreeningMatch[] = [];

	for (const entry of entries) {
		const entryNorm = normaliseScreeningName(entry.entryName);
		const aliasesNorm = (entry.aliases ?? []).map(normaliseScreeningName);

		// Exact match fast path
		if (queryNorm === entryNorm || aliasesNorm.includes(queryNorm)) {
			matches.push({
				entryId: entry.id,
				entryName: entry.entryName,
				matchScore: 1.0,
				matchAlgorithm: "EXACT",
				matchedFields: { name },
			});
			continue;
		}

		const score = bestMatchScore(queryNorm, entryNorm, aliasesNorm);
		if (score >= POTENTIAL_THRESHOLD) {
			matches.push({
				entryId: entry.id,
				entryName: entry.entryName,
				matchScore: score,
				matchAlgorithm: "FUZZY",
				matchedFields: { name },
			});
		}
	}

	const overallResult: OverallResult = matches.some((m) => m.matchScore >= CONFIRMED_THRESHOLD)
		? "CONFIRMED_MATCH"
		: matches.length > 0
			? "POTENTIAL_MATCH"
			: "CLEAR";

	return { overallResult, matchCount: matches.length, matches };
}

// ── Country restriction (pure / in-memory) ────────────────────────────────────

export type RestrictionType =
	| "EMBARGOED"
	| "HEAVILY_RESTRICTED"
	| "LICENSE_REQUIRED"
	| "CAUTION"
	| "UNRESTRICTED";

/** Precedence for restriction types — higher number = more restrictive. */
const RESTRICTION_PRECEDENCE: Record<RestrictionType, number> = {
	EMBARGOED: 5,
	HEAVILY_RESTRICTED: 4,
	LICENSE_REQUIRED: 3,
	CAUTION: 2,
	UNRESTRICTED: 1,
};

export interface CountryRestrictionRule {
	id: string;
	countryCode: string;
	restrictionType: RestrictionType;
	/** When set, rule only applies to this classification jurisdiction. */
	classificationType?: string | null;
	notes?: string | null;
}

export interface CountryRestrictionResult {
	ruleId: string;
	restrictionType: RestrictionType;
	notes: string | null;
}

/**
 * Determine the most restrictive applicable country restriction for a given
 * country code and optional classification type (e.g. "ITAR").
 *
 * Precedence: type-specific rules are considered alongside generic rules;
 * the most restrictive is returned.
 *
 * Pure function — no I/O.
 */
export function checkCountryRestrictionPure(
	rules: CountryRestrictionRule[],
	countryCode: string,
	classificationType: string | null,
): CountryRestrictionResult | null {
	const applicable = rules.filter(
		(r) =>
			r.countryCode === countryCode &&
			(r.classificationType === undefined ||
				r.classificationType === null ||
				r.classificationType === classificationType),
	);

	if (applicable.length === 0) return null;

	// applicable.length > 0 is checked above; find the most restrictive rule.
	const best = applicable.reduce(
		(a, b) =>
			(RESTRICTION_PRECEDENCE[b.restrictionType] ?? 0) >
			(RESTRICTION_PRECEDENCE[a.restrictionType] ?? 0)
				? b
				: a,
		applicable[0] as CountryRestrictionRule,
	);

	return {
		ruleId: best.id,
		restrictionType: best.restrictionType,
		notes: best.notes ?? null,
	};
}

// ── Product classification ─────────────────────────────────────────────────────

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
	effectiveFrom: string;
	effectiveTo: string | null;
}

/**
 * Look up the effective product classification from an in-memory list.
 * Returns the most recently effective classification as of `asOf`.
 *
 * Pure function — no I/O.
 */
export function getProductClassificationPure(
	classifications: ProductClassification[],
	productId: string,
	asOf: string = new Date().toISOString().slice(0, 10),
): ProductClassification | null {
	const applicable = classifications
		.filter(
			(c) =>
				c.productId === productId &&
				c.effectiveFrom <= asOf &&
				(c.effectiveTo === null || c.effectiveTo >= asOf),
		)
		.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

	return applicable[0] ?? null;
}

// ── Compliance hold lifecycle (pure / in-memory) ───────────────────────────────

export type HoldReason =
	| "SCREENING_MATCH"
	| "CLASSIFICATION_REQUIRED"
	| "COUNTRY_RESTRICTION"
	| "AMBIGUOUS_REGION"
	| "MANUAL";

export type HoldStatus = "ACTIVE" | "RELEASED" | "REJECTED";

export interface ComplianceHoldRecord {
	id: string;
	entityId: string;
	heldTable: string;
	heldRecordId: string;
	holdReason: HoldReason;
	screeningResultId: string | null;
	status: HoldStatus;
	placedBy: string;
	placedAt: string;
	resolvedBy: string | null;
	resolvedAt: string | null;
	resolutionNotes: string | null;
}

/**
 * Create an ACTIVE compliance hold (in-memory representation).
 * Returns a new hold record; caller is responsible for persistence.
 */
export function createComplianceHoldPure(params: {
	id: string;
	entityId: string;
	heldTable: string;
	heldRecordId: string;
	holdReason: HoldReason;
	screeningResultId?: string | null;
	placedBy: string;
	placedAt?: string;
}): ComplianceHoldRecord {
	return {
		id: params.id,
		entityId: params.entityId,
		heldTable: params.heldTable,
		heldRecordId: params.heldRecordId,
		holdReason: params.holdReason,
		screeningResultId: params.screeningResultId ?? null,
		status: "ACTIVE",
		placedBy: params.placedBy,
		placedAt: params.placedAt ?? new Date().toISOString(),
		resolvedBy: null,
		resolvedAt: null,
		resolutionNotes: null,
	};
}

export class ComplianceHoldError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ComplianceHoldError";
	}
}

/**
 * Resolve a compliance hold (RELEASED or REJECTED).
 * RELEASED requires non-empty resolution notes per EXP-003.
 *
 * Pure function — returns updated hold record, does not mutate input.
 */
export function resolveComplianceHoldPure(
	hold: ComplianceHoldRecord,
	params: {
		resolution: "RELEASED" | "REJECTED";
		resolutionNotes?: string;
		resolvedBy: string;
		resolvedAt?: string;
	},
): ComplianceHoldRecord {
	if (hold.status !== "ACTIVE") {
		throw new ComplianceHoldError(
			`Cannot resolve a hold with status ${hold.status}. Only ACTIVE holds can be resolved.`,
		);
	}
	if (params.resolution === "RELEASED" && !params.resolutionNotes?.trim()) {
		throw new ComplianceHoldError("Resolution notes are required when releasing a compliance hold");
	}

	return {
		...hold,
		status: params.resolution,
		resolvedBy: params.resolvedBy,
		resolvedAt: params.resolvedAt ?? new Date().toISOString(),
		resolutionNotes: params.resolutionNotes ?? null,
	};
}

// ── DB-backed functions (production) ──────────────────────────────────────────

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

export interface DbScreeningResult {
	screeningResultId: string;
	overallResult: OverallResult;
	matchCount: number;
	matches: ScreeningMatch[];
	durationMs: number;
}

/**
 * Screen a party name against all active denied-party lists in the database.
 * Writes screening_result and denied_party_match audit rows.
 */
export async function screenParty(
	db: DbClient,
	params: {
		entityId: string;
		screenedTable: string;
		screenedRecordId: string;
		name: string;
		performedBy: string;
	},
): Promise<DbScreeningResult> {
	const t0 = Date.now();
	const { entityId, screenedTable, screenedRecordId, name, performedBy } = params;

	const entriesResult = await db.query<ScreeningListEntryRow>(
		`SELECT sle.id, sle.entry_name, sle.aliases, sle.entity_type, sle.country_codes
		 FROM screening_list_entry sle
		 JOIN screening_list sl ON sl.id = sle.screening_list_id
		 WHERE sl.is_active = TRUE
		   AND (sle.delisted_date IS NULL OR sle.delisted_date > CURRENT_DATE)`,
	);

	const entries: ScreeningListEntry[] = entriesResult.rows.map((r) => {
		const entry: ScreeningListEntry = { id: r.id, entryName: r.entry_name };
		if (r.aliases) entry.aliases = r.aliases;
		if (r.entity_type) entry.entityType = r.entity_type;
		if (r.country_codes) entry.countryCodes = r.country_codes;
		return entry;
	});

	const { overallResult, matchCount, matches } = screenPartyInMemory(entries, name);

	const srResult = await db.query<ScreeningResultRow>(
		`INSERT INTO screening_result
		   (entity_id, screened_table, screened_record_id, screened_name,
		    screening_type, overall_result, match_count, created_by)
		 VALUES ($1, $2, $3, $4, 'AUTOMATED', $5, $6, $7)
		 RETURNING id`,
		[entityId, screenedTable, screenedRecordId, name, overallResult, matchCount, performedBy],
	);
	const screeningResultId = srResult.rows[0]?.id ?? crypto.randomUUID();

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

	return { screeningResultId, overallResult, matchCount, matches, durationMs: Date.now() - t0 };
}
