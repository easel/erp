/**
 * Pothos schema — code-first GraphQL schema with full TypeScript inference.
 *
 * Mutations validate against the same Zod schemas as the frontend forms
 * per ADR-010. Changing a schema in @apogee/shared causes a TypeScript
 * compile error here — the compile-time guarantee of no silent drift.
 *
 * DB wiring:
 * - `buildSchema(glRepo)` builds the schema with a real or injected GLRepository.
 * - `schema` is the legacy constant using the in-memory stub (kept for tests
 *   that don't supply a database).
 */
import {
	ApprovePurchaseOrderSchema,
	type CreateJournalEntryInput,
	CreateJournalEntrySchema,
	type CreateVendorInput,
	CreateVendorSchema,
	SendPurchaseOrderSchema,
	SubmitPurchaseOrderSchema,
} from "@apogee/shared";
import type { UUID } from "@apogee/shared";
import SchemaBuilder from "@pothos/core";
import type { DbClient } from "./db.js";
import {
	type FiscalPeriodSnapshot,
	type GLAccountSnapshot,
	type GLRepository,
	postJournalEntry,
} from "./finance/gl-engine.js";
import {
	type POSnapshot,
	approve,
	send,
	submitForApproval,
} from "./procurement/po-approval-workflow.js";
import { validateInput } from "./validation.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stub GL repository — accepts all valid-looking periods and accounts.
// Used when no database is configured (unit tests, build-time schema checks).
// ─────────────────────────────────────────────────────────────────────────────

export const stubGLRepository: GLRepository = {
	async findPeriod(_entityId, periodId): Promise<FiscalPeriodSnapshot | null> {
		return {
			id: periodId,
			entityId: _entityId,
			status: "OPEN",
			periodLabel: "Current Period",
		};
	},
	async findAccounts(entityId, accountIds) {
		const result = new Map<(typeof accountIds)[number], GLAccountSnapshot>();
		for (const id of accountIds) {
			result.set(id, {
				id,
				entityId,
				accountNumber: id.slice(0, 8),
				isHeader: false,
				isActive: true,
				currencyCode: null,
			});
		}
		return result;
	},
	async findEntry(_entityId, _entryId) {
		return null;
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and return the Pothos GraphQL schema.
 *
 * @param glRepo  GLRepository implementation. Defaults to the in-memory stub.
 * @param db      Optional DbClient for query resolvers. When omitted, queries
 *                return empty results (useful for tests without a real DB).
 */
export function buildSchema(
	glRepo: GLRepository = stubGLRepository,
	db?: DbClient,
): ReturnType<typeof _build> {
	return _build(glRepo, db ?? null);
}

function _build(glRepo: GLRepository, db: DbClient | null) {
	const builder = new SchemaBuilder<{
		Context: Record<string, never>;
	}>({});

	// ────────────────────────────────────────────────────────────────────────
	// Shared pagination input
	// ────────────────────────────────────────────────────────────────────────
	const PaginationInput = builder.inputType("PaginationInput", {
		fields: (t) => ({
			limit: t.int({ required: false, defaultValue: 50 }),
			offset: t.int({ required: false, defaultValue: 0 }),
		}),
	});

	// ────────────────────────────────────────────────────────────────────────
	// Row types for query results (snake_case from DB)
	// ────────────────────────────────────────────────────────────────────────

	type LegalEntityRow = {
		id: string;
		code: string;
		name: string;
		country_code: string;
		base_currency_code: string;
		tax_id: string | null;
		parent_entity_id: string | null;
		is_active: boolean;
		created_at: string;
	};
	type VendorRow = {
		id: string;
		entity_id: string;
		vendor_code: string;
		legal_name: string;
		trade_name: string | null;
		country_code: string;
		default_currency_code: string;
		tax_id: string | null;
		payment_terms: string | null;
		risk_rating: string | null;
		is_active: boolean;
		created_at: string;
	};
	type CustomerRow = {
		id: string;
		entity_id: string;
		customer_code: string;
		legal_name: string;
		country_code: string;
		default_currency_code: string;
		notes: string | null;
		is_active: boolean;
		created_at: string;
	};
	type ProductRow = {
		id: string;
		entity_id: string;
		product_code: string;
		name: string;
		description: string | null;
		product_type: string;
		unit_of_measure: string;
		is_active: boolean;
		created_at: string;
	};
	type AccountRow = {
		id: string;
		entity_id: string;
		account_number: string;
		name: string;
		account_type: string;
		normal_balance: string;
		is_header: boolean;
		is_active: boolean;
	};
	type SalesOrderRow = {
		id: string;
		entity_id: string;
		customer_id: string;
		order_number: string;
		order_date: string;
		status: string;
		compliance_status: string | null;
		currency_code: string;
		total_amount: string;
		notes: string | null;
		created_at: string;
	};
	type PurchaseOrderRow = {
		id: string;
		entity_id: string;
		vendor_id: string;
		po_number: string;
		po_date: string;
		expected_delivery_date: string | null;
		status: string;
		compliance_status: string | null;
		currency_code: string;
		total_amount: string;
		created_at: string;
	};
	type JournalEntryRow = {
		id: string;
		entity_id: string;
		entry_number: string;
		entry_date: string;
		description: string;
		status: string;
		source_module: string;
		created_at: string;
	};
	type OpportunityRow = {
		id: string;
		entity_id: string;
		crm_company_id: string | null;
		customer_id: string | null;
		name: string;
		description: string | null;
		pipeline_stage_id: string;
		amount: string | null;
		currency_code: string | null;
		expected_close_date: string | null;
		actual_close_date: string | null;
		probability: string | null;
		owner_user_id: string | null;
		source: string | null;
		lost_reason: string | null;
		created_at: string;
	};
	type ComplianceHoldRow = {
		id: string;
		entity_id: string;
		held_table: string;
		held_record_id: string;
		hold_reason: string;
		status: string;
		placed_by: string;
		placed_at: string;
		resolved_at: string | null;
		resolution_notes: string | null;
	};
	type CrmCompanyRow = {
		id: string;
		entity_id: string;
		name: string;
		domain: string | null;
		industry: string | null;
		employee_count_range: string | null;
		annual_revenue_range: string | null;
		country_code: string | null;
		phone: string | null;
		website: string | null;
		customer_id: string | null;
		vendor_id: string | null;
		created_at: string;
	};
	type CrmContactRow = {
		id: string;
		entity_id: string;
		crm_company_id: string | null;
		first_name: string;
		last_name: string;
		email: string | null;
		phone: string | null;
		job_title: string | null;
		department: string | null;
		country_code: string | null;
		do_not_contact: boolean;
		created_at: string;
	};
	type PipelineStageRow = {
		id: string;
		entity_id: string;
		code: string;
		name: string;
		stage_order: string;
		win_probability: string | null;
		is_closed_won: boolean;
		is_closed_lost: boolean;
		created_at: string;
	};
	type FiscalYearRow = {
		id: string;
		entity_id: string;
		year_label: string;
		start_date: string;
		end_date: string;
		is_closed: boolean;
		created_at: string;
	};
	type FiscalPeriodRow = {
		id: string;
		entity_id: string;
		fiscal_year_id: string;
		period_number: string;
		period_label: string;
		start_date: string;
		end_date: string;
		status: string;
		created_at: string;
	};
	type InventoryLocationRow = {
		id: string;
		entity_id: string;
		location_code: string;
		name: string;
		is_active: boolean;
		created_at: string;
	};
	type ScreeningListRow = {
		id: string;
		code: string;
		name: string;
		source_authority: string | null;
		is_active: boolean;
		created_at: string;
	};
	type ScreeningListEntryRow = {
		id: string;
		screening_list_id: string;
		entry_name: string;
		country_codes: string[] | null;
		remarks: string | null;
		listed_date: string | null;
		created_at: string;
	};
	type CountryRestrictionRow = {
		id: string;
		entity_id: string;
		name: string;
		description: string | null;
		is_active: boolean;
		created_at: string;
	};
	type CountryRestrictionRuleRow = {
		id: string;
		country_restriction_id: string;
		country_code: string;
		restriction_type: string;
		effective_from: string | null;
		effective_to: string | null;
		notes: string | null;
		created_at: string;
	};
	type RestrictedRegionRow = {
		id: string;
		country_code: string;
		region_name: string;
		sanctions_regime: string | null;
		effective_date: string | null;
		source_authority: string | null;
		created_at: string;
	};
	type CurrencyRow = {
		code: string;
		name: string;
		symbol: string | null;
		decimal_places: string;
		is_active: boolean;
	};

	// ────────────────────────────────────────────────────────────────────────
	// Entity object types for queries
	// ────────────────────────────────────────────────────────────────────────

	const LegalEntityType = builder.objectRef<LegalEntityRow>("LegalEntity");
	LegalEntityType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			code: t.exposeString("code"),
			name: t.exposeString("name"),
			countryCode: t.exposeString("country_code"),
			baseCurrencyCode: t.exposeString("base_currency_code"),
			taxId: t.exposeString("tax_id", { nullable: true }),
			parentEntityId: t.exposeString("parent_entity_id", { nullable: true }),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const VendorType = builder.objectRef<VendorRow>("Vendor");
	VendorType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			vendorCode: t.exposeString("vendor_code"),
			legalName: t.exposeString("legal_name"),
			tradeName: t.exposeString("trade_name", { nullable: true }),
			countryCode: t.exposeString("country_code"),
			defaultCurrencyCode: t.exposeString("default_currency_code"),
			taxId: t.exposeString("tax_id", { nullable: true }),
			paymentTerms: t.exposeString("payment_terms", { nullable: true }),
			riskRating: t.exposeString("risk_rating", { nullable: true }),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const CustomerType = builder.objectRef<CustomerRow>("Customer");
	CustomerType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			customerCode: t.exposeString("customer_code"),
			legalName: t.exposeString("legal_name"),
			countryCode: t.exposeString("country_code"),
			defaultCurrencyCode: t.exposeString("default_currency_code"),
			notes: t.exposeString("notes", { nullable: true }),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const ProductType = builder.objectRef<ProductRow>("Product");
	ProductType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			productCode: t.exposeString("product_code"),
			name: t.exposeString("name"),
			description: t.exposeString("description", { nullable: true }),
			productType: t.exposeString("product_type"),
			unitOfMeasure: t.exposeString("unit_of_measure"),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const AccountType = builder.objectRef<AccountRow>("Account");
	AccountType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			accountNumber: t.exposeString("account_number"),
			name: t.exposeString("name"),
			accountType: t.exposeString("account_type"),
			normalBalance: t.exposeString("normal_balance"),
			isHeader: t.exposeBoolean("is_header"),
			isActive: t.exposeBoolean("is_active"),
		}),
	});

	const SalesOrderType = builder.objectRef<SalesOrderRow>("SalesOrder");
	SalesOrderType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			customerId: t.exposeString("customer_id"),
			orderNumber: t.exposeString("order_number"),
			orderDate: t.exposeString("order_date"),
			status: t.exposeString("status"),
			complianceStatus: t.exposeString("compliance_status", { nullable: true }),
			currencyCode: t.exposeString("currency_code"),
			totalAmount: t.exposeString("total_amount"),
			notes: t.exposeString("notes", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const PurchaseOrderType = builder.objectRef<PurchaseOrderRow>("PurchaseOrder");
	PurchaseOrderType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			vendorId: t.exposeString("vendor_id"),
			poNumber: t.exposeString("po_number"),
			poDate: t.exposeString("po_date"),
			expectedDeliveryDate: t.exposeString("expected_delivery_date", { nullable: true }),
			status: t.exposeString("status"),
			complianceStatus: t.exposeString("compliance_status", { nullable: true }),
			currencyCode: t.exposeString("currency_code"),
			totalAmount: t.exposeString("total_amount"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const JournalEntryType = builder.objectRef<JournalEntryRow>("JournalEntry");
	JournalEntryType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			entryNumber: t.exposeString("entry_number"),
			entryDate: t.exposeString("entry_date"),
			description: t.exposeString("description"),
			status: t.exposeString("status"),
			sourceModule: t.exposeString("source_module"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const OpportunityType = builder.objectRef<OpportunityRow>("Opportunity");
	OpportunityType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			crmCompanyId: t.exposeString("crm_company_id", { nullable: true }),
			customerId: t.exposeString("customer_id", { nullable: true }),
			name: t.exposeString("name"),
			description: t.exposeString("description", { nullable: true }),
			pipelineStageId: t.exposeString("pipeline_stage_id"),
			amount: t.exposeString("amount", { nullable: true }),
			currencyCode: t.exposeString("currency_code", { nullable: true }),
			expectedCloseDate: t.exposeString("expected_close_date", { nullable: true }),
			actualCloseDate: t.exposeString("actual_close_date", { nullable: true }),
			probability: t.exposeString("probability", { nullable: true }),
			ownerUserId: t.exposeString("owner_user_id", { nullable: true }),
			source: t.exposeString("source", { nullable: true }),
			lostReason: t.exposeString("lost_reason", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const ComplianceHoldType = builder.objectRef<ComplianceHoldRow>("ComplianceHold");
	ComplianceHoldType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			heldTable: t.exposeString("held_table"),
			heldRecordId: t.exposeString("held_record_id"),
			holdReason: t.exposeString("hold_reason"),
			status: t.exposeString("status"),
			placedBy: t.exposeString("placed_by"),
			placedAt: t.exposeString("placed_at"),
			resolvedAt: t.exposeString("resolved_at", { nullable: true }),
			resolutionNotes: t.exposeString("resolution_notes", { nullable: true }),
		}),
	});

	const CrmCompanyType = builder.objectRef<CrmCompanyRow>("CrmCompany");
	CrmCompanyType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			name: t.exposeString("name"),
			domain: t.exposeString("domain", { nullable: true }),
			industry: t.exposeString("industry", { nullable: true }),
			employeeCountRange: t.exposeString("employee_count_range", { nullable: true }),
			annualRevenueRange: t.exposeString("annual_revenue_range", { nullable: true }),
			countryCode: t.exposeString("country_code", { nullable: true }),
			phone: t.exposeString("phone", { nullable: true }),
			website: t.exposeString("website", { nullable: true }),
			customerId: t.exposeString("customer_id", { nullable: true }),
			vendorId: t.exposeString("vendor_id", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const CrmContactType = builder.objectRef<CrmContactRow>("CrmContact");
	CrmContactType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			crmCompanyId: t.exposeString("crm_company_id", { nullable: true }),
			firstName: t.exposeString("first_name"),
			lastName: t.exposeString("last_name"),
			email: t.exposeString("email", { nullable: true }),
			phone: t.exposeString("phone", { nullable: true }),
			jobTitle: t.exposeString("job_title", { nullable: true }),
			department: t.exposeString("department", { nullable: true }),
			countryCode: t.exposeString("country_code", { nullable: true }),
			doNotContact: t.exposeBoolean("do_not_contact"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const PipelineStageType = builder.objectRef<PipelineStageRow>("PipelineStage");
	PipelineStageType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			code: t.exposeString("code"),
			name: t.exposeString("name"),
			stageOrder: t.exposeString("stage_order"),
			winProbability: t.exposeString("win_probability", { nullable: true }),
			isClosedWon: t.exposeBoolean("is_closed_won"),
			isClosedLost: t.exposeBoolean("is_closed_lost"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const FiscalYearType = builder.objectRef<FiscalYearRow>("FiscalYear");
	FiscalYearType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			yearLabel: t.exposeString("year_label"),
			startDate: t.exposeString("start_date"),
			endDate: t.exposeString("end_date"),
			isClosed: t.exposeBoolean("is_closed"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const FiscalPeriodType = builder.objectRef<FiscalPeriodRow>("FiscalPeriod");
	FiscalPeriodType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			fiscalYearId: t.exposeString("fiscal_year_id"),
			periodNumber: t.exposeString("period_number"),
			periodLabel: t.exposeString("period_label"),
			startDate: t.exposeString("start_date"),
			endDate: t.exposeString("end_date"),
			status: t.exposeString("status"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const InventoryLocationType = builder.objectRef<InventoryLocationRow>("InventoryLocation");
	InventoryLocationType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			locationCode: t.exposeString("location_code"),
			name: t.exposeString("name"),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const ScreeningListType = builder.objectRef<ScreeningListRow>("ScreeningList");
	ScreeningListType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			code: t.exposeString("code"),
			name: t.exposeString("name"),
			sourceAuthority: t.exposeString("source_authority", { nullable: true }),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const ScreeningListEntryType = builder.objectRef<ScreeningListEntryRow>("ScreeningListEntry");
	ScreeningListEntryType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			screeningListId: t.exposeString("screening_list_id"),
			entryName: t.exposeString("entry_name"),
			countryCodes: t.exposeStringList("country_codes", { nullable: true }),
			remarks: t.exposeString("remarks", { nullable: true }),
			listedDate: t.exposeString("listed_date", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const CountryRestrictionType = builder.objectRef<CountryRestrictionRow>("CountryRestriction");
	CountryRestrictionType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			entityId: t.exposeString("entity_id"),
			name: t.exposeString("name"),
			description: t.exposeString("description", { nullable: true }),
			isActive: t.exposeBoolean("is_active"),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const CountryRestrictionRuleType =
		builder.objectRef<CountryRestrictionRuleRow>("CountryRestrictionRule");
	CountryRestrictionRuleType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			countryRestrictionId: t.exposeString("country_restriction_id"),
			countryCode: t.exposeString("country_code"),
			restrictionType: t.exposeString("restriction_type"),
			effectiveFrom: t.exposeString("effective_from", { nullable: true }),
			effectiveTo: t.exposeString("effective_to", { nullable: true }),
			notes: t.exposeString("notes", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const RestrictedRegionType = builder.objectRef<RestrictedRegionRow>("RestrictedRegion");
	RestrictedRegionType.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			countryCode: t.exposeString("country_code"),
			regionName: t.exposeString("region_name"),
			sanctionsRegime: t.exposeString("sanctions_regime", { nullable: true }),
			effectiveDate: t.exposeString("effective_date", { nullable: true }),
			sourceAuthority: t.exposeString("source_authority", { nullable: true }),
			createdAt: t.exposeString("created_at"),
		}),
	});

	const CurrencyType = builder.objectRef<CurrencyRow>("Currency");
	CurrencyType.implement({
		fields: (t) => ({
			code: t.exposeString("code"),
			name: t.exposeString("name"),
			symbol: t.exposeString("symbol", { nullable: true }),
			decimalPlaces: t.exposeString("decimal_places"),
			isActive: t.exposeBoolean("is_active"),
		}),
	});

	// ────────────────────────────────────────────────────────────────────────
	// Helper: run a query if DB is available, return empty if not
	// ────────────────────────────────────────────────────────────────────────
	async function dbQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
		if (!db) return [];
		const result = await db.query<T>(sql, params);
		return result.rows;
	}

	// ------------------------------------------------------------------ //
	// Query
	// ------------------------------------------------------------------ //

	builder.queryType({
		fields: (t) => ({
			_version: t.string({
				description: "API version",
				resolve: () => "0.0.1",
			}),

			// ── Legal Entities ──────────────────────────────────────────
			legalEntities: t.field({
				type: [LegalEntityType],
				args: { pagination: t.arg({ type: PaginationInput, required: false }) },
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<LegalEntityRow>(
						`SELECT id, code, name, country_code, base_currency_code, tax_id,
						        parent_entity_id, is_active, created_at::text
						 FROM legal_entity WHERE deleted_at IS NULL
						 ORDER BY code LIMIT $1 OFFSET $2`,
						[limit, offset],
					);
				},
			}),

			legalEntity: t.field({
				type: LegalEntityType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<LegalEntityRow>(
						`SELECT id, code, name, country_code, base_currency_code, tax_id,
						        parent_entity_id, is_active, created_at::text
						 FROM legal_entity WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Vendors ─────────────────────────────────────────────────
			vendors: t.field({
				type: [VendorType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<VendorRow>(
						`SELECT id, entity_id, vendor_code, legal_name, trade_name,
						        country_code, default_currency_code, tax_id,
						        payment_terms, risk_rating, is_active, created_at::text
						 FROM vendor WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY vendor_code LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			vendor: t.field({
				type: VendorType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<VendorRow>(
						`SELECT id, entity_id, vendor_code, legal_name, trade_name,
						        country_code, default_currency_code, tax_id,
						        payment_terms, risk_rating, is_active, created_at::text
						 FROM vendor WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Customers ───────────────────────────────────────────────
			customers: t.field({
				type: [CustomerType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CustomerRow>(
						`SELECT id, entity_id, customer_code, legal_name,
						        country_code, default_currency_code, notes,
						        is_active, created_at::text
						 FROM customer WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY customer_code LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			customer: t.field({
				type: CustomerType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<CustomerRow>(
						`SELECT id, entity_id, customer_code, legal_name,
						        country_code, default_currency_code, notes,
						        is_active, created_at::text
						 FROM customer WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Products ────────────────────────────────────────────────
			products: t.field({
				type: [ProductType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<ProductRow>(
						`SELECT id, entity_id, product_code, name, description,
						        product_type, unit_of_measure, is_active, created_at::text
						 FROM product WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY product_code LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Accounts (Chart of Accounts) ────────────────────────────
			accounts: t.field({
				type: [AccountType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 200;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<AccountRow>(
						`SELECT id, entity_id, account_number, name, account_type,
						        normal_balance, is_header, is_active
						 FROM account WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY account_number LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Sales Orders ────────────────────────────────────────────
			salesOrders: t.field({
				type: [SalesOrderType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<SalesOrderRow>(
						`SELECT id, entity_id, customer_id, order_number,
						        order_date::text, status, compliance_status,
						        currency_code, total_amount::text, notes, created_at::text
						 FROM sales_order WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY order_number DESC LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			salesOrder: t.field({
				type: SalesOrderType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<SalesOrderRow>(
						`SELECT id, entity_id, customer_id, order_number,
						        order_date::text, status, compliance_status,
						        currency_code, total_amount::text, notes, created_at::text
						 FROM sales_order WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Purchase Orders ─────────────────────────────────────────
			purchaseOrders: t.field({
				type: [PurchaseOrderType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<PurchaseOrderRow>(
						`SELECT id, entity_id, vendor_id, po_number,
						        po_date::text, expected_delivery_date::text,
						        status, compliance_status,
						        currency_code, total_amount::text, created_at::text
						 FROM purchase_order WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY po_number DESC LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			purchaseOrder: t.field({
				type: PurchaseOrderType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<PurchaseOrderRow>(
						`SELECT id, entity_id, vendor_id, po_number,
						        po_date::text, expected_delivery_date::text,
						        status, compliance_status,
						        currency_code, total_amount::text, created_at::text
						 FROM purchase_order WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Journal Entries ──────────────────────────────────────────
			journalEntries: t.field({
				type: [JournalEntryType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<JournalEntryRow>(
						`SELECT id, entity_id, entry_number, entry_date::text,
						        description, status, source_module, created_at::text
						 FROM journal_entry WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY entry_number DESC LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			journalEntry: t.field({
				type: JournalEntryType,
				nullable: true,
				args: { id: t.arg.string({ required: true }) },
				resolve: async (_root, args) => {
					const rows = await dbQuery<JournalEntryRow>(
						`SELECT id, entity_id, entry_number, entry_date::text,
						        description, status, source_module, created_at::text
						 FROM journal_entry WHERE id = $1 AND deleted_at IS NULL`,
						[args.id],
					);
					return rows[0] ?? null;
				},
			}),

			// ── Opportunities (CRM) ─────────────────────────────────────
			opportunities: t.field({
				type: [OpportunityType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<OpportunityRow>(
						`SELECT id, entity_id, crm_company_id, customer_id, name,
						        description, pipeline_stage_id, amount::text,
						        currency_code, expected_close_date::text,
						        actual_close_date::text, probability::text,
						        owner_user_id, source, lost_reason, created_at::text
						 FROM opportunity WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Compliance Holds ─────────────────────────────────────────
			complianceHolds: t.field({
				type: [ComplianceHoldType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<ComplianceHoldRow>(
						`SELECT id, entity_id, held_table, held_record_id, hold_reason,
						        status, placed_by, placed_at::text, resolved_at::text,
						        resolution_notes
						 FROM compliance_hold WHERE entity_id = $1
						 ORDER BY placed_at DESC LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── CRM Companies ───────────────────────────────────────────
			crmCompanies: t.field({
				type: [CrmCompanyType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CrmCompanyRow>(
						`SELECT id, entity_id, name, domain, industry,
						        employee_count_range, annual_revenue_range,
						        country_code, phone, website, customer_id,
						        vendor_id, created_at::text
						 FROM crm_company WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY name LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── CRM Contacts ────────────────────────────────────────────
			crmContacts: t.field({
				type: [CrmContactType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CrmContactRow>(
						`SELECT id, entity_id, crm_company_id, first_name, last_name,
						        email, phone, job_title, department, country_code,
						        do_not_contact, created_at::text
						 FROM crm_contact WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY last_name, first_name LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Pipeline Stages ─────────────────────────────────────────
			pipelineStages: t.field({
				type: [PipelineStageType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<PipelineStageRow>(
						`SELECT id, entity_id, code, name, stage_order::text,
						        win_probability::text, is_closed_won, is_closed_lost,
						        created_at::text
						 FROM pipeline_stage WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY stage_order LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Fiscal Years ────────────────────────────────────────────
			fiscalYears: t.field({
				type: [FiscalYearType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<FiscalYearRow>(
						`SELECT id, entity_id, year_label, start_date::text,
						        end_date::text, is_closed, created_at::text
						 FROM fiscal_year WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY year_label LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Fiscal Periods ──────────────────────────────────────────
			fiscalPeriods: t.field({
				type: [FiscalPeriodType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<FiscalPeriodRow>(
						`SELECT id, entity_id, fiscal_year_id, period_number::text,
						        period_label, start_date::text, end_date::text,
						        status, created_at::text
						 FROM fiscal_period WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY period_number LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Inventory Locations ─────────────────────────────────────
			inventoryLocations: t.field({
				type: [InventoryLocationType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<InventoryLocationRow>(
						`SELECT id, entity_id, location_code, name, is_active,
						        created_at::text
						 FROM inventory_location WHERE entity_id = $1 AND deleted_at IS NULL
						 ORDER BY location_code LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Screening Lists (global) ────────────────────────────────
			screeningLists: t.field({
				type: [ScreeningListType],
				args: {
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<ScreeningListRow>(
						`SELECT id, code, name, source_authority, is_active,
						        created_at::text
						 FROM screening_list WHERE deleted_at IS NULL
						 ORDER BY code LIMIT $1 OFFSET $2`,
						[limit, offset],
					);
				},
			}),

			// ── Screening List Entries ───────────────────────────────────
			screeningListEntries: t.field({
				type: [ScreeningListEntryType],
				args: {
					screeningListId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<ScreeningListEntryRow>(
						`SELECT id, screening_list_id, entry_name, country_codes,
						        remarks, listed_date::text, created_at::text
						 FROM screening_list_entry WHERE screening_list_id = $1
						        AND deleted_at IS NULL
						 ORDER BY entry_name LIMIT $2 OFFSET $3`,
						[args.screeningListId, limit, offset],
					);
				},
			}),

			// ── Country Restrictions ────────────────────────────────────
			countryRestrictions: t.field({
				type: [CountryRestrictionType],
				args: {
					entityId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CountryRestrictionRow>(
						`SELECT id, entity_id, name, description, is_active,
						        created_at::text
						 FROM country_restriction WHERE entity_id = $1
						        AND deleted_at IS NULL
						 ORDER BY name LIMIT $2 OFFSET $3`,
						[args.entityId, limit, offset],
					);
				},
			}),

			// ── Country Restriction Rules ───────────────────────────────
			countryRestrictionRules: t.field({
				type: [CountryRestrictionRuleType],
				args: {
					countryRestrictionId: t.arg.string({ required: true }),
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CountryRestrictionRuleRow>(
						`SELECT id, country_restriction_id, country_code,
						        restriction_type, effective_from::text,
						        effective_to::text, notes, created_at::text
						 FROM country_restriction_rule
						 WHERE country_restriction_id = $1 AND deleted_at IS NULL
						 ORDER BY country_code LIMIT $2 OFFSET $3`,
						[args.countryRestrictionId, limit, offset],
					);
				},
			}),

			// ── Restricted Regions (global) ─────────────────────────────
			restrictedRegions: t.field({
				type: [RestrictedRegionType],
				args: {
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 50;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<RestrictedRegionRow>(
						`SELECT id, country_code, region_name, sanctions_regime,
						        effective_date::text, source_authority, created_at::text
						 FROM restricted_region WHERE deleted_at IS NULL
						 ORDER BY country_code, region_name LIMIT $1 OFFSET $2`,
						[limit, offset],
					);
				},
			}),

			// ── Currencies (global) ─────────────────────────────────────
			currencies: t.field({
				type: [CurrencyType],
				args: {
					pagination: t.arg({ type: PaginationInput, required: false }),
				},
				resolve: async (_root, args) => {
					const limit = args.pagination?.limit ?? 200;
					const offset = args.pagination?.offset ?? 0;
					return dbQuery<CurrencyRow>(
						`SELECT code, name, symbol, decimal_places::text, is_active
						 FROM currency
						 ORDER BY code LIMIT $1 OFFSET $2`,
						[limit, offset],
					);
				},
			}),
		}),
	});

	// ------------------------------------------------------------------ //
	// Object types
	// ------------------------------------------------------------------ //

	/**
	 * VendorResult — returned by createVendor mutation.
	 */
	const VendorResult = builder.objectRef<{ id: string; name: string }>("VendorResult");
	VendorResult.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			name: t.exposeString("name"),
		}),
	});

	const JournalEntryResult = builder.objectRef<{ id: string; reference: string }>(
		"JournalEntryResult",
	);
	JournalEntryResult.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			reference: t.exposeString("reference"),
		}),
	});

	/**
	 * POApprovalResult — returned by approvePurchaseOrder mutation.
	 * Carries the new PO status and compliance screening outcome.
	 */
	const POApprovalResultGQL = builder.objectRef<{
		poId: string;
		newStatus: string;
		screeningOutcome: string;
		holdId: string | null;
	}>("POApprovalResult");
	POApprovalResultGQL.implement({
		fields: (t) => ({
			poId: t.exposeString("poId"),
			newStatus: t.exposeString("newStatus"),
			screeningOutcome: t.exposeString("screeningOutcome"),
			holdId: t.exposeString("holdId", { nullable: true }),
		}),
	});

	const POStatusResultGQL = builder.objectRef<{ poId: string; newStatus: string }>(
		"POStatusResult",
	);
	POStatusResultGQL.implement({
		fields: (t) => ({
			poId: t.exposeString("poId"),
			newStatus: t.exposeString("newStatus"),
		}),
	});

	// ------------------------------------------------------------------ //
	// Input types
	// ------------------------------------------------------------------ //

	const _VendorAddressInput = builder.inputType("VendorAddressInput", {
		fields: (t) => ({
			line1: t.string({ required: true }),
			line2: t.string({ required: false }),
			city: t.string({ required: true }),
			region: t.string({ required: false }),
			postalCode: t.string({ required: false }),
			countryCode: t.string({ required: true }),
		}),
	});

	const CreateVendorInput_GQL = builder.inputType("CreateVendorInput", {
		fields: (t) => ({
			entityId: t.string({ required: true }),
			vendorCode: t.string({ required: true }),
			legalName: t.string({ required: true }),
			tradeName: t.string({ required: false }),
			countryCode: t.string({ required: true }),
			defaultCurrencyCode: t.string({ required: true }),
			taxId: t.string({ required: false }),
			paymentTerms: t.string({ required: false }),
			defaultPaymentMethod: t.string({ required: false }),
			riskRating: t.string({ required: false }),
			website: t.string({ required: false }),
			notes: t.string({ required: false }),
		}),
	});

	type JournalLineGQLInput = CreateJournalEntryInput["lines"][number];

	const JournalLineInput_GQL = builder.inputType("JournalLineInput", {
		fields: (t) => ({
			accountId: t.string({ required: true }),
			type: t.string({ required: true }),
			amount: t.string({ required: true }),
			currencyCode: t.string({ required: true }),
			description: t.string({ required: false }),
		}),
	});

	const CreateJournalEntryInput_GQL = builder.inputType("CreateJournalEntryInput", {
		fields: (t) => ({
			legalEntityId: t.string({ required: true }),
			fiscalPeriodId: t.string({ required: true }),
			entryDate: t.string({ required: true }),
			reference: t.string({ required: true }),
			description: t.string({ required: true }),
			lines: t.field({ type: [JournalLineInput_GQL], required: true }),
			attachmentIds: t.stringList({ required: false }),
		}),
	});

	const ApprovePurchaseOrderInput_GQL = builder.inputType("ApprovePurchaseOrderInput", {
		fields: (t) => ({
			id: t.string({ required: true }),
			approverId: t.string({ required: true }),
			notes: t.string({ required: false }),
		}),
	});

	const SubmitPurchaseOrderInput_GQL = builder.inputType("SubmitPurchaseOrderInput", {
		fields: (t) => ({
			id: t.string({ required: true }),
			submittedBy: t.string({ required: true }),
		}),
	});

	const SendPurchaseOrderInput_GQL = builder.inputType("SendPurchaseOrderInput", {
		fields: (t) => ({
			id: t.string({ required: true }),
			sentBy: t.string({ required: true }),
		}),
	});

	// ------------------------------------------------------------------ //
	// Mutations
	// ------------------------------------------------------------------ //

	builder.mutationType({
		fields: (t) => ({
			/**
			 * createVendor — Layer 1 validation via CreateVendorSchema from @apogee/shared.
			 * The same schema the frontend VendorForm uses via useZodForm(CreateVendorSchema).
			 * Changing CreateVendorSchema will break this resolver at compile time.
			 */
			createVendor: t.field({
				type: VendorResult,
				args: {
					input: t.arg({ type: CreateVendorInput_GQL, required: true }),
				},
				resolve: (_root, args) => {
					const validated: CreateVendorInput = validateInput(CreateVendorSchema, args.input);
					return {
						id: crypto.randomUUID(),
						name: validated.legalName,
					};
				},
			}),

			/**
			 * createJournalEntry — posts a double-entry journal entry to the GL.
			 *
			 * Validation layers:
			 * - Layer 1 (structural): CreateJournalEntrySchema (Zod) — balance, line types, etc.
			 * - Layer 2 (business):   GLEngine — period open check, account validation.
			 *
			 * The GL engine uses the injected GLRepository (real DB when databaseUrl is set,
			 * in-memory stub otherwise).
			 *
			 * Ref: SD-003-WP2 FIN-002, hx-152c4f71
			 */
			createJournalEntry: t.field({
				type: JournalEntryResult,
				args: {
					input: t.arg({ type: CreateJournalEntryInput_GQL, required: true }),
				},
				resolve: async (_root, args) => {
					const rawInput = {
						...args.input,
						lines: (args.input.lines as JournalLineGQLInput[]).map((l) => ({
							accountId: l.accountId,
							type: l.type,
							amount: l.amount,
							currencyCode: l.currencyCode,
							description: l.description ?? undefined,
						})),
					};
					const validated: CreateJournalEntryInput = validateInput(
						CreateJournalEntrySchema,
						rawInput,
					);

					let entryCounter = 0;
					const ctx = {
						actorId: crypto.randomUUID() as UUID,
						actorEmail: "system@apogee.internal",
						entityCurrencyCode: "USD",
						generateEntryNumber: async () => {
							entryCounter += 1;
							const year = new Date().getFullYear();
							return `JE-${year}-${entryCounter.toString().padStart(5, "0")}`;
						},
					};

					const result = await postJournalEntry(validated, ctx, glRepo);
					return {
						id: crypto.randomUUID(),
						reference: result.entry.reference,
					};
				},
			}),

			/**
			 * submitPurchaseOrderForApproval — transitions a DRAFT PO to PENDING_APPROVAL.
			 * Layer 1: structural validation via SubmitPurchaseOrderSchema.
			 * Layer 2: state machine enforced by submitForApproval() workflow function.
			 */
			submitPurchaseOrderForApproval: t.field({
				type: POStatusResultGQL,
				args: {
					input: t.arg({ type: SubmitPurchaseOrderInput_GQL, required: true }),
				},
				resolve: (_root, args) => {
					validateInput(SubmitPurchaseOrderSchema, args.input);
					// Stub PO snapshot — production would load from DB
					const po: POSnapshot = {
						id: args.input.id,
						entityId: crypto.randomUUID(),
						vendorId: crypto.randomUUID(),
						vendorName: "Unknown Vendor",
						status: "DRAFT",
					};
					const result = submitForApproval(po);
					return { poId: args.input.id, newStatus: result.newStatus };
				},
			}),

			/**
			 * approvePurchaseOrder — transitions PENDING_APPROVAL → APPROVED or ON_HOLD.
			 *
			 * On approval, triggers vendor denied-party screening (WP-3 compliance gate).
			 * If the vendor matches a denied-party list entry, the PO is placed ON_HOLD
			 * and a compliance hold record is created instead of approving.
			 *
			 * SCM-001: "PO approval triggers vendor denied-party screening; PO held if flagged"
			 */
			approvePurchaseOrder: t.field({
				type: POApprovalResultGQL,
				args: {
					input: t.arg({ type: ApprovePurchaseOrderInput_GQL, required: true }),
				},
				resolve: (_root, args) => {
					validateInput(ApprovePurchaseOrderSchema, args.input);
					// Stub PO snapshot — production would load from DB including vendor name
					const po: POSnapshot = {
						id: args.input.id,
						entityId: crypto.randomUUID(),
						vendorId: crypto.randomUUID(),
						vendorName: "Stub Vendor",
						status: "PENDING_APPROVAL",
					};
					const result = approve(po, args.input.approverId);
					return {
						poId: args.input.id,
						newStatus: result.newStatus,
						screeningOutcome: result.screening.outcome,
						holdId: result.holdId,
					};
				},
			}),

			/**
			 * sendPurchaseOrder — transitions APPROVED → SENT.
			 */
			sendPurchaseOrder: t.field({
				type: POStatusResultGQL,
				args: {
					input: t.arg({ type: SendPurchaseOrderInput_GQL, required: true }),
				},
				resolve: (_root, args) => {
					validateInput(SendPurchaseOrderSchema, args.input);
					// Stub PO snapshot — production would load from DB
					const po: POSnapshot = {
						id: args.input.id,
						entityId: crypto.randomUUID(),
						vendorId: crypto.randomUUID(),
						vendorName: "Stub Vendor",
						status: "APPROVED",
					};
					const result = send(po);
					return { poId: args.input.id, newStatus: result.newStatus };
				},
			}),
		}),
	});

	return builder.toSchema();
}

/**
 * Default schema instance using the in-memory stub GLRepository.
 * Used by tests that don't wire a real database.
 */
export const schema = buildSchema();
