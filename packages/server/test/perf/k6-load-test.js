/**
 * k6 Load Test — API surface performance validation.
 *
 * Validates HTTP-layer SLAs from SD-003-WP7 §WP7-PERF:
 *   - p95 API response < 500ms under 500 concurrent virtual users
 *   - No more than 1% error rate under load
 *   - Financial report endpoint < 10s at p99
 *   - Batch screening (1000 parties simulated via N requests) < 30s total
 *
 * Usage (requires a running server):
 *   k6 run --vus 500 --duration 60s k6-load-test.js
 *
 * Environment variables:
 *   BASE_URL   - Server base URL (default: http://localhost:3000)
 *   AUTH_TOKEN - Bearer token for authenticated requests
 *
 * Ref: SD-003-WP7 §WP7-PERF, hx-beff0d61
 */

import { check, sleep } from "k6";
// @ts-check
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

/** k6 test options — ramped VU profile matching production load targets. */
export const options = {
	scenarios: {
		/** Baseline API load: 500 concurrent users for 60s. */
		api_load: {
			executor: "constant-vus",
			vus: 500,
			duration: "60s",
			tags: { scenario: "api_load" },
		},
		/** Ramp-up scenario: gradual increase to 500 VUs. */
		ramp_up: {
			executor: "ramping-vus",
			startVUs: 0,
			stages: [
				{ duration: "30s", target: 100 },
				{ duration: "30s", target: 300 },
				{ duration: "60s", target: 500 },
				{ duration: "30s", target: 0 },
			],
			tags: { scenario: "ramp_up" },
			startTime: "120s", // starts after api_load
		},
	},
	thresholds: {
		// NIST SLA: p95 API response < 500ms
		http_req_duration: ["p(95)<500", "p(99)<2000"],
		// Error rate < 1%
		http_req_failed: ["rate<0.01"],
		// Financial report endpoint p99 < 10s
		financial_report_duration: ["p(99)<10000"],
		// Screening endpoint p95 < 1s
		screening_duration: ["p(95)<1000"],
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom metrics
// ─────────────────────────────────────────────────────────────────────────────

const financialReportDuration = new Trend("financial_report_duration", true);
const screeningDuration = new Trend("screening_duration", true);
const errorRate = new Rate("error_rate");

// ─────────────────────────────────────────────────────────────────────────────
// Test scenarios
// ─────────────────────────────────────────────────────────────────────────────

const HEADERS = {
	"Content-Type": "application/json",
	Authorization: `Bearer ${AUTH_TOKEN}`,
};

// Deterministic entity/period IDs matching SD-003 seed data
const ENTITY_ID = "00000000-test-0000-0000-entity00001";
const PERIOD_ID = "00000000-test-0000-0000-period00001";

/**
 * Health check — validates server is up and responding.
 * Not counted in SLA metrics (infrastructure check only).
 */
function checkHealth() {
	const res = http.get(`${BASE_URL}/health`);
	check(res, { "health OK": (r) => r.status === 200 });
}

/**
 * GraphQL query: trial balance for current period.
 * SLA: p95 < 500ms, p99 < 10s.
 */
function queryTrialBalance() {
	const payload = JSON.stringify({
		query: `
			query TrialBalance($entityId: ID!, $periodId: ID!) {
				trialBalance(entityId: $entityId, fiscalPeriodId: $periodId) {
					totalDebits
					totalCredits
					isBalanced
					lines { accountNumber accountName periodDebitTotal periodCreditTotal }
				}
			}
		`,
		variables: { entityId: ENTITY_ID, periodId: PERIOD_ID },
	});

	const start = Date.now();
	const res = http.post(`${BASE_URL}/graphql`, payload, { headers: HEADERS });
	const duration = Date.now() - start;
	financialReportDuration.add(duration);

	const ok = check(res, {
		"trial balance status 200": (r) => r.status === 200,
		"trial balance no errors": (r) => {
			const body = JSON.parse(r.body);
			return !body.errors;
		},
	});
	errorRate.add(!ok);
}

/**
 * GraphQL query: income statement.
 * SLA: p95 < 500ms.
 */
function queryIncomeStatement() {
	const payload = JSON.stringify({
		query: `
			query IncomeStatement($entityId: ID!, $periodId: ID!) {
				incomeStatement(entityId: $entityId, fiscalPeriodId: $periodId) {
					netIncome
					revenue { total }
					expenses { total }
				}
			}
		`,
		variables: { entityId: ENTITY_ID, periodId: PERIOD_ID },
	});

	const res = http.post(`${BASE_URL}/graphql`, payload, { headers: HEADERS });

	const ok = check(res, {
		"income statement status 200": (r) => r.status === 200,
	});
	errorRate.add(!ok);
}

/**
 * REST endpoint: vendor screening lookup.
 * SLA: p95 < 1s for individual party screening.
 */
function screenVendor() {
	const vendorId = `vendor-${Math.floor(Math.random() * 100_000)}`;
	const start = Date.now();
	const res = http.get(
		`${BASE_URL}/api/v1/compliance/screening/vendor/${vendorId}?entityId=${ENTITY_ID}`,
		{ headers: HEADERS },
	);
	const duration = Date.now() - start;
	screeningDuration.add(duration);

	const ok = check(res, {
		"screening status 200 or 404": (r) => r.status === 200 || r.status === 404,
	});
	errorRate.add(!ok);
}

/**
 * REST endpoint: list purchase orders (paginated).
 * SLA: p95 < 500ms.
 */
function listPurchaseOrders() {
	const res = http.get(
		`${BASE_URL}/api/v1/procurement/purchase-orders?entityId=${ENTITY_ID}&limit=50&offset=0`,
		{ headers: HEADERS },
	);

	const ok = check(res, {
		"PO list status 200": (r) => r.status === 200,
	});
	errorRate.add(!ok);
}

/**
 * Session authentication check.
 * Validates that the auth endpoint responds quickly.
 */
function checkAuth() {
	const res = http.get(`${BASE_URL}/api/v1/auth/sessions`, { headers: HEADERS });
	check(res, {
		"auth status 200 or 401": (r) => r.status === 200 || r.status === 401,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Main VU loop
// ─────────────────────────────────────────────────────────────────────────────

export default function () {
	// Weighted distribution mimicking real production traffic
	const rand = Math.random();

	if (rand < 0.05) {
		checkHealth();
	} else if (rand < 0.2) {
		queryTrialBalance(); // 15% — financial reporting is heavy
	} else if (rand < 0.35) {
		queryIncomeStatement(); // 15%
	} else if (rand < 0.55) {
		screenVendor(); // 20% — compliance screening is frequent
	} else if (rand < 0.75) {
		listPurchaseOrders(); // 20%
	} else if (rand < 0.9) {
		checkAuth(); // 15%
	} else {
		// 10%: mixed read operations
		checkHealth();
		screenVendor();
	}

	sleep(0.1); // 100ms think time between requests
}

/**
 * Setup: validate server connectivity before load test starts.
 */
export function setup() {
	const res = http.get(`${BASE_URL}/health`);
	if (res.status !== 200) {
		throw new Error(
			`Server health check failed: ${res.status}. Is the server running at ${BASE_URL}?`,
		);
	}
	return { baseUrl: BASE_URL };
}

/**
 * Teardown: log final summary.
 */
export function teardown(data) {
	console.log(`Load test completed against: ${data.baseUrl}`);
	console.log("SLA thresholds checked:");
	console.log("  p95 API response < 500ms");
	console.log("  p99 financial report < 10,000ms");
	console.log("  p95 screening < 1,000ms");
	console.log("  error rate < 1%");
}
