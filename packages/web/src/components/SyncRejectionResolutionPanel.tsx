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
			className="rounded-md border border-red-300 bg-rose-50 p-4 flex flex-col gap-3"
		>
			<div>
				<h3 className="m-0 text-[0.9375rem] font-semibold text-red-800">
					Server rejected this {entityLabel}
				</h3>
				<p className="mt-1 mb-0 text-sm text-red-700">
					Validation failed when syncing. Review the errors below and choose to edit or discard.
				</p>
			</div>

			<ul aria-label="Validation errors" className="m-0 pl-5 flex flex-col gap-1">
				{errors.map((err) => (
					<li key={`${err.rule}-${err.field ?? "form"}`} className="text-sm text-red-900">
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

			<div className="flex gap-2">
				<button
					type="button"
					onClick={onEdit}
					className="px-3.5 py-1.5 rounded-md border border-red-600 bg-red-600 text-white text-sm font-medium cursor-pointer"
				>
					Edit &amp; Resubmit
				</button>
				<button
					type="button"
					onClick={onDiscard}
					className="px-3.5 py-1.5 rounded-md border border-red-300 bg-rose-50 text-red-800 text-sm font-medium cursor-pointer"
				>
					Discard
				</button>
			</div>
		</div>
	);
}
