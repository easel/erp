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
import { cn } from "../lib/utils.js";
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
		<div className={cn("flex w-full h-full overflow-hidden", className)}>
			{/* Persistent sidebar */}
			<ModuleSidebar
				module={module}
				items={items}
				currentPath={currentPath}
				onNavigate={onNavigate}
			/>

			{/* Page content area */}
			<div className="flex-1 flex flex-col overflow-hidden min-w-0">
				{/* Breadcrumbs bar */}
				<div className="px-6 py-2.5 border-b border-gray-100 bg-white shrink-0">
					<Breadcrumbs segments={breadcrumbs} entityName={entityName} onNavigate={onNavigate} />
				</div>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto p-6">{children}</div>
			</div>
		</div>
	);
}
