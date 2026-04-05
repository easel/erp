/**
 * RBAC engine unit tests.
 *
 * Pure check functions are tested directly.
 * Fastify preHandler factories are tested via buildApp() + JWT injection —
 * the entity context flows from JWT claims through registerEntityContext().
 *
 * Issue: hx-cd2573f7
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createTestJWT } from "../src/auth.js";
import {
	hasCompartmentAccess,
	hasPermission,
	hasRole,
	isInEntity,
	requireCompartmentAccess,
	requireEntityAccess,
	requirePermission,
	requireRole,
} from "../src/rbac.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-for-rbac-validation-must-be-long-enough";

const ENTITY_A = "10000000-0000-0000-0000-000000000001" as UUID;
const ENTITY_B = "10000000-0000-0000-0000-000000000002" as UUID;
const COMPARTMENT_ITAR = "40000000-0000-0000-0000-000000000001" as UUID;
const COMPARTMENT_EAR = "40000000-0000-0000-0000-000000000002" as UUID;

/** Build an app with test routes for each RBAC check, all registered before ready(). */
async function buildRbacApp(): Promise<FastifyInstance> {
	const app = await buildApp({ logLevel: "silent", authSecret: TEST_SECRET });

	// requirePermission
	app.get(
		"/test/permission",
		{
			preHandler: requirePermission("gl:journal_entry:post"),
		},
		async () => ({ ok: true }),
	);

	// requireCompartmentAccess
	app.get(
		"/test/compartment",
		{
			preHandler: requireCompartmentAccess(COMPARTMENT_ITAR),
		},
		async () => ({ ok: true }),
	);

	// requireRole
	app.get(
		"/test/role",
		{
			preHandler: requireRole("admin", "compliance"),
		},
		async () => ({ ok: true }),
	);

	// requireEntityAccess — checks req.params.entityId === context.entityId
	app.get<{ Params: { entityId: string } }>(
		"/entities/:entityId/data",
		{
			preHandler: requireEntityAccess((req) => req.params.entityId as UUID),
		},
		async () => ({ ok: true }),
	);

	await app.ready();
	return app;
}

/** JWT with entity context scoped to ENTITY_A with finance role + GL permissions + ITAR compartment. */
async function financeToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: "30000000-0000-0000-0000-000000000002",
		email: "finance@satco.example",
		entity_id: ENTITY_A,
		roles: ["finance"],
		permissions: ["gl:journal_entry:read", "gl:journal_entry:post"],
		compartment_ids: [COMPARTMENT_ITAR],
	});
}

/** JWT with entity context but restricted permissions (no post permission). */
async function readonlyToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: "30000000-0000-0000-0000-000000000005",
		email: "readonly@satco.example",
		entity_id: ENTITY_A,
		roles: ["read_only"],
		permissions: ["gl:journal_entry:read"], // no :post
		compartment_ids: [], // no ITAR access
	});
}

/** JWT with entity context but no compartment access. */
async function noCompartmentToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: "30000000-0000-0000-0000-000000000003",
		email: "sales@satco.example",
		entity_id: ENTITY_A,
		roles: ["sales"],
		permissions: [],
		compartment_ids: [], // no ITAR
	});
}

/** JWT with no entity_id — authenticated but no entity context. */
async function noEntityToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: "30000000-0000-0000-0000-000000000001",
		email: "admin@satco.example",
		// No entity_id → entityContext will be null
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure check functions
// ─────────────────────────────────────────────────────────────────────────────

describe("hasPermission()", () => {
	const ctx = {
		entityId: ENTITY_A,
		userId: "30000000-0000-0000-0000-000000000001" as UUID,
		userEmail: "t@t.com",
		roles: ["finance"],
		permissions: ["gl:journal_entry:read", "gl:journal_entry:post"],
		compartmentIds: [],
	};

	test("returns true when permission is present", () => {
		expect(hasPermission(ctx, "gl:journal_entry:read")).toBe(true);
	});

	test("returns false when permission is absent", () => {
		expect(hasPermission(ctx, "ap:invoice:approve")).toBe(false);
	});

	test("is case-sensitive", () => {
		expect(hasPermission(ctx, "GL:JOURNAL_ENTRY:READ")).toBe(false);
	});
});

describe("hasRole()", () => {
	const ctx = {
		entityId: ENTITY_A,
		userId: "u1" as UUID,
		userEmail: "t@t.com",
		roles: ["finance"],
		permissions: [],
		compartmentIds: [],
	};

	test("returns true when role is present", () => {
		expect(hasRole(ctx, "finance")).toBe(true);
	});

	test("returns false when role is absent", () => {
		expect(hasRole(ctx, "admin")).toBe(false);
	});
});

describe("hasCompartmentAccess()", () => {
	const ctxWithCompartment = {
		entityId: ENTITY_A,
		userId: "u1" as UUID,
		userEmail: "t@t.com",
		roles: [],
		permissions: [],
		compartmentIds: [COMPARTMENT_ITAR],
	};
	const ctxNoCompartment = { ...ctxWithCompartment, compartmentIds: [] as UUID[] };

	test("returns true when compartment is granted", () => {
		expect(hasCompartmentAccess(ctxWithCompartment, COMPARTMENT_ITAR)).toBe(true);
	});

	test("returns false when compartment is not granted", () => {
		expect(hasCompartmentAccess(ctxWithCompartment, COMPARTMENT_EAR)).toBe(false);
	});

	test("returns false for empty compartmentIds", () => {
		expect(hasCompartmentAccess(ctxNoCompartment, COMPARTMENT_ITAR)).toBe(false);
	});
});

describe("isInEntity()", () => {
	const ctx = {
		entityId: ENTITY_A,
		userId: "u1" as UUID,
		userEmail: "t@t.com",
		roles: [],
		permissions: [],
		compartmentIds: [],
	};

	test("returns true when entityId matches context", () => {
		expect(isInEntity(ctx, ENTITY_A)).toBe(true);
	});

	test("returns false for different entity — isolation check", () => {
		expect(isInEntity(ctx, ENTITY_B)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fastify preHandler integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("requirePermission() — permission enforcement", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildRbacApp();
	});
	afterAll(async () => {
		await app.close();
	});

	test("returns 401 with no JWT (unauthenticated)", async () => {
		const res = await app.inject({ method: "GET", url: "/test/permission" });
		expect(res.statusCode).toBe(401);
	});

	test("returns 401 when JWT has no entity_id (no entity context)", async () => {
		const token = await noEntityToken();
		const res = await app.inject({
			method: "GET",
			url: "/test/permission",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(401);
	});

	test("returns 403 when permission is absent from context", async () => {
		const token = await readonlyToken(); // has read but not :post
		const res = await app.inject({
			method: "GET",
			url: "/test/permission",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
		expect(res.json<{ message: string }>().message).toContain("gl:journal_entry:post");
	});

	test("returns 200 when permission is present", async () => {
		const token = await financeToken(); // has :post
		const res = await app.inject({
			method: "GET",
			url: "/test/permission",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});
});

describe("requireCompartmentAccess() — ITAR enforcement", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildRbacApp();
	});
	afterAll(async () => {
		await app.close();
	});

	test("returns 401 with no JWT", async () => {
		const res = await app.inject({ method: "GET", url: "/test/compartment" });
		expect(res.statusCode).toBe(401);
	});

	test("returns 403 when ITAR compartment not granted", async () => {
		const token = await noCompartmentToken();
		const res = await app.inject({
			method: "GET",
			url: "/test/compartment",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
		expect(res.json<{ message: string }>().message).toContain("ITAR");
	});

	test("returns 200 when compartment is granted", async () => {
		const token = await financeToken(); // has COMPARTMENT_ITAR
		const res = await app.inject({
			method: "GET",
			url: "/test/compartment",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});
});

describe("requireRole() — role check", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildRbacApp();
	});
	afterAll(async () => {
		await app.close();
	});

	test("returns 401 with no JWT", async () => {
		const res = await app.inject({ method: "GET", url: "/test/role" });
		expect(res.statusCode).toBe(401);
	});

	test("returns 403 when none of the required roles are present", async () => {
		const token = await financeToken(); // finance role, not admin/compliance
		const res = await app.inject({
			method: "GET",
			url: "/test/role",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("returns 200 when at least one required role is present", async () => {
		const token = await createTestJWT(TEST_SECRET, {
			sub: "admin",
			email: "a@a.com",
			entity_id: ENTITY_A,
			roles: ["admin"],
			permissions: [],
		});
		const res = await app.inject({
			method: "GET",
			url: "/test/role",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});
});

describe("requireEntityAccess() — entity isolation", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildRbacApp();
	});
	afterAll(async () => {
		await app.close();
	});

	test("returns 401 with no JWT", async () => {
		const res = await app.inject({ method: "GET", url: `/entities/${ENTITY_A}/data` });
		expect(res.statusCode).toBe(401);
	});

	test("returns 403 when route entity differs from context entity (isolation)", async () => {
		// User context is ENTITY_A, but requesting ENTITY_B data
		const token = await financeToken(); // entity_id = ENTITY_A
		const res = await app.inject({
			method: "GET",
			url: `/entities/${ENTITY_B}/data`,
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
		expect(res.json<{ message: string }>().message).toContain("entity");
	});

	test("returns 200 when route entity matches context entity", async () => {
		const token = await financeToken(); // entity_id = ENTITY_A
		const res = await app.inject({
			method: "GET",
			url: `/entities/${ENTITY_A}/data`,
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});
});
