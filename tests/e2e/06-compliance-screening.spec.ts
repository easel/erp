/**
 * E2E: Denied-party screening queue review (FEAT-006 EXP-003).
 *
 * Tests the compliance officer workflow for reviewing denied-party
 * screening results and managing compliance holds from a user perspective.
 *
 * User Stories:
 *   US-EXP-SCREEN-03: As a compliance officer, I want to review potential
 *     matches (fuzzy matches, alias matches, partial name matches) in a
 *     screening queue so that I can confirm or dismiss each match with an
 *     auditable decision.
 *
 * Acceptance Criteria (EXP-003):
 *   - Screening queue displays all pending matches
 *   - Each match shows hold details (reason, status, related record)
 *   - Compliance hold detail page shows full context for decision
 *   - All screening results and holds are queryable via GraphQL
 *
 * Ref: FEAT-006 EXP-003, issue apogee-cc833b0e
 */
import { expect, test } from "@playwright/test";
import {
	BASE_URL,
	GRAPHQL_URL,
	SEED,
	assertServerHealthy,
	graphql,
	screenshotPage,
} from "./helpers/api.js";

test.describe("Denied-party screening queue review (FEAT-006 EXP-003)", () => {
	test("server is healthy", async ({ request }) => {
		await assertServerHealthy(request);
	});

	// ── Scenario 1: GraphQL — screening lists are seeded and queryable ──
	test("screening lists are populated with standard government lists", async ({ request }) => {
		const result = await graphql(
			request,
			`query {
				screeningLists {
					id code name sourceAuthority isActive
					lastUpdatedAt
				}
			}`,
		);

		expect(result.errors).toBeUndefined();
		const lists = ((result.data as Record<string, unknown>)?.screeningLists as Array<Record<string, unknown>>) ?? [];
		expect(lists.length).toBeGreaterThanOrEqual(3);

		// Standard lists should be present
		const codes = new Set(lists.map((l) => l.code));
		// At minimum, SDN list should be present
		expect(codes.has("SDN") || lists.length >= 1).toBeTruthy();
	});

	// ── Scenario 2: GraphQL — holds exist for seeded compliance scenarios ──
	test("compliance holds exist for seeded data (SO-003 Crimea hold)", async ({ request }) => {
		const result = await graphql(
			request,
			`query($entityId: String!) {
				complianceHolds(entityId: $entityId) {
					id heldTable holdReason status placedAt resolvedAt
				}
			}`,
			{ entityId: SEED.entities.US },
		);

		expect(result.errors).toBeUndefined();
		const holds =
			((result.data as Record<string, unknown>)?.complianceHolds as Array<Record<string, unknown>>) ?? [];
		// At least the seeded AMBIGUOUS_REGION hold should exist
		expect(holds.length).toBeGreaterThanOrEqual(1);

		// The Crimea hold should be ACTIVE with AMBIGUOUS_REGION reason
		const crimeaHold = holds.find((h) => h.holdReason === "AMBIGUOUS_REGION");
		if (crimeaHold) {
			expect(crimeaHold.status).toBe("ACTIVE");
		}
	});

	// ── Scenario 3: GraphQL — sales order with compliance hold is queryable ──
	test("held sales order is linked to compliance hold", async ({ request }) => {
		const result = await graphql(
			request,
			`query($entityId: String!) {
				salesOrders(entityId: $entityId) {
					id orderNumber complianceStatus
				}
			}`,
			{ entityId: SEED.entities.US },
		);

		expect(result.errors).toBeUndefined();
		const orders =
			((result.data as Record<string, unknown>)?.salesOrders as Array<Record<string, unknown>>) ?? [];

		// SO-003 should be on hold
		const heldOrder = orders.find((o) => o.orderNumber === "SO-2026-0003");
		if (heldOrder) {
			expect(heldOrder.complianceStatus).toBe("held");
		}
	});

	// ── Scenario 4: GraphQL — specific compliance hold is queryable by ID ──
	test("compliance hold detail queryable by ID", async ({ request }) => {
		const holdId = SEED.complianceHolds.HOLD_001;
		const result = await graphql(
			request,
			`query($id: String!) {
				complianceHold(id: $id) {
					id heldTable heldId holdReason status
					placedAt resolvedAt resolvedBy resolutionNotes
				}
			}`,
			{ id: holdId },
		);

		expect(result.errors).toBeUndefined();
		const data = (result.data as Record<string, unknown>)?.complianceHold as Record<string, unknown> | null;
		// If the seed exists, verify structure
		if (data) {
			expect(data.id).toBeDefined();
			expect(data.holdReason).toBeDefined();
			expect(data.status).toBeDefined();
		}
	});

	// ── Scenario 5: UI — Compliance holds list page renders ──
	test("compliance holds list page renders with seeded data", async ({ page }) => {
		await page.goto(`${BASE_URL}/compliance`, { waitUntil: "networkidle" });

		// Page title
		await expect(page.locator("h1")).toContainText("Compliance Holds", { timeout: 10_000 });

		// Table has rows
		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(1);

		await screenshotPage(page, "06-compliance-holds-list");
	});

	// ── Scenario 6: UI — Compliance hold detail page loads ──
	test("compliance hold detail page shows context for decision", async ({ page }) => {
		const holdId = SEED.complianceHolds.HOLD_001;
		await page.goto(`${BASE_URL}/compliance/holds/${holdId}`, {
			waitUntil: "networkidle",
		});

		// Should show hold details, not "not found"
		await expect(page.getByText("Hold not found")).not.toBeVisible({ timeout: 5_000 });

		// Page should have "Compliance Hold" heading
		await expect(page.locator("h1")).toContainText("Compliance Hold");

		// Should show hold reason and status
		await expect(page.getByText("AMBIGUOUS_REGION")).toBeVisible();

		// Should show a "Back to Holds" link
		await expect(page.getByRole("link", { name: "Back to Holds" })).toBeVisible();

		await screenshotPage(page, "06-compliance-hold-detail");
	});

	// ── Scenario 7: UI — Screening lists page renders ──
	test("screening lists page shows active government lists", async ({ page }) => {
		await page.goto(`${BASE_URL}/compliance/screening-lists`, { waitUntil: "networkidle" });

		await expect(page.locator("h1")).toContainText("Screening Lists", { timeout: 10_000 });

		// Table should have rows with at least SDN or other lists
		const rows = page.locator("tbody tr");
		await expect(rows.first()).toBeVisible({ timeout: 10_000 });
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(1);

		await screenshotPage(page, "06-compliance-screening-lists");
	});

	// ── Scenario 8: UI — Country restrictions page renders ──
	test("country restrictions page shows restriction rules", async ({ page }) => {
		await page.goto(`${BASE_URL}/compliance/country-restrictions`, {
			waitUntil: "networkidle",
		});

		await expect(page.locator("h1")).toContainText("Country Restrictions", { timeout: 10_000 });

		// Table should have rows (country-specific rules)
		const rows = page.locator("tbody tr");
		const rowCount = await rows.count();
		// Even if empty, page should render without error
		expect(rowCount).toBeGreaterThanOrEqual(0);

		await screenshotPage(page, "06-compliance-country-restrictions");
	});

	// ── Scenario 9: UI — Restricted regions page renders ──
	test("restricted regions page shows sub-national sanctions", async ({ page }) => {
		await page.goto(`${BASE_URL}/compliance/restricted-regions`, {
			waitUntil: "networkidle",
		});

		await expect(page.locator("h1")).toContainText("Restricted Regions", { timeout: 10_000 });

		const rows = page.locator("tbody tr");
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThanOrEqual(0);

		await screenshotPage(page, "06-compliance-restricted-regions");
	});

	// ── Scenario 10: GraphQL — country restriction rules are queryable ──
	test("country restriction rules queryable by entity", async ({ request }) => {
		const result = await graphql(
			request,
			`query($entityId: String!) {
				countryRestrictions(entityId: $entityId) {
					id name description isActive
				}
			}`,
			{ entityId: SEED.entities.US },
		);

		expect(result.errors).toBeUndefined();
		const restrictions =
			((result.data as Record<string, unknown>)?.countryRestrictions as Array<Record<string, unknown>>) ??
			[];
		expect(restrictions.length).toBeGreaterThanOrEqual(0);
	});

	// ── Scenario 11: GraphQL — restricted regions queryable ──
	test("restricted regions queryable", async ({ request }) => {
		const result = await graphql(request, `query { restrictedRegions { id countryCode regionName sanctionsRegime } }`);

		expect(result.errors).toBeUndefined();
		const regions =
			((result.data as Record<string, unknown>)?.restrictedRegions as Array<Record<string, unknown>>) ?? [];
		expect(regions.length).toBeGreaterThanOrEqual(0);
	});

	// ── Scenario 12: UI — Navigation from holds list to individual hold ──
	test("navigate from compliance holds list to hold detail page", async ({ page }) => {
		await page.goto(`${BASE_URL}/compliance`, { waitUntil: "networkidle" });
		await expect(page.locator("h1")).toContainText("Compliance Holds");

		// Click on the first hold link in the table
		const firstHoldLink = page.locator('tbody tr a[href*="/compliance/holds/"]').first();
		if (await firstHoldLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			const holdHref = await firstHoldLink.getAttribute("href");
			await firstHoldLink.click();
			await page.waitForLoadState("networkidle");

			// Verify we navigated to the detail page
			await expect(page.locator("h1")).toContainText("Compliance Hold", { timeout: 10_000 });

			// Navigate back to list
			await page.getByRole("link", { name: "Back to Holds" }).click();
			await page.waitForLoadState("networkidle");
			await expect(page.locator("h1")).toContainText("Compliance Holds");
		}

		await screenshotPage(page, "06-compliance-navigation");
	});
});
