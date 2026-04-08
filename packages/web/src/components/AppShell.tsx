"use client";

import type { CurrencyCode, UUID } from "@apogee/shared";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useEntityId } from "../lib/entity-context.js";
import type { EntityOption } from "./EntitySwitcher.js";
import type { SearchResult } from "./GlobalSearch.js";
import { RootLayout } from "./RootLayout.js";

const DEMO_ENTITIES: EntityOption[] = [
	{
		id: "a0000000-0000-0000-0000-000000000001" as UUID,
		name: "ODC-US",
		code: "ODC-US",
		functionalCurrency: "USD" as CurrencyCode,
	},
	{
		id: "a0000000-0000-0000-0000-000000000002" as UUID,
		name: "ODC-EU",
		code: "ODC-EU",
		functionalCurrency: "EUR" as CurrencyCode,
	},
];

export function AppShell({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { entityId, setEntityId } = useEntityId();

	const handleNavigate = useCallback((href: string) => router.push(href), [router]);

	const handleEntitySwitch = useCallback(
		(id: UUID) => {
			setEntityId(id);
			router.refresh();
		},
		[setEntityId, router],
	);

	const handleSearch = useCallback(async (_q: string): Promise<SearchResult[]> => [], []);

	return (
		<RootLayout
			isAuthenticated={true}
			entities={DEMO_ENTITIES}
			activeEntityId={entityId}
			syncStatus="synced"
			lastSyncedAt={new Date()}
			pendingCount={0}
			notifications={[]}
			currentPath={pathname}
			onEntitySwitch={handleEntitySwitch}
			onSearch={handleSearch}
			onNavigate={handleNavigate}
			onMarkNotificationRead={() => {}}
		>
			{children}
		</RootLayout>
	);
}
