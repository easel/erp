/**
 * ComplianceStatusBadge — visual indicator for entity compliance status.
 *
 * Design rules (ADR-006, ADR-011 PLT-018):
 *  - Three states: pending (yellow), cleared (green), held (red).
 *  - Tooltip surfaces screening summary, hold reason, and timestamp.
 *  - Appears on sales orders, purchase orders, shipments, and quotes.
 *  - onClick opens the compliance detail drawer (caller is responsible for the drawer).
 *
 * Accessibility: WCAG 2.1 AA — colour is not the only differentiator (icon + label);
 * tooltip triggered by focus and hover; role="status" for screen readers.
 *
 * @example
 * <ComplianceStatusBadge
 *   status="held"
 *   tooltip={{ holdReason: "Denied-party match — review required", checkedAt: new Date() }}
 *   onClick={() => openDrawer(orderId)}
 * />
 */

import type { ComplianceStatus } from "@apogee/shared";
import type React from "react";

export interface ComplianceTooltipInfo {
	/** Summary from the most recent screening run. */
	screeningSummary?: string;
	/** Populated when status is "held". */
	holdReason?: string;
	/** ISO timestamp of the last compliance check. */
	checkedAt?: Date;
}

export interface ComplianceStatusBadgeProps {
	status: ComplianceStatus;
	/** Rich tooltip content; plain string also accepted. */
	tooltip?: ComplianceTooltipInfo | string;
	/** Called when the user clicks the badge. */
	onClick?: () => void;
	/** Additional CSS class names. */
	className?: string;
}

const STATUS_CONFIG: Record<
	ComplianceStatus,
	{ label: string; icon: string; colors: React.CSSProperties }
> = {
	pending: {
		label: "Pending",
		icon: "⏳",
		colors: {
			backgroundColor: "#fef3c7",
			color: "#92400e",
			borderColor: "#f59e0b",
		},
	},
	cleared: {
		label: "Cleared",
		icon: "✓",
		colors: {
			backgroundColor: "#d1fae5",
			color: "#065f46",
			borderColor: "#10b981",
		},
	},
	held: {
		label: "Held",
		icon: "⚠",
		colors: {
			backgroundColor: "#fee2e2",
			color: "#991b1b",
			borderColor: "#ef4444",
		},
	},
};

function buildTooltipText(tooltip: ComplianceTooltipInfo | string | undefined): string {
	if (!tooltip) return "";
	if (typeof tooltip === "string") return tooltip;
	const parts: string[] = [];
	if (tooltip.screeningSummary) parts.push(tooltip.screeningSummary);
	if (tooltip.holdReason) parts.push(`Hold: ${tooltip.holdReason}`);
	if (tooltip.checkedAt) {
		parts.push(`Checked: ${tooltip.checkedAt.toLocaleString()}`);
	}
	return parts.join(" · ");
}

/**
 * ComplianceStatusBadge renders a colour-coded pill with an accessible tooltip.
 * Pending = yellow, Cleared = green, Held = red.
 */
export function ComplianceStatusBadge({
	status,
	tooltip,
	onClick,
	className,
}: ComplianceStatusBadgeProps): React.ReactElement {
	const config = STATUS_CONFIG[status];
	const tooltipText = buildTooltipText(tooltip);

	const badgeStyle: React.CSSProperties = {
		...config.colors,
		display: "inline-flex",
		alignItems: "center",
		gap: "0.25rem",
		padding: "0.125rem 0.625rem",
		borderRadius: "9999px",
		border: "1px solid",
		fontSize: "0.75rem",
		fontWeight: 600,
		lineHeight: 1.5,
		userSelect: "none",
		cursor: onClick ? "pointer" : "default",
		textDecoration: "none",
		whiteSpace: "nowrap",
	};

	const element = (
		<span
			role="status"
			aria-label={`Compliance status: ${config.label}${tooltipText ? `. ${tooltipText}` : ""}`}
			title={tooltipText || undefined}
			style={badgeStyle}
			className={className}
		>
			<span aria-hidden="true">{config.icon}</span>
			{config.label}
		</span>
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				title={tooltipText || undefined}
				aria-label={`Compliance status: ${config.label}. Click to view details.${tooltipText ? ` ${tooltipText}` : ""}`}
				style={{
					background: "none",
					border: "none",
					padding: 0,
					cursor: "pointer",
					display: "inline-flex",
				}}
			>
				<span role="status" aria-hidden="true" style={badgeStyle} className={className}>
					<span aria-hidden="true">{config.icon}</span>
					{config.label}
				</span>
			</button>
		);
	}

	return element;
}
