import { describe, expect, test } from "vitest";
import {
	ENTITY_OFFLINE_TIERS,
	OFFLINE_VALIDATION_BANNER_MESSAGES,
	type OfflineTier,
	type SqliteMirrorTable,
	type SyncConflictRecord,
	type SyncResolutionSummary,
	type SyncState,
	buildSqliteMirrorDdl,
	createInitialSyncState,
	createNoopSyncService,
	initialSyncStatus,
} from "../src/index.js";

describe("ENTITY_OFFLINE_TIERS", () => {
	test("Tier 1 entities are always offline-capable", () => {
		expect(ENTITY_OFFLINE_TIERS.contact).toBe(1);
		expect(ENTITY_OFFLINE_TIERS.company).toBe(1);
		expect(ENTITY_OFFLINE_TIERS.product).toBe(1);
		expect(ENTITY_OFFLINE_TIERS.screeningListEntry).toBe(1);
	});

	test("Tier 2 entities require eventual sync", () => {
		expect(ENTITY_OFFLINE_TIERS.quote).toBe(2);
		expect(ENTITY_OFFLINE_TIERS.salesOrder).toBe(2);
		expect(ENTITY_OFFLINE_TIERS.journalEntry).toBe(2);
	});

	test("Tier 3 entities are online-only", () => {
		expect(ENTITY_OFFLINE_TIERS.payment).toBe(3);
		expect(ENTITY_OFFLINE_TIERS.deniedPartyScreening).toBe(3);
		expect(ENTITY_OFFLINE_TIERS.financialReport).toBe(3);
	});

	test("all tier values are 1, 2, or 3", () => {
		const validTiers: OfflineTier[] = [1, 2, 3];
		for (const [_entity, tier] of Object.entries(ENTITY_OFFLINE_TIERS)) {
			expect(validTiers).toContain(tier);
		}
	});
});

describe("OFFLINE_VALIDATION_BANNER_MESSAGES", () => {
	test("Tier 2 entities have banner messages", () => {
		expect(OFFLINE_VALIDATION_BANNER_MESSAGES.quote).toContain("reconnect");
		expect(OFFLINE_VALIDATION_BANNER_MESSAGES.salesOrder).toContain("reconnect");
		expect(OFFLINE_VALIDATION_BANNER_MESSAGES.journalEntry).toContain("reconnect");
	});

	test("messages mention compliance checks for commercial entities", () => {
		expect(OFFLINE_VALIDATION_BANNER_MESSAGES.quote).toContain("Compliance checks");
		expect(OFFLINE_VALIDATION_BANNER_MESSAGES.salesOrder).toContain("Compliance checks");
	});
});

describe("buildSqliteMirrorDdl", () => {
	test("generates CREATE TABLE IF NOT EXISTS SQL", () => {
		const table: SqliteMirrorTable = {
			tableName: "contacts",
			offlineTier: 1,
			columns: [
				{ name: "id", sqliteType: "TEXT", nullable: false, primaryKey: true },
				{ name: "name", sqliteType: "TEXT", nullable: false },
				{ name: "email", sqliteType: "TEXT", nullable: true },
			],
		};
		const ddl = buildSqliteMirrorDdl(table);
		expect(ddl).toContain("CREATE TABLE IF NOT EXISTS contacts");
		expect(ddl).toContain("id TEXT PRIMARY KEY NOT NULL");
		expect(ddl).toContain("name TEXT NOT NULL");
		expect(ddl).toContain("email TEXT");
	});

	test("always appends sync metadata columns", () => {
		const table: SqliteMirrorTable = {
			tableName: "products",
			offlineTier: 1,
			columns: [{ name: "id", sqliteType: "TEXT", nullable: false, primaryKey: true }],
		};
		const ddl = buildSqliteMirrorDdl(table);
		expect(ddl).toContain("sync_version INTEGER NOT NULL");
		expect(ddl).toContain("last_synced_at TEXT");
		expect(ddl).toContain("sync_status TEXT NOT NULL");
	});

	test("nullable columns do not have NOT NULL", () => {
		const table: SqliteMirrorTable = {
			tableName: "activities",
			offlineTier: 1,
			columns: [
				{ name: "id", sqliteType: "TEXT", nullable: false, primaryKey: true },
				{ name: "notes", sqliteType: "TEXT", nullable: true },
			],
		};
		const ddl = buildSqliteMirrorDdl(table);
		// notes should appear without NOT NULL suffix
		expect(ddl).toMatch(/notes TEXT\b(?! NOT NULL)/);
	});
});

describe("createInitialSyncState", () => {
	test("returns disconnected state with no pending events", () => {
		const state = createInitialSyncState();
		expect(state.connected).toBe(false);
		expect(state.lastSyncedAt).toBeNull();
		expect(state.pendingCount).toBe(0);
		expect(state.conflictCount).toBe(0);
	});
});

describe("createNoopSyncService", () => {
	test("initial state is disconnected", () => {
		const svc = createNoopSyncService();
		expect(svc.state.connected).toBe(false);
		expect(svc.state.pendingCount).toBe(0);
	});

	test("notifyConnected sets connected to true", () => {
		const svc = createNoopSyncService();
		svc.notifyConnected();
		expect(svc.state.connected).toBe(true);
	});

	test("notifyDisconnected sets connected to false", () => {
		const svc = createNoopSyncService();
		svc.notifyConnected();
		svc.notifyDisconnected();
		expect(svc.state.connected).toBe(false);
	});

	test("onStateChange listener fires on connect/disconnect", () => {
		const svc = createNoopSyncService();
		const states: SyncState[] = [];
		svc.onStateChange((s) => states.push(s));

		svc.notifyConnected();
		svc.notifyDisconnected();

		expect(states).toHaveLength(2);
		expect(states[0]?.connected).toBe(true);
		expect(states[1]?.connected).toBe(false);
	});

	test("unsubscribe removes the listener", () => {
		const svc = createNoopSyncService();
		const calls: SyncState[] = [];
		const unsub = svc.onStateChange((s) => calls.push(s));

		svc.notifyConnected();
		unsub();
		svc.notifyDisconnected();

		expect(calls).toHaveLength(1);
	});

	test("queueEvent increments pendingCount and fires listeners", () => {
		const svc = createNoopSyncService();
		const states: SyncState[] = [];
		svc.onStateChange((s) => states.push(s));

		const event = svc.queueEvent({
			entityType: "quote",
			entityId: "550e8400-e29b-41d4-a716-446655440000",
			operation: "create",
			payload: { amount: "1000.00" },
			clientVersion: 1,
		});

		expect(event.id).toBeTruthy();
		expect(event.clientTimestamp).toBeGreaterThan(0);
		expect(svc.state.pendingCount).toBe(1);
		expect(states).toHaveLength(1);
		expect(states[0]?.pendingCount).toBe(1);
	});

	test("pushPending returns empty array (placeholder implementation)", async () => {
		const svc = createNoopSyncService();
		const results = await svc.pushPending();
		expect(results).toEqual([]);
	});

	test("pull resolves without error (placeholder implementation)", async () => {
		const svc = createNoopSyncService();
		await expect(svc.pull()).resolves.toBeUndefined();
	});

	test("multiple listeners can be registered independently", () => {
		const svc = createNoopSyncService();
		const a: boolean[] = [];
		const b: boolean[] = [];

		svc.onStateChange((s) => a.push(s.connected));
		svc.onStateChange((s) => b.push(s.connected));

		svc.notifyConnected();

		expect(a).toEqual([true]);
		expect(b).toEqual([true]);
	});
});

describe("initialSyncStatus", () => {
	test("returns pending_push for new offline records", () => {
		expect(initialSyncStatus()).toBe("pending_push");
	});
});

describe("SyncConflictRecord shape", () => {
	test("can be constructed and carries validation errors", () => {
		const record: SyncConflictRecord = {
			entityType: "salesOrder",
			entityId: "550e8400-e29b-41d4-a716-446655440001",
			localPayload: { customerId: "cust-1", lineItems: [] },
			errors: [
				{
					code: "VALIDATION_ERROR",
					field: "customerId",
					message: "Customer is on the denied-party list",
					rule: "DENIED_PARTY_SCREENING_HIT",
				},
			],
		};
		expect(record.errors).toHaveLength(1);
		expect(record.errors[0]?.rule).toBe("DENIED_PARTY_SCREENING_HIT");
		expect(record.resolution).toBeUndefined();
	});
});

describe("SyncResolutionSummary shape", () => {
	test("can represent a summary with mixed resolution state", () => {
		const summary: SyncResolutionSummary = {
			total: 3,
			pending: 2,
			resolved: 1,
			conflicts: [
				{
					entityType: "quote",
					entityId: "id-1",
					localPayload: {},
					errors: [{ code: "VALIDATION_ERROR", message: "bad", rule: "X" }],
				},
			],
		};
		expect(summary.total).toBe(3);
		expect(summary.pending).toBe(2);
	});
});
