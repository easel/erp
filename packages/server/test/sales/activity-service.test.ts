/**
 * Unit tests for the CRM activity domain service.
 *
 * Verifies: buildActivityRecord, buildActivityPatch, completeActivity,
 * reopenActivity, sortTimelineEntries, and link filter predicates.
 *
 * Ref: FEAT-004 CRM-003, SD-003-WP5, hx-975c910b
 */

import { describe, expect, test } from "vitest";
import {
	ActivityError,
	type ActivitySnapshot,
	buildActivityPatch,
	buildActivityRecord,
	completeActivity,
	isLinkedToCompany,
	isLinkedToContact,
	isLinkedToOpportunity,
	reopenActivity,
	sortTimelineEntries,
} from "../../src/sales/activity-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_ID = "00000000-0000-4000-8000-000000000001" as const;
const ACTOR_ID = "00000000-0000-4000-8000-000000000002" as const;
const CONTACT_ID = "00000000-0000-4000-8000-000000000003" as const;
const COMPANY_ID = "00000000-0000-4000-8000-000000000004" as const;
const OPP_ID = "00000000-0000-4000-8000-000000000005" as const;
const LEAD_ID = "00000000-0000-4000-8000-000000000006" as const;
const ACTIVITY_ID = "00000000-0000-4000-8000-000000000007" as const;
const OWNER_ID = "00000000-0000-4000-8000-000000000008" as const;

const NOW = "2026-04-05T12:00:00.000Z";

function makeSnapshot(overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
	return {
		id: ACTIVITY_ID,
		entityId: ENTITY_ID,
		activityType: "CALL",
		subject: "Discovery call",
		description: null,
		crmContactId: CONTACT_ID,
		crmCompanyId: null,
		opportunityId: null,
		leadId: null,
		ownerUserId: OWNER_ID,
		dueDate: null,
		completedAt: null,
		isCompleted: false,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildActivityRecord
// ─────────────────────────────────────────────────────────────────────────────

describe("buildActivityRecord", () => {
	test("maps minimal input to DB record (contact-linked, not completed)", () => {
		const result = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "CALL",
				subject: "Intro call",
				ownerUserId: OWNER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: false,
			},
			ACTOR_ID,
			NOW,
		);

		expect(result.entityId).toBe(ENTITY_ID);
		expect(result.activityType).toBe("CALL");
		expect(result.subject).toBe("Intro call");
		expect(result.crmContactId).toBe(CONTACT_ID);
		expect(result.crmCompanyId).toBeNull();
		expect(result.opportunityId).toBeNull();
		expect(result.leadId).toBeNull();
		expect(result.ownerUserId).toBe(OWNER_ID);
		expect(result.isCompleted).toBe(false);
		expect(result.completedAt).toBeNull();
		expect(result.createdBy).toBe(ACTOR_ID);
		expect(result.updatedBy).toBe(ACTOR_ID);
	});

	test("sets completedAt when isCompleted=true on creation", () => {
		const result = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "NOTE",
				subject: "Meeting notes",
				ownerUserId: OWNER_ID,
				crmContactId: CONTACT_ID,
				isCompleted: true,
			},
			ACTOR_ID,
			NOW,
		);

		expect(result.isCompleted).toBe(true);
		expect(result.completedAt).toBe(NOW);
	});

	test("maps all optional link fields", () => {
		const result = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "MEETING",
				subject: "Quarterly review",
				ownerUserId: OWNER_ID,
				crmContactId: CONTACT_ID,
				crmCompanyId: COMPANY_ID,
				opportunityId: OPP_ID,
				leadId: LEAD_ID,
				description: "Review Q1 pipeline",
				dueDate: "2026-04-10T09:00:00.000Z",
				isCompleted: false,
			},
			ACTOR_ID,
			NOW,
		);

		expect(result.crmCompanyId).toBe(COMPANY_ID);
		expect(result.opportunityId).toBe(OPP_ID);
		expect(result.leadId).toBe(LEAD_ID);
		expect(result.description).toBe("Review Q1 pipeline");
		expect(result.dueDate).toBe("2026-04-10T09:00:00.000Z");
	});

	test("accepts all activity types (AC-CRM-003-01)", () => {
		for (const activityType of ["CALL", "EMAIL", "MEETING", "TASK", "NOTE"] as const) {
			const result = buildActivityRecord(
				{
					entityId: ENTITY_ID,
					activityType,
					subject: `${activityType} subject`,
					ownerUserId: OWNER_ID,
					crmContactId: CONTACT_ID,
					isCompleted: false,
				},
				ACTOR_ID,
				NOW,
			);
			expect(result.activityType).toBe(activityType);
		}
	});

	test("company-linked activity (AC-CRM-003-02)", () => {
		const result = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "EMAIL",
				subject: "Partnership proposal",
				ownerUserId: OWNER_ID,
				crmCompanyId: COMPANY_ID,
				isCompleted: false,
			},
			ACTOR_ID,
			NOW,
		);

		expect(result.crmCompanyId).toBe(COMPANY_ID);
		expect(result.crmContactId).toBeNull();
	});

	test("opportunity-linked activity (AC-CRM-003-02)", () => {
		const result = buildActivityRecord(
			{
				entityId: ENTITY_ID,
				activityType: "MEETING",
				subject: "Deal review",
				ownerUserId: OWNER_ID,
				opportunityId: OPP_ID,
				isCompleted: false,
			},
			ACTOR_ID,
			NOW,
		);

		expect(result.opportunityId).toBe(OPP_ID);
		expect(result.crmContactId).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// buildActivityPatch
// ─────────────────────────────────────────────────────────────────────────────

describe("buildActivityPatch", () => {
	test("builds patch with only provided fields", () => {
		const patch = buildActivityPatch({ id: ACTIVITY_ID, subject: "Updated subject" }, ACTOR_ID);

		expect(patch.subject).toBe("Updated subject");
		expect(patch.updatedBy).toBe(ACTOR_ID);
		expect(patch.activityType).toBeUndefined();
		expect(patch.dueDate).toBeUndefined();
	});

	test("includes all optional fields when provided", () => {
		const patch = buildActivityPatch(
			{
				id: ACTIVITY_ID,
				subject: "New subject",
				activityType: "EMAIL",
				description: "Updated description",
				dueDate: "2026-05-01T10:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			ACTOR_ID,
		);

		expect(patch.subject).toBe("New subject");
		expect(patch.activityType).toBe("EMAIL");
		expect(patch.description).toBe("Updated description");
		expect(patch.dueDate).toBe("2026-05-01T10:00:00.000Z");
		expect(patch.ownerUserId).toBe(OWNER_ID);
	});

	test("passes through null description to clear it", () => {
		const patch = buildActivityPatch({ id: ACTIVITY_ID, description: null }, ACTOR_ID);
		expect(patch.description).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// completeActivity / reopenActivity
// ─────────────────────────────────────────────────────────────────────────────

describe("completeActivity (AC-CRM-003-03)", () => {
	test("marks activity completed with provided timestamp", () => {
		const activity = makeSnapshot({ isCompleted: false });
		const result = completeActivity(activity, NOW);

		expect(result.isCompleted).toBe(true);
		expect(result.completedAt).toBe(NOW);
	});

	test("uses current time when now is not provided", () => {
		const activity = makeSnapshot({ isCompleted: false });
		const before = Date.now();
		const result = completeActivity(activity);
		const after = Date.now();

		expect(result.isCompleted).toBe(true);
		expect(result.completedAt).not.toBeNull();
		const ts = new Date(result.completedAt ?? "").getTime();
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	test("throws ActivityError when already completed", () => {
		const activity = makeSnapshot({ isCompleted: true, completedAt: NOW });
		let caught: unknown;
		try {
			completeActivity(activity, NOW);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ActivityError);
		expect((caught as ActivityError).code).toBe("ACTIVITY_ALREADY_COMPLETED");
	});
});

describe("reopenActivity", () => {
	test("clears completion state", () => {
		const activity = makeSnapshot({ isCompleted: true, completedAt: NOW });
		const result = reopenActivity(activity);

		expect(result.isCompleted).toBe(false);
		expect(result.completedAt).toBeNull();
	});

	test("throws ActivityError when activity is not completed", () => {
		const activity = makeSnapshot({ isCompleted: false });
		let caught: unknown;
		try {
			reopenActivity(activity);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ActivityError);
		expect((caught as ActivityError).code).toBe("ACTIVITY_NOT_COMPLETED");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// sortTimelineEntries (AC-CRM-003-04)
// ─────────────────────────────────────────────────────────────────────────────

describe("sortTimelineEntries (AC-CRM-003-04: reverse-chronological)", () => {
	test("sorts completed activities by completedAt descending", () => {
		const entries = [
			{
				id: "a" as const,
				activityType: "CALL" as const,
				subject: "A",
				isCompleted: true,
				completedAt: "2026-04-01T10:00:00.000Z",
				dueDate: null,
				createdAt: "2026-03-01T10:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			{
				id: "b" as const,
				activityType: "EMAIL" as const,
				subject: "B",
				isCompleted: true,
				completedAt: "2026-04-03T10:00:00.000Z",
				dueDate: null,
				createdAt: "2026-03-02T10:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			{
				id: "c" as const,
				activityType: "MEETING" as const,
				subject: "C",
				isCompleted: true,
				completedAt: "2026-04-02T10:00:00.000Z",
				dueDate: null,
				createdAt: "2026-03-03T10:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
		];

		const sorted = sortTimelineEntries(entries);
		expect(sorted.map((e) => e.id)).toEqual(["b", "c", "a"]);
	});

	test("sorts open tasks by dueDate descending (when no completedAt)", () => {
		const entries = [
			{
				id: "a" as const,
				activityType: "TASK" as const,
				subject: "A",
				isCompleted: false,
				completedAt: null,
				dueDate: "2026-04-10T09:00:00.000Z",
				createdAt: "2026-04-01T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			{
				id: "b" as const,
				activityType: "TASK" as const,
				subject: "B",
				isCompleted: false,
				completedAt: null,
				dueDate: "2026-04-20T09:00:00.000Z",
				createdAt: "2026-04-02T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
		];

		const sorted = sortTimelineEntries(entries);
		expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
	});

	test("falls back to createdAt when no completedAt or dueDate", () => {
		const entries = [
			{
				id: "a" as const,
				activityType: "NOTE" as const,
				subject: "A",
				isCompleted: false,
				completedAt: null,
				dueDate: null,
				createdAt: "2026-04-01T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			{
				id: "b" as const,
				activityType: "NOTE" as const,
				subject: "B",
				isCompleted: false,
				completedAt: null,
				dueDate: null,
				createdAt: "2026-04-03T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
		];

		const sorted = sortTimelineEntries(entries);
		expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
	});

	test("does not mutate input array", () => {
		const entries = [
			{
				id: "a" as const,
				activityType: "CALL" as const,
				subject: "A",
				isCompleted: false,
				completedAt: null,
				dueDate: null,
				createdAt: "2026-04-01T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
			{
				id: "b" as const,
				activityType: "EMAIL" as const,
				subject: "B",
				isCompleted: false,
				completedAt: null,
				dueDate: null,
				createdAt: "2026-04-03T09:00:00.000Z",
				ownerUserId: OWNER_ID,
			},
		];
		const original = [...entries];
		sortTimelineEntries(entries);
		expect(entries).toEqual(original);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Link filter predicates (AC-CRM-003-02)
// ─────────────────────────────────────────────────────────────────────────────

describe("link filter predicates (AC-CRM-003-02)", () => {
	test("isLinkedToContact returns true when contact matches", () => {
		const a = makeSnapshot({ crmContactId: CONTACT_ID });
		expect(isLinkedToContact(a, CONTACT_ID)).toBe(true);
	});

	test("isLinkedToContact returns false when contact does not match", () => {
		const a = makeSnapshot({ crmContactId: null });
		expect(isLinkedToContact(a, CONTACT_ID)).toBe(false);
	});

	test("isLinkedToCompany returns true when company matches", () => {
		const a = makeSnapshot({ crmCompanyId: COMPANY_ID });
		expect(isLinkedToCompany(a, COMPANY_ID)).toBe(true);
	});

	test("isLinkedToCompany returns false when company does not match", () => {
		const a = makeSnapshot({ crmCompanyId: null });
		expect(isLinkedToCompany(a, COMPANY_ID)).toBe(false);
	});

	test("isLinkedToOpportunity returns true when opportunity matches", () => {
		const a = makeSnapshot({ opportunityId: OPP_ID });
		expect(isLinkedToOpportunity(a, OPP_ID)).toBe(true);
	});

	test("isLinkedToOpportunity returns false when opportunity does not match", () => {
		const a = makeSnapshot({ opportunityId: null });
		expect(isLinkedToOpportunity(a, OPP_ID)).toBe(false);
	});
});
