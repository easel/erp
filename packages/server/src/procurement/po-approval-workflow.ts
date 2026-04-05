/**
 * PO Approval Workflow — state machine for purchase order lifecycle.
 *
 * Implements the SCM-001 approval workflow:
 *   DRAFT → PENDING_APPROVAL → APPROVED → SENT
 *                           ↘ ON_HOLD (if vendor compliance screening hits)
 *
 * State transition rules:
 *   submitForApproval:  DRAFT            → PENDING_APPROVAL
 *   approve:            PENDING_APPROVAL → APPROVED  (vendor clear)
 *                       PENDING_APPROVAL → ON_HOLD   (vendor flagged)
 *   send:               APPROVED         → SENT
 *   rejectTodrAft:      PENDING_APPROVAL → DRAFT
 *   releaseHold:        ON_HOLD          → APPROVED  (compliance officer cleared)
 *   rejectHold:         ON_HOLD          → CANCELLED (compliance officer rejected)
 *
 * All state transitions are pure functions — no I/O. The caller is responsible
 * for persisting the new status to the database.
 *
 * Compliance screening is injected as a parameter to `approve()` so tests can
 * substitute a stub without patching module globals.
 *
 * Ref: SD-003-WP4 §SCM-001 (PO approval, compliance gate), hx-25b2d935
 */

import type { POStatus } from "@apogee/shared";
import {
	type ScreenVendorParams,
	type VendorScreeningResult,
	screenVendorForPO,
} from "./compliance-screening-service.js";

// ── Domain types ──────────────────────────────────────────────────────────────

/** Minimal PO snapshot needed for workflow decisions. */
export interface POSnapshot {
	id: string;
	entityId: string;
	vendorId: string;
	vendorName: string;
	status: POStatus;
}

/** Result of an approval attempt. */
export interface POApprovalResult {
	/** New PO status after the approval attempt. */
	newStatus: POStatus;
	/** Screening result, always present after an approve() call. */
	screening: VendorScreeningResult;
	/** Compliance hold ID if the PO was placed on hold, null otherwise. */
	holdId: string | null;
}

/** Result of a submit-for-approval attempt. */
export interface POSubmitResult {
	newStatus: POStatus;
}

/** Result of a send attempt. */
export interface POSendResult {
	newStatus: POStatus;
}

/** Workflow error — invalid state transition. */
export class POWorkflowError extends Error {
	constructor(
		message: string,
		public readonly currentStatus: POStatus,
		public readonly attemptedAction: string,
	) {
		super(message);
		this.name = "POWorkflowError";
	}
}

// ── Allowed transitions ───────────────────────────────────────────────────────

/** Valid source statuses for each action. */
const ALLOWED_SOURCES: Record<string, readonly POStatus[]> = {
	submitForApproval: ["DRAFT"],
	approve: ["PENDING_APPROVAL"],
	send: ["APPROVED"],
	rejectToDraft: ["PENDING_APPROVAL"],
	releaseHold: ["ON_HOLD"],
	rejectHold: ["ON_HOLD"],
} as const;

function assertTransition(po: POSnapshot, action: string): void {
	const allowed = ALLOWED_SOURCES[action];
	if (!allowed?.includes(po.status)) {
		throw new POWorkflowError(
			`Cannot ${action} a PO with status ${po.status}. ` +
				`Allowed source statuses: ${allowed?.join(", ") ?? "none"}.`,
			po.status,
			action,
		);
	}
}

// ── Workflow functions ────────────────────────────────────────────────────────

/**
 * Submit a DRAFT PO for approval.
 * Transitions: DRAFT → PENDING_APPROVAL
 */
export function submitForApproval(po: POSnapshot): POSubmitResult {
	assertTransition(po, "submitForApproval");
	return { newStatus: "PENDING_APPROVAL" };
}

/**
 * Approve a PO that is PENDING_APPROVAL.
 *
 * Triggers vendor denied-party screening. If the vendor is flagged
 * (POTENTIAL_MATCH or CONFIRMED_MATCH), the PO transitions to ON_HOLD
 * instead of APPROVED, and a compliance hold record is created.
 *
 * Transitions:
 *   PENDING_APPROVAL → APPROVED  (vendor clear)
 *   PENDING_APPROVAL → ON_HOLD   (vendor flagged by screening)
 *
 * @param po - PO snapshot including vendor details
 * @param approverId - UUID of the approver
 * @param screenFn - Compliance screening function (injectable for testing)
 * @returns Approval result with new status, screening details, and hold ID if applicable
 */
export function approve(
	po: POSnapshot,
	_approverId: string,
	screenFn: (params: ScreenVendorParams) => VendorScreeningResult = screenVendorForPO,
): POApprovalResult {
	assertTransition(po, "approve");

	const screening = screenFn({
		vendorId: po.vendorId,
		vendorName: po.vendorName,
		entityId: po.entityId,
		purchaseOrderId: po.id,
	});

	if (screening.holdRequired) {
		// Vendor flagged — place PO on hold
		const holdId = `hold-${po.id}-${Date.now()}`;
		return {
			newStatus: "ON_HOLD",
			screening,
			holdId,
		};
	}

	// Vendor clear — approve
	return {
		newStatus: "APPROVED",
		screening,
		holdId: null,
	};
}

/**
 * Send an APPROVED PO to the vendor.
 * Transitions: APPROVED → SENT
 */
export function send(po: POSnapshot): POSendResult {
	assertTransition(po, "send");
	return { newStatus: "SENT" };
}

/**
 * Reject a PENDING_APPROVAL PO back to DRAFT (e.g., approver requests changes).
 * Transitions: PENDING_APPROVAL → DRAFT
 */
export function rejectToDraft(po: POSnapshot): POSubmitResult {
	assertTransition(po, "rejectToDraft");
	return { newStatus: "DRAFT" };
}

/**
 * Release a compliance hold, returning the PO to APPROVED status.
 * Called by a compliance officer who has reviewed and cleared the hold.
 * Transitions: ON_HOLD → APPROVED
 */
export function releaseHold(po: POSnapshot): POSubmitResult {
	assertTransition(po, "releaseHold");
	return { newStatus: "APPROVED" };
}

/**
 * Reject a compliance hold, cancelling the PO.
 * Called by a compliance officer who has confirmed the vendor is denied.
 * Transitions: ON_HOLD → CANCELLED
 */
export function rejectHold(po: POSnapshot): POSubmitResult {
	assertTransition(po, "rejectHold");
	return { newStatus: "CANCELLED" };
}
