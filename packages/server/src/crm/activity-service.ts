/**
 * CRM Activity Service — activity domain logic for CRM-003.
 *
 * Implements CRM-003 (Activity Tracking) from FEAT-004 / SD-003-WP5a.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - buildActivityRecord: converts CreateActivityInput into a DB-ready record.
 * - completeActivity: marks an activity complete, enforces outcome requirement.
 * - isOverdue: returns true when a TASK activity is past due_date and incomplete.
 * - sortByTimeline: returns activities in reverse-chronological order (AC-CRM-003-04).
 * - Outcome is stored in the `ext` JSONB column; the migration does not have a
 *   dedicated outcome column but `ext` is available for extensible attributes.
 *
 * Acceptance criteria covered:
 *   AC-CRM-003-01: Typed activities, required subject + link.
 *   AC-CRM-003-02: Links to contacts, companies, opportunities, leads.
 *   AC-CRM-003-03: Outcome required on completion; notes capped at 10,000 chars.
 *   AC-CRM-003-04: Timeline sorted reverse-chronological.
 *   AC-CRM-003-05: isOverdue helper supports overdue-task notification queries.
 *
 * Ref: FEAT-004-customer-relationship.md §CRM-003,
 *      SD-002-data-model.md §7 (activity table),
 *      SD-003-WP5a
 * Issue: hx-975c910b
 */

import type { CreateActivityInput } from "@apogee/shared";
import { ACTIVITY_TYPES } from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export { ACTIVITY_TYPES };
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Valid outcome values for completed activities (AC-CRM-003-03). */
export const ACTIVITY_OUTCOMES = [
	"COMPLETED",
	"NO_ANSWER",
	"LEFT_MESSAGE",
	"RESCHEDULED",
	"CANCELLED",
] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

/** Activity types that require an outcome on completion (AC-CRM-003-03). */
const OUTCOME_REQUIRED_TYPES: ReadonlySet<ActivityType> = new Set(["CALL", "EMAIL", "MEETING"]);

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory snapshot of an activity record (read from DB).
 * Used as input to state-change domain functions.
 */
export interface ActivitySnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly activityType: ActivityType;
	readonly subject: string;
	readonly description: string | null;
	readonly crmContactId: UUID | null;
	readonly crmCompanyId: UUID | null;
	readonly opportunityId: UUID | null;
	readonly leadId: UUID | null;
	readonly ownerUserId: UUID;
	/** ISO 8601 datetime string or null */
	readonly dueDate: string | null;
	/** ISO 8601 datetime string or null */
	readonly completedAt: string | null;
	readonly isCompleted: boolean;
	readonly outcome: ActivityOutcome | null;
	/** ISO 8601 datetime string */
	readonly createdAt: string;
	/** ISO 8601 datetime string */
	readonly updatedAt: string;
}

/** DB-ready record for activity INSERT. */
export interface ActivityRecord {
	readonly entityId: UUID;
	readonly activityType: ActivityType;
	readonly subject: string;
	readonly description: string | null;
	readonly crmContactId: UUID | null;
	readonly crmCompanyId: UUID | null;
	readonly opportunityId: UUID | null;
	readonly leadId: UUID | null;
	readonly ownerUserId: UUID;
	readonly dueDate: string | null;
	readonly isCompleted: false;
	readonly completedAt: null;
	/** Serialised ext JSONB — outcome stored here when set */
	readonly ext: Record<string, unknown>;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** DB-ready patch for marking an activity complete. */
export interface ActivityCompletionPatch {
	readonly isCompleted: true;
	readonly completedAt: string;
	/** Serialised ext JSONB — includes outcome */
	readonly ext: Record<string, unknown>;
	readonly updatedBy: UUID;
}

/** Lightweight view entry for timeline rendering (AC-CRM-003-04). */
export interface ActivityTimelineEntry {
	readonly id: UUID;
	readonly activityType: ActivityType;
	readonly subject: string;
	readonly description: string | null;
	readonly ownerUserId: UUID;
	readonly isCompleted: boolean;
	readonly outcome: ActivityOutcome | null;
	/** ISO 8601 datetime — the effective timestamp for ordering */
	readonly occurredAt: string;
	readonly crmContactId: UUID | null;
	readonly crmCompanyId: UUID | null;
	readonly opportunityId: UUID | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class ActivityError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ActivityError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB-ready activity record from validated input.
 *
 * Notes:
 * - New activities are always created in incomplete state.
 * - At least one link target must be present (enforced by CreateActivitySchema).
 * - Description is capped at 10,000 characters per AC-CRM-003-03.
 */
export function buildActivityRecord(input: CreateActivityInput, actorId: UUID): ActivityRecord {
	const description =
		input.description != null
			? input.description.slice(0, 10_000) // AC-CRM-003-03: max 10,000 chars
			: null;

	return {
		entityId: input.entityId as UUID,
		activityType: input.activityType,
		subject: input.subject,
		description,
		crmContactId: (input.crmContactId as UUID | undefined) ?? null,
		crmCompanyId: (input.crmCompanyId as UUID | undefined) ?? null,
		opportunityId: (input.opportunityId as UUID | undefined) ?? null,
		leadId: (input.leadId as UUID | undefined) ?? null,
		ownerUserId: input.ownerUserId as UUID,
		dueDate: input.dueDate ?? null,
		isCompleted: false,
		completedAt: null,
		ext: {},
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Produce a DB-ready patch that marks an activity as complete.
 *
 * Rules (AC-CRM-003-03):
 * - Outcome is required for CALL, EMAIL, and MEETING activity types.
 * - TASK and NOTE activities may be completed without an explicit outcome;
 *   if an outcome is provided, it is stored.
 * - Already-completed activities cannot be completed again.
 */
export function completeActivity(
	snapshot: ActivitySnapshot,
	outcome: ActivityOutcome | null,
	actorId: UUID,
	now: Date = new Date(),
): ActivityCompletionPatch {
	if (snapshot.isCompleted) {
		throw new ActivityError(
			`Activity '${snapshot.id}' is already completed.`,
			"ACTIVITY_ALREADY_COMPLETED",
		);
	}

	if (OUTCOME_REQUIRED_TYPES.has(snapshot.activityType) && outcome === null) {
		throw new ActivityError(
			`Outcome is required when completing a ${snapshot.activityType} activity. ` +
				`Valid outcomes: ${ACTIVITY_OUTCOMES.join(", ")}.`,
			"ACTIVITY_OUTCOME_REQUIRED",
		);
	}

	const ext: Record<string, unknown> = outcome !== null ? { outcome } : {};

	return {
		isCompleted: true,
		completedAt: now.toISOString(),
		ext,
		updatedBy: actorId,
	};
}

/**
 * Returns true when a TASK activity is past its due date and not yet complete.
 * Used to build overdue-task notification queries (AC-CRM-003-05).
 */
export function isOverdue(snapshot: ActivitySnapshot, now: Date = new Date()): boolean {
	if (snapshot.activityType !== "TASK") return false;
	if (snapshot.isCompleted) return false;
	if (snapshot.dueDate === null) return false;
	return new Date(snapshot.dueDate) < now;
}

/**
 * Sort a set of activities into reverse-chronological order for timeline display.
 *
 * Ordering key (AC-CRM-003-04):
 *   completedAt (if set) > dueDate (if set) > createdAt
 *
 * Returns a new array — does not mutate the input.
 */
export function sortByTimeline(activities: ActivitySnapshot[]): ActivitySnapshot[] {
	return [...activities].sort((a, b) => {
		const tsA = a.completedAt ?? a.dueDate ?? a.createdAt;
		const tsB = b.completedAt ?? b.dueDate ?? b.createdAt;
		// Descending (newest first)
		return tsB.localeCompare(tsA);
	});
}

/**
 * Project an ActivitySnapshot into a timeline view entry.
 * Derives the `occurredAt` timestamp using the same key as sortByTimeline.
 */
export function toTimelineEntry(snapshot: ActivitySnapshot): ActivityTimelineEntry {
	return {
		id: snapshot.id,
		activityType: snapshot.activityType,
		subject: snapshot.subject,
		description: snapshot.description,
		ownerUserId: snapshot.ownerUserId,
		isCompleted: snapshot.isCompleted,
		outcome: snapshot.outcome,
		occurredAt: snapshot.completedAt ?? snapshot.dueDate ?? snapshot.createdAt,
		crmContactId: snapshot.crmContactId,
		crmCompanyId: snapshot.crmCompanyId,
		opportunityId: snapshot.opportunityId,
	};
}

/**
 * Build a timeline view from a list of activity snapshots:
 * sorts reverse-chronologically and projects to timeline entries.
 */
export function buildTimeline(activities: ActivitySnapshot[]): ActivityTimelineEntry[] {
	return sortByTimeline(activities).map(toTimelineEntry);
}
