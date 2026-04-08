"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import type { AppModule } from "./GlobalSearch.js";
import { ModuleLayout } from "./ModuleLayout.js";
import type { SidebarNavItem } from "./ModuleSidebar.js";

interface ModuleShellProps {
	module: AppModule;
	items: SidebarNavItem[];
	children: React.ReactNode;
}

export function ModuleShell({ module, items, children }: ModuleShellProps) {
	const pathname = usePathname();
	const router = useRouter();
	const handleNavigate = useCallback((href: string) => router.push(href), [router]);

	return (
		<ModuleLayout module={module} items={items} currentPath={pathname} onNavigate={handleNavigate}>
			{children}
		</ModuleLayout>
	);
}
