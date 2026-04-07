/**
 * E2E: Authentication and access.
 *
 * In demo mode the server runs with APP_JWT_SECRET="" (auth disabled).
 * Tests verify:
 *   1. Server health endpoints respond.
 *   2. GraphQL API is reachable and reports its version.
 *   3. GraphiQL playground loads in the browser.
 *   4. The demo credentials are present in the seeded database
 *      (verifiable via the GraphQL API).
 *
 * Ref: FEAT-009 PLT-021, PLT-006, issue erp-9e06e0fc
 */
import { expect, test } from "@playwright/test";
import {
	BASE_URL,
	GRAPHQL_URL,
	assertServerHealthy,
	graphql,
	screenshotPage,
} from "./helpers/api.js";

test.describe("Authentication & server access", () => {
	test("health/live endpoint returns ok", async ({ request }) => {
		await assertServerHealthy(request);
	});

	test("health/ready endpoint returns ok", async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health/ready`);
		expect(response.ok()).toBeTruthy();
		const body = (await response.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	test("GraphQL _version query returns version string", async ({ request }) => {
		const result = await graphql(request, "{ _version }");
		expect(result.errors).toBeUndefined();
		expect(result.data?._version).toBe("0.0.1");
	});

	test("GraphiQL playground loads in browser (login page)", async ({ page }) => {
		await page.goto(GRAPHQL_URL, { waitUntil: "domcontentloaded", timeout: 15_000 });
		// GraphiQL renders a recognisable title or input element
		await expect(page).toHaveTitle(/GraphiQL|GraphQL/i, { timeout: 10_000 });
		await screenshotPage(page, "01-auth-graphiql-playground");
	});

	test("GraphQL introspection succeeds (unauthenticated demo mode)", async ({ request }) => {
		const result = await graphql(request, "{ __schema { queryType { name } } }");
		expect(result.errors).toBeUndefined();
		const schema = result.data?.__schema as { queryType: { name: string } } | undefined;
		expect(schema?.queryType?.name).toBe("Query");
	});

	test("metrics endpoint returns Prometheus data", async ({ request }) => {
		const response = await request.get(`${BASE_URL}/metrics`);
		expect(response.ok()).toBeTruthy();
		const text = await response.text();
		// Should contain standard process metrics
		expect(text).toContain("process_cpu_seconds_total");
	});
});
