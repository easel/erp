/**
 * OfflineDeferralBanner — displayed when the user is offline and the form
 * contains a Tier 2 entity that will require Layer 2 (state-dependent)
 * server validation on sync.
 *
 * Per ADR-010 §Offline Validation Behavior:
 *   Layer 1 (structural) validation runs normally against Zod schemas.
 *   Layer 2 (state-dependent) validation deferred until reconnection.
 *   Banner text: "Compliance checks are pending until you reconnect."
 *
 * Usage:
 *   <OfflineDeferralBanner entityLabel="quote" isOffline={!isOnline} />
 */

interface OfflineDeferralBannerProps {
	/** Human-readable entity name for the banner message (e.g. "quote", "purchase order") */
	entityLabel: string;
	/** Whether the banner should be visible */
	isOffline: boolean;
}

export function OfflineDeferralBanner({ entityLabel, isOffline }: OfflineDeferralBannerProps) {
	if (!isOffline) return null;

	return (
		<output
			aria-live="polite"
			aria-label="Offline validation notice"
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: "0.75rem",
				padding: "0.75rem 1rem",
				borderRadius: "0.375rem",
				backgroundColor: "#fefce8",
				border: "1px solid #fde68a",
				color: "#92400e",
			}}
		>
			<span aria-hidden="true" style={{ fontSize: "1rem", lineHeight: "1.5rem" }}>
				⚠
			</span>
			<p style={{ margin: 0, fontSize: "0.875rem", lineHeight: "1.5rem" }}>
				This {entityLabel} will be validated by the server when you reconnect.{" "}
				<strong>Compliance checks are pending until you reconnect.</strong>
			</p>
		</output>
	);
}
