/**
 * Unit tests for setAuditContext().
 *
 * These are pure TypeScript tests — no live database is required.
 * The test injects a mock QueryableClient that captures calls, verifying
 * that setAuditContext() passes the correct SQL and parameters.
 *
 * Full integration testing (trigger fires, audit_entry row present) requires
 * a live PostgreSQL instance and is covered by the DB integration test suite
 * (out of scope for WP-0/WP-1 unit test pass).
 *
 * Issue: hx-c3e547b2
 */

import { describe, expect, mock, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import { setAuditContext } from "../src/audit-context.js";
import type { QueryableClient } from "../src/audit-context.js";

const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as UUID;
const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as UUID;

function mockClient(): {
	client: QueryableClient;
	calls: Array<{ sql: string; params: unknown[] }>;
} {
	const calls: Array<{ sql: string; params: unknown[] }> = [];
	const client: QueryableClient = {
		query: mock(async (sql: string, params: unknown[]) => {
			calls.push({ sql, params });
		}),
	};
	return { client, calls };
}

describe("setAuditContext()", () => {
	test("calls query with set_config SQL and correct params", async () => {
		const { client, calls } = mockClient();
		await setAuditContext(client, ACTOR_ID, "admin@satco.example", ENTITY_ID);

		expect(calls).toHaveLength(1);
		const { sql, params } = calls[0]!;
		expect(sql).toContain("set_config('app.actor_id'");
		expect(sql).toContain("set_config('app.actor_email'");
		expect(sql).toContain("set_config('app.entity_id'");
		expect(params).toEqual([ACTOR_ID, "admin@satco.example", ENTITY_ID]);
	});

	test("uses empty string for null entityId", async () => {
		const { client, calls } = mockClient();
		await setAuditContext(client, ACTOR_ID, "system@apogee.internal", null);

		const { params } = calls[0]!;
		// Third param must be '' not null so set_config receives a valid string
		expect(params[2]).toBe("");
	});

	test("defaults entityId to null (empty string in query) when omitted", async () => {
		const { client, calls } = mockClient();
		await setAuditContext(client, ACTOR_ID, "system@apogee.internal");

		const { params } = calls[0]!;
		expect(params[2]).toBe("");
	});

	test("preserves actorId and actorEmail exactly in params", async () => {
		const { client, calls } = mockClient();
		const email = "finance@satco.example";
		await setAuditContext(client, ACTOR_ID, email, ENTITY_ID);

		const { params } = calls[0]!;
		expect(params[0]).toBe(ACTOR_ID);
		expect(params[1]).toBe(email);
		expect(params[2]).toBe(ENTITY_ID);
	});

	test("uses is_local=TRUE so settings are transaction-scoped", async () => {
		const { client, calls } = mockClient();
		await setAuditContext(client, ACTOR_ID, "a@b.com");

		// The SQL must pass TRUE as the third argument to set_config
		expect(calls[0]!.sql).toContain("TRUE");
	});
});
