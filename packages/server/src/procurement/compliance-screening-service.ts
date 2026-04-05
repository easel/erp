/**
 * Compliance screening service — WP-3/WP-4 integration layer.
 *
 * Defines the `VendorScreeningResult` interface used by the PO approval
 * workflow (`po-approval-workflow.ts`) and exposes a factory function that
 * returns a DB-backed screening function for use in production resolvers.
 *
 * The keyword stub (`resolveScreeningOutcome`) has been removed and replaced
 * by the real `screenParty` implementation in
 * `../compliance/export-control-service.ts`.
 *
 * For unit testing the PO approval workflow, inject a stub directly:
 *
 *   const clearFn = (_p: ScreenVendorParams): VendorScreeningResult => ({
 *     outcome: "CLEAR", matchCount: 0, holdRequired: false,
 *     holdReason: null, screeningResultId: "stub",
 *   });
 *   const result = approve(po, approverId, clearFn);
 *
 * Ref: SD-003-WP3 §EXP-002, SD-003-WP4 §SCM-001
 * Issue: hx-e7e4cad6
 */

import { screenParty } from "../compliance/export-control-service.js";
import type { DbClient } from "../db.js";

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
	/** UUID of the persisted screening_result row for audit trail. */
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
 * Create a DB-backed vendor screening function compatible with the
 * `approve()` parameter signature in `po-approval-workflow.ts`.
 *
 * The returned function is async; callers in schema resolvers must await it.
 * Pass `performedBy` as the UUID of the system user or approver initiating
 * the screening.
 *
 * @param db          Database client (pg.Pool or pg.PoolClient).
 * @param performedBy UUID recorded as the `created_by` on the screening_result row.
 */
export function createDbScreeningFn(
	db: DbClient,
	performedBy: string,
): (params: ScreenVendorParams) => Promise<VendorScreeningResult> {
	return async (params: ScreenVendorParams): Promise<VendorScreeningResult> => {
		const result = await screenParty(db, {
			entityId: params.entityId,
			screenedTable: "vendor",
			screenedRecordId: params.vendorId,
			name: params.vendorName,
			performedBy,
		});

		const holdRequired = result.overallResult !== "CLEAR";
		return {
			outcome: result.overallResult,
			matchCount: result.matchCount,
			holdRequired,
			holdReason: holdRequired ? "SCREENING_MATCH" : null,
			screeningResultId: result.screeningResultId,
		};
	};
}

/**
 * Synchronous no-op screening function for use as a safe default where no DB
 * is available (e.g., local dev without a running database). Always returns
 * CLEAR. Inject an explicit stub in tests; use `createDbScreeningFn` in
 * production resolvers.
 */
export function screenVendorForPO(_params: ScreenVendorParams): VendorScreeningResult {
	return {
		outcome: "CLEAR",
		matchCount: 0,
		holdRequired: false,
		holdReason: null,
		screeningResultId: "no-db-noop",
	};
}
