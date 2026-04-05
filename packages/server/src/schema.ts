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
 * @param glRepo  GLRepository implementation. Defaults to the in-memory stub
 *                when omitted (useful for tests without a real DB).
 */
export function buildSchema(glRepo: GLRepository = stubGLRepository): ReturnType<typeof _build> {
	return _build(glRepo);
}

function _build(glRepo: GLRepository) {
	const builder = new SchemaBuilder<{
		Context: Record<string, never>;
	}>({});

	// ------------------------------------------------------------------ //
	// Query
	// ------------------------------------------------------------------ //

	builder.queryType({
		fields: (t) => ({
			_version: t.string({
				description: "API version",
				resolve: () => "0.0.1",
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

	const VendorAddressInput = builder.inputType("VendorAddressInput", {
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
			name: t.string({ required: true }),
			legalName: t.string({ required: true }),
			vendorType: t.string({ required: true }),
			taxId: t.string({ required: false }),
			countryCode: t.string({ required: true }),
			currencyCode: t.string({ required: true }),
			paymentTerms: t.string({ required: true }),
			email: t.string({ required: false }),
			phone: t.string({ required: false }),
			address: t.field({ type: VendorAddressInput, required: false }),
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
