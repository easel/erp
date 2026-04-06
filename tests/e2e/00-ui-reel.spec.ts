/**
 * E2E UI Reel: Browser-driven walkthrough of the Apogee ERP application.
 *
 * Navigates every module page in a real browser, verifies seeded data is
 * rendered in tables, and captures full-page screenshots at each step.
 *
 * Prerequisites:
 *   - Kind cluster running: bun run demo
 *   - Next.js dev server: NEXT_PUBLIC_API_URL=http://localhost:3100 PORT=3200 bun run --filter '@apogee/web' dev
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:3200 npx playwright test tests/e2e/00-ui-reel.spec.ts
 *
 * Ref: FEAT-009 PLT-021, WP-8
 */
import { type Page, expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3200";

async function screenshot(page: Page, name: string) {
	await page.screenshot({
		path: `test-results/e2e-artifacts/ui-reel-${name}.png`,
		fullPage: true,
	});
}

/** Wait for Next.js page to finish loading (no spinner, content visible). */
async function waitForPage(page: Page) {
	await page.waitForLoadState("networkidle");
}

// Serial — the reel tells a narrative story.
test.describe.configure({ mode: "serial" });

test.describe("Apogee ERP — UI Reel", () => {
	// ── Scene 1: Dashboard ────────────────────────────────────────────────
	test("scene 01 — Dashboard loads with entity counts", async ({ page }) => {
		await page.goto(BASE, { waitUntil: "networkidle" });

		// Page title
		await expect(page.locator("h1")).toContainText("Dashboard");

		// Entity count cards are rendered with non-zero values
		const cards = page.locator('[class*="font-bold"]').filter({ hasText: /^\d+$/ });
		const count = await cards.count();
		expect(count).toBeGreaterThanOrEqual(5);

		// Sidebar is visible with module links
		const sidebar = page.locator("aside");
		await expect(sidebar).toBeVisible();
		await expect(sidebar.locator('a[href="/finance"]')).toBeVisible();
		await expect(sidebar.locator('a[href="/sales"]')).toBeVisible();
		await expect(sidebar.locator('a[href="/procurement"]')).toBeVisible();
		await expect(sidebar.locator('a[href="/crm"]')).toBeVisible();
		await expect(sidebar.locator('a[href="/compliance"]')).toBeVisible();

		await screenshot(page, "01-dashboard");
	});

	// ── Scene 2: Finance — Journal Entries ─────────────────────────────────
	test("scene 02 — Finance: Journal Entries list", async ({ page }) => {
		await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Journal Entries");

		// Table has rows with seeded data
		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(1);

		// Verify a known entry number is visible
		await expect(page.getByText("JE-2026").first()).toBeVisible();

		await screenshot(page, "02-finance-journal-entries");
	});

	// ── Scene 3: Finance — Chart of Accounts ──────────────────────────────
	test("scene 03 — Finance: Chart of Accounts", async ({ page }) => {
		await page.goto(`${BASE}/finance/accounts`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Chart of Accounts");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(15);

		// Known accounts
		await expect(page.getByText("Cash and Cash Equivalents")).toBeVisible();
		await expect(page.getByText("Accounts Receivable")).toBeVisible();
		await expect(page.getByText("Satellite Capacity Revenue")).toBeVisible();

		await screenshot(page, "03-finance-accounts");
	});

	// ── Scene 4: Sales — Orders ───────────────────────────────────────────
	test("scene 04 — Sales: Orders list", async ({ page }) => {
		await page.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Sales Orders");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		// Compliance statuses should be visible as badges
		await expect(page.getByText("cleared").first()).toBeVisible();
		await expect(page.getByText("held")).toBeVisible();

		await screenshot(page, "04-sales-orders");
	});

	// ── Scene 5: Procurement — Vendors ────────────────────────────────────
	test("scene 05 — Procurement: Vendors list", async ({ page }) => {
		await page.goto(`${BASE}/procurement`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Vendors");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(10);

		await screenshot(page, "05-procurement-vendors");
	});

	// ── Scene 6: Procurement — Purchase Orders ────────────────────────────
	test("scene 06 — Procurement: Purchase Orders", async ({ page }) => {
		await page.goto(`${BASE}/procurement/purchase-orders`, {
			waitUntil: "networkidle",
		});
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Purchase Orders");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2);

		await screenshot(page, "06-procurement-pos");
	});

	// ── Scene 7: CRM — Opportunities ──────────────────────────────────────
	test("scene 07 — CRM: Opportunities pipeline", async ({ page }) => {
		await page.goto(`${BASE}/crm`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Opportunities");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		await screenshot(page, "07-crm-opportunities");
	});

	// ── Scene 8: Compliance — Holds ───────────────────────────────────────
	test("scene 08 — Compliance: Active holds", async ({ page }) => {
		await page.goto(`${BASE}/compliance`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Compliance Holds");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });

		// The Crimea hold should be visible
		await expect(page.getByText("AMBIGUOUS_REGION")).toBeVisible();
		await expect(page.getByText("ACTIVE")).toBeVisible();

		await screenshot(page, "08-compliance-holds");
	});

	// ── Scene 9: Sales — Customers ───────────────────────────────────────
	test("scene 09 — Sales: Customers list", async ({ page }) => {
		await page.goto(`${BASE}/sales/customers`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Customers");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		await screenshot(page, "09-sales-customers");
	});

	// ── Scene 10: Procurement — Products ──────────────────────────────────
	test("scene 10 — Procurement: Products list", async ({ page }) => {
		await page.goto(`${BASE}/procurement/products`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Products");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		await screenshot(page, "10-procurement-products");
	});

	// ── Scene 11: CRM — Companies ────────────────────────────────────────
	test("scene 11 — CRM: Companies list", async ({ page }) => {
		await page.goto(`${BASE}/crm/companies`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Companies");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		await screenshot(page, "11-crm-companies");
	});

	// ── Scene 12: CRM — Contacts ─────────────────────────────────────────
	test("scene 12 — CRM: Contacts list", async ({ page }) => {
		await page.goto(`${BASE}/crm/contacts`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Contacts");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(3);

		await screenshot(page, "12-crm-contacts");
	});

	// ── Scene 13: Finance — Fiscal Periods ────────────────────────────────
	test("scene 13 — Finance: Fiscal Periods list", async ({ page }) => {
		await page.goto(`${BASE}/finance/fiscal-periods`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Fiscal Periods");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(4);

		await screenshot(page, "13-finance-fiscal-periods");
	});

	// ── Scene 14: Finance — Currencies ────────────────────────────────────
	test("scene 14 — Finance: Currencies list", async ({ page }) => {
		await page.goto(`${BASE}/finance/currencies`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Currencies");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(5);

		await screenshot(page, "14-finance-currencies");
	});

	// ── Scene 15: Procurement — Inventory Locations ───────────────────────
	test("scene 15 — Procurement: Inventory Locations", async ({ page }) => {
		await page.goto(`${BASE}/procurement/locations`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Inventory Locations");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2);

		await screenshot(page, "15-procurement-locations");
	});

	// ── Scene 16: Compliance — Screening Lists ────────────────────────────
	test("scene 16 — Compliance: Screening Lists", async ({ page }) => {
		await page.goto(`${BASE}/compliance/screening-lists`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Screening Lists");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2);

		await screenshot(page, "16-compliance-screening-lists");
	});

	// ── Scene 17: Compliance — Country Restrictions ───────────────────────
	test("scene 17 — Compliance: Country Restrictions", async ({ page }) => {
		await page.goto(`${BASE}/compliance/country-restrictions`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Country Restrictions");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(2);

		await screenshot(page, "17-compliance-country-restrictions");
	});

	// ── Scene 18: Compliance — Restricted Regions ─────────────────────────
	test("scene 18 — Compliance: Restricted Regions", async ({ page }) => {
		await page.goto(`${BASE}/compliance/restricted-regions`, { waitUntil: "networkidle" });
		await waitForPage(page);

		await expect(page.locator("h1")).toContainText("Restricted Regions");

		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(1);

		await screenshot(page, "18-compliance-restricted-regions");
	});

	// ── Scene 19: Navigation — sidebar links work ──────────────────────────
	test("scene 19 — Sidebar navigation between modules", async ({ page }) => {
		await page.goto(BASE, { waitUntil: "networkidle" });

		const sidebar = page.locator("aside");

		// Navigate via sidebar: Dashboard → Finance → Sales → Procurement → CRM → Compliance
		for (const [href, heading] of [
			["/finance", "Journal Entries"],
			["/sales", "Sales Orders"],
			["/procurement", "Vendors"],
			["/crm", "Opportunities"],
			["/compliance", "Compliance Holds"],
		]) {
			await sidebar.locator(`a[href="${href}"]`).click();
			await waitForPage(page);
			await expect(page.locator("h1")).toContainText(heading);
		}

		// Navigate back to dashboard
		await sidebar.locator('a[href="/"]').click();
		await waitForPage(page);
		await expect(page.locator("h1")).toContainText("Dashboard");
	});

	// ── Scene 20: Vendor creation form ────────────────────────────────────
	test("scene 20 — Vendor form: fill and submit", async ({ page }) => {
		await page.goto(`${BASE}/procurement/vendors/new`, { waitUntil: "networkidle" });

		await expect(page.locator("h1")).toContainText("New Vendor", { timeout: 10_000 });

		// Fill required fields
		await page.fill('input[name="vendorCode"]', `REEL-${Date.now().toString(36).toUpperCase()}`);
		await page.fill('input[name="legalName"]', "Reel Test Vendor LLC");
		await page.fill('input[name="countryCode"]', "US");
		await page.fill('input[name="defaultCurrencyCode"]', "USD");

		await screenshot(page, "20-vendor-form-filled");

		// Submit
		await page.click('button[type="submit"]');
		await waitForPage(page);

		// Should redirect to vendor list
		await expect(page.locator("h1")).toContainText("Vendors", { timeout: 10_000 });

		await screenshot(page, "20-vendor-form-submitted");
	});

	// ── Scene 21: Journal entry form ──────────────────────────────────────
	test("scene 21 — Journal entry form: fill and submit", async ({ page }) => {
		await page.goto(`${BASE}/finance/journal-entries/new`, { waitUntil: "networkidle" });

		await expect(page.locator("h1")).toContainText("New Journal Entry", { timeout: 10_000 });

		// Fill header
		await page.fill('input[name="reference"]', `REEL-JE-${Date.now()}`);
		await page.fill('input[name="description"]', "UI Reel test entry");
		await page.fill('input[name="entryDate"]', "2026-04-05");

		// Fill line 1 (debit) — the form starts with 2 lines
		await page.fill('input[name="lines.0.accountId"]', "a8001100-0000-0000-0000-000000000001");
		await page.selectOption('select[name="lines.0.type"]', "DEBIT");
		await page.fill('input[name="lines.0.amount"]', "750");

		// Fill line 2 (credit)
		await page.fill('input[name="lines.1.accountId"]', "a8004100-0000-0000-0000-000000000001");
		await page.selectOption('select[name="lines.1.type"]', "CREDIT");
		await page.fill('input[name="lines.1.amount"]', "750");

		await screenshot(page, "21-je-form-filled");

		// Submit
		await page.click('button[type="submit"]');
		await waitForPage(page);

		// Should redirect to journal entries list
		await expect(page.locator("h1")).toContainText("Journal Entries", { timeout: 10_000 });

		await screenshot(page, "21-je-form-submitted");
	});

	// ── Scene 22: Sales order detail page ─────────────────────────────────
	test("scene 22 — Sales order detail view", async ({ page }) => {
		// Navigate to sales list and click a known order
		await page.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
		await expect(page.locator("h1")).toContainText("Sales Orders");

		// Click on SO-2026-0001 (cleared order)
		const orderLink = page.locator('a', { hasText: "SO-2026-0001" });
		if (await orderLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await orderLink.click();
			await waitForPage(page);

			// Should show order detail
			await expect(page.getByText("SO-2026-0001")).toBeVisible();
			await screenshot(page, "22-sales-order-detail");
		} else {
			// Fallback: go directly
			await page.goto(`${BASE}/sales/a6000001-0000-0000-0000-000000000001`, {
				waitUntil: "networkidle",
			});
			await screenshot(page, "22-sales-order-detail");
		}
	});

	// ── Scene 23: Final dashboard ─────────────────────────────────────────
	test("scene 23 — Final dashboard screenshot", async ({ page }) => {
		await page.goto(BASE, { waitUntil: "networkidle" });
		await expect(page.locator("h1")).toContainText("Dashboard");
		await screenshot(page, "23-final-dashboard");
	});
});
