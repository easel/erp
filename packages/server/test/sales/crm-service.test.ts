/**
 * CRM Service unit tests.
 *
 * Covers CRM-001..003 acceptance criteria:
 * - buildCrmCompanyRecord / buildCrmContactRecord: field mapping
 * - buildPipelineStageRecord: field mapping
 * - buildOpportunityRecord: stage validation, amount derivation from lines
 * - buildActivityRecord: field mapping
 * - buildPipelineForecastReport: weighted revenue by stage, grand total
 *
 * Ref: SD-003-WP5 CRM-001..003, hx-31c83b3c
 */

import { describe, expect, test } from "bun:test";
import {
	CRMError,
	type CRMRepository,
	type OpportunitySnapshot,
	type PipelineStageSnapshot,
	buildActivityRecord,
	buildCrmCompanyRecord,
	buildCrmContactRecord,
	buildOpportunityRecord,
	buildPipelineForecastReport,
	buildPipelineStageRecord,
} from "../../src/sales/crm-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const STAGE_ID_1 = "20000000-0000-0000-0000-000000000001" as const;
const STAGE_ID_2 = "20000000-0000-0000-0000-000000000002" as const;
const STAGE_ID_3 = "20000000-0000-0000-0000-000000000003" as const;
const COMPANY_ID = "30000000-0000-0000-0000-000000000001" as const;
const OPP_ID_1 = "40000000-0000-0000-0000-000000000001" as const;
const OPP_ID_2 = "40000000-0000-0000-0000-000000000002" as const;
const ACTOR_ID = "50000000-0000-0000-0000-000000000001" as const;
const PRODUCT_ID = "60000000-0000-0000-0000-000000000001" as const;
const CONTACT_ID = "70000000-0000-0000-0000-000000000001" as const;

function makeStage(overrides: Partial<PipelineStageSnapshot> = {}): PipelineStageSnapshot {
	return {
		id: STAGE_ID_1,
		entityId: ENTITY_ID,
		code: "PROSPECT",
		name: "Prospect",
		stageOrder: 1,
		winProbability: 10,
		isClosedWon: false,
		isClosedLost: false,
		...overrides,
	};
}

function makeOpportunity(overrides: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
	return {
		id: OPP_ID_1,
		entityId: ENTITY_ID,
		name: "Satellite contract",
		pipelineStageId: STAGE_ID_1,
		amount: "100000.000000",
		currencyCode: "USD",
		probability: 10,
		expectedCloseDate: "2026-12-31",
		...overrides,
	};
}

function makeNullRepo(): CRMRepository {
	return {
		async findPipelineStage() {
			return null;
		},
		async findOpportunitiesByEntity() {
			return [];
		},
		async findOpportunitiesByStage() {
			return [];
		},
	};
}

function makeRepoWithStage(stage: PipelineStageSnapshot): CRMRepository {
	return {
		...makeNullRepo(),
		async findPipelineStage() {
			return stage;
		},
	};
}

// ── buildCrmCompanyRecord ─────────────────────────────────────────────────────

describe("buildCrmCompanyRecord", () => {
	test("builds minimal company record", () => {
		const input = { entityId: ENTITY_ID, name: "Acme Corp" };
		const record = buildCrmCompanyRecord(input, ACTOR_ID);
		expect(record.entityId).toBe(ENTITY_ID);
		expect(record.name).toBe("Acme Corp");
		expect(record.domain).toBeNull();
		expect(record.countryCode).toBeNull();
		expect(record.customerId).toBeNull();
		expect(record.createdBy).toBe(ACTOR_ID);
	});

	test("maps all optional fields", () => {
		const input = {
			entityId: ENTITY_ID,
			name: "Orbital Dynamics",
			domain: "orbitaldynamics.com",
			industry: "Aerospace",
			countryCode: "US" as const,
			phone: "+1-555-0100",
			customerId: "80000000-0000-0000-0000-000000000001",
			ownerUserId: ACTOR_ID,
		};
		const record = buildCrmCompanyRecord(input, ACTOR_ID);
		expect(record.domain).toBe("orbitaldynamics.com");
		expect(record.industry).toBe("Aerospace");
		expect(record.countryCode).toBe("US");
		expect(record.phone).toBe("+1-555-0100");
	});
});

// ── buildCrmContactRecord ─────────────────────────────────────────────────────

describe("buildCrmContactRecord", () => {
	test("builds minimal contact record", () => {
		const input = {
			entityId: ENTITY_ID,
			firstName: "Jane",
			lastName: "Smith",
		};
		const record = buildCrmContactRecord(input, ACTOR_ID);
		expect(record.firstName).toBe("Jane");
		expect(record.lastName).toBe("Smith");
		expect(record.email).toBeNull();
		expect(record.doNotContact).toBe(false);
		expect(record.crmCompanyId).toBeNull();
	});

	test("maps all optional fields", () => {
		const input = {
			entityId: ENTITY_ID,
			firstName: "Jane",
			lastName: "Smith",
			email: "jane@example.com",
			phone: "+1-555-1234",
			jobTitle: "CTO",
			crmCompanyId: COMPANY_ID,
			doNotContact: true,
		};
		const record = buildCrmContactRecord(input, ACTOR_ID);
		expect(record.email).toBe("jane@example.com");
		expect(record.jobTitle).toBe("CTO");
		expect(record.crmCompanyId).toBe(COMPANY_ID);
		expect(record.doNotContact).toBe(true);
	});
});

// ── buildPipelineStageRecord ──────────────────────────────────────────────────

describe("buildPipelineStageRecord", () => {
	test("builds a valid pipeline stage record", () => {
		const input = {
			entityId: ENTITY_ID,
			code: "DEMO",
			name: "Demo",
			stageOrder: 2,
			winProbability: 40,
			isClosedWon: false,
			isClosedLost: false,
		};
		const record = buildPipelineStageRecord(input, ACTOR_ID);
		expect(record.code).toBe("DEMO");
		expect(record.stageOrder).toBe(2);
		expect(record.winProbability).toBe(40);
		expect(record.isClosedWon).toBe(false);
	});
});

// ── buildOpportunityRecord ────────────────────────────────────────────────────

describe("buildOpportunityRecord", () => {
	test("builds opportunity with explicit amount", async () => {
		const repo = makeRepoWithStage(makeStage());
		const input = {
			entityId: ENTITY_ID,
			name: "Big deal",
			pipelineStageId: STAGE_ID_1,
			amount: "500000.000000",
			currencyCode: "USD" as const,
		};
		const result = await buildOpportunityRecord(input, ACTOR_ID, repo);
		expect(result.record.name).toBe("Big deal");
		expect(result.record.amount).toBe("500000.000000");
		expect(result.record.pipelineStageId).toBe(STAGE_ID_1);
		expect(result.lines).toHaveLength(0);
	});

	test("derives amount from line items when amount not provided", async () => {
		const repo = makeRepoWithStage(makeStage());
		const input = {
			entityId: ENTITY_ID,
			name: "Line-priced deal",
			pipelineStageId: STAGE_ID_1,
			currencyCode: "USD" as const,
			lines: [
				{
					productId: PRODUCT_ID,
					description: "Component A",
					quantity: "2",
					unitPrice: "150000.000000",
					currencyCode: "USD" as const,
				},
			],
		};
		const result = await buildOpportunityRecord(input, ACTOR_ID, repo);
		// 2 × 150000 = 300000
		expect(result.record.amount).toBe("300000.000000");
		expect(result.lines).toHaveLength(1);
		expect(result.lines[0]?.amount).toBe("300000.000000");
	});

	test("inherits stage win probability when opportunity probability not set", async () => {
		const repo = makeRepoWithStage(makeStage({ winProbability: 25 }));
		const input = {
			entityId: ENTITY_ID,
			name: "Probability test",
			pipelineStageId: STAGE_ID_1,
		};
		const result = await buildOpportunityRecord(input, ACTOR_ID, repo);
		expect(result.record.probability).toBe(25);
	});

	test("throws PIPELINE_STAGE_NOT_FOUND when stage missing", async () => {
		const repo = makeNullRepo();
		const input = {
			entityId: ENTITY_ID,
			name: "Bad stage",
			pipelineStageId: STAGE_ID_1,
		};
		try {
			await buildOpportunityRecord(input, ACTOR_ID, repo);
			throw new Error("Expected CRMError");
		} catch (e) {
			expect(e).toBeInstanceOf(CRMError);
			expect((e as CRMError).code).toBe("PIPELINE_STAGE_NOT_FOUND");
		}
	});
});

// ── buildActivityRecord ───────────────────────────────────────────────────────

describe("buildActivityRecord", () => {
	test("builds a valid activity record linked to a contact", () => {
		const input = {
			entityId: ENTITY_ID,
			activityType: "CALL" as const,
			subject: "Discovery call",
			ownerUserId: ACTOR_ID,
			crmContactId: CONTACT_ID,
		};
		const record = buildActivityRecord(input, ACTOR_ID);
		expect(record.activityType).toBe("CALL");
		expect(record.subject).toBe("Discovery call");
		expect(record.crmContactId).toBe(CONTACT_ID);
		expect(record.isCompleted).toBe(false);
		expect(record.createdBy).toBe(ACTOR_ID);
	});
});

// ── buildPipelineForecastReport ───────────────────────────────────────────────

describe("buildPipelineForecastReport", () => {
	const stages: PipelineStageSnapshot[] = [
		makeStage({
			id: STAGE_ID_1,
			code: "PROSPECT",
			name: "Prospect",
			stageOrder: 1,
			winProbability: 10,
		}),
		makeStage({ id: STAGE_ID_2, code: "DEMO", name: "Demo", stageOrder: 2, winProbability: 40 }),
		makeStage({
			id: STAGE_ID_3,
			code: "NEGOTIATION",
			name: "Negotiation",
			stageOrder: 3,
			winProbability: 75,
		}),
	];

	test("returns empty rows with zero totals for entity with no opportunities", () => {
		const report = buildPipelineForecastReport(stages, [], ENTITY_ID);
		expect(report.stages).toHaveLength(3);
		expect(report.stages[0]?.opportunityCount).toBe(0);
		expect(report.totalWeightedAmount).toBeNull();
	});

	test("computes weighted amount for single-currency stage: 100000 × 10% = 10000", () => {
		const opps = [
			makeOpportunity({
				pipelineStageId: STAGE_ID_1,
				amount: "100000.000000",
				currencyCode: "USD",
			}),
		];
		const report = buildPipelineForecastReport(stages, opps, ENTITY_ID);
		const prospectRow = report.stages.find((r) => r.stageId === STAGE_ID_1)!;
		expect(prospectRow.opportunityCount).toBe(1);
		expect(prospectRow.totalAmount).toBe("100000.000000");
		expect(prospectRow.weightedAmount).toBe("10000.000000");
		expect(prospectRow.currencyCode).toBe("USD");
	});

	test("computes weighted amount for 40% probability stage", () => {
		const opps = [
			makeOpportunity({
				pipelineStageId: STAGE_ID_2,
				amount: "250000.000000",
				currencyCode: "USD",
			}),
		];
		const report = buildPipelineForecastReport(stages, opps, ENTITY_ID);
		const demoRow = report.stages.find((r) => r.stageId === STAGE_ID_2)!;
		// 250000 × 0.40 = 100000
		expect(demoRow.weightedAmount).toBe("100000.000000");
	});

	test("sums grand total weighted amount across all stages (single currency)", () => {
		const opps: OpportunitySnapshot[] = [
			makeOpportunity({
				id: OPP_ID_1,
				pipelineStageId: STAGE_ID_1,
				amount: "100000.000000",
				currencyCode: "USD",
			}),
			makeOpportunity({
				id: OPP_ID_2,
				pipelineStageId: STAGE_ID_2,
				amount: "250000.000000",
				currencyCode: "USD",
			}),
		];
		const report = buildPipelineForecastReport(stages, opps, ENTITY_ID);
		// Stage 1: 100000 × 10% = 10000
		// Stage 2: 250000 × 40% = 100000
		// Grand total = 110000
		expect(report.totalWeightedAmount).toBe("110000.000000");
		expect(report.totalCurrencyCode).toBe("USD");
	});

	test("returns null grand total for multi-currency opportunities", () => {
		const opps: OpportunitySnapshot[] = [
			makeOpportunity({
				id: OPP_ID_1,
				pipelineStageId: STAGE_ID_1,
				amount: "100000.000000",
				currencyCode: "USD",
			}),
			makeOpportunity({
				id: OPP_ID_2,
				pipelineStageId: STAGE_ID_2,
				amount: "200000.000000",
				currencyCode: "EUR",
			}),
		];
		const report = buildPipelineForecastReport(stages, opps, ENTITY_ID);
		// Mixed currencies across stages → no grand total
		expect(report.totalWeightedAmount).toBeNull();
	});

	test("stages are sorted by stageOrder ascending", () => {
		// Pass stages in reverse order
		const shuffled = [stages[2]!, stages[0]!, stages[1]!];
		const report = buildPipelineForecastReport(shuffled, [], ENTITY_ID);
		const orders = report.stages.map((r) => r.stageOrder);
		expect(orders).toEqual([1, 2, 3]);
	});

	test("stages with null amount opportunities show zero weighted amount", () => {
		const opps = [
			makeOpportunity({ pipelineStageId: STAGE_ID_1, amount: null, currencyCode: null }),
		];
		const report = buildPipelineForecastReport(stages, opps, ENTITY_ID);
		const prospectRow = report.stages.find((r) => r.stageId === STAGE_ID_1)!;
		expect(prospectRow.opportunityCount).toBe(1);
		expect(prospectRow.weightedAmount).toBe("0.000000");
	});

	test("report includes entityId and generatedAt", () => {
		const report = buildPipelineForecastReport(stages, [], ENTITY_ID);
		expect(report.entityId).toBe(ENTITY_ID);
		expect(report.generatedAt).toBeTruthy();
		// generatedAt should be a valid ISO datetime
		expect(() => new Date(report.generatedAt)).not.toThrow();
	});
});
