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
		<div style={{ position: "relative", display: "inline-block" }} className={className}>
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={expanded}
				aria-controls={panelId}
				aria-label={`${config.ariaLabel}. ${tooltipText}. Click to ${expanded ? "hide" : "show"} details.`}
				title={tooltipText}
				onClick={() => setExpanded((prev) => !prev)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.375rem",
					padding: "0.25rem 0.5rem",
					border: "1px solid #e5e7eb",
					borderRadius: "0.375rem",
					background: "transparent",
					cursor: "pointer",
					fontSize: "0.75rem",
					color: "#374151",
				}}
			>
				{/* Animated dot */}
				<span
					aria-hidden="true"
					style={{
						width: "0.5rem",
						height: "0.5rem",
						borderRadius: "50%",
						background: config.dotColor,
						display: "inline-block",
						animation: status === "pending_push" ? "pulse 1.5s ease-in-out infinite" : "none",
					}}
				/>
				<span aria-hidden="true">{config.label}</span>
			</button>

			{/* Expanded detail panel */}
			{expanded && (
				<section
					id={panelId}
					aria-label="Sync details"
					style={{
						position: "absolute",
						top: "calc(100% + 0.25rem)",
						right: 0,
						width: "16rem",
						background: "#fff",
						border: "1px solid #d1d5db",
						borderRadius: "0.375rem",
						boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
						padding: "0.75rem",
						zIndex: 50,
						fontSize: "0.875rem",
					}}
				>
					<p style={{ margin: 0, fontWeight: 600, color: "#111827" }}>{config.label}</p>

					<p style={{ margin: "0.25rem 0 0", color: "#6b7280" }}>
						{lastSyncedAt ? `Last synced ${formatRelativeTime(lastSyncedAt)}` : "Never synced"}
					</p>

					{pendingCount > 0 && (
						<p style={{ margin: "0.25rem 0 0", color: "#92400e" }}>
							{pendingCount} item{pendingCount === 1 ? "" : "s"} pending sync
						</p>
					)}

					{errors.length > 0 && (
						<ul
							aria-label="Sync errors"
							style={{
								margin: "0.5rem 0 0",
								padding: "0 0 0 1rem",
								color: "#991b1b",
							}}
						>
							{errors.map((err, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static error list
								<li key={i}>{err}</li>
							))}
						</ul>
					)}

					{status === "offline" && (
						<p
							style={{
								margin: "0.5rem 0 0",
								padding: "0.375rem",
								background: "#fee2e2",
								borderRadius: "0.25rem",
								color: "#991b1b",
								fontSize: "0.75rem",
							}}
						>
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
			style={{
				background: "#fef3c7",
				borderBottom: "1px solid #f59e0b",
				padding: "0.5rem 1rem",
				fontSize: "0.875rem",
				color: "#92400e",
				textAlign: "center",
			}}
		>
			⚠ You are offline. Changes will sync when you reconnect. Compliance checks are pending.
		</div>
	);
}
