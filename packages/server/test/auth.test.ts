import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createTestJWT, verifyHS256JWT } from "../src/auth.js";

const TEST_SECRET = "test-secret-for-hs256-validation-must-be-long-enough";

/**
 * Helper: build the app with auth enabled and register a simple protected
 * GET /api/ping route that returns { ok: true }.  This avoids the known
 * Fastify-inject + Yoga stream hang that affects the /graphql route.
 */
async function buildAuthApp(): Promise<FastifyInstance> {
	const app = await buildApp({ logLevel: "silent", authSecret: TEST_SECRET });
	app.get("/api/ping", async () => ({ ok: true }));
	await app.ready();
	return app;
}

describe("Auth middleware — JWT validation", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildAuthApp();
	});

	afterAll(async () => {
		await app.close();
	});

	test("unauthenticated request returns 401", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/api/ping",
		});

		expect(response.statusCode).toBe(401);
		const body = response.json() as Record<string, unknown>;
		expect(body.statusCode).toBe(401);
		expect(body.error).toBe("Unauthorized");
	});

	test("request with missing Bearer prefix returns 401", async () => {
		const token = await createTestJWT(TEST_SECRET);
		const response = await app.inject({
			method: "GET",
			url: "/api/ping",
			headers: { authorization: `Token ${token}` },
		});

		expect(response.statusCode).toBe(401);
	});

	test("request with malformed token returns 401", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/api/ping",
			headers: { authorization: "Bearer not.a.valid.jwt.at.all" },
		});

		expect(response.statusCode).toBe(401);
	});

	test("request with wrong-secret token returns 401", async () => {
		const token = await createTestJWT("wrong-secret-should-not-work-here-either!");
		const response = await app.inject({
			method: "GET",
			url: "/api/ping",
			headers: { authorization: `Bearer ${token}` },
		});

		expect(response.statusCode).toBe(401);
	});

	test("request with valid JWT is accepted (returns 200)", async () => {
		const token = await createTestJWT(TEST_SECRET, { sub: "user-1", roles: ["viewer"] });
		const response = await app.inject({
			method: "GET",
			url: "/api/ping",
			headers: { authorization: `Bearer ${token}` },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ ok: true });
	});

	test("GET /health/live bypasses auth and returns 200", async () => {
		const response = await app.inject({ method: "GET", url: "/health/live" });
		expect(response.statusCode).toBe(200);
	});

	test("GET /health/ready bypasses auth and returns 200", async () => {
		const response = await app.inject({ method: "GET", url: "/health/ready" });
		expect(response.statusCode).toBe(200);
	});

	test("GET /metrics bypasses auth and returns 200", async () => {
		const response = await app.inject({ method: "GET", url: "/metrics" });
		expect(response.statusCode).toBe(200);
	});
});

describe("verifyHS256JWT — unit tests", () => {
	test("returns payload for a valid token", async () => {
		const token = await createTestJWT(TEST_SECRET, { sub: "alice" });
		const payload = await verifyHS256JWT(token, TEST_SECRET);
		expect(payload).not.toBeNull();
		expect(payload?.sub).toBe("alice");
	});

	test("returns null for wrong secret", async () => {
		const token = await createTestJWT(TEST_SECRET);
		const payload = await verifyHS256JWT(token, "totally-different-secret-value-here");
		expect(payload).toBeNull();
	});

	test("returns null for expired token", async () => {
		const token = await createTestJWT(TEST_SECRET, {}, -1); // already expired
		const payload = await verifyHS256JWT(token, TEST_SECRET);
		expect(payload).toBeNull();
	});

	test("returns null for a non-JWT string", async () => {
		const payload = await verifyHS256JWT("not-a-jwt", TEST_SECRET);
		expect(payload).toBeNull();
	});

	test("returns null for tampered payload", async () => {
		const token = await createTestJWT(TEST_SECRET, { sub: "alice", role: "viewer" });
		// Tamper the payload segment
		const parts = token.split(".");
		const tamperedPayload = btoa(JSON.stringify({ sub: "admin", role: "admin" }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");
		const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
		const payload = await verifyHS256JWT(tampered, TEST_SECRET);
		expect(payload).toBeNull();
	});
});

describe("Auth disabled — existing routes unaffected", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		// No authSecret → auth disabled, all existing tests remain green
		app = await buildApp({ logLevel: "silent" });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("unauthenticated request succeeds when auth is disabled", async () => {
		const response = await app.inject({ method: "GET", url: "/health/live" });
		expect(response.statusCode).toBe(200);
	});
});
