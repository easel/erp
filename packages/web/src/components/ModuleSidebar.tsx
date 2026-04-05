/**
 * ModuleSidebar — persistent sidebar navigation within an ERP module.
 *
 * Design rules (ADR-011 PLT-019):
 *  - Renders a list of nav items for the current module.
 *  - Active item is highlighted.
 *  - Sections can be collapsed; state is preserved in-memory across renders
 *    (caller owns the persistence layer if desired).
 *  - Module shortcuts: G+F (Finance), G+S (Sales) — handled by the parent
 *    RootLayout; this component receives the active module.
 *
 * Accessibility: WCAG 2.1 AA — nav landmark, aria-current on active link,
 * aria-expanded on collapsible sections.
 *
 * @example
 * <ModuleSidebar
 *   module="finance"
 *   items={FINANCE_NAV}
 *   currentPath="/finance/journal-entries"
 *   onNavigate={(href) => router.push(href)}
 * />
 */

import type React from "react";
import { useState } from "react";
import type { AppModule } from "./GlobalSearch.js";

export interface SidebarNavItem {
	/** Unique identifier for the item. */
	id: string;
	/** Display label. */
	label: string;
	/** URL path. Required unless this is a section header. */
	href?: string;
	/** Optional icon character or component. */
	icon?: string;
	/** Child items — makes this item a collapsible section header. */
	children?: SidebarNavItem[];
}

export interface ModuleSidebarProps {
	/** The ERP module this sidebar belongs to. */
	module: AppModule;
	/** Navigation items to display. */
	items: SidebarNavItem[];
	/** The current URL pathname, used to highlight the active item. */
	currentPath: string;
	/** Called when the user activates a nav item. Caller navigates. */
	onNavigate: (href: string) => void;
	/** Additional CSS class names for the sidebar element. */
	className?: string;
}

const MODULE_DISPLAY: Record<AppModule, string> = {
	finance: "Finance",
	sales: "Sales",
	procurement: "Procurement",
	crm: "CRM",
	compliance: "Compliance",
	settings: "Settings",
	dashboard: "Dashboard",
};

const MODULE_COLOR: Record<AppModule, string> = {
	finance: "#3b82f6",
	sales: "#10b981",
	procurement: "#f59e0b",
	crm: "#8b5cf6",
	compliance: "#ef4444",
	settings: "#6b7280",
	dashboard: "#6b7280",
};

/**
 * ModuleSidebar renders a persistent vertical navigation panel for one ERP module.
 */
export function ModuleSidebar({
	module,
	items,
	currentPath,
	onNavigate,
	className,
}: ModuleSidebarProps): React.ReactElement {
	// Track collapsed state for each section by item id
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	const toggleSection = (id: string) => {
		setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const isActive = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`);

	const renderItem = (item: SidebarNavItem, depth = 0): React.ReactNode => {
		const hasChildren = item.children && item.children.length > 0;
		const isCollapsed = collapsed[item.id] ?? false;

		if (hasChildren) {
			const isAnyChildActive = (item.children ?? []).some((c) => c.href && isActive(c.href));
			return (
				<li key={item.id} style={{ listStyle: "none" }}>
					<button
						type="button"
						aria-expanded={!isCollapsed}
						onClick={() => toggleSection(item.id)}
						style={{
							display: "flex",
							alignItems: "center",
							width: "100%",
							padding: `0.375rem ${0.75 + depth * 0.75}rem`,
							background: "transparent",
							border: "none",
							cursor: "pointer",
							fontSize: "0.8125rem",
							fontWeight: isAnyChildActive ? 600 : 500,
							color: isAnyChildActive ? "#111827" : "#4b5563",
							textAlign: "left",
							gap: "0.5rem",
						}}
					>
						{item.icon && (
							<span aria-hidden="true" style={{ fontSize: "0.875rem" }}>
								{item.icon}
							</span>
						)}
						<span style={{ flex: 1 }}>{item.label}</span>
						<span aria-hidden="true" style={{ fontSize: "0.625rem", color: "#9ca3af" }}>
							{isCollapsed ? "▶" : "▼"}
						</span>
					</button>
					{!isCollapsed && (
						<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
							{(item.children ?? []).map((child) => renderItem(child, depth + 1))}
						</ul>
					)}
				</li>
			);
		}

		if (!item.href) {
			// Plain label (section divider)
			return (
				<li
					key={item.id}
					aria-hidden="true"
					style={{
						padding: `0.25rem ${0.75 + depth * 0.75}rem`,
						fontSize: "0.7rem",
						fontWeight: 600,
						color: "#9ca3af",
						textTransform: "uppercase",
						letterSpacing: "0.05em",
						listStyle: "none",
					}}
				>
					{item.label}
				</li>
			);
		}

		const active = isActive(item.href);
		const itemHref = item.href;
		return (
			<li key={item.id} style={{ listStyle: "none" }}>
				<a
					href={itemHref}
					aria-current={active ? "page" : undefined}
					onClick={(e) => {
						e.preventDefault();
						onNavigate(itemHref);
					}}
					style={{
						display: "flex",
						alignItems: "center",
						padding: `0.375rem ${0.75 + depth * 0.75}rem`,
						fontSize: "0.8125rem",
						fontWeight: active ? 600 : 400,
						color: active ? "#111827" : "#4b5563",
						background: active ? "#eff6ff" : "transparent",
						textDecoration: "none",
						borderLeft: active ? `2px solid ${MODULE_COLOR[module]}` : "2px solid transparent",
						gap: "0.5rem",
					}}
					onFocus={(e) => {
						if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb";
					}}
					onBlur={(e) => {
						if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
					}}
				>
					{item.icon && (
						<span aria-hidden="true" style={{ fontSize: "0.875rem" }}>
							{item.icon}
						</span>
					)}
					{item.label}
				</a>
			</li>
		);
	};

	return (
		<nav
			aria-label={`${MODULE_DISPLAY[module]} module navigation`}
			className={className}
			style={{
				width: "14rem",
				minHeight: "100%",
				background: "#fff",
				borderRight: "1px solid #e5e7eb",
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* Module header */}
			<div
				style={{
					padding: "1rem 0.75rem 0.5rem",
					borderBottom: "1px solid #e5e7eb",
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
				}}
			>
				<span
					aria-hidden="true"
					style={{
						width: "0.625rem",
						height: "0.625rem",
						borderRadius: "50%",
						background: MODULE_COLOR[module],
						display: "inline-block",
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontSize: "0.75rem",
						fontWeight: 700,
						color: "#111827",
						textTransform: "uppercase",
						letterSpacing: "0.05em",
					}}
				>
					{MODULE_DISPLAY[module]}
				</span>
			</div>

			{/* Nav items */}
			<ul
				style={{
					listStyle: "none",
					margin: 0,
					padding: "0.5rem 0",
					flex: 1,
					overflowY: "auto",
				}}
			>
				{items.map((item) => renderItem(item))}
			</ul>
		</nav>
	);
}

// ─── Pre-built nav configs for each module ────────────────────────────────────

export const FINANCE_NAV: SidebarNavItem[] = [
	{
		id: "gl",
		label: "General Ledger",
		icon: "📒",
		children: [
			{ id: "gl-journal-entries", label: "Journal Entries", href: "/finance/journal-entries" },
			{
				id: "gl-chart-of-accounts",
				label: "Chart of Accounts",
				href: "/finance/chart-of-accounts",
			},
		],
	},
	{
		id: "ap",
		label: "Accounts Payable",
		icon: "📤",
		children: [
			{ id: "ap-invoices", label: "Vendor Invoices", href: "/finance/ap/invoices" },
			{ id: "ap-payments", label: "Payments", href: "/finance/ap/payments" },
		],
	},
	{
		id: "ar",
		label: "Accounts Receivable",
		icon: "📥",
		children: [
			{ id: "ar-invoices", label: "Customer Invoices", href: "/finance/ar/invoices" },
			{ id: "ar-receipts", label: "Receipts", href: "/finance/ar/receipts" },
		],
	},
	{
		id: "reports",
		label: "Reports",
		icon: "📊",
		children: [
			{
				id: "reports-trial-balance",
				label: "Trial Balance",
				href: "/finance/reports/trial-balance",
			},
			{
				id: "reports-balance-sheet",
				label: "Balance Sheet",
				href: "/finance/reports/balance-sheet",
			},
			{
				id: "reports-income",
				label: "Income Statement",
				href: "/finance/reports/income-statement",
			},
		],
	},
];

export const SALES_NAV: SidebarNavItem[] = [
	{ id: "quotes", label: "Quotes", icon: "📋", href: "/sales/quotes" },
	{ id: "orders", label: "Sales Orders", icon: "📦", href: "/sales/orders" },
	{ id: "customers", label: "Customers", icon: "🏢", href: "/sales/customers" },
	{
		id: "reports",
		label: "Reports",
		icon: "📊",
		children: [
			{ id: "reports-pipeline", label: "Pipeline", href: "/sales/reports/pipeline" },
			{ id: "reports-revenue", label: "Revenue", href: "/sales/reports/revenue" },
		],
	},
];

export const PROCUREMENT_NAV: SidebarNavItem[] = [
	{ id: "pos", label: "Purchase Orders", icon: "🛒", href: "/procurement/purchase-orders" },
	{ id: "vendors", label: "Vendors", icon: "🏭", href: "/procurement/vendors" },
	{ id: "requisitions", label: "Requisitions", icon: "📝", href: "/procurement/requisitions" },
	{ id: "receiving", label: "Receiving", icon: "📫", href: "/procurement/receiving" },
];

export const CRM_NAV: SidebarNavItem[] = [
	{ id: "contacts", label: "Contacts", icon: "👥", href: "/crm/contacts" },
	{ id: "accounts", label: "Accounts", icon: "🏢", href: "/crm/accounts" },
	{ id: "opportunities", label: "Opportunities", icon: "💡", href: "/crm/opportunities" },
	{ id: "activities", label: "Activities", icon: "📅", href: "/crm/activities" },
];

export const COMPLIANCE_NAV: SidebarNavItem[] = [
	{ id: "screening", label: "Screening", icon: "🔍", href: "/compliance/screening" },
	{ id: "holds", label: "Active Holds", icon: "🚫", href: "/compliance/holds" },
	{ id: "licenses", label: "Licenses", icon: "📜", href: "/compliance/licenses" },
	{
		id: "classifications",
		label: "Classifications",
		icon: "🏷",
		href: "/compliance/classifications",
	},
];

export const SETTINGS_NAV: SidebarNavItem[] = [
	{ id: "entities", label: "Legal Entities", icon: "🏛", href: "/settings/entities" },
	{ id: "users", label: "Users & Roles", icon: "👤", href: "/settings/users" },
	{ id: "workflows", label: "Workflows", icon: "⚙️", href: "/settings/workflows" },
	{ id: "integrations", label: "Integrations", icon: "🔗", href: "/settings/integrations" },
	{ id: "audit", label: "Audit Log", icon: "📋", href: "/settings/audit" },
];
