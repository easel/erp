/**
 * Activity Service — CRM activity (call/email/meeting/task/note) domain logic.
 *
 * Implements CRM-003 (Activity Tracking) from SD-003-WP5.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O.
 * - buildActivityRecord: maps validated input to DB-ready INSERT record.
 * - completeActivity / reopenActivity: state helpers for completion tracking.
 * - sortTimelineEntries: reverse-chronological ordering for timeline view.
 *
 * Acceptance criteria (FEAT-004 CRM-003):
 * - AC-CRM-003-01: Activities typed CALL/EMAIL/MEETING/TASK/NOTE.
 * - AC-CRM-003-02: Activities linked to contacts, companies, opportunities, leads.
 * - AC-CRM-003-03: Completion state tracked with completedAt timestamp.
 * - AC-CRM-003-04: Timeline sorted reverse-chronological.
 *
 * Ref: SD-002-data-model.md §7 (activity table),
 *      FEAT-004-customer-relationship.md CRM-003,
 *      SD-003-WP5 CRM-003
 * Issue: hx-975c910b
 */

import type { ActivityType, CreateActivityInput } from "@apogee/shared";
import type { UUID } from "@apogee/shared";

/** Input for partial activity updates. */
export interface UpdateActivityInput {
	readonly id: UUID;
	readonly subject?: string;
	readonly description?: string | null;
	readonly activityType?: ActivityType;
	readonly dueDate?: string | null;
	readonly ownerUserId?: UUID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/** Snapshot of a persisted activity record (read from DB). */
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
	readonly dueDate: string | null;
	readonly completedAt: string | null;
	readonly isCompleted: boolean;
	readonly createdAt: string;
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
	readonly isCompleted: boolean;
	readonly completedAt: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** DB-ready patch for activity UPDATE. */
export interface ActivityPatch {
	readonly subject?: string;
	readonly description?: string | null;
	readonly activityType?: ActivityType;
	readonly dueDate?: string | null;
	readonly isCompleted?: boolean;
	readonly completedAt?: string | null;
	readonly ownerUserId?: UUID;
	readonly updatedBy: UUID;
}

/** Entry in a timeline view across activity types. */
export interface TimelineEntry {
	readonly id: UUID;
	readonly activityType: ActivityType;
	readonly subject: string;
	readonly isCompleted: boolean;
	readonly completedAt: string | null;
	readonly dueDate: string | null;
	readonly createdAt: string;
	readonly ownerUserId: UUID;
}

/** Result of a completion state change. */
export interface ActivityCompletionResult {
	readonly isCompleted: boolean;
	readonly completedAt: string | null;
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
 * The isCompleted flag is taken from input; completedAt is set to the current
 * timestamp only when the activity is created already completed (unusual but
 * valid for back-filling historical activities).
 *
 * @param actorId  UUID of the user performing the create.
 * @param now      ISO 8601 timestamp for completedAt (when isCompleted=true).
 */
export function buildActivityRecord(
	input: CreateActivityInput,
	actorId: UUID,
	now: string = new Date().toISOString(),
): ActivityRecord {
	const isCompleted = input.isCompleted ?? false;
	return {
		entityId: input.entityId as UUID,
		activityType: input.activityType,
		subject: input.subject,
		description: input.description ?? null,
		crmContactId: (input.crmContactId as UUID | undefined) ?? null,
		crmCompanyId: (input.crmCompanyId as UUID | undefined) ?? null,
		opportunityId: (input.opportunityId as UUID | undefined) ?? null,
		leadId: (input.leadId as UUID | undefined) ?? null,
		ownerUserId: input.ownerUserId as UUID,
		dueDate: input.dueDate ?? null,
		isCompleted,
		completedAt: isCompleted ? now : null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Build an activity patch from a validated update input.
 *
 * Completion state is intentionally NOT toggled here; use completeActivity /
 * reopenActivity for explicit state transitions to ensure completedAt is set
 * correctly.
 *
 * @param actorId  UUID of the user performing the update.
 */
export function buildActivityPatch(input: UpdateActivityInput, actorId: UUID): ActivityPatch {
	const patch: ActivityPatch = { updatedBy: actorId };
	const mutable = patch as {
		subject?: string;
		description?: string | null;
		activityType?: ActivityType;
		dueDate?: string | null;
		ownerUserId?: UUID;
		updatedBy: UUID;
	};
	if (input.subject !== undefined) mutable.subject = input.subject;
	if (input.description !== undefined) mutable.description = input.description ?? null;
	if (input.activityType !== undefined) mutable.activityType = input.activityType;
	if (input.dueDate !== undefined) mutable.dueDate = input.dueDate ?? null;
	if (input.ownerUserId !== undefined) mutable.ownerUserId = input.ownerUserId;
	return mutable;
}

/**
 * Mark an activity as completed.
 *
 * @param activity  Current state of the activity.
 * @param now       ISO 8601 timestamp for completedAt (defaults to now).
 * @throws ActivityError if the activity is already completed.
 */
export function completeActivity(
	activity: ActivitySnapshot,
	now: string = new Date().toISOString(),
): ActivityCompletionResult {
	if (activity.isCompleted) {
		throw new ActivityError(
			`Activity '${activity.id}' is already completed.`,
			"ACTIVITY_ALREADY_COMPLETED",
		);
	}
	return { isCompleted: true, completedAt: now };
}

/**
 * Reopen a completed activity (clear completion state).
 *
 * @param activity  Current state of the activity.
 * @throws ActivityError if the activity is not completed.
 */
export function reopenActivity(activity: ActivitySnapshot): ActivityCompletionResult {
	if (!activity.isCompleted) {
		throw new ActivityError(
			`Activity '${activity.id}' is not completed; cannot reopen.`,
			"ACTIVITY_NOT_COMPLETED",
		);
	}
	return { isCompleted: false, completedAt: null };
}

/**
 * Sort timeline entries in reverse-chronological order.
 *
 * Sort key priority:
 * 1. completedAt (desc) — completed activities ordered by when they finished
 * 2. dueDate (desc) — upcoming/open tasks ordered by due date
 * 3. createdAt (desc) — stable fallback
 *
 * This matches AC-CRM-003-04: activities displayed reverse-chronologically.
 */
export function sortTimelineEntries(entries: TimelineEntry[]): TimelineEntry[] {
	return [...entries].sort((a, b) => {
		// Primary: most-recent effective date first
		const aDate = a.completedAt ?? a.dueDate ?? a.createdAt;
		const bDate = b.completedAt ?? b.dueDate ?? b.createdAt;
		if (aDate > bDate) return -1;
		if (aDate < bDate) return 1;
		// Secondary: by createdAt for stability
		if (a.createdAt > b.createdAt) return -1;
		if (a.createdAt < b.createdAt) return 1;
		return 0;
	});
}

/**
 * Filter predicate: return activities linked to a specific contact.
 */
export function isLinkedToContact(activity: ActivitySnapshot, contactId: UUID): boolean {
	return activity.crmContactId === contactId;
}

/**
 * Filter predicate: return activities linked to a specific company.
 */
export function isLinkedToCompany(activity: ActivitySnapshot, companyId: UUID): boolean {
	return activity.crmCompanyId === companyId;
}

/**
 * Filter predicate: return activities linked to a specific opportunity.
 */
export function isLinkedToOpportunity(activity: ActivitySnapshot, opportunityId: UUID): boolean {
	return activity.opportunityId === opportunityId;
}
