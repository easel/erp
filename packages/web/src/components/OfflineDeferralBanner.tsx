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
			className="flex items-start gap-3 px-4 py-3 rounded-md bg-yellow-50 border border-yellow-200 text-amber-800"
		>
			<span aria-hidden="true" className="text-base leading-6">
				⚠
			</span>
			<p className="m-0 text-sm leading-6">
				This {entityLabel} will be validated by the server when you reconnect.{" "}
				<strong>Compliance checks are pending until you reconnect.</strong>
			</p>
		</output>
	);
}
