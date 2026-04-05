/**
 * Zod schemas for Journal Entry entity — shared by Pothos resolvers and React Hook Form.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 *
 * Layer 1 (structural) validation only. Layer 2 (state-dependent: fiscal period
 * OPEN/SOFT_CLOSED check, duplicate detection) runs server-side.
 *
 * Critical Layer 1 invariant: debits must equal credits (balanced journal entry).
 */
import { z } from "zod";
import { CurrencyCodeSchema, UUIDSchema } from "../schemas.js";
import { MoneyAmountSchema } from "../schemas.js";

const JOURNAL_LINE_TYPES = ["DEBIT", "CREDIT"] as const;

export const JournalLineSchema = z.object({
	accountId: UUIDSchema,
	type: z.enum(JOURNAL_LINE_TYPES, { error: "Line type must be DEBIT or CREDIT" }),
	amount: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
	description: z.string().max(500, "Line description must be 500 characters or fewer").optional(),
});

export type JournalLineInput = z.infer<typeof JournalLineSchema>;

/**
 * Validates that the journal entry is balanced: sum of debits equals sum of credits.
 * Uses string comparison to avoid floating-point errors (amounts are NUMERIC(19,6) strings).
 */
function isBalanced(lines: JournalLineInput[]): boolean {
	// Sum as integer cents (multiply by 1_000_000 to handle up to 6 decimal places)
	let debitTotal = BigInt(0);
	let creditTotal = BigInt(0);
	for (const line of lines) {
		const [intPart = "0", decPart = ""] = line.amount.split(".");
		const padded = decPart.padEnd(6, "0");
		const micro = BigInt(intPart) * BigInt(1_000_000) + BigInt(padded);
		if (line.type === "DEBIT") {
			debitTotal += micro;
		} else {
			creditTotal += micro;
		}
	}
	return debitTotal === creditTotal;
}

export const CreateJournalEntrySchema = z
	.object({
		legalEntityId: UUIDSchema,
		fiscalPeriodId: UUIDSchema,
		entryDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		reference: z
			.string()
			.min(1, "Reference is required")
			.max(100, "Reference must be 100 characters or fewer"),
		description: z
			.string()
			.min(1, "Description is required")
			.max(1000, "Description must be 1000 characters or fewer"),
		lines: z
			.array(JournalLineSchema)
			.min(2, "A journal entry must have at least 2 lines")
			.max(200, "Cannot exceed 200 journal lines"),
		attachmentIds: z.array(UUIDSchema).max(20, "Cannot attach more than 20 files").optional(),
	})
	.refine((data) => isBalanced(data.lines), {
		message: "Journal entry must be balanced: total debits must equal total credits",
		path: ["lines"],
	})
	.refine(
		(data) => {
			const hasDebit = data.lines.some((l) => l.type === "DEBIT");
			const hasCredit = data.lines.some((l) => l.type === "CREDIT");
			return hasDebit && hasCredit;
		},
		{
			message: "Journal entry must have at least one debit and one credit line",
			path: ["lines"],
		},
	);

export type CreateJournalEntryInput = z.infer<typeof CreateJournalEntrySchema>;

export const UpdateJournalEntrySchema = z.object({
	id: UUIDSchema,
	description: z
		.string()
		.min(1, "Description is required")
		.max(1000, "Description must be 1000 characters or fewer")
		.optional(),
	attachmentIds: z.array(UUIDSchema).max(20, "Cannot attach more than 20 files").optional(),
});

export type UpdateJournalEntryInput = z.infer<typeof UpdateJournalEntrySchema>;
