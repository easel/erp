/**
 * GlobalSearch — Cmd+K search overlay for cross-module entity search.
 *
 * Design rules (ADR-011 PLT-019):
 *  - Opens on Cmd+K (Mac) / Ctrl+K (Windows/Linux).
 *  - Closes on Escape.
 *  - When online, delegates search to the caller-supplied async search function.
 *  - When offline, notifies via the onOfflineSearch callback so the caller can
 *    query local SQLite FTS instead.
 *  - Results are grouped by module (Finance, Sales, etc.).
 *
 * Accessibility: WCAG 2.1 AA — dialog with role="dialog", results as a list
 * of buttons, keyboard navigation via ArrowUp/ArrowDown/Enter/Escape.
 *
 * @example
 * <GlobalSearch
 *   isOffline={false}
 *   onSearch={async (q) => serverSearch(q)}
 *   onNavigate={(result) => router.push(result.href)}
 * />
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SearchResult {
	id: string;
	/** Human-readable title (e.g. "JE-2026-001234"). */
	title: string;
	/** Short description or secondary label. */
	description?: string;
	/** Module the result belongs to. */
	module: AppModule;
	/** URL path to navigate to. */
	href: string;
}

export type AppModule =
	| "finance"
	| "sales"
	| "procurement"
	| "crm"
	| "compliance"
	| "settings"
	| "dashboard";

export interface GlobalSearchProps {
	/** Whether the app is currently offline. When true, onOfflineSearch is used. */
	isOffline?: boolean;
	/**
	 * Called with the query string when online. Must return ranked results.
	 * The component debounces calls by ~200 ms.
	 */
	onSearch: (query: string) => Promise<SearchResult[]>;
	/**
	 * Called with the query string when offline. Must return results from local
	 * SQLite FTS. Falls back to empty array if not provided.
	 */
	onOfflineSearch?: (query: string) => SearchResult[];
	/** Called when the user activates a result. Caller is responsible for navigation. */
	onNavigate: (result: SearchResult) => void;
	/** Additional CSS class names for the overlay backdrop. */
	className?: string;
}

const MODULE_LABELS: Record<AppModule, string> = {
	finance: "Finance",
	sales: "Sales",
	procurement: "Procurement",
	crm: "CRM",
	compliance: "Compliance",
	settings: "Settings",
	dashboard: "Dashboard",
};

/**
 * GlobalSearch renders a modal overlay triggered by Cmd+K / Ctrl+K.
 */
export function GlobalSearch({
	isOffline = false,
	onSearch,
	onOfflineSearch,
	onNavigate,
	className,
}: GlobalSearchProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cmd+K / Ctrl+K shortcut to open
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen(true);
			}
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	// Focus input when opened
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 0);
			setQuery("");
			setResults([]);
			setActiveIndex(-1);
		}
	}, [open]);

	const runSearch = useCallback(
		(q: string) => {
			if (!q.trim()) {
				setResults([]);
				setLoading(false);
				return;
			}

			if (isOffline) {
				const localResults = onOfflineSearch ? onOfflineSearch(q) : [];
				setResults(localResults);
				setLoading(false);
				return;
			}

			setLoading(true);
			onSearch(q)
				.then((r) => {
					setResults(r);
					setLoading(false);
				})
				.catch(() => {
					setResults([]);
					setLoading(false);
				});
		},
		[isOffline, onSearch, onOfflineSearch],
	);

	const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const q = e.target.value;
		setQuery(q);
		setActiveIndex(-1);

		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => runSearch(q), 200);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			setOpen(false);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, -1));
		} else if (e.key === "Enter" && activeIndex >= 0) {
			const result = results[activeIndex];
			if (result) {
				setOpen(false);
				onNavigate(result);
			}
		}
	};

	// Group results by module
	const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
		const key = r.module;
		const existing = acc[key];
		if (existing) {
			existing.push(r);
		} else {
			acc[key] = [r];
		}
		return acc;
	}, {});

	if (!open) return <></>;

	return (
		/* Backdrop — closes dialog when clicked outside the dialog box */
		<div
			className={className}
			onClick={() => setOpen(false)}
			onKeyDown={(e) => {
				if (e.key === "Escape") setOpen(false);
			}}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.4)",
				zIndex: 100,
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				paddingTop: "10vh",
			}}
		>
			{/* Dialog */}
			<dialog
				open
				aria-label="Global search"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				style={{
					background: "#fff",
					borderRadius: "0.5rem",
					boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1)",
					width: "min(38rem, 90vw)",
					overflow: "hidden",
					border: "none",
					padding: 0,
					margin: 0,
					position: "static",
				}}
			>
				{/* Input row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						padding: "0.75rem 1rem",
						borderBottom: "1px solid #e5e7eb",
						gap: "0.5rem",
					}}
				>
					<span aria-hidden="true" style={{ color: "#9ca3af", fontSize: "1rem" }}>
						🔍
					</span>
					<input
						ref={inputRef}
						type="search"
						aria-label={isOffline ? "Search local data (offline)" : "Search across all modules"}
						placeholder={
							isOffline ? "Search offline (local data)…" : "Search across all modules… (Cmd+K)"
						}
						value={query}
						onChange={handleQueryChange}
						onKeyDown={handleKeyDown}
						style={{
							flex: 1,
							border: "none",
							outline: "none",
							fontSize: "1rem",
							color: "#111827",
							background: "transparent",
						}}
					/>
					{loading && (
						<span aria-label="Searching…" style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
							…
						</span>
					)}
					{isOffline && (
						<span
							aria-label="Offline — searching local data"
							style={{
								fontSize: "0.7rem",
								background: "#fee2e2",
								color: "#991b1b",
								borderRadius: "0.25rem",
								padding: "0.125rem 0.375rem",
							}}
						>
							OFFLINE
						</span>
					)}
					<kbd
						style={{
							fontSize: "0.7rem",
							color: "#9ca3af",
							border: "1px solid #e5e7eb",
							borderRadius: "0.25rem",
							padding: "0.125rem 0.375rem",
						}}
					>
						Esc
					</kbd>
				</div>

				{/* Results — rendered as a list of buttons for accessibility */}
				{results.length > 0 && (
					<div
						aria-label="Search results"
						style={{
							margin: 0,
							padding: "0.5rem 0",
							maxHeight: "24rem",
							overflowY: "auto",
						}}
					>
						{Object.entries(grouped).map(([module, moduleResults]) => (
							<div key={module}>
								<div
									style={{
										padding: "0.25rem 1rem",
										fontSize: "0.7rem",
										fontWeight: 600,
										color: "#9ca3af",
										textTransform: "uppercase",
										letterSpacing: "0.05em",
									}}
								>
									{MODULE_LABELS[module as AppModule] ?? module}
								</div>
								{moduleResults.map((result) => {
									const flatIndex = results.indexOf(result);
									const isActive = flatIndex === activeIndex;
									return (
										<button
											key={result.id}
											type="button"
											id={`search-result-${flatIndex}`}
											aria-pressed={isActive}
											onClick={() => {
												setOpen(false);
												onNavigate(result);
											}}
											onFocus={() => setActiveIndex(flatIndex)}
											style={{
												display: "flex",
												flexDirection: "column",
												width: "100%",
												padding: "0.5rem 1rem",
												cursor: "pointer",
												background: isActive ? "#eff6ff" : "transparent",
												border: "none",
												textAlign: "left",
											}}
										>
											<span
												style={{
													fontSize: "0.875rem",
													fontWeight: 500,
													color: "#111827",
												}}
											>
												{result.title}
											</span>
											{result.description && (
												<span
													style={{
														fontSize: "0.75rem",
														color: "#6b7280",
														marginTop: "0.125rem",
													}}
												>
													{result.description}
												</span>
											)}
										</button>
									);
								})}
							</div>
						))}
					</div>
				)}

				{query.trim() && !loading && results.length === 0 && (
					<div
						style={{
							padding: "1.5rem",
							textAlign: "center",
							color: "#6b7280",
							fontSize: "0.875rem",
						}}
					>
						No results for &ldquo;{query}&rdquo;
					</div>
				)}
			</dialog>
		</div>
	);
}
