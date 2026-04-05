/**
 * Fiscal period utility functions.
 * Encodes the 4-state lifecycle from ADR-007: FUTURE → OPEN → SOFT_CLOSED → HARD_CLOSED.
 */

import type { FiscalPeriodStatus } from "@apogee/shared";

/**
 * Returns true if a fiscal period may be selected for journal posting.
 * HARD_CLOSED periods are never selectable for posting.
 */
export function isFiscalPeriodSelectable(status: FiscalPeriodStatus): boolean {
	return status !== "HARD_CLOSED";
}

/**
 * Returns a warning message for soft-closed periods, or null for others.
 * Callers should surface this to the user before allowing a posting.
 */
export function getFiscalPeriodWarning(status: FiscalPeriodStatus): string | null {
	if (status === "SOFT_CLOSED") {
		return "Only adjusting entries are allowed in a soft-closed period.";
	}
	return null;
}

/** Human-readable label for each fiscal period status. */
export const FISCAL_PERIOD_LABELS: Record<FiscalPeriodStatus, string> = {
	FUTURE: "Future",
	OPEN: "Open",
	SOFT_CLOSED: "Soft Closed",
	HARD_CLOSED: "Hard Closed",
};
