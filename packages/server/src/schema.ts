import {
	type CreateJournalEntryInput,
	CreateJournalEntrySchema,
	type CreateVendorInput,
	CreateVendorSchema,
} from "@apogee/shared";
/**
 * Pothos schema — code-first GraphQL schema with full TypeScript inference.
 *
 * Mutations validate against the same Zod schemas as the frontend forms
 * per ADR-010. Changing a schema in @apogee/shared causes a TypeScript
 * compile error here — the compile-time guarantee of no silent drift.
 */
import SchemaBuilder from "@pothos/core";
import { validateInput } from "./validation.js";

export const builder = new SchemaBuilder<{
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
// Mutation — Vendor
// ------------------------------------------------------------------ //

/**
 * VendorResult — returned by createVendor mutation.
 * In a complete implementation this would query the database; here it
 * demonstrates that the input type is inferred from CreateVendorSchema.
 */
const VendorResult = builder.objectRef<{ id: string; name: string }>("VendorResult");
VendorResult.implement({
	fields: (t) => ({
		id: t.exposeString("id"),
		name: t.exposeString("name"),
	}),
});

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

// ------------------------------------------------------------------ //
// Mutation — Journal Entry
// ------------------------------------------------------------------ //

const JournalEntryResult = builder.objectRef<{ id: string; reference: string }>(
	"JournalEntryResult",
);
JournalEntryResult.implement({
	fields: (t) => ({
		id: t.exposeString("id"),
		reference: t.exposeString("reference"),
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
				// Layer 1: structural validation using the shared schema
				const validated: CreateVendorInput = validateInput(CreateVendorSchema, args.input);

				// Layer 2 (state-dependent) validation would happen here:
				//   - Denied-party screening against live screening lists (Tier 3)
				//   - Duplicate vendor detection
				// For now, stub a response demonstrating the validated shape is used.
				return {
					id: crypto.randomUUID(),
					name: validated.name,
				};
			},
		}),

		/**
		 * createJournalEntry — Layer 1 validation via CreateJournalEntrySchema.
		 * Includes balance check: debits must equal credits (enforced in shared schema).
		 * Changing the schema breaks this resolver at compile time.
		 */
		createJournalEntry: t.field({
			type: JournalEntryResult,
			args: {
				input: t.arg({ type: CreateJournalEntryInput_GQL, required: true }),
			},
			resolve: (_root, args) => {
				// Coerce lines to match the expected shape
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

				// Layer 1: structural validation + balance check using the shared schema
				const validated: CreateJournalEntryInput = validateInput(
					CreateJournalEntrySchema,
					rawInput,
				);

				// Layer 2 (state-dependent) validation would happen here:
				//   - Fiscal period OPEN/SOFT_CLOSED check
				//   - Duplicate journal entry detection
				return {
					id: crypto.randomUUID(),
					reference: validated.reference,
				};
			},
		}),
	}),
});

export const schema = builder.toSchema();
