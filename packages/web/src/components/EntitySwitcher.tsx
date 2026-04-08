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
import { cn } from "../lib/utils.js";

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
		<div className={cn("relative inline-block", className)}>
			<span id={labelId} className="hidden">
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
				className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md bg-white cursor-pointer text-sm font-medium min-w-40"
			>
				{active ? (
					<>
						<span className="flex-1 text-left">
							{active.name}
							<span className="ml-1.5 text-xs text-gray-500 font-normal">
								{active.code} · {active.functionalCurrency}
							</span>
						</span>
						<span aria-hidden="true" className="text-gray-500">
							{open ? "▲" : "▼"}
						</span>
					</>
				) : (
					<span className="text-gray-500">Select entity…</span>
				)}
			</button>

			{open && (
				<ul
					ref={listRef}
					id={listboxId}
					role="listbox"
					aria-labelledby={labelId}
					aria-activedescendant={active ? `entity-option-${active.id}` : undefined}
					tabIndex={0}
					className="absolute top-full mt-1 left-0 min-w-full bg-white border border-gray-300 rounded-md shadow-lg list-none m-0 py-1 z-50"
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
								className={cn(
									"flex items-center justify-between px-4 py-2 cursor-pointer text-sm",
									isSelected ? "bg-blue-50 font-semibold" : "bg-transparent font-normal",
								)}
							>
								<span>
									{entity.name}
									<span className="ml-2 text-xs text-gray-500">{entity.code}</span>
								</span>
								<span className="text-xs text-gray-500">{entity.functionalCurrency}</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
