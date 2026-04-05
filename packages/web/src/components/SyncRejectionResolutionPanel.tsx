/**
 * SyncRejectionResolutionPanel — displayed when a locally-saved Tier 2 record
 * was rejected by the server during sync (Layer 2 validation failure).
 *
 * Per ADR-010 §Offline Validation Behavior:
 *   "On sync, server-rejected records surface in resolution UI where user can
 *    edit and resubmit or discard."
 *
 * The panel shows all structured ValidationErrors returned by the server,
 * and provides Edit and Discard actions.
 *
 * Usage:
 *   <SyncRejectionResolutionPanel
 *     entityLabel="quote"
 *     entityId="abc123"
 *     errors={syncRejection.errors}
 *     onEdit={() => router.push(`/quotes/${id}/edit`)}
 *     onDiscard={() => discardLocalRecord(id)}
 *   />
 */
import type { ValidationError } from "@apogee/shared";

interface SyncRejectionResolutionPanelProps {
	/** Human-readable entity name (e.g. "quote", "journal entry") */
	entityLabel: string;
	/** The local entity ID that was rejected */
	entityId: string;
	/** Structured validation errors from the server Layer 2 response */
	errors: readonly ValidationError[];
	/** Called when the user chooses to edit and resubmit */
	onEdit: () => void;
	/** Called when the user chooses to discard the local record */
	onDiscard: () => void;
}

export function SyncRejectionResolutionPanel({
	entityLabel,
	entityId,
	errors,
	onEdit,
	onDiscard,
}: SyncRejectionResolutionPanelProps) {
	return (
		<div
			role="alert"
			aria-label={`Sync rejection for ${entityLabel} ${entityId}`}
			style={{
				borderRadius: "0.375rem",
				border: "1px solid #fca5a5",
				backgroundColor: "#fff1f2",
				padding: "1rem",
				display: "flex",
				flexDirection: "column",
				gap: "0.75rem",
			}}
		>
			<div>
				<h3
					style={{
						margin: 0,
						fontSize: "0.9375rem",
						fontWeight: 600,
						color: "#991b1b",
					}}
				>
					Server rejected this {entityLabel}
				</h3>
				<p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#b91c1c" }}>
					Validation failed when syncing. Review the errors below and choose to edit or discard.
				</p>
			</div>

			<ul
				aria-label="Validation errors"
				style={{
					margin: 0,
					padding: "0 0 0 1.25rem",
					display: "flex",
					flexDirection: "column",
					gap: "0.25rem",
				}}
			>
				{errors.map((err) => (
					<li
						key={`${err.rule}-${err.field ?? "form"}`}
						style={{ fontSize: "0.875rem", color: "#7f1d1d" }}
					>
						{err.field ? (
							<>
								<strong>{err.field}:</strong> {err.message}
							</>
						) : (
							err.message
						)}
					</li>
				))}
			</ul>

			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button
					type="button"
					onClick={onEdit}
					style={{
						padding: "0.375rem 0.875rem",
						borderRadius: "0.375rem",
						border: "1px solid #dc2626",
						backgroundColor: "#dc2626",
						color: "#fff",
						fontSize: "0.875rem",
						fontWeight: 500,
						cursor: "pointer",
					}}
				>
					Edit &amp; Resubmit
				</button>
				<button
					type="button"
					onClick={onDiscard}
					style={{
						padding: "0.375rem 0.875rem",
						borderRadius: "0.375rem",
						border: "1px solid #fca5a5",
						backgroundColor: "#fff1f2",
						color: "#991b1b",
						fontSize: "0.875rem",
						fontWeight: 500,
						cursor: "pointer",
					}}
				>
					Discard
				</button>
			</div>
		</div>
	);
}
