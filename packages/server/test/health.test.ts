import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("Health endpoints", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = await buildApp({ logLevel: "silent" });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("GET /health/live returns 200", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/health/live",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});

	test("GET /health/ready returns 200", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/health/ready",
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});
});
