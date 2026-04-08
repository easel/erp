"use client";

import type { UUID } from "@apogee/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "apogee:activeEntityId";
const COOKIE_KEY = "apogee_entityId";
const DEFAULT_ENTITY_ID = "a0000000-0000-0000-0000-000000000001" as UUID;

interface EntityContextValue {
	entityId: UUID;
	setEntityId: (id: UUID) => void;
}

const EntityContext = createContext<EntityContextValue>({
	entityId: DEFAULT_ENTITY_ID,
	setEntityId: () => {},
});

function persistEntity(id: UUID): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// localStorage unavailable
	}
	document.cookie = `${COOKIE_KEY}=${id};path=/;samesite=lax`;
}

export function EntityProvider({ children }: { children: ReactNode }) {
	const [entityId, setEntityIdState] = useState<UUID>(DEFAULT_ENTITY_ID);

	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				setEntityIdState(stored as UUID);
				document.cookie = `${COOKIE_KEY}=${stored};path=/;samesite=lax`;
			}
		} catch {
			// localStorage unavailable
		}
	}, []);

	const setEntityId = (id: UUID) => {
		setEntityIdState(id);
		persistEntity(id);
	};

	return <EntityContext.Provider value={{ entityId, setEntityId }}>{children}</EntityContext.Provider>;
}

export function useEntityId(): EntityContextValue {
	return useContext(EntityContext);
}

export { DEFAULT_ENTITY_ID };
