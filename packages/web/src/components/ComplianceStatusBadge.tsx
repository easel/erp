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
import { cn } from "../lib/utils.js";

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
	{ label: string; icon: string; colorClasses: string }
> = {
	pending: {
		label: "Pending",
		icon: "⏳",
		colorClasses: "bg-amber-100 text-amber-800 border-amber-500",
	},
	cleared: {
		label: "Cleared",
		icon: "✓",
		colorClasses: "bg-green-100 text-green-800 border-green-500",
	},
	held: {
		label: "Held",
		icon: "⚠",
		colorClasses: "bg-red-100 text-red-800 border-red-500",
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

	const badgeClasses = cn(
		"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold leading-normal select-none whitespace-nowrap no-underline",
		config.colorClasses,
		onClick ? "cursor-pointer" : "cursor-default",
		className,
	);

	const element = (
		<output
			aria-label={`Compliance status: ${config.label}${tooltipText ? `. ${tooltipText}` : ""}`}
			title={tooltipText || undefined}
			className={badgeClasses}
		>
			<span aria-hidden="true">{config.icon}</span>
			{config.label}
		</output>
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				title={tooltipText || undefined}
				aria-label={`Compliance status: ${config.label}. Click to view details.${tooltipText ? ` ${tooltipText}` : ""}`}
				className="bg-transparent border-none p-0 cursor-pointer inline-flex"
			>
				<output aria-hidden="true" className={badgeClasses}>
					<span aria-hidden="true">{config.icon}</span>
					{config.label}
				</output>
			</button>
		);
	}

	return element;
}
