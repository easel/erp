import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { InMemoryRateLimitStore } from "../src/rate-limit.js";

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryRateLimitStore unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("InMemoryRateLimitStore", () => {
	test("increments count within the window", () => {
		const store = new InMemoryRateLimitStore();
		expect(store.increment("key1", 60_000)).toBe(1);
		expect(store.increment("key1", 60_000)).toBe(2);
		expect(store.increment("key1", 60_000)).toBe(3);
		store.destroy();
	});

	test("independent keys do not interfere", () => {
		const store = new InMemoryRateLimitStore();
		store.increment("a", 60_000);
		store.increment("a", 60_000);
		expect(store.increment("b", 60_000)).toBe(1);
		store.destroy();
	});

	test("expired timestamps are pruned (near-zero window)", () => {
		const store = new InMemoryRateLimitStore();
		// Use a 1 ms window — the next call should see count = 1.
		store.increment("key2", 1);
		// Spin a tiny bit to let the timestamp expire.
		const spin = Date.now() + 5;
		while (Date.now() < spin) { /* busy wait */ }
		const count = store.increment("key2", 1);
		expect(count).toBe(1);
		store.destroy();
	});

	test("destroy clears all state", async () => {
		const store = new InMemoryRateLimitStore();
		store.increment("k", 60_000);
		store.increment("k", 60_000);
		await store.destroy();
		// After destroy the key is gone; a new increment starts from 1.
		expect(store.increment("k", 60_000)).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP integration tests via Fastify inject()
// ─────────────────────────────────────────────────────────────────────────────

describe("Rate limiting middleware", () => {
	let app: FastifyInstance;
	let store: InMemoryRateLimitStore;

	beforeAll(async () => {
		store = new InMemoryRateLimitStore();
		app = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 3, windowMs: 60_000 },
				store,
			},
		});
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("allows requests within the limit", async () => {
		for (let i = 0; i < 3; i++) {
			const res = await app.inject({ method: "GET", url: "/health/live" });
			// /health/* is bypassed — should always 200 regardless of counter.
			expect(res.statusCode).toBe(200);
		}
	});

	test("bypasses rate limiting for health endpoints", async () => {
		// Make many requests to /health/live — should never get 429.
		for (let i = 0; i < 20; i++) {
			const res = await app.inject({ method: "GET", url: "/health/live" });
			expect(res.statusCode).toBe(200);
		}
	});

	test("bypasses rate limiting for /metrics endpoint", async () => {
		for (let i = 0; i < 10; i++) {
			const res = await app.inject({ method: "GET", url: "/metrics" });
			expect(res.statusCode).toBe(200);
		}
	});

	test("returns 429 after limit is exceeded", async () => {
		const limitedStore = new InMemoryRateLimitStore();
		const limitedApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 2, windowMs: 60_000 },
				routes: {
					"/health/ready": { max: 2, windowMs: 60_000 },
				},
				// Override bypass to include nothing so /health/ready is rate-limited.
				bypass: [],
				store: limitedStore,
			},
		});
		await limitedApp.ready();

		try {
			// First two succeed.
			const r1 = await limitedApp.inject({ method: "GET", url: "/health/ready" });
			expect(r1.statusCode).toBe(200);
			const r2 = await limitedApp.inject({ method: "GET", url: "/health/ready" });
			expect(r2.statusCode).toBe(200);
			// Third exceeds the limit.
			const r3 = await limitedApp.inject({ method: "GET", url: "/health/ready" });
			expect(r3.statusCode).toBe(429);
		} finally {
			await limitedApp.close();
		}
	});

	test("includes rate-limit headers on non-bypassed responses", async () => {
		const headerStore = new InMemoryRateLimitStore();
		const headerApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 10, windowMs: 60_000 },
				bypass: [],
				store: headerStore,
			},
		});
		await headerApp.ready();

		try {
			const res = await headerApp.inject({ method: "GET", url: "/health/live" });
			expect(res.headers["x-ratelimit-limit"]).toBe("10");
			expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
			expect(res.headers["x-ratelimit-window"]).toBe("60000");
		} finally {
			await headerApp.close();
		}
	});

	test("returns Retry-After header on 429", async () => {
		const retryStore = new InMemoryRateLimitStore();
		const retryApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 1, windowMs: 30_000 },
				bypass: [],
				store: retryStore,
			},
		});
		await retryApp.ready();

		try {
			await retryApp.inject({ method: "GET", url: "/health/live" }); // allowed
			const res = await retryApp.inject({ method: "GET", url: "/health/live" }); // 429
			expect(res.statusCode).toBe(429);
			expect(res.headers["retry-after"]).toBe("30");
		} finally {
			await retryApp.close();
		}
	});

	test("per-route limit overrides global", async () => {
		const routeStore = new InMemoryRateLimitStore();
		const routeApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 100, windowMs: 60_000 },
				routes: {
					"/health/ready": { max: 1, windowMs: 60_000 },
				},
				bypass: [],
				store: routeStore,
			},
		});
		await routeApp.ready();

		try {
			// /health/ready has tight per-route limit of 1.
			const r1 = await routeApp.inject({ method: "GET", url: "/health/ready" });
			expect(r1.statusCode).toBe(200);
			const r2 = await routeApp.inject({ method: "GET", url: "/health/ready" });
			expect(r2.statusCode).toBe(429);

			// /health/live still uses the generous global limit.
			const r3 = await routeApp.inject({ method: "GET", url: "/health/live" });
			expect(r3.statusCode).toBe(200);
		} finally {
			await routeApp.close();
		}
	});

	test("rate limiting disabled when rateLimitConfig is false", async () => {
		const noRlApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: false,
		});
		await noRlApp.ready();

		try {
			for (let i = 0; i < 10; i++) {
				const res = await noRlApp.inject({ method: "GET", url: "/health/live" });
				expect(res.statusCode).toBe(200);
			}
		} finally {
			await noRlApp.close();
		}
	});

	test("per-API-key isolation (x-api-key header)", async () => {
		const apiKeyStore = new InMemoryRateLimitStore();
		const apiKeyApp = await buildApp({
			logLevel: "silent",
			rateLimitConfig: {
				global: { max: 2, windowMs: 60_000 },
				bypass: [],
				store: apiKeyStore,
			},
		});
		await apiKeyApp.ready();

		try {
			// Key A uses up its 2 requests.
			await apiKeyApp.inject({
				method: "GET",
				url: "/health/live",
				headers: { "x-api-key": "key-a" },
			});
			await apiKeyApp.inject({
				method: "GET",
				url: "/health/live",
				headers: { "x-api-key": "key-a" },
			});
			const r3a = await apiKeyApp.inject({
				method: "GET",
				url: "/health/live",
				headers: { "x-api-key": "key-a" },
			});
			expect(r3a.statusCode).toBe(429);

			// Key B still has its full quota.
			const r1b = await apiKeyApp.inject({
				method: "GET",
				url: "/health/live",
				headers: { "x-api-key": "key-b" },
			});
			expect(r1b.statusCode).toBe(200);
		} finally {
			await apiKeyApp.close();
		}
	});
});
