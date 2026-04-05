/**
 * ModuleLayout — layout wrapper for a single ERP module (Finance, Sales, etc.).
 *
 * Design rules (ADR-011 PLT-019):
 *  - Persistent sidebar within the module; state is preserved across page navigations.
 *  - Breadcrumbs rendered above the content area.
 *  - Content area fills remaining horizontal space.
 *  - Navigating within a module does NOT collapse or reset the sidebar.
 *
 * Usage in Next.js App Router:
 *   In `app/finance/layout.tsx`, render <ModuleLayout module="finance" ...>
 *   The parent RootLayout handles the top nav and entity switcher.
 *
 * Accessibility: WCAG 2.1 AA — complementary landmark for sidebar,
 * main landmark inherited from RootLayout.
 *
 * @example
 * <ModuleLayout
 *   module="finance"
 *   items={FINANCE_NAV}
 *   currentPath="/finance/journal-entries"
 *   entityName="Acme Sat Corp"
 *   onNavigate={(href) => router.push(href)}
 * >
 *   {children}
 * </ModuleLayout>
 */

import type React from "react";
import { Breadcrumbs, buildBreadcrumbs } from "./Breadcrumbs.js";
import type { AppModule } from "./GlobalSearch.js";
import { ModuleSidebar } from "./ModuleSidebar.js";
import type { SidebarNavItem } from "./ModuleSidebar.js";

export interface ModuleLayoutProps {
	/** The ERP module for this layout. */
	module: AppModule;
	/** Sidebar navigation items. Use the pre-built exports (FINANCE_NAV, SALES_NAV, etc.). */
	items: SidebarNavItem[];
	/** The current URL pathname. */
	currentPath: string;
	/** Active entity name for breadcrumb prefix. */
	entityName?: string | null;
	/** Called when the user clicks a nav or breadcrumb link. */
	onNavigate: (href: string) => void;
	/** Page content. */
	children: React.ReactNode;
	/** Additional CSS class names for the outer wrapper. */
	className?: string;
}

/**
 * ModuleLayout composes a persistent sidebar and breadcrumbs around page content.
 */
export function ModuleLayout({
	module,
	items,
	currentPath,
	entityName,
	onNavigate,
	children,
	className,
}: ModuleLayoutProps): React.ReactElement {
	const breadcrumbs = buildBreadcrumbs(currentPath);

	return (
		<div
			className={className}
			style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}
		>
			{/* Persistent sidebar */}
			<ModuleSidebar
				module={module}
				items={items}
				currentPath={currentPath}
				onNavigate={onNavigate}
			/>

			{/* Page content area */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					minWidth: 0,
				}}
			>
				{/* Breadcrumbs bar */}
				<div
					style={{
						padding: "0.625rem 1.5rem",
						borderBottom: "1px solid #f3f4f6",
						background: "#fff",
						flexShrink: 0,
					}}
				>
					<Breadcrumbs segments={breadcrumbs} entityName={entityName} onNavigate={onNavigate} />
				</div>

				{/* Scrollable content */}
				<div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>{children}</div>
			</div>
		</div>
	);
}
