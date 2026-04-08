/**
 * SyncStatusIndicator — root-layout widget showing the local-first sync state.
 *
 * Design rules (ADR-009, ADR-011 PLT-018):
 *  - Three connection states: connected (green dot), syncing (yellow dot), offline (red dot).
 *  - Tooltip: "Last synced: 2 minutes ago · 3 items pending sync".
 *  - Click to expand: pending sync queue length, last sync timestamp, any sync errors.
 *  - Offline banner rendered separately (see OfflineBanner component below).
 *
 * Accessibility: WCAG 2.1 AA — status announced via aria-live; expand panel
 * managed as a disclosure widget.
 *
 * @example
 * <SyncStatusIndicator
 *   status="syncing"
 *   lastSyncedAt={new Date()}
 *   pendingCount={3}
 *   errors={[]}
 * />
 */

import type { SyncStatus } from "@apogee/shared";
import type React from "react";
import { useId, useRef, useState } from "react";
import { cn } from "../lib/utils.js";

export type SyncConnectionState = SyncStatus | "offline";

export interface SyncStatusIndicatorProps {
	/** Current sync connection state. */
	status: SyncConnectionState;
	/** Timestamp of the last successful sync, or null if never synced. */
	lastSyncedAt: Date | null;
	/** Number of locally-created records awaiting push to server. */
	pendingCount: number;
	/** Any errors from the most recent sync attempt. */
	errors?: string[];
	/** Additional CSS class names. */
	className?: string;
}

const STATUS_CONFIG: Record<
	SyncConnectionState,
	{ label: string; dotColor: string; ariaLabel: string }
> = {
	synced: {
		label: "Synced",
		dotColor: "#10b981",
		ariaLabel: "Connected and synced",
	},
	pending_push: {
		label: "Syncing",
		dotColor: "#f59e0b",
		ariaLabel: "Sync in progress",
	},
	conflict: {
		label: "Conflict",
		dotColor: "#f59e0b",
		ariaLabel: "Sync conflict — review required",
	},
	offline: {
		label: "Offline",
		dotColor: "#ef4444",
		ariaLabel: "Offline — changes will sync when reconnected",
	},
};

function formatRelativeTime(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
	return date.toLocaleDateString();
}

/**
 * SyncStatusIndicator renders a coloured dot with an accessible expanded detail panel.
 */
export function SyncStatusIndicator({
	status,
	lastSyncedAt,
	pendingCount,
	errors = [],
	className,
}: SyncStatusIndicatorProps): React.ReactElement {
	const [expanded, setExpanded] = useState(false);
	const panelId = useId();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const config = STATUS_CONFIG[status];

	const tooltipText = [
		lastSyncedAt ? `Last synced: ${formatRelativeTime(lastSyncedAt)}` : "Never synced",
		pendingCount > 0 ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} pending` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className={cn("relative inline-block", className)}>
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={expanded}
				aria-controls={panelId}
				aria-label={`${config.ariaLabel}. ${tooltipText}. Click to ${expanded ? "hide" : "show"} details.`}
				title={tooltipText}
				onClick={() => setExpanded((prev) => !prev)}
				className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-md bg-transparent cursor-pointer text-xs text-gray-700"
			>
				{/* Animated dot */}
				<span
					aria-hidden="true"
					className={cn(
						"inline-block size-2 rounded-full",
						status === "pending_push" && "animate-[pulse_1.5s_ease-in-out_infinite]",
					)}
					style={{ background: config.dotColor }}
				/>
				<span aria-hidden="true">{config.label}</span>
			</button>

			{/* Expanded detail panel */}
			{expanded && (
				<section
					id={panelId}
					aria-label="Sync details"
					className="absolute top-[calc(100%+0.25rem)] right-0 w-64 bg-white border border-gray-300 rounded-md shadow-md p-3 z-50 text-sm"
				>
					<p className="m-0 font-semibold text-gray-900">{config.label}</p>

					<p className="mt-1 mb-0 text-gray-500">
						{lastSyncedAt ? `Last synced ${formatRelativeTime(lastSyncedAt)}` : "Never synced"}
					</p>

					{pendingCount > 0 && (
						<p className="mt-1 mb-0 text-amber-800">
							{pendingCount} item{pendingCount === 1 ? "" : "s"} pending sync
						</p>
					)}

					{errors.length > 0 && (
						<ul aria-label="Sync errors" className="mt-2 mb-0 pl-4 text-red-800">
							{errors.map((err, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static error list
								<li key={i}>{err}</li>
							))}
						</ul>
					)}

					{status === "offline" && (
						<p className="mt-2 mb-0 p-1.5 bg-red-100 rounded text-red-800 text-xs">
							You are offline. Changes will sync when you reconnect. Compliance checks are pending.
						</p>
					)}
				</section>
			)}

			{/* CSS animation for syncing dot — injected once */}
			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.4; }
				}
			`}</style>
		</div>
	);
}

/**
 * OfflineBanner — full-width banner rendered at the top of the page when offline.
 * Intended for the root layout.
 */
export function OfflineBanner(): React.ReactElement {
	return (
		<div
			aria-live="assertive"
			aria-atomic="true"
			className="bg-amber-100 border-b border-amber-500 px-4 py-2 text-sm text-amber-800 text-center"
		>
			⚠ You are offline. Changes will sync when you reconnect. Compliance checks are pending.
		</div>
	);
}
