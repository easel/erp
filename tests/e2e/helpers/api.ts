/**
 * E2E test helpers — GraphQL API and server interaction utilities.
 *
 * Ref: FEAT-009 PLT-021, issue erp-9e06e0fc
 */
import { type APIRequestContext, type Page, expect } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const GRAPHQL_URL = `${BASE_URL}/graphql`;

// Deterministic seed UUIDs — must match packages/server/src/seed.ts
export const SEED = {
	entities: {
		US: "a0000000-0000-0000-0000-000000000001",
		EU: "a0000000-0000-0000-0000-000000000002",
		APAC: "a0000000-0000-0000-0000-000000000003",
	},
	users: {
		demo: "a1000000-0000-0000-0000-000000000001",
	},
	salesOrders: {
		SO_001: "a6000001-0000-0000-0000-000000000001", // Cleared
		SO_003: "a6000003-0000-0000-0000-000000000001", // Compliance hold — Crimea
	},
	complianceHolds: {
		HOLD_001: "a0300000-0000-0000-000000000001",
	},
	fiscalPeriods: {
		// Current period (Apr 2026 — SOFT_CLOSED based on seed)
		PERIOD_04: "a5000000-0000-0000-0000-000000000004",
	},
	accounts: {
		// acct(n) = `a8${n.padStart(6,'0')}-0000-0000-0000-000000000001`
		CASH: "a8001100-0000-0000-0000-000000000001",
		AR: "a8001200-0000-0000-0000-000000000001",
		INVENTORY: "a8001300-0000-0000-0000-000000000001",
		AP: "a8002100-0000-0000-0000-000000000001",
		DEFERRED_REV: "a8002300-0000-0000-0000-000000000001",
		SAT_CAPACITY_REV: "a8004100-0000-0000-0000-000000000001",
		GROUND_SVC_REV: "a8004200-0000-0000-0000-000000000001",
		COGS: "a8005100-0000-0000-0000-000000000001",
	},
} as const;

export const DEMO_CREDENTIALS = {
	email: "demo@apogee.dev",
	password: "apogee-demo",
} as const;

/**
 * Execute a raw GraphQL query/mutation against the API.
 */
export async function graphql(
	request: APIRequestContext,
	query: string,
	variables?: Record<string, unknown>,
): Promise<{
	data: Record<string, unknown> | null;
	errors?: Array<{ message: string }>;
}> {
	const response = await request.post(GRAPHQL_URL, {
		data: { query, variables },
		headers: {
			"Content-Type": "application/json",
		},
	});
	expect(response.ok()).toBeTruthy();
	return response.json();
}

/**
 * Check that the server is healthy.
 */
export async function assertServerHealthy(request: APIRequestContext): Promise<void> {
	const response = await request.get(`${BASE_URL}/health/live`);
	expect(response.ok()).toBeTruthy();
	const body = (await response.json()) as { status: string };
	expect(body.status).toBe("ok");
}

/**
 * Navigate to a page and take a named screenshot.
 */
export async function screenshotPage(page: Page, name: string): Promise<void> {
	await page.screenshot({
		path: `test-results/e2e-artifacts/${name}.png`,
		fullPage: true,
	});
}
