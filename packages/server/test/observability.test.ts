import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { Registry } from "prom-client";
import { buildApp } from "../src/app.js";
import { generateSpanId, generateTraceId, parseTraceparent } from "../src/telemetry.js";

describe("GET /metrics", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		// Use a fresh registry per test suite to avoid cross-test pollution.
		app = await buildApp({ logLevel: "silent", metricsRegistry: new Registry() });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("returns 200 with Prometheus text format", async () => {
		const response = await app.inject({ method: "GET", url: "/metrics" });
		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toContain("text/plain");
	});

	test("response body contains default process metrics", async () => {
		const response = await app.inject({ method: "GET", url: "/metrics" });
		expect(response.body).toContain("process_cpu_seconds_total");
	});

	test("request counter increments after subsequent requests", async () => {
		// Make a request to a tracked endpoint.
		await app.inject({ method: "GET", url: "/health/live" });
		const response = await app.inject({ method: "GET", url: "/metrics" });
		expect(response.body).toContain("http_requests_total");
	});

	test("response body contains request duration histogram", async () => {
		const response = await app.inject({ method: "GET", url: "/metrics" });
		expect(response.body).toContain("http_request_duration_seconds");
	});
});

describe("Request ID propagation", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildApp({ logLevel: "silent", metricsRegistry: new Registry() });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("response includes x-request-id header", async () => {
		const response = await app.inject({ method: "GET", url: "/health/live" });
		expect(response.headers["x-request-id"]).toBeDefined();
		expect(typeof response.headers["x-request-id"]).toBe("string");
	});

	test("x-request-id is forwarded when provided by client", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/health/live",
			headers: { "x-request-id": "test-id-abc" },
		});
		expect(response.headers["x-request-id"]).toBe("test-id-abc");
	});
});

describe("OTel trace context helpers", () => {
	test("parseTraceparent returns null for undefined input", () => {
		expect(parseTraceparent(undefined)).toBeNull();
	});

	test("parseTraceparent returns null for malformed header", () => {
		expect(parseTraceparent("not-a-traceparent")).toBeNull();
	});

	test("parseTraceparent parses a valid W3C traceparent header", () => {
		const traceId = "0af7651916cd43dd8448eb211c80319c";
		const spanId = "b7ad6b7169203331";
		const header = `00-${traceId}-${spanId}-01`;
		const ctx = parseTraceparent(header);
		expect(ctx).not.toBeNull();
		expect(ctx?.traceId).toBe(traceId);
		expect(ctx?.spanId).toBe(spanId);
		expect(ctx?.traceFlags).toBe(1);
	});

	test("generateTraceId returns a 32-character hex string", () => {
		const id = generateTraceId();
		expect(id).toHaveLength(32);
		expect(/^[0-9a-f]{32}$/.test(id)).toBe(true);
	});

	test("generateSpanId returns a 16-character hex string", () => {
		const id = generateSpanId();
		expect(id).toHaveLength(16);
		expect(/^[0-9a-f]{16}$/.test(id)).toBe(true);
	});
});
