/**
 * Sync protocol types and interfaces for the local-first architecture.
 * See ADR-009 §Sync Protocol.
 * Isomorphic — no platform-specific dependencies.
 */

import type { OfflineTier, SyncStatus } from "./types.js";

export type { OfflineTier };

// ---------------------------------------------------------------------------
// Offline tier configuration
// ---------------------------------------------------------------------------

/**
 * Canonical offline tier assignments per entity type, derived from ADR-009.
 *
 * Tier 1: Read-only recently-synced data and draft creation are always available.
 * Tier 2: Records created offline are queued for server commit on reconnect.
 * Tier 3: Operations requiring authoritative server state cannot run offline.
 */
export const ENTITY_OFFLINE_TIERS: Record<string, OfflineTier> = {
	// Tier 1 — always offline-capable
	contact: 1,
	company: 1,
	product: 1,
	activity: 1,
	screeningListEntry: 1,

	// Tier 2 — requires eventual sync
	quote: 2,
	purchaseOrder: 2,
	salesOrder: 2,
	journalEntry: 2,
	complianceDecision: 2,

	// Tier 3 — online-only
	payment: 3,
	deniedPartyScreening: 3,
	financialReport: 3,
	exportLicenseDrawdown: 3,
} as const;

// ---------------------------------------------------------------------------
// Sync event log — CRDT-inspired mutation record
// ---------------------------------------------------------------------------

/**
 * A single mutation recorded locally before sync.
 * Clients append events locally and push them to the server on reconnect.
 * The server is the source of truth; it may reject events (Layer 2 failure).
 */
export interface SyncEvent {
	/** Unique event identifier (UUID v4). */
	readonly id: string;
	/** Entity type (key from ENTITY_OFFLINE_TIERS). */
	readonly entityType: string;
	/** Entity primary key (UUID v4). */
	readonly entityId: string;
	/** Operation performed. */
	readonly operation: "create" | "update" | "delete";
	/** Full payload for create/update; unused for delete. */
	readonly payload: Record<string, unknown>;
	/** Client-assigned logical timestamp (Unix ms, from client clock). */
	readonly clientTimestamp: number;
	/** Sequential version counter for the entity on this client. */
	readonly clientVersion: number;
}

// ---------------------------------------------------------------------------
// Sync result — outcome of pushing a SyncEvent to the server
// ---------------------------------------------------------------------------

export type SyncEventResult =
	| {
			readonly status: "committed";
			readonly serverVersion: number;
			readonly serverTimestamp: number;
	  }
	| {
			readonly status: "conflict";
			readonly serverVersion: number;
			readonly serverPayload: Record<string, unknown>;
	  }
	| {
			readonly status: "rejected";
			readonly errors: readonly import("./errors.js").ValidationError[];
	  };

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

/** Current connectivity and sync state, maintained by the SyncService. */
export interface SyncState {
	readonly connected: boolean;
	readonly lastSyncedAt: Date | null;
	/** Number of local events pending push to the server. */
	readonly pendingCount: number;
	/** Number of records in conflict state requiring resolution. */
	readonly conflictCount: number;
}

// ---------------------------------------------------------------------------
// SyncService interface — platform-neutral contract
// ---------------------------------------------------------------------------

/**
 * Placeholder sync service interface.
 * Concrete implementations are platform-specific (Bun SQLite, sql.js in browser).
 * This interface lives in @apogee/shared so consuming modules can depend on it
 * without importing a platform implementation.
 *
 * See ADR-009 §Local-First Architecture.
 */
export interface SyncService {
	/** Current connectivity and sync state. */
	readonly state: SyncState;

	/**
	 * Register a listener that fires whenever SyncState changes
	 * (e.g., connected/disconnected, pendingCount changes).
	 * Returns an unsubscribe function.
	 */
	onStateChange(listener: (state: SyncState) => void): () => void;

	/**
	 * Queue a local mutation for eventual sync.
	 * Returns the queued SyncEvent.
	 */
	queueEvent(event: Omit<SyncEvent, "id" | "clientTimestamp">): SyncEvent;

	/**
	 * Attempt to push all pending local events to the server.
	 * Resolves when all events have been processed (committed, conflicted, or rejected).
	 * No-op when offline — returns immediately with empty results.
	 */
	pushPending(): Promise<readonly SyncEventResult[]>;

	/**
	 * Pull the latest server state for the given entity types.
	 * Updates the local SQLite mirror.
	 * No-op when offline.
	 */
	pull(entityTypes?: readonly string[]): Promise<void>;

	/** Manually notify the service that connectivity has been restored. */
	notifyConnected(): void;

	/** Manually notify the service that connectivity has been lost. */
	notifyDisconnected(): void;
}

// ---------------------------------------------------------------------------
// Offline validation deferral — Layer 2 pending state per ADR-010
// ---------------------------------------------------------------------------

/**
 * When offline, Layer 2 (state-dependent) validation is deferred.
 * The record is persisted locally with this status until the server confirms.
 * See ADR-010 §Offline Validation Behavior.
 */
export type OfflineValidationStatus =
	| "not_required" // Layer 2 not applicable to this entity/operation
	| "pending" // Awaiting server validation (record is offline or unsynced)
	| "passed" // Server confirmed Layer 2 passed
	| "failed"; // Server rejected: errors are in validationErrors field

/**
 * Pending-validation banner message shown to users when a record has deferred
 * Layer 2 validation, keyed by entity type.
 * See ADR-010 §Offline Validation Behavior.
 */
export const OFFLINE_VALIDATION_BANNER_MESSAGES: Record<string, string> = {
	quote:
		"This quote will be validated by the server when you reconnect. Compliance checks are pending.",
	salesOrder:
		"This order will be validated by the server when you reconnect. Compliance checks are pending.",
	purchaseOrder:
		"This purchase order will be validated by the server when you reconnect. Compliance checks are pending.",
	journalEntry:
		"This journal entry will be validated by the server when you reconnect. Period status and balance checks are pending.",
	complianceDecision:
		"This compliance decision will be validated by the server when you reconnect.",
} as const;

// ---------------------------------------------------------------------------
// SQLite schema mirroring — table descriptor for client-side SQLite mirror
// ---------------------------------------------------------------------------

/**
 * Descriptor for a SQLite client-side mirror table.
 * The SQLite schema is a subset of the PostgreSQL schema, extended with
 * sync metadata columns. See ADR-009 §Consequences (Negative).
 */
export interface SqliteMirrorTable {
	/** Table name in SQLite (matches PostgreSQL table name). */
	readonly tableName: string;
	/** Offline tier for this entity type. */
	readonly offlineTier: OfflineTier;
	/**
	 * Columns mirrored from PostgreSQL.
	 * Sync metadata columns (sync_version, last_synced_at, sync_status) are
	 * always added automatically by the framework.
	 */
	readonly columns: readonly SqliteMirrorColumn[];
}

export interface SqliteMirrorColumn {
	readonly name: string;
	readonly sqliteType: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "NUMERIC";
	readonly nullable: boolean;
	readonly primaryKey?: boolean;
}

/**
 * Generates the CREATE TABLE SQL for a SQLite mirror table.
 * Always appends sync metadata columns required by ADR-009.
 */
export function buildSqliteMirrorDdl(table: SqliteMirrorTable): string {
	const syncColumns: SqliteMirrorColumn[] = [
		{ name: "sync_version", sqliteType: "INTEGER", nullable: false },
		{ name: "last_synced_at", sqliteType: "TEXT", nullable: true },
		{ name: "sync_status", sqliteType: "TEXT", nullable: false },
	];

	const allColumns = [...table.columns, ...syncColumns];

	const colDefs = allColumns
		.map((col) => {
			const pk = col.primaryKey === true ? " PRIMARY KEY" : "";
			const nullability = col.nullable ? "" : " NOT NULL";
			return `\t${col.name} ${col.sqliteType}${pk}${nullability}`;
		})
		.join(",\n");

	return `CREATE TABLE IF NOT EXISTS ${table.tableName} (\n${colDefs}\n);`;
}

// ---------------------------------------------------------------------------
// Sync resolution record — for server-rejected records requiring user action
// ---------------------------------------------------------------------------

/**
 * A record that the server rejected during sync, surfaced in the resolution UI.
 * See ADR-010 §Offline Validation Behavior (last paragraph) and ADR-009.
 */
export interface SyncConflictRecord {
	/** Entity type. */
	readonly entityType: string;
	/** Entity primary key. */
	readonly entityId: string;
	/** The local payload that was rejected. */
	readonly localPayload: Record<string, unknown>;
	/** Validation errors returned by the server. */
	readonly errors: readonly import("./errors.js").ValidationError[];
	/** Resolution action taken by the user. */
	resolution?: SyncConflictResolution;
}

export type SyncConflictResolution =
	| { readonly action: "edit_and_resubmit"; readonly updatedPayload: Record<string, unknown> }
	| { readonly action: "discard" };

/**
 * Sync conflict resolution summary for display in the resolution UI.
 * The UI lists pending conflicts and allows the user to resolve each one.
 */
export interface SyncResolutionSummary {
	readonly total: number;
	readonly pending: number;
	readonly resolved: number;
	readonly conflicts: readonly SyncConflictRecord[];
}

// ---------------------------------------------------------------------------
// Connectivity detection helpers
// ---------------------------------------------------------------------------

/**
 * Returns an initial SyncState representing a disconnected client.
 * Used to bootstrap the SyncService before connectivity is determined.
 */
export function createInitialSyncState(): SyncState {
	return {
		connected: false,
		lastSyncedAt: null,
		pendingCount: 0,
		conflictCount: 0,
	};
}

/**
 * Placeholder in-memory SyncService implementation for use in tests and
 * environments where no real sync backend is available.
 * A real implementation backed by SQLite (Bun) or sql.js (browser) will
 * replace this in WP-1.
 */
export function createNoopSyncService(): SyncService {
	let _state: SyncState = createInitialSyncState();
	const _listeners = new Set<(state: SyncState) => void>();

	function notifyListeners() {
		for (const listener of _listeners) {
			listener(_state);
		}
	}

	return {
		get state() {
			return _state;
		},

		onStateChange(listener) {
			_listeners.add(listener);
			return () => {
				_listeners.delete(listener);
			};
		},

		queueEvent(partial) {
			const event: SyncEvent = {
				...partial,
				id: crypto.randomUUID(),
				clientTimestamp: Date.now(),
			};
			_state = { ..._state, pendingCount: _state.pendingCount + 1 };
			notifyListeners();
			return event;
		},

		async pushPending() {
			return [];
		},

		async pull() {
			// no-op in placeholder
		},

		notifyConnected() {
			_state = { ..._state, connected: true };
			notifyListeners();
		},

		notifyDisconnected() {
			_state = { ..._state, connected: false };
			notifyListeners();
		},
	};
}

/**
 * Returns the sync status for a locally-created record before its first sync.
 * Convenience for initialising new records in offline-capable write paths.
 */
export function initialSyncStatus(): SyncStatus {
	return "pending_push";
}
