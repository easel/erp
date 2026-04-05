/**
 * EntitySwitcher — dropdown that lets users select their active legal entity.
 *
 * Design rules (ADR-011 PLT-018):
 *  - Displays entity name, functional currency, and entity code.
 *  - Persists selection in localStorage under ENTITY_SWITCHER_KEY.
 *  - Fires onSwitch(entityId) so the caller can scope all API queries.
 *  - Keyboard shortcut Cmd+E (Mac) / Ctrl+E (Windows/Linux) opens the dropdown.
 *  - Full-page data refresh is the caller's responsibility after onSwitch.
 *
 * Accessibility: WCAG 2.1 AA — keyboard-operable combobox, announced selection.
 *
 * @example
 * <EntitySwitcher
 *   entities={accessibleEntities}
 *   activeEntityId={currentEntityId}
 *   onSwitch={(id) => { setEntityId(id); router.refresh(); }}
 * />
 */

import type { CurrencyCode, UUID } from "@apogee/shared";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export const ENTITY_SWITCHER_KEY = "apogee:activeEntityId";

export interface EntityOption {
	id: UUID;
	/** Display name of the legal entity. */
	name: string;
	/** Short code shown alongside the name (e.g. "ACME-US"). */
	code: string;
	/** Functional reporting currency for this entity. */
	functionalCurrency: CurrencyCode;
}

export interface EntitySwitcherProps {
	entities: EntityOption[];
	/** The currently active entity id. */
	activeEntityId: UUID | null;
	/** Called when the user selects a different entity. */
	onSwitch: (entityId: UUID) => void;
	/** Additional CSS class names for the root element. */
	className?: string;
}

/** Loads the persisted active entity id from localStorage, or null. */
export function loadPersistedEntityId(): UUID | null {
	try {
		return (localStorage.getItem(ENTITY_SWITCHER_KEY) as UUID | null) ?? null;
	} catch {
		return null;
	}
}

/** Persists the active entity id to localStorage. */
export function persistEntityId(id: UUID): void {
	try {
		localStorage.setItem(ENTITY_SWITCHER_KEY, id);
	} catch {
		// localStorage unavailable (SSR, private mode) — silently ignore
	}
}

/**
 * EntitySwitcher renders a combobox-style dropdown bound to the Cmd+E / Ctrl+E
 * keyboard shortcut.  It persists the selection in localStorage automatically.
 */
export function EntitySwitcher({
	entities,
	activeEntityId,
	onSwitch,
	className,
}: EntitySwitcherProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const labelId = useId();
	const listboxId = useId();

	const active = entities.find((e) => e.id === activeEntityId) ?? entities[0];

	// Cmd+E / Ctrl+E shortcut
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "e") {
				e.preventDefault();
				setOpen((prev) => !prev);
				buttonRef.current?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				!buttonRef.current?.contains(e.target as Node) &&
				!listRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const handleSelect = useCallback(
		(entity: EntityOption) => {
			persistEntityId(entity.id);
			onSwitch(entity.id);
			setOpen(false);
			buttonRef.current?.focus();
		},
		[onSwitch],
	);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") setOpen(false);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setOpen(true);
			(listRef.current?.querySelector("li") as HTMLElement | null)?.focus();
		}
	};

	return (
		<div style={{ position: "relative", display: "inline-block" }} className={className}>
			<span id={labelId} style={{ display: "none" }}>
				Active entity
			</span>

			<button
				ref={buttonRef}
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-labelledby={labelId}
				aria-controls={listboxId}
				onKeyDown={handleKeyDown}
				onClick={() => setOpen((prev) => !prev)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
					padding: "0.375rem 0.75rem",
					border: "1px solid #d1d5db",
					borderRadius: "0.375rem",
					background: "#fff",
					cursor: "pointer",
					fontSize: "0.875rem",
					fontWeight: 500,
					minWidth: "10rem",
				}}
			>
				{active ? (
					<>
						<span style={{ flex: 1, textAlign: "left" }}>
							{active.name}
							<span
								style={{
									marginLeft: "0.375rem",
									fontSize: "0.75rem",
									color: "#6b7280",
									fontWeight: 400,
								}}
							>
								{active.code} · {active.functionalCurrency}
							</span>
						</span>
						<span aria-hidden="true" style={{ color: "#6b7280" }}>
							{open ? "▲" : "▼"}
						</span>
					</>
				) : (
					<span style={{ color: "#6b7280" }}>Select entity…</span>
				)}
			</button>

			{open && (
				<ul
					ref={listRef}
					id={listboxId}
					role="listbox"
					aria-labelledby={labelId}
					aria-activedescendant={active ? `entity-option-${active.id}` : undefined}
					style={{
						position: "absolute",
						top: "calc(100% + 0.25rem)",
						left: 0,
						minWidth: "100%",
						background: "#fff",
						border: "1px solid #d1d5db",
						borderRadius: "0.375rem",
						boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
						listStyle: "none",
						margin: 0,
						padding: "0.25rem 0",
						zIndex: 50,
					}}
				>
					{entities.map((entity) => {
						const isSelected = entity.id === activeEntityId;
						return (
							<li
								key={entity.id}
								id={`entity-option-${entity.id}`}
								role="option"
								aria-selected={isSelected}
								tabIndex={0}
								onClick={() => handleSelect(entity)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") handleSelect(entity);
									if (e.key === "Escape") setOpen(false);
								}}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "0.5rem 1rem",
									cursor: "pointer",
									fontSize: "0.875rem",
									background: isSelected ? "#eff6ff" : "transparent",
									fontWeight: isSelected ? 600 : 400,
								}}
							>
								<span>
									{entity.name}
									<span
										style={{
											marginLeft: "0.5rem",
											fontSize: "0.75rem",
											color: "#6b7280",
										}}
									>
										{entity.code}
									</span>
								</span>
								<span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
									{entity.functionalCurrency}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
