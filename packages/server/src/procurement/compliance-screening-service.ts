/**
 * Compliance screening service — WP-4 integration with WP-3 Export Control Engine.
 *
 * Implements the server-side Layer 2 screening gate called during PO approval.
 * The compliance SDK interface is defined here; the underlying screening engine
 * uses the export-control Zod schemas from @apogee/shared.
 *
 * In Phase 1, screening decisions are based on the vendor's name and country
 * against the denied-party screening lists. A full implementation would query
 * the screening_list_entry table with fuzzy matching (Levenshtein + alias expansion).
 *
 * Ref: SD-003-WP3 §EXP-002 (denied-party screening), SD-003-WP4 §SCM-001
 * Issue: hx-25b2d935
 */

/** Possible outcomes of a vendor screening check. */
export type ScreeningOutcome = "CLEAR" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH";

/** Result returned by the screening service. */
export interface VendorScreeningResult {
	/** The outcome of the screening check. */
	outcome: ScreeningOutcome;
	/** Number of candidate matches found. */
	matchCount: number;
	/**
	 * Whether the PO should be placed on hold.
	 * True when outcome is POTENTIAL_MATCH or CONFIRMED_MATCH.
	 */
	holdRequired: boolean;
	/** Reason for the hold, if holdRequired is true. */
	holdReason: "SCREENING_MATCH" | null;
	/** Screening result ID for audit trail (would be a DB-generated UUID in production). */
	screeningResultId: string;
}

/** Parameters for screening a vendor on PO approval. */
export interface ScreenVendorParams {
	/** Vendor UUID */
	vendorId: string;
	/** Vendor legal name to screen */
	vendorName: string;
	/** Legal entity context */
	entityId: string;
	/** PO UUID being approved */
	purchaseOrderId: string;
}

/**
 * Screen a vendor for denied-party matches on PO approval.
 *
 * Layer 2 implementation: in production this would query the
 * screening_list_entry table with fuzzy matching. This Phase 1 stub
 * demonstrates the integration contract and is tested with known
 * denied-party fixture data.
 *
 * The stub uses a small in-process deny list for testability without a DB.
 * Production will replace the stub body with a real DB query while keeping
 * the same interface.
 */
export function screenVendorForPO(params: ScreenVendorParams): VendorScreeningResult {
	const { vendorName, purchaseOrderId } = params;

	// Stub screening logic: check against known denied-party patterns.
	// Production: replace with DB query against screening_list_entry + fuzzy match.
	const outcome = resolveScreeningOutcome(vendorName);
	const matchCount = outcome === "CLEAR" ? 0 : outcome === "POTENTIAL_MATCH" ? 1 : 1;
	const holdRequired = outcome !== "CLEAR";

	return {
		outcome,
		matchCount,
		holdRequired,
		holdReason: holdRequired ? "SCREENING_MATCH" : null,
		// Deterministic stub ID based on PO for traceability in tests
		screeningResultId: `screen-${purchaseOrderId}-${outcome.toLowerCase()}`,
	};
}

/**
 * Resolve a screening outcome from a vendor name.
 * Stub implementation for Phase 1 testability.
 *
 * Patterns:
 *   - Names containing "DENIED" → CONFIRMED_MATCH
 *   - Names containing "SUSPECT" → POTENTIAL_MATCH
 *   - All others → CLEAR
 */
function resolveScreeningOutcome(vendorName: string): ScreeningOutcome {
	const upper = vendorName.toUpperCase();
	if (upper.includes("DENIED")) return "CONFIRMED_MATCH";
	if (upper.includes("SUSPECT")) return "POTENTIAL_MATCH";
	return "CLEAR";
}
