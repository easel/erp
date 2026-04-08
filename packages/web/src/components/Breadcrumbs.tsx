/**
 * Breadcrumbs — auto-generated navigation trail from route segments.
 *
 * Design rules (ADR-011 PLT-019):
 *  - Displays route segments as clickable links.
 *  - Includes entity context: "Acme Sat Corp > Finance > Journal Entries > JE-2026-001234".
 *  - Segments are separated by a visual divider (›).
 *  - Last segment is not a link (current page).
 *
 * Accessibility: WCAG 2.1 AA — nav landmark with aria-label="Breadcrumb",
 * aria-current="page" on the final item.
 *
 * @example
 * <Breadcrumbs
 *   segments={[
 *     { label: "Finance", href: "/finance" },
 *     { label: "Journal Entries", href: "/finance/journal-entries" },
 *     { label: "JE-2026-001234" },
 *   ]}
 *   entityName="Acme Sat Corp"
 * />
 */

import React from "react";
import { cn } from "../lib/utils.js";

export interface BreadcrumbSegment {
	/** Display label for this segment. */
	label: string;
	/** If present, the segment is rendered as a link. Omit for the current page. */
	href?: string;
}

export interface BreadcrumbsProps {
	/** Route segments in order from shallowest to deepest. The last segment is the current page. */
	segments: BreadcrumbSegment[];
	/** The active legal entity name, prepended to the trail. Omitted when null or undefined. */
	entityName?: string | null | undefined;
	/** Called when the user clicks a segment link. Caller is responsible for navigation. */
	onNavigate?: (href: string) => void;
	/** Additional CSS class names for the nav element. */
	className?: string;
}

/**
 * Breadcrumbs renders a navigation trail with optional entity context prefix.
 */
export function Breadcrumbs({
	segments,
	entityName,
	onNavigate,
	className,
}: BreadcrumbsProps): React.ReactElement {
	const allSegments: BreadcrumbSegment[] = entityName
		? [{ label: entityName }, ...segments]
		: segments;

	return (
		<nav aria-label="Breadcrumb" className={cn(className)}>
			<ol className="list-none m-0 p-0 flex items-center flex-wrap gap-1 text-sm text-gray-500">
				{allSegments.map((seg, idx) => {
					const isLast = idx === allSegments.length - 1;
					const key = `${seg.label}-${idx}`;
					return (
						<React.Fragment key={key}>
							{idx > 0 && (
								<li aria-hidden="true" className="text-gray-300 select-none">
									›
								</li>
							)}
							<li>
								{!isLast && seg.href ? (
									<a
										href={seg.href}
										onClick={
											onNavigate
												? (e) => {
														e.preventDefault();
														// seg.href is confirmed non-null by the condition above
														if (seg.href) onNavigate(seg.href);
													}
												: undefined
										}
										className="text-gray-600 no-underline font-normal hover:text-gray-900 hover:underline focus:text-gray-900 focus:underline"
									>
										{seg.label}
									</a>
								) : (
									<span
										aria-current={isLast ? "page" : undefined}
										className={isLast ? "text-gray-900 font-semibold" : "text-gray-600 font-normal"}
									>
										{seg.label}
									</span>
								)}
							</li>
						</React.Fragment>
					);
				})}
			</ol>
		</nav>
	);
}

/**
 * buildBreadcrumbs — derive BreadcrumbSegment array from a URL pathname.
 *
 * Converts e.g. "/finance/journal-entries/JE-001" into:
 *   [{ label: "Finance", href: "/finance" },
 *    { label: "Journal Entries", href: "/finance/journal-entries" },
 *    { label: "JE-001" }]
 *
 * Known module names are title-cased; path segments with hyphens are humanised.
 */
export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
	const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);
	return parts.map((part, idx) => {
		const href = `/${parts.slice(0, idx + 1).join("/")}`;
		const label = humaniseSegment(part);
		const isLast = idx === parts.length - 1;
		return isLast ? { label } : { label, href };
	});
}

const MODULE_LABELS: Record<string, string> = {
	finance: "Finance",
	sales: "Sales",
	procurement: "Procurement",
	crm: "CRM",
	compliance: "Compliance",
	settings: "Settings",
	dashboard: "Dashboard",
	"journal-entries": "Journal Entries",
	"trial-balance": "Trial Balance",
	"balance-sheet": "Balance Sheet",
	quotes: "Quotes",
	orders: "Orders",
	"sales-orders": "Sales Orders",
	customers: "Customers",
	screening: "Screening",
	holds: "Holds",
	licenses: "Licenses",
	classifications: "Classifications",
	entities: "Entities",
	users: "Users",
	new: "New",
};

function humaniseSegment(segment: string): string {
	const known = MODULE_LABELS[segment];
	if (known !== undefined) return known;
	// Dynamic segments like [id] → strip brackets
	if (segment.startsWith("[") && segment.endsWith("]")) {
		return segment.slice(1, -1).toUpperCase();
	}
	// Segments that look like record IDs (contain digits) are preserved as-is
	// e.g. "JE-001", "SO-2026-001234"
	if (/\d/.test(segment)) {
		return segment;
	}
	// Convert kebab-case to Title Case
	return segment
		.split("-")
		.map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
		.join(" ");
}
