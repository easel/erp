/**
 * E2E Feature Spec: Apogee ERP Demo Reel
 *
 * Exercises every major entity type and workflow via the GraphQL / REST
 * API against the seeded Orbital Dynamics Corp dataset.
 *
 * Sections:
 *   1. Platform health & observability
 *   2. Schema completeness — all types and mutations present
 *   3. Multi-entity context — US, EU, APAC entities
 *   4. Procurement — vendor creation, PO lifecycle (submit → approve → send)
 *   5. Finance — journal entry (balanced/unbalanced), GL invariants
 *   6. Compliance — PO approval with screening gate
 *
 * Run against the Kind demo:
 *   E2E_BASE_URL=http://localhost:3100 bun run test:e2e -- tests/e2e/00-reel.spec.ts
 *
 * Ref: FEAT-009 PLT-021, issue erp-9e06e0fc
 */
import { expect, test } from "@playwright/test";
import { BASE_URL, GRAPHQL_URL, SEED, graphql } from "./helpers/api.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Platform health & observability
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Platform health & observability", () => {
	test("health/live returns ok", async ({ request }) => {
		const res = await request.get(`${BASE_URL}/health/live`);
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	test("health/ready returns ok", async ({ request }) => {
		const res = await request.get(`${BASE_URL}/health/ready`);
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	test("Prometheus metrics include process and app metrics", async ({ request }) => {
		const res = await request.get(`${BASE_URL}/metrics`);
		expect(res.ok()).toBeTruthy();
		const text = await res.text();
		expect(text).toContain("process_cpu_seconds_total");
		expect(text).toContain("process_resident_memory_bytes");
		expect(text).toContain("process_start_time_seconds");
	});

	test("API version is 0.0.1", async ({ request }) => {
		const result = await graphql(request, "{ _version }");
		expect(result.errors).toBeUndefined();
		expect(result.data?._version).toBe("0.0.1");
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Schema completeness
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Schema completeness", () => {
	test("all mutations are registered", async ({ request }) => {
		const result = await graphql(
			request,
			`{
			__type(name: "Mutation") { fields { name } }
		}`,
		);
		expect(result.errors).toBeUndefined();
		const names = (result.data?.__type as { fields: { name: string }[] }).fields.map((f) => f.name);
		expect(names).toContain("createVendor");
		expect(names).toContain("createJournalEntry");
		expect(names).toContain("approvePurchaseOrder");
		expect(names).toContain("submitPurchaseOrderForApproval");
		expect(names).toContain("sendPurchaseOrder");
	});

	test("domain input types exist with correct fields", async ({ request }) => {
		const types = [
			[
				"CreateVendorInput",
				["entityId", "vendorCode", "legalName", "countryCode", "defaultCurrencyCode"],
			],
			[
				"CreateJournalEntryInput",
				["legalEntityId", "fiscalPeriodId", "entryDate", "reference", "lines"],
			],
			["JournalLineInput", ["accountId", "type", "amount", "currencyCode"]],
			["ApprovePurchaseOrderInput", ["id", "approverId"]],
			["SubmitPurchaseOrderInput", ["id", "submittedBy"]],
			["SendPurchaseOrderInput", ["id", "sentBy"]],
		] as const;

		for (const [typeName, expectedFields] of types) {
			const result = await graphql(
				request,
				`{
				__type(name: "${typeName}") { inputFields { name } }
			}`,
			);
			expect(result.errors).toBeUndefined();
			const fields =
				(result.data?.__type as { inputFields: { name: string }[] })?.inputFields.map(
					(f) => f.name,
				) ?? [];
			for (const field of expectedFields) {
				expect(fields, `${typeName} missing field: ${field}`).toContain(field);
			}
		}
	});

	test("domain output types exist with correct fields", async ({ request }) => {
		const types = [
			["VendorResult", ["id", "name"]],
			["JournalEntryResult", ["id", "reference"]],
			["POApprovalResult", ["poId", "newStatus", "screeningOutcome", "holdId"]],
			["POStatusResult", ["poId", "newStatus"]],
		] as const;

		for (const [typeName, expectedFields] of types) {
			const result = await graphql(
				request,
				`{
				__type(name: "${typeName}") { fields { name } }
			}`,
			);
			expect(result.errors).toBeUndefined();
			const fields =
				(result.data?.__type as { fields: { name: string }[] })?.fields.map((f) => f.name) ?? [];
			for (const field of expectedFields) {
				expect(fields, `${typeName} missing field: ${field}`).toContain(field);
			}
		}
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2b. Data queries — verify seeded data is queryable
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Data queries — seeded data", () => {
	const entityId = SEED.entities.US;

	test("legalEntities returns ODC entities", async ({ request }) => {
		const result = await graphql(request, "{ legalEntities { id code name } }");
		expect(result.errors).toBeUndefined();
		const entities = result.data?.legalEntities as { code: string }[];
		expect(entities.length).toBeGreaterThanOrEqual(3);
		const codes = entities.map((e) => e.code);
		expect(codes).toContain("ODC-US");
		expect(codes).toContain("ODC-EU");
		expect(codes).toContain("ODC-APAC");
	});

	test("vendors returns seeded vendors", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { vendors(entityId: $eid) { id vendorCode legalName } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const vendors = result.data?.vendors as { vendorCode: string }[];
		expect(vendors.length).toBeGreaterThanOrEqual(10);
	});

	test("customers returns seeded customers", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { customers(entityId: $eid) { id customerCode legalName countryCode } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const customers = result.data?.customers as { customerCode: string }[];
		expect(customers.length).toBeGreaterThanOrEqual(15);
	});

	test("accounts returns chart of accounts", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { accounts(entityId: $eid) { id accountNumber name accountType } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const accounts = result.data?.accounts as { accountNumber: string }[];
		expect(accounts.length).toBeGreaterThanOrEqual(15);
		const numbers = accounts.map((a) => a.accountNumber);
		expect(numbers).toContain("1100"); // Cash
		expect(numbers).toContain("4100"); // Satellite Capacity Revenue
	});

	test("salesOrders returns seeded orders with compliance statuses", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { salesOrders(entityId: $eid) { id orderNumber status complianceStatus } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const orders = result.data?.salesOrders as { complianceStatus: string }[];
		expect(orders.length).toBeGreaterThanOrEqual(3);
		const statuses = orders.map((o) => o.complianceStatus);
		expect(statuses).toContain("cleared");
		expect(statuses).toContain("held");
	});

	test("purchaseOrders returns seeded POs", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { purchaseOrders(entityId: $eid) { id poNumber status totalAmount } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const pos = result.data?.purchaseOrders as { poNumber: string }[];
		expect(pos.length).toBeGreaterThanOrEqual(2);
	});

	test("journalEntries returns posted entries", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { journalEntries(entityId: $eid) { id entryNumber description status } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const entries = result.data?.journalEntries as { status: string }[];
		expect(entries.length).toBeGreaterThanOrEqual(1);
	});

	test("opportunities returns CRM pipeline", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { opportunities(entityId: $eid) { id name amount } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const opps = result.data?.opportunities as { name: string }[];
		expect(opps.length).toBeGreaterThanOrEqual(3);
	});

	test("complianceHolds returns active hold (Crimea)", async ({ request }) => {
		const result = await graphql(
			request,
			"query($eid: String!) { complianceHolds(entityId: $eid) { id holdReason status } }",
			{ eid: entityId },
		);
		expect(result.errors).toBeUndefined();
		const holds = result.data?.complianceHolds as { holdReason: string; status: string }[];
		expect(holds.length).toBeGreaterThanOrEqual(1);
		const activeHold = holds.find((h) => h.holdReason === "AMBIGUOUS_REGION");
		expect(activeHold).toBeTruthy();
		expect(activeHold?.status).toBe("ACTIVE");
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Multi-entity context
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Multi-entity context", () => {
	test("X-Entity-Id header is accepted for all 3 ODC entities", async ({ request }) => {
		for (const [label, entityId] of [
			["US", SEED.entities.US],
			["EU", SEED.entities.EU],
			["APAC", SEED.entities.APAC],
		] as const) {
			const res = await request.post(GRAPHQL_URL, {
				data: { query: "{ _version }" },
				headers: { "Content-Type": "application/json", "X-Entity-Id": entityId },
			});
			expect(res.ok(), `Entity ${label} (${entityId}) request failed`).toBeTruthy();
			const body = (await res.json()) as { data: { _version: string } };
			expect(body.data._version).toBe("0.0.1");
		}
	});

	test("entity IDs are deterministic from seed", async () => {
		expect(SEED.entities.US).toBe("a0000000-0000-0000-0000-000000000001");
		expect(SEED.entities.EU).toBe("a0000000-0000-0000-0000-000000000002");
		expect(SEED.entities.APAC).toBe("a0000000-0000-0000-0000-000000000003");
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Procurement — vendor creation & PO lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Procurement — vendor creation", () => {
	test("createVendor succeeds with valid input", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: CreateVendorInput!) {
				createVendor(input: $input) { id name }
			}`,
			{
				input: {
					entityId: SEED.entities.US,
					vendorCode: "REEL-LAUNCH",
					legalName: "Reel Launch Services LLC",
					countryCode: "US",
					defaultCurrencyCode: "USD",
					paymentTerms: "NET30",
				},
			},
		);
		expect(result.errors).toBeUndefined();
		const vendor = result.data?.createVendor as { id: string; name: string };
		expect(vendor.id).toBeTruthy();
		expect(vendor.name).toBe("Reel Launch Services LLC");
	});

	test("createVendor with optional fields succeeds", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: CreateVendorInput!) {
				createVendor(input: $input) { id name }
			}`,
			{
				input: {
					entityId: SEED.entities.EU,
					vendorCode: "ORBITAL-COMP",
					legalName: "Orbital Components GmbH",
					tradeName: "OrbComp",
					countryCode: "DE",
					defaultCurrencyCode: "EUR",
					taxId: "DE123456789",
					riskRating: "LOW",
					notes: "Satellite component supplier",
				},
			},
		);
		expect(result.errors).toBeUndefined();
		const vendor = result.data?.createVendor as { id: string; name: string };
		expect(vendor.id).toBeTruthy();
		expect(vendor.name).toBe("Orbital Components GmbH");
	});

	test("createVendor rejects missing required fields", async ({ request }) => {
		// Missing entityId, vendorCode, defaultCurrencyCode
		const res = await request.post(GRAPHQL_URL, {
			data: {
				query: `mutation($input: CreateVendorInput!) {
					createVendor(input: $input) { id name }
				}`,
				variables: {
					input: {
						legalName: "Incomplete Vendor",
						countryCode: "US",
					},
				},
			},
			headers: { "Content-Type": "application/json" },
		});
		const body = (await res.json()) as { errors?: unknown[] };
		expect(body.errors).toBeDefined();
		expect((body.errors as unknown[]).length).toBeGreaterThan(0);
	});

	test("createVendor rejects invalid vendor code format", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: CreateVendorInput!) {
				createVendor(input: $input) { id name }
			}`,
			{
				input: {
					entityId: SEED.entities.US,
					vendorCode: "invalid lowercase!",
					legalName: "Bad Code Vendor",
					countryCode: "US",
					defaultCurrencyCode: "USD",
				},
			},
		);
		// Zod rejects vendor codes that aren't uppercase alphanumeric
		expect(result.errors).toBeDefined();
	});
});

test.describe("Procurement — PO lifecycle", () => {
	// PO mutations use stub snapshots (not DB), so we can use crypto UUIDs
	const poId = "550e8400-e29b-41d4-a716-446655440000";
	const actorId = "550e8400-e29b-41d4-a716-446655440001";

	test("submitPurchaseOrderForApproval transitions PO to PENDING_APPROVAL", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: SubmitPurchaseOrderInput!) {
				submitPurchaseOrderForApproval(input: $input) { poId newStatus }
			}`,
			{ input: { id: poId, submittedBy: actorId } },
		);
		expect(result.errors).toBeUndefined();
		const po = result.data?.submitPurchaseOrderForApproval as {
			poId: string;
			newStatus: string;
		};
		expect(po.poId).toBe(poId);
		expect(po.newStatus).toBe("PENDING_APPROVAL");
	});

	test("approvePurchaseOrder returns screening outcome", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: ApprovePurchaseOrderInput!) {
				approvePurchaseOrder(input: $input) {
					poId newStatus screeningOutcome holdId
				}
			}`,
			{ input: { id: poId, approverId: actorId } },
		);
		expect(result.errors).toBeUndefined();
		const approval = result.data?.approvePurchaseOrder as {
			poId: string;
			newStatus: string;
			screeningOutcome: string;
			holdId: string | null;
		};
		expect(approval.poId).toBe(poId);
		expect(approval.newStatus).toBeTruthy();
		expect(approval.screeningOutcome).toBeTruthy();
	});

	test("sendPurchaseOrder transitions PO to SENT", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: SendPurchaseOrderInput!) {
				sendPurchaseOrder(input: $input) { poId newStatus }
			}`,
			{ input: { id: poId, sentBy: actorId } },
		);
		expect(result.errors).toBeUndefined();
		const po = result.data?.sendPurchaseOrder as { poId: string; newStatus: string };
		expect(po.poId).toBe(poId);
		expect(po.newStatus).toBe("SENT");
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Finance — journal entries & GL invariants
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Finance — journal entries", () => {
	test("createJournalEntry accepts a balanced entry", async ({ request }) => {
		const ref = `REEL-JE-${Date.now()}`;
		const result = await graphql(
			request,
			`mutation($input: CreateJournalEntryInput!) {
				createJournalEntry(input: $input) { id reference }
			}`,
			{
				input: {
					legalEntityId: SEED.entities.US,
					fiscalPeriodId: SEED.fiscalPeriods.PERIOD_04,
					entryDate: "2026-04-05",
					reference: ref,
					description: "Reel — balanced journal entry",
					lines: [
						{
							accountId: SEED.accounts.CASH,
							type: "DEBIT",
							amount: "1250.00",
							currencyCode: "USD",
							description: "Cash receipt",
						},
						{
							accountId: SEED.accounts.SAT_CAPACITY_REV,
							type: "CREDIT",
							amount: "1250.00",
							currencyCode: "USD",
							description: "Service revenue",
						},
					],
				},
			},
		);
		expect(result.errors).toBeUndefined();
		const je = result.data?.createJournalEntry as { id: string; reference: string };
		expect(je.id).toBeTruthy();
		expect(je.reference).toBe(ref);
	});

	test("createJournalEntry rejects an unbalanced entry (GL invariant)", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: CreateJournalEntryInput!) {
				createJournalEntry(input: $input) { id reference }
			}`,
			{
				input: {
					legalEntityId: SEED.entities.US,
					fiscalPeriodId: SEED.fiscalPeriods.PERIOD_04,
					entryDate: "2026-04-05",
					reference: "REEL-UNBALANCED",
					description: "Should be rejected — debit only",
					lines: [
						{
							accountId: SEED.accounts.CASH,
							type: "DEBIT",
							amount: "999.99",
							currencyCode: "USD",
							description: "Orphan debit — no matching credit",
						},
					],
				},
			},
		);
		expect(result.errors).toBeDefined();
		expect(result.errors?.length).toBeGreaterThan(0);
	});

	test("createJournalEntry rejects entry with only one line", async ({ request }) => {
		const res = await request.post(GRAPHQL_URL, {
			data: {
				query: `mutation($input: CreateJournalEntryInput!) {
					createJournalEntry(input: $input) { id reference }
				}`,
				variables: {
					input: {
						legalEntityId: SEED.entities.US,
						fiscalPeriodId: SEED.fiscalPeriods.PERIOD_04,
						entryDate: "2026-04-05",
						reference: "REEL-SINGLE-LINE",
						description: "Should be rejected — minimum 2 lines required",
						lines: [
							{
								accountId: SEED.accounts.CASH,
								type: "DEBIT",
								amount: "100.00",
								currencyCode: "USD",
							},
						],
					},
				},
			},
			headers: { "Content-Type": "application/json" },
		});
		// Zod requires .min(2) lines
		const body = (await res.json()) as { errors?: unknown[]; data?: unknown };
		expect(body.errors).toBeDefined();
	});

	test("createJournalEntry supports multi-line entries", async ({ request }) => {
		const ref = `REEL-MULTI-${Date.now()}`;
		const result = await graphql(
			request,
			`mutation($input: CreateJournalEntryInput!) {
				createJournalEntry(input: $input) { id reference }
			}`,
			{
				input: {
					legalEntityId: SEED.entities.US,
					fiscalPeriodId: SEED.fiscalPeriods.PERIOD_04,
					entryDate: "2026-04-05",
					reference: ref,
					description: "Reel — compound journal entry with 4 lines",
					lines: [
						{
							accountId: SEED.accounts.CASH,
							type: "DEBIT",
							amount: "3000.00",
							currencyCode: "USD",
							description: "Cash in",
						},
						{
							accountId: SEED.accounts.AR,
							type: "DEBIT",
							amount: "500.00",
							currencyCode: "USD",
							description: "AR write-off",
						},
						{
							accountId: SEED.accounts.SAT_CAPACITY_REV,
							type: "CREDIT",
							amount: "2500.00",
							currencyCode: "USD",
							description: "Service revenue",
						},
						{
							accountId: SEED.accounts.DEFERRED_REV,
							type: "CREDIT",
							amount: "1000.00",
							currencyCode: "USD",
							description: "Deferred revenue",
						},
					],
				},
			},
		);
		expect(result.errors).toBeUndefined();
		const je = result.data?.createJournalEntry as { id: string; reference: string };
		expect(je.id).toBeTruthy();
		expect(je.reference).toBe(ref);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Compliance — PO approval screening gate
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Compliance — screening gate", () => {
	test("POApprovalResult carries screening metadata", async ({ request }) => {
		const result = await graphql(
			request,
			`{
			__type(name: "POApprovalResult") { fields { name type { name kind } } }
		}`,
		);
		expect(result.errors).toBeUndefined();
		const fields = (result.data?.__type as { fields: { name: string }[] }).fields.map(
			(f) => f.name,
		);
		expect(fields).toContain("screeningOutcome");
		expect(fields).toContain("holdId");
		expect(fields).toContain("newStatus");
		expect(fields).toContain("poId");
	});

	test("approvePurchaseOrder returns CLEAR or hold for valid PO", async ({ request }) => {
		const result = await graphql(
			request,
			`mutation($input: ApprovePurchaseOrderInput!) {
				approvePurchaseOrder(input: $input) {
					poId newStatus screeningOutcome holdId
				}
			}`,
			{
				input: {
					id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
					approverId: "f47ac10b-58cc-4372-a567-0e02b2c3d480",
				},
			},
		);
		expect(result.errors).toBeUndefined();
		const approval = result.data?.approvePurchaseOrder as {
			screeningOutcome: string;
			holdId: string | null;
		};
		// Outcome should be one of the compliance statuses
		expect(["CLEAR", "DENIED", "RESTRICTED"]).toContain(approval.screeningOutcome);
	});
});
