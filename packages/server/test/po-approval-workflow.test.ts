/**
 * PO Approval Workflow — unit tests.
 *
 * Covers the SCM-001 acceptance criteria:
 *   - PO approval triggers vendor denied-party screening
 *   - PO is placed ON_HOLD if vendor is flagged
 *   - Full state machine: DRAFT → PENDING_APPROVAL → APPROVED → SENT
 *   - Invalid transitions throw POWorkflowError
 *   - Compliance screening is injectable for testability
 *
 * Ref: SD-003-WP4 §SCM-001, hx-25b2d935
 */

import { describe, expect, test } from "bun:test";
import { ApprovePurchaseOrderSchema, type POStatus } from "@apogee/shared";
import type {
	ScreenVendorParams,
	VendorScreeningResult,
} from "../src/procurement/compliance-screening-service.js";
import {
	type POSnapshot,
	POWorkflowError,
	approve,
	rejectHold,
	rejectToDraft,
	releaseHold,
	send,
	submitForApproval,
} from "../src/procurement/po-approval-workflow.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const UUID_PO = "00000000-0000-4000-8000-000000000001";
const UUID_ENTITY = "00000000-0000-4000-8000-000000000002";
const UUID_VENDOR = "00000000-0000-4000-8000-000000000003";
const UUID_APPROVER = "00000000-0000-4000-8000-000000000004";

function makePO(status: POStatus, vendorName = "Trusted Aerospace Ltd"): POSnapshot {
	return {
		id: UUID_PO,
		entityId: UUID_ENTITY,
		vendorId: UUID_VENDOR,
		vendorName,
		status,
	};
}

/** Stub screening function that always returns CLEAR. */
function clearScreenFn(_params: ScreenVendorParams): VendorScreeningResult {
	return {
		outcome: "CLEAR",
		matchCount: 0,
		holdRequired: false,
		holdReason: null,
		screeningResultId: "screen-clear-stub",
	};
}

/** Stub screening function that always returns CONFIRMED_MATCH (denied party). */
function deniedScreenFn(_params: ScreenVendorParams): VendorScreeningResult {
	return {
		outcome: "CONFIRMED_MATCH",
		matchCount: 1,
		holdRequired: true,
		holdReason: "SCREENING_MATCH",
		screeningResultId: "screen-denied-stub",
	};
}

/** Stub screening function that returns POTENTIAL_MATCH (fuzzy hit). */
function suspectScreenFn(_params: ScreenVendorParams): VendorScreeningResult {
	return {
		outcome: "POTENTIAL_MATCH",
		matchCount: 1,
		holdRequired: true,
		holdReason: "SCREENING_MATCH",
		screeningResultId: "screen-potential-stub",
	};
}

// ── submitForApproval ─────────────────────────────────────────────────────────

describe("submitForApproval", () => {
	test("transitions DRAFT → PENDING_APPROVAL", () => {
		const result = submitForApproval(makePO("DRAFT"));
		expect(result.newStatus).toBe("PENDING_APPROVAL");
	});

	test("throws POWorkflowError if PO is not DRAFT", () => {
		expect(() => submitForApproval(makePO("PENDING_APPROVAL"))).toThrow(POWorkflowError);
		expect(() => submitForApproval(makePO("APPROVED"))).toThrow(POWorkflowError);
		expect(() => submitForApproval(makePO("ON_HOLD"))).toThrow(POWorkflowError);
	});

	test("error message includes current status", () => {
		try {
			submitForApproval(makePO("APPROVED"));
			throw new Error("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(POWorkflowError);
			expect((e as POWorkflowError).currentStatus).toBe("APPROVED");
			expect((e as POWorkflowError).attemptedAction).toBe("submitForApproval");
		}
	});
});

// ── approve — compliance screening gate (SCM-001) ─────────────────────────────

describe("approve — vendor compliance screening gate", () => {
	test("SCM-001: PENDING_APPROVAL → APPROVED when vendor is clear", () => {
		const result = approve(makePO("PENDING_APPROVAL"), UUID_APPROVER, clearScreenFn);
		expect(result.newStatus).toBe("APPROVED");
		expect(result.screening.outcome).toBe("CLEAR");
		expect(result.holdId).toBeNull();
	});

	test("SCM-001: PENDING_APPROVAL → ON_HOLD when vendor is a confirmed denied party", () => {
		const result = approve(makePO("PENDING_APPROVAL"), UUID_APPROVER, deniedScreenFn);
		expect(result.newStatus).toBe("ON_HOLD");
		expect(result.screening.outcome).toBe("CONFIRMED_MATCH");
		expect(result.holdId).not.toBeNull();
	});

	test("SCM-001: PENDING_APPROVAL → ON_HOLD for potential match (fuzzy hit)", () => {
		const result = approve(makePO("PENDING_APPROVAL"), UUID_APPROVER, suspectScreenFn);
		expect(result.newStatus).toBe("ON_HOLD");
		expect(result.screening.outcome).toBe("POTENTIAL_MATCH");
		expect(result.holdId).not.toBeNull();
	});

	test("compliance screening is invoked with correct vendor parameters", () => {
		let capturedParams: ScreenVendorParams | null = null;
		const capturingScreen = (params: ScreenVendorParams): VendorScreeningResult => {
			capturedParams = params;
			return clearScreenFn(params);
		};

		approve(makePO("PENDING_APPROVAL", "Rocket Parts Co"), UUID_APPROVER, capturingScreen);

		expect(capturedParams).not.toBeNull();
		const params = capturedParams as ScreenVendorParams;
		expect(params.vendorId).toBe(UUID_VENDOR);
		expect(params.vendorName).toBe("Rocket Parts Co");
		expect(params.entityId).toBe(UUID_ENTITY);
		expect(params.purchaseOrderId).toBe(UUID_PO);
	});

	test("holdId is non-null when PO is held", () => {
		const result = approve(makePO("PENDING_APPROVAL"), UUID_APPROVER, deniedScreenFn);
		expect(typeof result.holdId).toBe("string");
		expect((result.holdId as string).length).toBeGreaterThan(0);
	});

	test("throws POWorkflowError if PO is not PENDING_APPROVAL", () => {
		expect(() => approve(makePO("DRAFT"), UUID_APPROVER, clearScreenFn)).toThrow(POWorkflowError);
		expect(() => approve(makePO("APPROVED"), UUID_APPROVER, clearScreenFn)).toThrow(
			POWorkflowError,
		);
		expect(() => approve(makePO("ON_HOLD"), UUID_APPROVER, clearScreenFn)).toThrow(POWorkflowError);
	});
});

// ── send ──────────────────────────────────────────────────────────────────────

describe("send", () => {
	test("transitions APPROVED → SENT", () => {
		const result = send(makePO("APPROVED"));
		expect(result.newStatus).toBe("SENT");
	});

	test("throws POWorkflowError if PO is not APPROVED", () => {
		expect(() => send(makePO("DRAFT"))).toThrow(POWorkflowError);
		expect(() => send(makePO("PENDING_APPROVAL"))).toThrow(POWorkflowError);
		expect(() => send(makePO("ON_HOLD"))).toThrow(POWorkflowError);
	});
});

// ── Full happy path: DRAFT → PENDING_APPROVAL → APPROVED → SENT ───────────────

describe("Full PO approval workflow — happy path", () => {
	test("DRAFT → PENDING_APPROVAL → APPROVED → SENT with clear vendor", () => {
		const draft = makePO("DRAFT");

		const submitResult = submitForApproval(draft);
		expect(submitResult.newStatus).toBe("PENDING_APPROVAL");

		const pending = makePO("PENDING_APPROVAL");
		const approveResult = approve(pending, UUID_APPROVER, clearScreenFn);
		expect(approveResult.newStatus).toBe("APPROVED");
		expect(approveResult.holdId).toBeNull();

		const approved = makePO("APPROVED");
		const sendResult = send(approved);
		expect(sendResult.newStatus).toBe("SENT");
	});
});

// ── Hold lifecycle ────────────────────────────────────────────────────────────

describe("Hold lifecycle", () => {
	test("ON_HOLD → APPROVED after compliance officer releases hold", () => {
		const result = releaseHold(makePO("ON_HOLD"));
		expect(result.newStatus).toBe("APPROVED");
	});

	test("ON_HOLD → CANCELLED after compliance officer rejects hold", () => {
		const result = rejectHold(makePO("ON_HOLD"));
		expect(result.newStatus).toBe("CANCELLED");
	});

	test("throws POWorkflowError when releasing hold on non-ON_HOLD PO", () => {
		expect(() => releaseHold(makePO("APPROVED"))).toThrow(POWorkflowError);
		expect(() => releaseHold(makePO("PENDING_APPROVAL"))).toThrow(POWorkflowError);
	});

	test("Full hold workflow: PENDING_APPROVAL → ON_HOLD → APPROVED", () => {
		const pending = makePO("PENDING_APPROVAL");
		const approveResult = approve(pending, UUID_APPROVER, deniedScreenFn);
		expect(approveResult.newStatus).toBe("ON_HOLD");

		const held = makePO("ON_HOLD");
		const releaseResult = releaseHold(held);
		expect(releaseResult.newStatus).toBe("APPROVED");
	});

	test("Full hold workflow: PENDING_APPROVAL → ON_HOLD → CANCELLED", () => {
		const pending = makePO("PENDING_APPROVAL");
		const approveResult = approve(pending, UUID_APPROVER, deniedScreenFn);
		expect(approveResult.newStatus).toBe("ON_HOLD");

		const held = makePO("ON_HOLD");
		const rejectResult = rejectHold(held);
		expect(rejectResult.newStatus).toBe("CANCELLED");
	});
});

// ── rejectToDraft ─────────────────────────────────────────────────────────────

describe("rejectToDraft", () => {
	test("transitions PENDING_APPROVAL → DRAFT", () => {
		const result = rejectToDraft(makePO("PENDING_APPROVAL"));
		expect(result.newStatus).toBe("DRAFT");
	});

	test("throws POWorkflowError if PO is not PENDING_APPROVAL", () => {
		expect(() => rejectToDraft(makePO("DRAFT"))).toThrow(POWorkflowError);
		expect(() => rejectToDraft(makePO("APPROVED"))).toThrow(POWorkflowError);
	});
});

// ── Default screening function (no-op safe default) ──────────────────────────
// The keyword stub has been replaced by the DB-backed screenParty service in
// packages/server/src/compliance/export-control-service.ts.
// The default screenVendorForPO is now a safe no-op that always returns CLEAR.
// Production resolvers inject createDbScreeningFn(db, performedBy) instead.

describe("Default screening function — safe no-op (no DB)", () => {
	test("any vendor name returns CLEAR when no DB is available", () => {
		const po = makePO("PENDING_APPROVAL", "Any Vendor Name");
		const result = approve(po, UUID_APPROVER);
		expect(result.newStatus).toBe("APPROVED");
		expect(result.screening.outcome).toBe("CLEAR");
		expect(result.screening.holdRequired).toBe(false);
	});

	test("no-op screening never places a hold", () => {
		const po = makePO("PENDING_APPROVAL", "Acme Industries International");
		const result = approve(po, UUID_APPROVER);
		expect(result.holdId).toBeNull();
	});
});

// ── Shared schema validation (ApprovePurchaseOrderSchema) ─────────────────────

describe("ApprovePurchaseOrderSchema validation", () => {
	test("accepts valid approval input", () => {
		expect(() =>
			ApprovePurchaseOrderSchema.parse({
				id: UUID_PO,
				approverId: UUID_APPROVER,
			}),
		).not.toThrow();
	});

	test("accepts approval input with notes", () => {
		expect(() =>
			ApprovePurchaseOrderSchema.parse({
				id: UUID_PO,
				approverId: UUID_APPROVER,
				notes: "Reviewed and approved per procurement policy.",
			}),
		).not.toThrow();
	});

	test("rejects missing approverId", () => {
		expect(() =>
			ApprovePurchaseOrderSchema.parse({
				id: UUID_PO,
			}),
		).toThrow();
	});

	test("rejects invalid UUID for id", () => {
		expect(() =>
			ApprovePurchaseOrderSchema.parse({
				id: "not-a-uuid",
				approverId: UUID_APPROVER,
			}),
		).toThrow();
	});
});
