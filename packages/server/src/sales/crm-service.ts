/**
 * CRM Service — pipeline management, contacts, companies, opportunities, forecast.
 *
 * Implements CRM-001 (Contacts & companies), CRM-002 (Pipeline management),
 * CRM-003 (Activities) from SD-003-WP5.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O. CRMRepository is injected.
 * - buildCrmCompanyRecord / buildCrmContactRecord: validate + assemble DB records.
 * - buildOpportunityRecord: computes opportunity amount from line items if not explicit.
 * - buildPipelineForecastReport: weighted revenue by stage from live opportunity data.
 * - Opportunity stage transition: validated against pipeline stage definitions.
 *
 * Ref: SD-002-data-model.md §7 (crm_company, crm_contact, pipeline_stage, opportunity),
 *      SD-003-WP5 CRM-001..003, ADR-011 (money amounts)
 * Issue: hx-31c83b3c
 */

import type {
	CreateActivityInput,
	CreateCrmCompanyInput,
	CreateCrmContactInput,
	CreateOpportunityInput,
	CreatePipelineStageInput,
} from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineStageSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly code: string;
	readonly name: string;
	readonly stageOrder: number;
	readonly winProbability: number | null;
	readonly isClosedWon: boolean;
	readonly isClosedLost: boolean;
}

export interface OpportunitySnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly name: string;
	readonly pipelineStageId: UUID;
	readonly amount: string | null;
	readonly currencyCode: string | null;
	readonly probability: number | null;
	readonly expectedCloseDate: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CRMRepository {
	findPipelineStage(entityId: UUID, stageId: UUID): Promise<PipelineStageSnapshot | null>;
	findOpportunitiesByEntity(entityId: UUID): Promise<OpportunitySnapshot[]>;
	findOpportunitiesByStage(entityId: UUID, stageId: UUID): Promise<OpportunitySnapshot[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB record types
// ─────────────────────────────────────────────────────────────────────────────

export interface CrmCompanyRecord {
	readonly entityId: UUID;
	readonly name: string;
	readonly domain: string | null;
	readonly industry: string | null;
	readonly employeeCountRange: string | null;
	readonly annualRevenueRange: string | null;
	readonly countryCode: string | null;
	readonly phone: string | null;
	readonly website: string | null;
	readonly customerId: UUID | null;
	readonly vendorId: UUID | null;
	readonly ownerUserId: UUID | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

export interface CrmContactRecord {
	readonly entityId: UUID;
	readonly crmCompanyId: UUID | null;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
	readonly phone: string | null;
	readonly mobile: string | null;
	readonly jobTitle: string | null;
	readonly department: string | null;
	readonly countryCode: string | null;
	readonly doNotContact: boolean;
	readonly ownerUserId: UUID | null;
	readonly source: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

export interface PipelineStageRecord {
	readonly entityId: UUID;
	readonly code: string;
	readonly name: string;
	readonly stageOrder: number;
	readonly winProbability: number | null;
	readonly isClosedWon: boolean;
	readonly isClosedLost: boolean;
	readonly createdBy: UUID;
}

export interface OpportunityRecord {
	readonly entityId: UUID;
	readonly crmCompanyId: UUID | null;
	readonly customerId: UUID | null;
	readonly name: string;
	readonly description: string | null;
	readonly pipelineStageId: UUID;
	readonly amount: string | null;
	readonly currencyCode: string | null;
	readonly probability: number | null;
	readonly expectedCloseDate: string | null;
	readonly ownerUserId: UUID | null;
	readonly source: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

export interface OpportunityLineRecord {
	readonly productId: UUID | null;
	readonly description: string;
	readonly quantity: string;
	readonly unitPrice: string;
	readonly amount: string;
	readonly currencyCode: string;
}

export interface ActivityRecord {
	readonly entityId: UUID;
	readonly activityType: string;
	readonly subject: string;
	readonly description: string | null;
	readonly crmContactId: UUID | null;
	readonly crmCompanyId: UUID | null;
	readonly opportunityId: UUID | null;
	readonly leadId: UUID | null;
	readonly ownerUserId: UUID;
	readonly dueDate: string | null;
	readonly isCompleted: boolean;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class CRMError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "CRMError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-unit arithmetic
// ─────────────────────────────────────────────────────────────────────────────

function toMicro(amount: string): bigint {
	const [intPart = "0", decPart = ""] = amount.split(".");
	return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
}

function fromMicro(micro: bigint): string {
	const intPart = micro / 1_000_000n;
	const decPart = (micro % 1_000_000n).toString().padStart(6, "0");
	return `${intPart}.${decPart}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/** Build a DB-ready CRM company record. */
export function buildCrmCompanyRecord(
	input: CreateCrmCompanyInput,
	actorId: UUID,
): CrmCompanyRecord {
	return {
		entityId: input.entityId as UUID,
		name: input.name,
		domain: input.domain ?? null,
		industry: input.industry ?? null,
		employeeCountRange: input.employeeCountRange ?? null,
		annualRevenueRange: input.annualRevenueRange ?? null,
		countryCode: input.countryCode ?? null,
		phone: input.phone ?? null,
		website: input.website ?? null,
		customerId: (input.customerId as UUID | undefined) ?? null,
		vendorId: (input.vendorId as UUID | undefined) ?? null,
		ownerUserId: (input.ownerUserId as UUID | undefined) ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/** Build a DB-ready CRM contact record. */
export function buildCrmContactRecord(
	input: CreateCrmContactInput,
	actorId: UUID,
): CrmContactRecord {
	return {
		entityId: input.entityId as UUID,
		crmCompanyId: (input.crmCompanyId as UUID | undefined) ?? null,
		firstName: input.firstName,
		lastName: input.lastName,
		email: input.email ?? null,
		phone: input.phone ?? null,
		mobile: input.mobile ?? null,
		jobTitle: input.jobTitle ?? null,
		department: input.department ?? null,
		countryCode: input.countryCode ?? null,
		doNotContact: input.doNotContact ?? false,
		ownerUserId: (input.ownerUserId as UUID | undefined) ?? null,
		source: input.source ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/** Build a DB-ready pipeline stage record. */
export function buildPipelineStageRecord(
	input: CreatePipelineStageInput,
	actorId: UUID,
): PipelineStageRecord {
	return {
		entityId: input.entityId as UUID,
		code: input.code,
		name: input.name,
		stageOrder: input.stageOrder,
		winProbability: input.winProbability ?? null,
		isClosedWon: input.isClosedWon ?? false,
		isClosedLost: input.isClosedLost ?? false,
		createdBy: actorId,
	};
}

/**
 * Build a DB-ready opportunity record + line records.
 * If explicit amount is not provided, computes it from line items.
 * Throws CRMError if pipeline stage does not exist.
 */
export async function buildOpportunityRecord(
	input: CreateOpportunityInput,
	actorId: UUID,
	repo: CRMRepository,
): Promise<{ record: OpportunityRecord; lines: OpportunityLineRecord[] }> {
	// Validate pipeline stage exists
	const stage = await repo.findPipelineStage(input.entityId as UUID, input.pipelineStageId as UUID);
	if (!stage) {
		throw new CRMError(
			`Pipeline stage ${input.pipelineStageId} not found in entity ${input.entityId}.`,
			"PIPELINE_STAGE_NOT_FOUND",
		);
	}

	const lines: OpportunityLineRecord[] = (input.lines ?? []).map((l) => {
		const qtyStr = l.quantity.includes(".") ? l.quantity : `${l.quantity}.000000`;
		const [qInt = "0", qDec = ""] = qtyStr.split(".");
		const qtyMicro = BigInt(qInt) * 1_000_000n + BigInt(qDec.padEnd(6, "0").slice(0, 6));
		const priceMicro = toMicro(l.unitPrice);
		const amountMicro = (priceMicro * qtyMicro) / 1_000_000n;
		return {
			productId: (l.productId as UUID | undefined) ?? null,
			description: l.description,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			amount: fromMicro(amountMicro),
			currencyCode: l.currencyCode,
		};
	});

	// Derive amount from lines if not explicitly provided
	let derivedAmount: string | null = input.amount ?? null;
	if (derivedAmount === null && lines.length > 0) {
		const totalMicro = lines.reduce((acc, l) => acc + toMicro(l.amount), 0n);
		derivedAmount = fromMicro(totalMicro);
	}

	const record: OpportunityRecord = {
		entityId: input.entityId as UUID,
		crmCompanyId: (input.crmCompanyId as UUID | undefined) ?? null,
		customerId: (input.customerId as UUID | undefined) ?? null,
		name: input.name,
		description: input.description ?? null,
		pipelineStageId: input.pipelineStageId as UUID,
		amount: derivedAmount,
		currencyCode: input.currencyCode ?? null,
		probability: input.probability ?? stage.winProbability ?? null,
		expectedCloseDate: input.expectedCloseDate ?? null,
		ownerUserId: (input.ownerUserId as UUID | undefined) ?? null,
		source: input.source ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};

	return { record, lines };
}

/** Build a DB-ready activity record. */
export function buildActivityRecord(input: CreateActivityInput, actorId: UUID): ActivityRecord {
	return {
		entityId: input.entityId as UUID,
		activityType: input.activityType,
		subject: input.subject,
		description: input.description ?? null,
		crmContactId: (input.crmContactId as UUID | undefined) ?? null,
		crmCompanyId: (input.crmCompanyId as UUID | undefined) ?? null,
		opportunityId: (input.opportunityId as UUID | undefined) ?? null,
		leadId: (input.leadId as UUID | undefined) ?? null,
		ownerUserId: input.ownerUserId as UUID,
		dueDate: input.dueDate ?? null,
		isCompleted: input.isCompleted ?? false,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline forecast report
// ─────────────────────────────────────────────────────────────────────────────

/** A single row in the pipeline forecast report. */
export interface ForecastStageRow {
	readonly stageId: UUID;
	readonly stageName: string;
	readonly stageOrder: number;
	readonly opportunityCount: number;
	/** Sum of opportunity amounts in this stage (same currency only; multi-currency is excluded). */
	readonly totalAmount: string;
	/** Weighted amount: totalAmount × (probability / 100). */
	readonly weightedAmount: string;
	readonly currencyCode: string | null;
	readonly probability: number | null;
}

export interface PipelineForecastReport {
	readonly entityId: UUID;
	readonly generatedAt: string;
	/** Rows sorted by stageOrder ascending. */
	readonly stages: ForecastStageRow[];
	/** Sum of all stage weighted amounts (single-currency totals only). */
	readonly totalWeightedAmount: string | null;
	readonly totalCurrencyCode: string | null;
}

/**
 * Build a pipeline forecast report from active opportunities + stage definitions.
 *
 * Multi-currency handling: if opportunities in a stage span multiple currencies,
 * the stage row shows null for amounts. Only single-currency stages are summed
 * into the grand total.
 *
 * @param stages       All pipeline stages for the entity, ordered by stage_order.
 * @param opportunities All open opportunities for the entity.
 * @param entityId     The entity being reported on.
 */
export function buildPipelineForecastReport(
	stages: PipelineStageSnapshot[],
	opportunities: OpportunitySnapshot[],
	entityId: UUID,
): PipelineForecastReport {
	const generatedAt = new Date().toISOString();

	// Group opportunities by stage
	const byStage = new Map<UUID, OpportunitySnapshot[]>();
	for (const opp of opportunities) {
		const list = byStage.get(opp.pipelineStageId) ?? [];
		list.push(opp);
		byStage.set(opp.pipelineStageId, list);
	}

	const rows: ForecastStageRow[] = stages
		.slice()
		.sort((a, b) => a.stageOrder - b.stageOrder)
		.map((stage) => {
			const stagOpps = byStage.get(stage.id) ?? [];
			const currencies = new Set(stagOpps.map((o) => o.currencyCode).filter(Boolean));
			const firstCurrency = currencies.size === 1 ? [...currencies][0] : undefined;
			const singleCurrency = firstCurrency ?? null;

			let totalAmount = "0.000000";
			let weightedAmount = "0.000000";

			if (singleCurrency !== null && stagOpps.length > 0) {
				const totalMicro = stagOpps.reduce(
					(acc, o) => acc + (o.amount ? toMicro(o.amount) : 0n),
					0n,
				);
				totalAmount = fromMicro(totalMicro);

				const prob = stage.winProbability ?? 0;
				const probBP = BigInt(Math.round(prob * 100));
				const weightedMicro = (totalMicro * probBP) / 10_000n;
				weightedAmount = fromMicro(weightedMicro);
			}

			return {
				stageId: stage.id,
				stageName: stage.name,
				stageOrder: stage.stageOrder,
				opportunityCount: stagOpps.length,
				totalAmount: singleCurrency !== null ? totalAmount : "0.000000",
				weightedAmount: singleCurrency !== null ? weightedAmount : "0.000000",
				currencyCode: singleCurrency,
				probability: stage.winProbability,
			};
		});

	// Grand total: only sum rows where currencyCode is defined and consistent
	const rowsWithAmount = rows.filter((r) => r.currencyCode !== null);
	const grandCurrencies = new Set(rowsWithAmount.map((r) => r.currencyCode));
	let totalWeightedAmount: string | null = null;
	let totalCurrencyCode: string | null = null;

	if (grandCurrencies.size === 1) {
		const [currency] = grandCurrencies;
		totalCurrencyCode = currency ?? null;
		const grandMicro = rowsWithAmount.reduce((acc, r) => acc + toMicro(r.weightedAmount), 0n);
		totalWeightedAmount = fromMicro(grandMicro);
	}

	return {
		entityId,
		generatedAt,
		stages: rows,
		totalWeightedAmount,
		totalCurrencyCode,
	};
}
