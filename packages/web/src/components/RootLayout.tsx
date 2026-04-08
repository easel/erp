/**
 * RootLayout — top-level shell for the Apogee ERP application.
 *
 * Design rules (ADR-011 PLT-019):
 *  - Always visible. Contains: logo, global search (Cmd+K), entity switcher,
 *    sync status indicator, notification bell, user menu.
 *  - Auth gate: renders children only when authenticated.
 *  - Keyboard shortcuts registered here:
 *      Cmd+K  → open global search
 *      Cmd+E  → open entity switcher
 *      G+F    → navigate to Finance module
 *      G+S    → navigate to Sales module
 *      Escape → close modals (handled by individual modal components)
 *  - Offline banner rendered below the top nav when sync status is "offline".
 *  - Module switcher tabs in the top nav.
 *
 * This component is framework-agnostic: it does not import from Next.js.
 * The App Router `app/layout.tsx` wraps this component and provides
 * routing callbacks.
 *
 * Accessibility: WCAG 2.1 AA — skip-to-main link, banner landmark,
 * main landmark, navigation landmark.
 *
 * @example
 * <RootLayout
 *   isAuthenticated={true}
 *   entities={userEntities}
 *   activeEntityId={entityId}
 *   syncStatus="synced"
 *   lastSyncedAt={new Date()}
 *   pendingCount={0}
 *   notifications={userNotifications}
 *   currentPath="/finance/journal-entries"
 *   onEntitySwitch={(id) => { setEntityId(id); router.refresh(); }}
 *   onSearch={async (q) => serverSearch(q)}
 *   onNavigate={(href) => router.push(href)}
 *   onMarkNotificationRead={(id) => markRead(id)}
 * >
 *   {children}
 * </RootLayout>
 */

import type { UUID } from "@apogee/shared";
import type React from "react";
import { useEffect, useRef } from "react";

import { cn } from "../lib/utils.js";
import { EntitySwitcher } from "./EntitySwitcher.js";
import type { EntityOption } from "./EntitySwitcher.js";
import { GlobalSearch } from "./GlobalSearch.js";
import type { AppModule, SearchResult } from "./GlobalSearch.js";
import { NotificationBell } from "./NotificationBell.js";
import type { AppNotification } from "./NotificationBell.js";
import { OfflineBanner, SyncStatusIndicator } from "./SyncStatusIndicator.js";
import type { SyncConnectionState } from "./SyncStatusIndicator.js";

export interface RootLayoutProps {
	/** Whether the current user is authenticated. Unauthenticated users see a placeholder. */
	isAuthenticated: boolean;
	/** All legal entities accessible to the current user. */
	entities: EntityOption[];
	/** The currently active legal entity id. */
	activeEntityId: UUID | null;
	/** Current sync state. */
	syncStatus: SyncConnectionState;
	/** Timestamp of last successful sync. */
	lastSyncedAt: Date | null;
	/** Number of locally pending records awaiting sync. */
	pendingCount: number;
	/** Sync errors from the most recent attempt. */
	syncErrors?: string[];
	/** Current user's notifications. */
	notifications: AppNotification[];
	/** The current URL pathname, used to highlight active module tab. */
	currentPath: string;
	/** Called when the user switches legal entity. */
	onEntitySwitch: (entityId: UUID) => void;
	/** Called with search query; returns ranked results. */
	onSearch: (query: string) => Promise<SearchResult[]>;
	/** Called with search query when offline; returns local FTS results. */
	onOfflineSearch?: (query: string) => SearchResult[];
	/** Called when user activates a search result or nav item. */
	onNavigate: (href: string) => void;
	/** Called when user marks a notification as read. */
	onMarkNotificationRead: (id: string) => void;
	/** Page content. */
	children: React.ReactNode;
	/** Additional CSS class names for the outer shell. */
	className?: string;
}

const MODULE_TABS: { module: AppModule; label: string; href: string; shortcut: string }[] = [
	{ module: "dashboard", label: "Dashboard", href: "/dashboard", shortcut: "" },
	{ module: "finance", label: "Finance", href: "/finance", shortcut: "G+F" },
	{ module: "sales", label: "Sales", href: "/sales", shortcut: "G+S" },
	{ module: "procurement", label: "Procurement", href: "/procurement", shortcut: "" },
	{ module: "crm", label: "CRM", href: "/crm", shortcut: "" },
	{ module: "compliance", label: "Compliance", href: "/compliance", shortcut: "" },
	{ module: "settings", label: "Settings", href: "/settings", shortcut: "" },
];

/**
 * Resolves the active module from a pathname.
 * e.g. "/finance/journal-entries" → "finance"
 */
function resolveActiveModule(pathname: string): AppModule | null {
	for (const tab of MODULE_TABS) {
		if (tab.module === "dashboard") continue;
		if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
			return tab.module;
		}
	}
	if (pathname === "/dashboard" || pathname === "/") return "dashboard";
	return null;
}

/**
 * RootLayout is the persistent application shell.
 * It registers global keyboard shortcuts and renders the top navigation bar.
 */
export function RootLayout({
	isAuthenticated,
	entities,
	activeEntityId,
	syncStatus,
	lastSyncedAt,
	pendingCount,
	syncErrors = [],
	notifications,
	currentPath,
	onEntitySwitch,
	onSearch,
	onOfflineSearch,
	onNavigate,
	onMarkNotificationRead,
	children,
	className,
}: RootLayoutProps): React.ReactElement {
	const isOffline = syncStatus === "offline";
	const activeModule = resolveActiveModule(currentPath);

	// G+F / G+S module shortcuts
	const gKeyRef = useRef(false);
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore when focus is inside an input
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			if (e.key === "g" || e.key === "G") {
				gKeyRef.current = true;
				// Clear the G-key state after 1 second if no follow-up key
				setTimeout(() => {
					gKeyRef.current = false;
				}, 1000);
				return;
			}

			if (gKeyRef.current) {
				gKeyRef.current = false;
				if (e.key === "f" || e.key === "F") {
					e.preventDefault();
					onNavigate("/finance");
				} else if (e.key === "s" || e.key === "S") {
					e.preventDefault();
					onNavigate("/sales");
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onNavigate]);

	if (!isAuthenticated) {
		return (
			<main
				className="min-h-screen flex items-center justify-center bg-gray-50"
				aria-label="Authentication required"
			>
				<p className="text-gray-500 text-sm">Redirecting to sign in…</p>
			</main>
		);
	}

	return (
		<div className={cn("min-h-screen flex flex-col", className)}>
			{/* Skip to main content (accessibility) */}
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[200] focus:px-4 focus:py-2 focus:bg-blue-500 focus:text-white focus:text-sm focus:rounded-b"
			>
				Skip to main content
			</a>

			{/* Offline banner */}
			{isOffline && <OfflineBanner />}

			{/* Top navigation bar */}
			<header
				className={cn(
					"bg-white border-b border-gray-200 px-6 flex items-center h-14 gap-4 shrink-0 sticky z-40",
					isOffline ? "top-10" : "top-0",
				)}
			>
				{/* Logo */}
				<a
					href="/dashboard"
					aria-label="Apogee ERP — go to dashboard"
					onClick={(e) => {
						e.preventDefault();
						onNavigate("/dashboard");
					}}
					className="font-bold text-lg text-gray-900 tracking-tight cursor-pointer select-none no-underline"
				>
					Apogee
				</a>

				{/* Module tabs */}
				<nav
					aria-label="Main navigation"
					className="flex items-center gap-0.5 flex-1 overflow-hidden"
				>
					{MODULE_TABS.map((tab) => {
						const isActive = tab.module === activeModule;
						return (
							<a
								key={tab.module}
								href={tab.href}
								aria-current={isActive ? "page" : undefined}
								title={tab.shortcut ? `${tab.label} (${tab.shortcut})` : tab.label}
								onClick={(e) => {
									e.preventDefault();
									onNavigate(tab.href);
								}}
								className={cn(
									"py-1.5 px-3 text-sm no-underline rounded-md whitespace-nowrap",
									isActive
										? "font-semibold text-gray-900 bg-gray-100"
										: "font-normal text-gray-500 bg-transparent hover:bg-gray-50 focus:bg-gray-50",
								)}
							>
								{tab.label}
							</a>
						);
					})}
				</nav>

				{/* Right-side controls */}
				<div className="flex items-center gap-2 shrink-0">
					{/* Search hint */}
					<button
						type="button"
						aria-label="Open global search (Cmd+K)"
						title="Search (Cmd+K)"
						onClick={() => {
							// Dispatch synthetic Cmd+K — the GlobalSearch component listens for this
							document.dispatchEvent(
								new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
							);
						}}
						className="flex items-center gap-1.5 py-1.5 px-2.5 border border-gray-200 rounded-md bg-gray-50 cursor-pointer text-[0.8125rem] text-gray-500"
					>
						<span aria-hidden="true">🔍</span>
						<span>Search</span>
						<kbd className="text-[0.6875rem] border border-gray-300 rounded px-1 py-px bg-white text-gray-400">
							⌘K
						</kbd>
					</button>

					{/* Sync status */}
					<SyncStatusIndicator
						status={syncStatus}
						lastSyncedAt={lastSyncedAt}
						pendingCount={pendingCount}
						errors={syncErrors}
					/>

					{/* Notification bell */}
					<NotificationBell
						notifications={notifications}
						onMarkRead={onMarkNotificationRead}
						onNavigate={onNavigate}
					/>

					{/* Entity switcher */}
					{entities.length > 1 && (
						<EntitySwitcher
							entities={entities}
							activeEntityId={activeEntityId}
							onSwitch={onEntitySwitch}
						/>
					)}
					{entities.length === 1 && entities[0] && (
						<span
							aria-label={`Active entity: ${entities[0].name}`}
							className="text-[0.8125rem] font-medium text-gray-700 py-1.5 px-3 border border-gray-200 rounded-md"
						>
							{entities[0].name}
						</span>
					)}
				</div>
			</header>

			{/* Main content */}
			<main id="main-content" className="flex-1 flex overflow-hidden">
				{children}
			</main>

			{/* Global search overlay (hidden until Cmd+K) */}
			<GlobalSearch
				isOffline={isOffline}
				onSearch={onSearch}
				{...(onOfflineSearch !== undefined ? { onOfflineSearch } : {})}
				onNavigate={(result) => onNavigate(result.href)}
			/>
		</div>
	);
}
