/**
 * Playwright configuration for Apogee ERP end-to-end tests.
 *
 * Tests exercise the real Fastify API server running in demo mode
 * (auth disabled, seeded PostgreSQL).
 *
 * CI:     bun run test:e2e          (headless)
 * Local:  bun run test:e2e:headed   (headed browser)
 *
 * Ref: FEAT-009 PLT-021, issue erp-9e06e0fc
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "./tests/e2e",
	// Default timeout per test
	timeout: 30_000,
	// Timeout for each assertion
	expect: { timeout: 10_000 },
	// Run tests in parallel (each file is independent)
	fullyParallel: false,
	// Fail the build on CI if test.only was left in source
	forbidOnly: !!process.env.CI,
	// Retry once on CI to handle flakiness
	retries: process.env.CI ? 1 : 0,
	// One worker in CI to avoid port conflicts
	workers: process.env.CI ? 1 : 1,
	// Reporter: list for CI, html for local
	reporter: process.env.CI
		? [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]]
		: [["list"], ["html", { open: "never" }]],

	use: {
		// Base URL for page.goto("/path")
		baseURL: BASE_URL,
		// Capture screenshot on failure always; on success at the end of each test
		screenshot: "on",
		// Record video on failure in CI
		video: process.env.CI ? "retain-on-failure" : "off",
		// Trace on failure for debugging
		trace: "retain-on-failure",
		// Headless unless E2E_HEADED is set
		headless: !process.env.E2E_HEADED,
		// Accept all security exceptions (self-signed certs in dev)
		ignoreHTTPSErrors: true,
	},

	// Output directory for screenshots, videos, traces
	outputDir: "test-results/e2e-artifacts",

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	// Start the Fastify API server before tests if not already running externally.
	// Set E2E_BASE_URL to skip auto-start when running against demo stack.
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: "PORT=3000 APP_JWT_SECRET= LOG_LEVEL=silent bun run packages/server/src/index.ts",
				url: "http://localhost:3000/health/live",
				reuseExistingServer: !process.env.CI,
				timeout: 30_000,
				stdout: "pipe",
				stderr: "pipe",
			},
});
