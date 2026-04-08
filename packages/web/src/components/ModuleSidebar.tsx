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
import { cn } from "../lib/utils.js";
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
				<li key={item.id} className="list-none">
					<button
						type="button"
						aria-expanded={!isCollapsed}
						onClick={() => toggleSection(item.id)}
						className={cn(
							"flex items-center w-full py-1.5 bg-transparent border-none cursor-pointer text-[0.8125rem] text-left gap-2",
							isAnyChildActive ? "font-semibold text-gray-900" : "font-medium text-gray-600",
						)}
						style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
					>
						{item.icon && (
							<span aria-hidden="true" className="text-sm">
								{item.icon}
							</span>
						)}
						<span className="flex-1">{item.label}</span>
						<span aria-hidden="true" className="text-[0.625rem] text-gray-400">
							{isCollapsed ? "▶" : "▼"}
						</span>
					</button>
					{!isCollapsed && (
						<ul className="list-none m-0 p-0">
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
					className="py-1 text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wide list-none"
					style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
				>
					{item.label}
				</li>
			);
		}

		const active = isActive(item.href);
		const itemHref = item.href;
		return (
			<li key={item.id} className="list-none">
				<a
					href={itemHref}
					aria-current={active ? "page" : undefined}
					onClick={(e) => {
						e.preventDefault();
						onNavigate(itemHref);
					}}
					className={cn(
						"flex items-center py-1.5 text-[0.8125rem] no-underline gap-2 border-l-2",
						active
							? "font-semibold text-gray-900 bg-blue-50"
							: "font-normal text-gray-600 bg-transparent border-l-transparent hover:bg-gray-50 focus:bg-gray-50",
					)}
					style={{
						paddingLeft: `${0.75 + depth * 0.75}rem`,
						borderLeftColor: active ? MODULE_COLOR[module] : undefined,
					}}
				>
					{item.icon && (
						<span aria-hidden="true" className="text-sm">
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
			className={cn("w-56 min-h-full bg-white border-r border-gray-200 flex flex-col", className)}
		>
			{/* Module header */}
			<div className="px-3 pt-4 pb-2 border-b border-gray-200 flex items-center gap-2">
				<span
					aria-hidden="true"
					className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
					style={{ background: MODULE_COLOR[module] }}
				/>
				<span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
					{MODULE_DISPLAY[module]}
				</span>
			</div>

			{/* Nav items */}
			<ul className="list-none m-0 py-2 px-0 flex-1 overflow-y-auto">
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
