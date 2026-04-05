import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { createYoga } from "graphql-yoga";
import { buildApp } from "../src/app.js";
import { schema } from "../src/schema.js";

describe("404 handler", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildApp({ logLevel: "silent" });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("GET /nonexistent returns 404 with error shape", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/nonexistent",
		});

		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({
			statusCode: 404,
			error: "Not Found",
			message: "Route not found",
		});
	});
});

describe("Error handler", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		// Register a test route before ready() so Fastify accepts it
		app = await buildApp({ logLevel: "silent" });
		app.get("/test-client-error", async () => {
			const err = Object.assign(new Error("Bad input"), {
				statusCode: 400,
				name: "BadRequestError",
			});
			throw err;
		});
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("error handler returns consistent { statusCode, error, message } shape for 4xx errors", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/test-client-error",
		});

		expect(response.statusCode).toBe(400);
		const body = response.json();
		expect(typeof body.statusCode).toBe("number");
		expect(typeof body.error).toBe("string");
		expect(typeof body.message).toBe("string");
		expect(body.statusCode).toBe(400);
	});
});

describe("GraphQL schema", () => {
	// Test the GraphQL schema directly via yoga.fetch to avoid raw Node stream
	// compatibility issues with Fastify inject + yoga.handleNodeRequestAndResponse.
	const yoga = createYoga({ schema, logging: false });

	test("POST /graphql with { query: '{ _version }' } returns version string", async () => {
		const response = await yoga.fetch("http://localhost/graphql", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query: "{ _version }" }),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { data?: { _version?: unknown } };
		expect(body).toHaveProperty("data");
		expect(body.data).toHaveProperty("_version");
		expect(typeof body.data?._version).toBe("string");
	});
});
