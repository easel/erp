/**
 * Tests for the CRM Activity domain service.
 * Covers CRM-003 acceptance criteria (FEAT-004).
 *
 * AC-CRM-003-01: Typed activities, required fields.
 * AC-CRM-003-02: Links to contacts, companies, opportunities, leads.
 * AC-CRM-003-03: Outcome required on completion for CALL/EMAIL/MEETING; notes ≤ 10k chars.
 * AC-CRM-003-04: Timeline sorted reverse-chronological.
 * AC-CRM-003-05: isOverdue reports TASK activities past due.
 *
 * Issue: hx-975c910b
 */
import { describe, expect, test } from "bun:test";
import {
	ACTIVITY_OUTCOMES,
	ACTIVITY_TYPES,
	ActivityError,
	type ActivitySnapshot,
	buildActivityRecord,
	buildTimeline,
	completeActivity,
	isOverdue,
	sortByTimeline,
	toTimelineEntry,
} from "../../src/crm/activity-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_ID = "00000000-0000-4000-8000-000000000001" as const;
const USER_ID = "00000000-0000-4000-8000-000000000002" as const;
const CONTACT_ID = "00000000-0000-4000-8000-000000000003" as const;
const COMPANY_ID = "00000000-0000-4000-8000-000000000004" as const;
const OPP_ID = "00000000-0000-4000-8000-000000000005" as const;
const LEAD_ID = "00000000-0000-4000-8000-000000000006" as const;
const ACT_ID_1 = "00000000-0000-4000-8000-000000000010" as const;
const ACT_ID_2 = "00000000-0000-4000-8000-000000000011" as const;
const ACT_ID_3 = "00000000-0000-4000-8000-000000000012" as const;

function makeSnapshot(overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
	return {
		id: ACT_ID_1,
		entityId: ENTITY_ID,
		activityType: "CALL",
		subject: "Intro call",
		description: null,
		crmContactId: CONTACT_ID,
		crmCompanyId: null,
		opportunityId: null,
		leadId: null,
		ownerUserId: USER_ID,
		dueDate: null,
		completedAt: null,
		isCompleted: false,
		outcome: null,
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		...overrides,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildActivityRecord
// ─────────────────────────────────────────────────────────────────────────────

describe("buildActivityRecord", () => {
	test("builds a DB record from minimal input linked to a contact (AC-CRM-003-01)", () => {
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "CALL",
				subject: "Discovery call",
				ownerUserId: USER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: false,
			},
			USER_ID,
		);

		expect(record.activityType).toBe("CALL");
		expect(record.subject).toBe("Discovery call");
		expect(record.crmContactId).toBe(CONTACT_ID);
		expect(record.isCompleted).toBe(false);
		expect(record.completedAt).toBeNull();
		expect(record.createdBy).toBe(USER_ID);
		expect(record.updatedBy).toBe(USER_ID);
	});

	test("accepts all activity types (AC-CRM-003-01)", () => {
		for (const at of ACTIVITY_TYPES) {
			const record = buildActivityRecord(
				{
					entityId: ENTITY_ID,
					activityType: at,
					subject: `${at} activity`,
					ownerUserId: USER_ID,
					crmCompanyId: COMPANY_ID,
					isCompleted: false,
				},
				USER_ID,
			);
			expect(record.activityType).toBe(at);
		}
	});

	test("builds a record linked to opportunity (AC-CRM-003-02)", () => {
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "MEETING",
				subject: "Proposal review",
				ownerUserId: USER_ID,
				opportunityId: OPP_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.opportunityId).toBe(OPP_ID);
		expect(record.crmContactId).toBeNull();
		expect(record.crmCompanyId).toBeNull();
	});

	test("builds a record linked to lead (AC-CRM-003-02)", () => {
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "EMAIL",
				subject: "Follow-up email",
				ownerUserId: USER_ID,
				leadId: LEAD_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.leadId).toBe(LEAD_ID);
	});

	test("builds a record linked to company (AC-CRM-003-02)", () => {
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "NOTE",
				subject: "Account note",
				ownerUserId: USER_ID,
				crmCompanyId: COMPANY_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.crmCompanyId).toBe(COMPANY_ID);
	});

	test("truncates description to 10,000 characters (AC-CRM-003-03)", () => {
		const longDesc = "x".repeat(15_000);
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "NOTE",
				subject: "Big note",
				description: longDesc,
				ownerUserId: USER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.description).toHaveLength(10_000);
	});

	test("preserves description under the limit", () => {
		const desc = "Short description";
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "CALL",
				subject: "Call",
				description: desc,
				ownerUserId: USER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.description).toBe(desc);
	});

	test("sets ext to empty object on new record", () => {
		const record = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "TASK",
				subject: "Send proposal",
				ownerUserId: USER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: false,
			},
			USER_ID,
		);
		expect(record.ext).toEqual({});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// completeActivity
// ─────────────────────────────────────────────────────────────────────────────

describe("completeActivity", () => {
	const NOW = new Date("2026-03-15T14:00:00.000Z");

	test("completes a CALL activity with outcome (AC-CRM-003-03)", () => {
		const patch = completeActivity(
			makeSnapshot({ activityType: "CALL" }),
			"COMPLETED",
			USER_ID,
			NOW,
		);
		expect(patch.isCompleted).toBe(true);
		expect(patch.completedAt).toBe("2026-03-15T14:00:00.000Z");
		expect(patch.ext).toEqual({ outcome: "COMPLETED" });
		expect(patch.updatedBy).toBe(USER_ID);
	});

	test("completes an EMAIL activity with outcome (AC-CRM-003-03)", () => {
		const patch = completeActivity(
			makeSnapshot({ activityType: "EMAIL" }),
			"LEFT_MESSAGE",
			USER_ID,
			NOW,
		);
		expect(patch.ext).toEqual({ outcome: "LEFT_MESSAGE" });
	});

	test("completes a MEETING activity with outcome (AC-CRM-003-03)", () => {
		const patch = completeActivity(
			makeSnapshot({ activityType: "MEETING" }),
			"RESCHEDULED",
			USER_ID,
			NOW,
		);
		expect(patch.ext).toEqual({ outcome: "RESCHEDULED" });
	});

	test("accepts all valid outcomes", () => {
		for (const outcome of ACTIVITY_OUTCOMES) {
			const patch = completeActivity(makeSnapshot({ activityType: "CALL" }), outcome, USER_ID, NOW);
			expect(patch.ext).toEqual({ outcome });
		}
	});

	test("completes a TASK without outcome (not required for TASK)", () => {
		const patch = completeActivity(makeSnapshot({ activityType: "TASK" }), null, USER_ID, NOW);
		expect(patch.isCompleted).toBe(true);
		expect(patch.ext).toEqual({});
	});

	test("completes a NOTE without outcome (not required for NOTE)", () => {
		const patch = completeActivity(makeSnapshot({ activityType: "NOTE" }), null, USER_ID, NOW);
		expect(patch.isCompleted).toBe(true);
		expect(patch.ext).toEqual({});
	});

	test("stores optional outcome for TASK when provided", () => {
		const patch = completeActivity(
			makeSnapshot({ activityType: "TASK" }),
			"CANCELLED",
			USER_ID,
			NOW,
		);
		expect(patch.ext).toEqual({ outcome: "CANCELLED" });
	});

	test("throws ACTIVITY_OUTCOME_REQUIRED for CALL without outcome (AC-CRM-003-03)", () => {
		let caught: unknown;
		try {
			completeActivity(makeSnapshot({ activityType: "CALL" }), null, USER_ID, NOW);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ActivityError);
		expect((caught as ActivityError).code).toBe("ACTIVITY_OUTCOME_REQUIRED");
	});

	test("throws ACTIVITY_OUTCOME_REQUIRED for EMAIL without outcome (AC-CRM-003-03)", () => {
		expect(() =>
			completeActivity(makeSnapshot({ activityType: "EMAIL" }), null, USER_ID, NOW),
		).toThrow(ActivityError);
	});

	test("throws ACTIVITY_OUTCOME_REQUIRED for MEETING without outcome (AC-CRM-003-03)", () => {
		expect(() =>
			completeActivity(makeSnapshot({ activityType: "MEETING" }), null, USER_ID, NOW),
		).toThrow(ActivityError);
	});

	test("throws ACTIVITY_ALREADY_COMPLETED when completing an already-complete activity", () => {
		const completed = makeSnapshot({
			isCompleted: true,
			completedAt: "2026-03-10T09:00:00.000Z",
			outcome: "COMPLETED",
		});
		let caught: unknown;
		try {
			completeActivity(completed, "COMPLETED", USER_ID, NOW);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ActivityError);
		expect((caught as ActivityError).code).toBe("ACTIVITY_ALREADY_COMPLETED");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// isOverdue (AC-CRM-003-05)
// ─────────────────────────────────────────────────────────────────────────────

describe("isOverdue", () => {
	const NOW = new Date("2026-04-05T12:00:00.000Z");
	const PAST = "2026-04-01T08:00:00.000Z";
	const FUTURE = "2026-04-10T08:00:00.000Z";

	test("returns true for overdue TASK", () => {
		expect(isOverdue(makeSnapshot({ activityType: "TASK", dueDate: PAST }), NOW)).toBe(true);
	});

	test("returns false for future TASK", () => {
		expect(isOverdue(makeSnapshot({ activityType: "TASK", dueDate: FUTURE }), NOW)).toBe(false);
	});

	test("returns false for TASK with no due date", () => {
		expect(isOverdue(makeSnapshot({ activityType: "TASK", dueDate: null }), NOW)).toBe(false);
	});

	test("returns false for completed TASK past its due date", () => {
		expect(
			isOverdue(
				makeSnapshot({
					activityType: "TASK",
					dueDate: PAST,
					isCompleted: true,
					completedAt: "2026-04-02T09:00:00.000Z",
				}),
				NOW,
			),
		).toBe(false);
	});

	test("returns false for non-TASK activity types (CALL, EMAIL, MEETING, NOTE)", () => {
		for (const at of ["CALL", "EMAIL", "MEETING", "NOTE"] as const) {
			expect(isOverdue(makeSnapshot({ activityType: at, dueDate: PAST }), NOW)).toBe(false);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// sortByTimeline (AC-CRM-003-04)
// ─────────────────────────────────────────────────────────────────────────────

describe("sortByTimeline", () => {
	const snap1 = makeSnapshot({
		id: ACT_ID_1,
		createdAt: "2026-01-01T10:00:00.000Z",
		dueDate: null,
		completedAt: null,
	});
	const snap2 = makeSnapshot({
		id: ACT_ID_2,
		createdAt: "2026-01-03T10:00:00.000Z",
		dueDate: null,
		completedAt: null,
	});
	const snap3 = makeSnapshot({
		id: ACT_ID_3,
		createdAt: "2026-01-02T10:00:00.000Z",
		dueDate: null,
		completedAt: null,
	});

	test("returns activities in reverse-chronological order (newest first)", () => {
		const sorted = sortByTimeline([snap1, snap2, snap3]);
		expect(sorted[0]?.id).toBe(ACT_ID_2); // Jan 3
		expect(sorted[1]?.id).toBe(ACT_ID_3); // Jan 2
		expect(sorted[2]?.id).toBe(ACT_ID_1); // Jan 1
	});

	test("does not mutate the input array", () => {
		const input = [snap2, snap1, snap3];
		const sorted = sortByTimeline(input);
		expect(input[0]?.id).toBe(ACT_ID_2); // unchanged
		expect(sorted[0]?.id).toBe(ACT_ID_2); // still newest first
	});

	test("prefers completedAt over dueDate over createdAt for ordering key", () => {
		// snap with completedAt in far future should sort first
		const completed = makeSnapshot({
			id: ACT_ID_1,
			createdAt: "2026-01-01T10:00:00.000Z",
			dueDate: "2026-02-01T10:00:00.000Z",
			completedAt: "2026-06-01T10:00:00.000Z",
			isCompleted: true,
		});
		// snap with only dueDate
		const withDue = makeSnapshot({
			id: ACT_ID_2,
			createdAt: "2026-01-01T10:00:00.000Z",
			dueDate: "2026-04-01T10:00:00.000Z",
			completedAt: null,
		});
		// snap with only createdAt
		const noMeta = makeSnapshot({
			id: ACT_ID_3,
			createdAt: "2026-03-01T10:00:00.000Z",
			dueDate: null,
			completedAt: null,
		});

		const sorted = sortByTimeline([withDue, noMeta, completed]);
		expect(sorted[0]?.id).toBe(ACT_ID_1); // completedAt Jun
		expect(sorted[1]?.id).toBe(ACT_ID_2); // dueDate Apr
		expect(sorted[2]?.id).toBe(ACT_ID_3); // createdAt Mar
	});

	test("returns empty array for empty input", () => {
		expect(sortByTimeline([])).toEqual([]);
	});

	test("returns single item unchanged", () => {
		expect(sortByTimeline([snap1])).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// toTimelineEntry / buildTimeline (AC-CRM-003-04)
// ─────────────────────────────────────────────────────────────────────────────

describe("toTimelineEntry", () => {
	test("projects snapshot fields correctly", () => {
		const snap = makeSnapshot({
			completedAt: "2026-03-15T14:00:00.000Z",
			isCompleted: true,
			outcome: "COMPLETED",
		});
		const entry = toTimelineEntry(snap);
		expect(entry.id).toBe(snap.id);
		expect(entry.activityType).toBe("CALL");
		expect(entry.isCompleted).toBe(true);
		expect(entry.outcome).toBe("COMPLETED");
		expect(entry.occurredAt).toBe("2026-03-15T14:00:00.000Z"); // completedAt preferred
		expect(entry.crmContactId).toBe(CONTACT_ID);
		expect(entry.crmCompanyId).toBeNull();
	});

	test("falls back to dueDate when completedAt is null", () => {
		const snap = makeSnapshot({ dueDate: "2026-05-01T09:00:00.000Z", completedAt: null });
		const entry = toTimelineEntry(snap);
		expect(entry.occurredAt).toBe("2026-05-01T09:00:00.000Z");
	});

	test("falls back to createdAt when completedAt and dueDate are null", () => {
		const snap = makeSnapshot({ dueDate: null, completedAt: null });
		const entry = toTimelineEntry(snap);
		expect(entry.occurredAt).toBe(snap.createdAt);
	});
});

describe("buildTimeline", () => {
	test("returns timeline entries sorted reverse-chronologically", () => {
		const activities = [
			makeSnapshot({ id: ACT_ID_1, createdAt: "2026-01-01T10:00:00.000Z" }),
			makeSnapshot({ id: ACT_ID_2, createdAt: "2026-03-01T10:00:00.000Z" }),
			makeSnapshot({ id: ACT_ID_3, createdAt: "2026-02-01T10:00:00.000Z" }),
		];
		const timeline = buildTimeline(activities);
		expect(timeline).toHaveLength(3);
		expect(timeline[0]?.id).toBe(ACT_ID_2); // Mar
		expect(timeline[1]?.id).toBe(ACT_ID_3); // Feb
		expect(timeline[2]?.id).toBe(ACT_ID_1); // Jan
	});

	test("returns empty timeline for empty input", () => {
		expect(buildTimeline([])).toEqual([]);
	});
});
