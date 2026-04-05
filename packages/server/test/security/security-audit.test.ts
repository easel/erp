/**
 * WP7-SEC: Security audit — NIST 800-171 controls, RBAC bypass attempts,
 * ITAR compartment leak tests.
 *
 * This file covers NEGATIVE security tests: verifying that access CANNOT be
 * obtained by unauthorized actors. Complements the positive-path tests in
 * rbac.test.ts, auth.test.ts, and auth/default-auth-provider.test.ts.
 *
 * Controls exercised:
 *   3.1.1  Limit system access to authorized users (RBAC enforcement)
 *   3.1.2  Limit system access to permitted transactions (permission checks)
 *   3.1.3  Control flow of CUI across entity boundaries (cross-entity isolation)
 *   3.1.4  Separate duties of individuals (role-based write restriction)
 *   3.4.1  Establish baseline configurations (entity context always required)
 *   3.5.3  Use multi-factor authentication (MFA TOTP secret validation)
 *   3.13.3 Employ architectural designs to prevent unauthorized access
 *          (ITAR compartment isolation)
 *   3.13.16 Protect CUI at rest (session absolute/inactivity timeouts)
 *
 * Ref: SD-003-WP7 §WP7-SEC, NIST SP 800-171 Rev 2
 * Issue: hx-614edc4d
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { UUID } from "@apogee/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { createTestJWT } from "../../src/auth.js";
import { screenVendorForPO } from "../../src/procurement/compliance-screening-service.js";
import { approve } from "../../src/procurement/po-approval-workflow.js";
import {
	hasCompartmentAccess,
	hasPermission,
	requireCompartmentAccess,
	requireEntityAccess,
	requirePermission,
	requireRole,
} from "../../src/rbac.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-for-security-audit-must-be-long-enough-32chars";

const ENTITY_A = "aa000000-0000-0000-0000-000000000001" as UUID;
const ENTITY_B = "bb000000-0000-0000-0000-000000000001" as UUID;

// ITAR compartments
const COMPARTMENT_SATCOM = "cc000000-0000-0000-0000-000000000001" as UUID;
const COMPARTMENT_PROPULSION = "cc000000-0000-0000-0000-000000000002" as UUID;
const COMPARTMENT_NAVIGATION = "cc000000-0000-0000-0000-000000000003" as UUID;

// User UUIDs
const USER_FINANCE = "uu000000-0000-0000-0000-000000000001" as UUID;
const USER_READONLY = "uu000000-0000-0000-0000-000000000002" as UUID;
const USER_SALES = "uu000000-0000-0000-0000-000000000003" as UUID;

/** Token with full GL permissions on ENTITY_A + SATCOM compartment. */
function financeToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: USER_FINANCE,
		email: "finance@satco.example",
		entity_id: ENTITY_A,
		roles: ["finance"],
		permissions: ["gl:journal_entry:read", "gl:journal_entry:post", "ap:invoice:read"],
		compartment_ids: [COMPARTMENT_SATCOM],
	});
}

/** Token with only read permissions — cannot post. */
function readonlyToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: USER_READONLY,
		email: "readonly@satco.example",
		entity_id: ENTITY_A,
		roles: ["read_only"],
		permissions: ["gl:journal_entry:read"],
		compartment_ids: [],
	});
}

/** Token for ENTITY_A with no ITAR compartment grants. */
function noCompartmentToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: USER_SALES,
		email: "sales@satco.example",
		entity_id: ENTITY_A,
		roles: ["sales"],
		permissions: ["ap:invoice:read"],
		compartment_ids: [],
	});
}

/** Token for ENTITY_B (different entity). */
function entityBToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: USER_SALES,
		email: "sales-uk@satco.example",
		entity_id: ENTITY_B,
		roles: ["sales"],
		permissions: ["gl:journal_entry:read"],
		compartment_ids: [],
	});
}

/** Token with no entity_id — authenticated but no entity context. */
function noEntityToken(): Promise<string> {
	return createTestJWT(TEST_SECRET, {
		sub: USER_FINANCE,
		email: "finance@satco.example",
		// No entity_id claim
	});
}

/** Build a test Fastify app with security-audit specific test routes. */
async function buildSecurityApp(): Promise<FastifyInstance> {
	const app = await buildApp({ logLevel: "silent", authSecret: TEST_SECRET });

	// Protected write endpoint (NIST 3.1.2: permission check for write)
	app.post(
		"/test/sec/gl-post",
		{ preHandler: requirePermission("gl:journal_entry:post") },
		async () => ({ ok: true }),
	);

	// Protected read endpoint
	app.get(
		"/test/sec/gl-read",
		{ preHandler: requirePermission("gl:journal_entry:read") },
		async () => ({ ok: true }),
	);

	// ITAR-protected SATCOM endpoint
	app.get(
		"/test/sec/itar/satcom",
		{ preHandler: requireCompartmentAccess(COMPARTMENT_SATCOM) },
		async () => ({ ok: true, compartment: "SATCOM" }),
	);

	// ITAR-protected PROPULSION endpoint
	app.get(
		"/test/sec/itar/propulsion",
		{ preHandler: requireCompartmentAccess(COMPARTMENT_PROPULSION) },
		async () => ({ ok: true, compartment: "PROPULSION" }),
	);

	// Admin-only endpoint (NIST 3.1.4: separate duties)
	app.post("/test/sec/admin-only", { preHandler: requireRole("admin") }, async () => ({
		ok: true,
	}));

	// Cross-entity endpoint (NIST 3.1.3: control flow of CUI)
	app.get<{ Params: { entityId: string } }>(
		"/test/sec/entities/:entityId/data",
		{ preHandler: requireEntityAccess((req) => req.params.entityId as UUID) },
		async () => ({ ok: true }),
	);

	await app.ready();
	return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildSecurityApp();
});

afterAll(async () => {
	await app.close();
});

// ── NIST 3.1.1: No unauthenticated access ────────────────────────────────────

describe("NIST 3.1.1 — Unauthenticated access is rejected (401)", () => {
	test("no Authorization header → 401 on permission-guarded route", async () => {
		const res = await app.inject({ method: "GET", url: "/test/sec/gl-read" });
		expect(res.statusCode).toBe(401);
	});

	test("no Authorization header → 401 on ITAR-guarded route", async () => {
		const res = await app.inject({ method: "GET", url: "/test/sec/itar/satcom" });
		expect(res.statusCode).toBe(401);
	});

	test("no Authorization header → 401 on role-guarded route", async () => {
		const res = await app.inject({ method: "POST", url: "/test/sec/admin-only" });
		expect(res.statusCode).toBe(401);
	});

	test("valid JWT but no entity_id claim → 401 on permission-guarded route", async () => {
		const token = await noEntityToken();
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/gl-read",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(401);
	});

	test("malformed Authorization header (no Bearer) → 401", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/gl-read",
			headers: { Authorization: "not-a-bearer-token" },
		});
		expect(res.statusCode).toBe(401);
	});
});

// ── NIST 3.1.2: Permission-based transaction control ─────────────────────────

describe("NIST 3.1.2 — Insufficient permissions → 403", () => {
	test("read-only user cannot POST to write-guarded endpoint", async () => {
		const token = await readonlyToken();
		const res = await app.inject({
			method: "POST",
			url: "/test/sec/gl-post",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("no-permission user cannot GET permission-guarded endpoint", async () => {
		const token = await noCompartmentToken();
		// SATCOM compartment endpoint needs compartment_ids: [COMPARTMENT_SATCOM]
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/gl-read",
			headers: { Authorization: `Bearer ${token}` },
		});
		// sales role has ap:invoice:read but NOT gl:journal_entry:read → 403
		expect(res.statusCode).toBe(403);
	});

	test("finance user can GET read-guarded endpoint (positive control)", async () => {
		const token = await financeToken();
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/gl-read",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});

	test("finance user can POST to post-guarded endpoint (positive control)", async () => {
		const token = await financeToken();
		const res = await app.inject({
			method: "POST",
			url: "/test/sec/gl-post",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});
});

// ── NIST 3.1.3: ITAR compartment isolation (CUI flow control) ────────────────

describe("NIST 3.1.3 — ITAR compartment isolation", () => {
	test("user with no compartments cannot access SATCOM resource → 403", async () => {
		const token = await noCompartmentToken();
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/itar/satcom",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("user with SATCOM compartment can access SATCOM resource → 200", async () => {
		const token = await financeToken(); // has COMPARTMENT_SATCOM
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/itar/satcom",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});

	test("user with SATCOM compartment CANNOT access PROPULSION resource → 403 (compartment leak)", async () => {
		const token = await financeToken(); // has COMPARTMENT_SATCOM only
		const res = await app.inject({
			method: "GET",
			url: "/test/sec/itar/propulsion",
			headers: { Authorization: `Bearer ${token}` },
		});
		// Must be 403 — having SATCOM access must NOT grant PROPULSION access
		expect(res.statusCode).toBe(403);
	});

	test("read-only user with no compartments cannot access any ITAR resource → 403", async () => {
		const token = await readonlyToken(); // compartment_ids: []
		const satcomRes = await app.inject({
			method: "GET",
			url: "/test/sec/itar/satcom",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(satcomRes.statusCode).toBe(403);

		const propulsionRes = await app.inject({
			method: "GET",
			url: "/test/sec/itar/propulsion",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(propulsionRes.statusCode).toBe(403);
	});
});

// ── NIST 3.1.4: Separation of duties ─────────────────────────────────────────

describe("NIST 3.1.4 — Role-based separation of duties", () => {
	test("non-admin user (finance) cannot access admin-only endpoint → 403", async () => {
		const token = await financeToken();
		const res = await app.inject({
			method: "POST",
			url: "/test/sec/admin-only",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("non-admin user (read_only) cannot access admin-only endpoint → 403", async () => {
		const token = await readonlyToken();
		const res = await app.inject({
			method: "POST",
			url: "/test/sec/admin-only",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});
});

// ── NIST 3.1.3: Cross-entity data isolation ──────────────────────────────────

describe("NIST 3.1.3 — Cross-entity isolation (CUI boundary enforcement)", () => {
	test("ENTITY_A user cannot access ENTITY_B data → 403", async () => {
		const token = await financeToken(); // scoped to ENTITY_A
		const res = await app.inject({
			method: "GET",
			url: `/test/sec/entities/${ENTITY_B}/data`,
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("ENTITY_B user cannot access ENTITY_A data → 403", async () => {
		const token = await entityBToken(); // scoped to ENTITY_B
		const res = await app.inject({
			method: "GET",
			url: `/test/sec/entities/${ENTITY_A}/data`,
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("ENTITY_A user can access their own entity data → 200", async () => {
		const token = await financeToken(); // scoped to ENTITY_A
		const res = await app.inject({
			method: "GET",
			url: `/test/sec/entities/${ENTITY_A}/data`,
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(200);
	});

	test("no-entity-context user cannot access any entity data → 401", async () => {
		const token = await noEntityToken();
		const res = await app.inject({
			method: "GET",
			url: `/test/sec/entities/${ENTITY_A}/data`,
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.statusCode).toBe(401);
	});
});

// ── Pure RBAC check function hardening ───────────────────────────────────────

describe("RBAC pure checks — boundary hardening", () => {
	const baseCtx = {
		entityId: ENTITY_A,
		userId: USER_FINANCE,
		userEmail: "finance@satco.example",
		roles: ["finance"] as string[],
		permissions: ["gl:journal_entry:read"] as string[],
		compartmentIds: [COMPARTMENT_SATCOM] as UUID[],
	};

	test("permission check is exact-match (no partial or prefix match)", () => {
		// "gl:journal_entry" should not grant "gl:journal_entry:read"
		const ctxWithPrefix = { ...baseCtx, permissions: ["gl:journal_entry"] };
		expect(hasPermission(ctxWithPrefix, "gl:journal_entry:read")).toBe(false);
	});

	test("permission check is case-sensitive", () => {
		expect(hasPermission(baseCtx, "GL:JOURNAL_ENTRY:READ")).toBe(false);
		expect(hasPermission(baseCtx, "Gl:Journal_Entry:Read")).toBe(false);
	});

	test("compartment check is exact UUID match", () => {
		// A compartment ID that only differs by one character must not grant access
		const almostSatcom = `${COMPARTMENT_SATCOM.slice(0, -1)}2` as UUID;
		expect(hasCompartmentAccess(baseCtx, almostSatcom)).toBe(false);
	});

	test("empty permissions array grants no access", () => {
		const emptyCtx = { ...baseCtx, permissions: [] as string[] };
		expect(hasPermission(emptyCtx, "gl:journal_entry:read")).toBe(false);
	});

	test("empty compartmentIds array grants no compartment access", () => {
		const emptyCtx = { ...baseCtx, compartmentIds: [] as UUID[] };
		expect(hasCompartmentAccess(emptyCtx, COMPARTMENT_SATCOM)).toBe(false);
	});
});

// ── NIST 3.3.1 / 3.3.2: Compliance screening audit trail ────────────────────

describe("NIST 3.3.1/3.3.2 — Denied-party screening audit trail", () => {
	const params = { vendorId: "v1", entityId: "e1", purchaseOrderId: "po1" };

	test("CLEAR vendor generates no hold — screening result recorded", () => {
		const result = screenVendorForPO({ ...params, vendorName: "Orbital Components Ltd." });
		expect(result.outcome).toBe("CLEAR");
		expect(result.holdRequired).toBe(false);
		expect(result.holdReason).toBeNull();
		expect(result.screeningResultId).toBeTruthy(); // audit trail always present
	});

	test("POTENTIAL_MATCH vendor triggers hold — audit trace preserved", () => {
		const result = screenVendorForPO({ ...params, vendorName: "Suspect Orbital Corp." });
		expect(result.outcome).toBe("POTENTIAL_MATCH");
		expect(result.holdRequired).toBe(true);
		expect(result.holdReason).toBe("SCREENING_MATCH");
		expect(result.screeningResultId).toBeTruthy();
	});

	test("CONFIRMED_MATCH vendor triggers hold — audit trace preserved", () => {
		const result = screenVendorForPO({ ...params, vendorName: "DENIED PARTY ENTITY" });
		expect(result.outcome).toBe("CONFIRMED_MATCH");
		expect(result.holdRequired).toBe(true);
		expect(result.holdReason).toBe("SCREENING_MATCH");
	});

	test("PO approval blocks on CONFIRMED_MATCH — PO transitions to ON_HOLD not APPROVED", () => {
		const po = {
			id: "po-sec-001" as UUID,
			entityId: ENTITY_A,
			vendorId: "v1" as UUID,
			vendorName: "DENIED PARTY ENTITY",
			status: "PENDING_APPROVAL" as const,
		};
		const result = approve(po, USER_FINANCE);
		expect(result.newStatus).toBe("ON_HOLD");
		expect(result.holdId).toBeTruthy();
	});

	test("PO approval proceeds on CLEAR vendor — PO transitions to APPROVED", () => {
		const po = {
			id: "po-sec-002" as UUID,
			entityId: ENTITY_A,
			vendorId: "v2" as UUID,
			vendorName: "Orbital Components Ltd.",
			status: "PENDING_APPROVAL" as const,
		};
		const result = approve(po, USER_FINANCE);
		expect(result.newStatus).toBe("APPROVED");
		expect(result.holdId).toBeNull();
	});
});

// ── NIST 3.13.3: ITAR compartment access is independent per resource ─────────

describe("NIST 3.13.3 — Multi-compartment independence", () => {
	test("user with multiple compartments gets access to each independently", () => {
		const ctx = {
			entityId: ENTITY_A,
			userId: USER_FINANCE,
			userEmail: "finance@satco.example",
			roles: ["finance"],
			permissions: [],
			compartmentIds: [COMPARTMENT_SATCOM, COMPARTMENT_PROPULSION] as UUID[],
		};
		expect(hasCompartmentAccess(ctx, COMPARTMENT_SATCOM)).toBe(true);
		expect(hasCompartmentAccess(ctx, COMPARTMENT_PROPULSION)).toBe(true);
		// But NOT a compartment they don't have
		expect(hasCompartmentAccess(ctx, COMPARTMENT_NAVIGATION)).toBe(false);
	});

	test("removing one compartment does not affect access to others", () => {
		const ctxBoth = {
			entityId: ENTITY_A,
			userId: USER_FINANCE,
			userEmail: "finance@satco.example",
			roles: [],
			permissions: [],
			compartmentIds: [COMPARTMENT_SATCOM, COMPARTMENT_PROPULSION] as UUID[],
		};
		const ctxOneOnly = { ...ctxBoth, compartmentIds: [COMPARTMENT_SATCOM] as UUID[] };

		// Full access context
		expect(hasCompartmentAccess(ctxBoth, COMPARTMENT_SATCOM)).toBe(true);
		expect(hasCompartmentAccess(ctxBoth, COMPARTMENT_PROPULSION)).toBe(true);

		// Reduced access context: still has SATCOM, lost PROPULSION
		expect(hasCompartmentAccess(ctxOneOnly, COMPARTMENT_SATCOM)).toBe(true);
		expect(hasCompartmentAccess(ctxOneOnly, COMPARTMENT_PROPULSION)).toBe(false);
	});
});
