/**
 * GL Engine unit tests.
 *
 * Covers FIN-002 (General Ledger) acceptance criteria from SD-003-WP2:
 * - Journal entries enforce double-entry invariant
 * - Period validation: OPEN/SOFT_CLOSED accepted, FUTURE/HARD_CLOSED rejected
 * - Account validation: must exist, be active, not be a header
 * - Reversal: swaps debit/credit, sets reversal_of_id, validates period
 * - Period close/reopen: valid and invalid state transitions
 *
 * Ref: SD-003-WP2 FIN-002, SD-002 §4.2, hx-152c4f71
 */

import { describe, expect, test } from "bun:test";
import type { CreateJournalEntryInput } from "@apogee/shared";
import {
	type FiscalPeriodSnapshot,
	type GLAccountSnapshot,
	GLError,
	type GLRepository,
	type JournalEntrySnapshot,
	type PostingContext,
	closePeriod,
	postJournalEntry,
	reopenPeriod,
	reverseJournalEntry,
} from "../../src/finance/gl-engine.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as const;
const PERIOD_OPEN_ID = "50000000-0000-0000-0000-000000000001" as const;
const PERIOD_SOFT_ID = "50000000-0000-0000-0000-000000000002" as const;
const PERIOD_HARD_ID = "50000000-0000-0000-0000-000000000003" as const;
const PERIOD_FUTURE_ID = "50000000-0000-0000-0000-000000000004" as const;
const ACCOUNT_CASH_ID = "40000000-0000-0000-0000-000000000001" as const;
const ACCOUNT_AP_ID = "40000000-0000-0000-0000-000000000002" as const;
const ACCOUNT_HEADER_ID = "40000000-0000-0000-0000-000000000003" as const;
const ACCOUNT_INACTIVE_ID = "40000000-0000-0000-0000-000000000004" as const;

const openPeriod: FiscalPeriodSnapshot = {
	id: PERIOD_OPEN_ID,
	entityId: ENTITY_ID,
	status: "OPEN",
	periodLabel: "Apr 2026",
};

const softClosedPeriod: FiscalPeriodSnapshot = {
	id: PERIOD_SOFT_ID,
	entityId: ENTITY_ID,
	status: "SOFT_CLOSED",
	periodLabel: "Mar 2026",
};

const hardClosedPeriod: FiscalPeriodSnapshot = {
	id: PERIOD_HARD_ID,
	entityId: ENTITY_ID,
	status: "HARD_CLOSED",
	periodLabel: "Feb 2026",
};

const futurePeriod: FiscalPeriodSnapshot = {
	id: PERIOD_FUTURE_ID,
	entityId: ENTITY_ID,
	status: "FUTURE",
	periodLabel: "May 2026",
};

const cashAccount: GLAccountSnapshot = {
	id: ACCOUNT_CASH_ID,
	entityId: ENTITY_ID,
	accountNumber: "1010",
	isHeader: false,
	isActive: true,
	currencyCode: null,
};

const apAccount: GLAccountSnapshot = {
	id: ACCOUNT_AP_ID,
	entityId: ENTITY_ID,
	accountNumber: "2010",
	isHeader: false,
	isActive: true,
	currencyCode: null,
};

const headerAccount: GLAccountSnapshot = {
	id: ACCOUNT_HEADER_ID,
	entityId: ENTITY_ID,
	accountNumber: "2000",
	isHeader: true,
	isActive: true,
	currencyCode: null,
};

const inactiveAccount: GLAccountSnapshot = {
	id: ACCOUNT_INACTIVE_ID,
	entityId: ENTITY_ID,
	accountNumber: "9000",
	isHeader: false,
	isActive: false,
	currencyCode: null,
};

const allAccounts = new Map<string, GLAccountSnapshot>([
	[ACCOUNT_CASH_ID, cashAccount],
	[ACCOUNT_AP_ID, apAccount],
	[ACCOUNT_HEADER_ID, headerAccount],
	[ACCOUNT_INACTIVE_ID, inactiveAccount],
]);

const allPeriods = new Map<string, FiscalPeriodSnapshot>([
	[PERIOD_OPEN_ID, openPeriod],
	[PERIOD_SOFT_ID, softClosedPeriod],
	[PERIOD_HARD_ID, hardClosedPeriod],
	[PERIOD_FUTURE_ID, futurePeriod],
]);

/** Build a stub GLRepository with configurable data. */
function makeRepo(opts: {
	periods?: Map<string, FiscalPeriodSnapshot>;
	accounts?: Map<string, GLAccountSnapshot>;
	entries?: Map<string, JournalEntrySnapshot>;
}): GLRepository {
	return {
		async findPeriod(entityId, periodId) {
			const period = opts.periods?.get(periodId) ?? null;
			if (period && period.entityId !== entityId) return null;
			return period;
		},
		async findAccounts(entityId, accountIds) {
			const result = new Map<string, GLAccountSnapshot>();
			for (const id of accountIds) {
				const account = opts.accounts?.get(id);
				if (account && account.entityId === entityId) {
					result.set(id, account);
				}
			}
			return result;
		},
		async findEntry(entityId, entryId) {
			const entry = opts.entries?.get(entryId) ?? null;
			if (entry && entry.entityId !== entityId) return null;
			return entry;
		},
	};
}

/** Default repo with all fixtures loaded. */
const defaultRepo = makeRepo({
	periods: allPeriods,
	accounts: allAccounts,
});

/** Posting context with a sequential counter for entry numbers. */
function makeCtx(prefix = "JE"): PostingContext {
	let counter = 0;
	return {
		actorId: ACTOR_ID,
		actorEmail: "finance@satco.example",
		entityCurrencyCode: "USD",
		generateEntryNumber: async () => {
			counter += 1;
			return `${prefix}-2026-${counter.toString().padStart(5, "0")}`;
		},
	};
}

/** Balanced 2-line journal entry: debit cash, credit AP. */
function makeBalancedInput(
	fiscalPeriodId = PERIOD_OPEN_ID,
	amount = "1000.000000",
): CreateJournalEntryInput {
	return {
		legalEntityId: ENTITY_ID,
		fiscalPeriodId,
		entryDate: "2026-04-01",
		reference: "REF-001",
		description: "Test journal entry",
		lines: [
			{
				accountId: ACCOUNT_CASH_ID,
				type: "DEBIT",
				amount,
				currencyCode: "USD",
			},
			{
				accountId: ACCOUNT_AP_ID,
				type: "CREDIT",
				amount,
				currencyCode: "USD",
			},
		],
	};
}

// ── postJournalEntry — happy path ─────────────────────────────────────────────

describe("postJournalEntry - happy path", () => {
	test("posts a balanced entry to an OPEN period", async () => {
		const result = await postJournalEntry(makeBalancedInput(), makeCtx(), defaultRepo);

		expect(result.entry.status).toBe("POSTED");
		expect(result.entry.fiscalPeriodId).toBe(PERIOD_OPEN_ID);
		expect(result.entry.entryNumber).toBe("JE-2026-00001");
		expect(result.entry.entityId).toBe(ENTITY_ID);
		expect(result.entry.reversalOfId).toBeNull();
		expect(result.entry.isAdjustment).toBe(false);
	});

	test("posts a balanced entry to a SOFT_CLOSED period (adjusting)", async () => {
		const result = await postJournalEntry(
			makeBalancedInput(PERIOD_SOFT_ID),
			makeCtx(),
			defaultRepo,
		);
		expect(result.entry.status).toBe("POSTED");
		expect(result.entry.fiscalPeriodId).toBe(PERIOD_SOFT_ID);
	});

	test("constructs correct line records: DEBIT line has debitAmount set", async () => {
		const result = await postJournalEntry(makeBalancedInput(), makeCtx(), defaultRepo);

		const debitLine = result.lines.find((l) => l.accountId === ACCOUNT_CASH_ID)!;
		const creditLine = result.lines.find((l) => l.accountId === ACCOUNT_AP_ID)!;

		expect(debitLine.debitAmount).toBe("1000.000000");
		expect(debitLine.creditAmount).toBe("0.000000");
		expect(creditLine.debitAmount).toBe("0.000000");
		expect(creditLine.creditAmount).toBe("1000.000000");
	});

	test("line numbers are 1-based and sequential", async () => {
		const result = await postJournalEntry(makeBalancedInput(), makeCtx(), defaultRepo);

		expect(result.lines[0]?.lineNumber).toBe(1);
		expect(result.lines[1]?.lineNumber).toBe(2);
	});

	test("postedBy is set from PostingContext.actorId", async () => {
		const result = await postJournalEntry(makeBalancedInput(), makeCtx(), defaultRepo);
		expect(result.entry.postedBy).toBe(ACTOR_ID);
		expect(result.entry.createdBy).toBe(ACTOR_ID);
	});

	test("generates unique entry numbers across multiple calls", async () => {
		const ctx = makeCtx();
		const r1 = await postJournalEntry(makeBalancedInput(), ctx, defaultRepo);
		const r2 = await postJournalEntry(makeBalancedInput(), ctx, defaultRepo);

		expect(r1.entry.entryNumber).toBe("JE-2026-00001");
		expect(r2.entry.entryNumber).toBe("JE-2026-00002");
	});
});

// ── postJournalEntry — period validation ──────────────────────────────────────

describe("postJournalEntry - period validation", () => {
	test("throws PERIOD_NOT_FOUND for an unknown period ID", async () => {
		const input = makeBalancedInput("99999999-0000-0000-0000-000000000001" as const);

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "PERIOD_NOT_FOUND",
		});
	});

	test("throws PERIOD_NOT_POSTABLE for a HARD_CLOSED period", async () => {
		const input = makeBalancedInput(PERIOD_HARD_ID);

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "PERIOD_NOT_POSTABLE",
		});
	});

	test("throws PERIOD_NOT_POSTABLE for a FUTURE period", async () => {
		const input = makeBalancedInput(PERIOD_FUTURE_ID);

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "PERIOD_NOT_POSTABLE",
		});
	});
});

// ── postJournalEntry — account validation ─────────────────────────────────────

describe("postJournalEntry - account validation", () => {
	test("throws ACCOUNT_NOT_FOUND for an unknown account ID", async () => {
		const input: CreateJournalEntryInput = {
			...makeBalancedInput(),
			lines: [
				{
					accountId: "99999999-0000-0000-0000-000000000001",
					type: "DEBIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
				{
					accountId: ACCOUNT_AP_ID,
					type: "CREDIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
			],
		};

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "ACCOUNT_NOT_FOUND",
		});
	});

	test("throws ACCOUNT_INACTIVE for an inactive account", async () => {
		const input: CreateJournalEntryInput = {
			...makeBalancedInput(),
			lines: [
				{
					accountId: ACCOUNT_INACTIVE_ID,
					type: "DEBIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
				{
					accountId: ACCOUNT_AP_ID,
					type: "CREDIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
			],
		};

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "ACCOUNT_INACTIVE",
		});
	});

	test("throws ACCOUNT_IS_HEADER when posting to a header/summary account", async () => {
		const input: CreateJournalEntryInput = {
			...makeBalancedInput(),
			lines: [
				{
					accountId: ACCOUNT_HEADER_ID,
					type: "DEBIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
				{
					accountId: ACCOUNT_AP_ID,
					type: "CREDIT",
					amount: "500.000000",
					currencyCode: "USD",
				},
			],
		};

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "ACCOUNT_IS_HEADER",
		});
	});
});

// ── postJournalEntry — balance validation ─────────────────────────────────────

describe("postJournalEntry - balance validation", () => {
	test("throws UNBALANCED_ENTRY when debits ≠ credits", async () => {
		const input: CreateJournalEntryInput = {
			...makeBalancedInput(),
			lines: [
				{
					accountId: ACCOUNT_CASH_ID,
					type: "DEBIT",
					amount: "1000.000000",
					currencyCode: "USD",
				},
				{
					accountId: ACCOUNT_AP_ID,
					type: "CREDIT",
					amount: "999.999999", // off by 1 micro-unit
					currencyCode: "USD",
				},
			],
		};

		await expect(postJournalEntry(input, makeCtx(), defaultRepo)).rejects.toMatchObject({
			code: "UNBALANCED_ENTRY",
		});
	});

	test("accepts entries balanced to 6 decimal places", async () => {
		const result = await postJournalEntry(
			makeBalancedInput(PERIOD_OPEN_ID, "1234567.123456"),
			makeCtx(),
			defaultRepo,
		);
		expect(result.entry.status).toBe("POSTED");
	});
});

// ── reverseJournalEntry ───────────────────────────────────────────────────────

describe("reverseJournalEntry", () => {
	const ORIGINAL_ENTRY_ID = "60000000-0000-0000-0000-000000000001" as const;

	const originalEntry: JournalEntrySnapshot = {
		id: ORIGINAL_ENTRY_ID,
		entityId: ENTITY_ID,
		status: "POSTED",
		entryNumber: "JE-2026-00001",
		fiscalPeriodId: PERIOD_OPEN_ID,
		lines: [
			{
				id: "70000000-0000-0000-0000-000000000001" as const,
				accountId: ACCOUNT_CASH_ID,
				description: "Cash debit",
				debitAmount: "1000.000000",
				creditAmount: "0.000000",
				currencyCode: "USD",
				exchangeRate: "1.000000",
				baseDebitAmount: "1000.000000",
				baseCreditAmount: "0.000000",
			},
			{
				id: "70000000-0000-0000-0000-000000000002" as const,
				accountId: ACCOUNT_AP_ID,
				description: "AP credit",
				debitAmount: "0.000000",
				creditAmount: "1000.000000",
				currencyCode: "USD",
				exchangeRate: "1.000000",
				baseDebitAmount: "0.000000",
				baseCreditAmount: "1000.000000",
			},
		],
	};

	const repoWithEntry = makeRepo({
		periods: allPeriods,
		accounts: allAccounts,
		entries: new Map([[ORIGINAL_ENTRY_ID, originalEntry]]),
	});

	test("creates a reversal entry with swapped debits and credits", async () => {
		const result = await reverseJournalEntry(
			ORIGINAL_ENTRY_ID,
			ENTITY_ID,
			PERIOD_OPEN_ID,
			"2026-04-15",
			makeCtx(),
			repoWithEntry,
		);

		expect(result.entry.reversalOfId).toBe(ORIGINAL_ENTRY_ID);
		expect(result.entry.isAdjustment).toBe(true);
		expect(result.entry.status).toBe("POSTED");

		// Line amounts are swapped
		const cashLine = result.lines.find((l) => l.accountId === ACCOUNT_CASH_ID)!;
		const apLine = result.lines.find((l) => l.accountId === ACCOUNT_AP_ID)!;

		// Original cash line was DEBIT 1000 — reversal is CREDIT 1000
		expect(cashLine.debitAmount).toBe("0.000000");
		expect(cashLine.creditAmount).toBe("1000.000000");

		// Original AP line was CREDIT 1000 — reversal is DEBIT 1000
		expect(apLine.debitAmount).toBe("1000.000000");
		expect(apLine.creditAmount).toBe("0.000000");
	});

	test("reversal description references original entry number", async () => {
		const result = await reverseJournalEntry(
			ORIGINAL_ENTRY_ID,
			ENTITY_ID,
			PERIOD_OPEN_ID,
			"2026-04-15",
			makeCtx(),
			repoWithEntry,
		);

		expect(result.entry.description).toContain("JE-2026-00001");
		expect(result.entry.reference).toBe("REV-JE-2026-00001");
	});

	test("throws ENTRY_NOT_FOUND if entry does not exist", async () => {
		await expect(
			reverseJournalEntry(
				"99999999-0000-0000-0000-000000000001" as const,
				ENTITY_ID,
				PERIOD_OPEN_ID,
				"2026-04-15",
				makeCtx(),
				defaultRepo,
			),
		).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
	});

	test("throws ENTRY_NOT_REVERSIBLE if entry is not POSTED", async () => {
		const draftEntry: JournalEntrySnapshot = { ...originalEntry, status: "DRAFT" };
		const repo = makeRepo({
			periods: allPeriods,
			accounts: allAccounts,
			entries: new Map([[ORIGINAL_ENTRY_ID, draftEntry]]),
		});

		await expect(
			reverseJournalEntry(
				ORIGINAL_ENTRY_ID,
				ENTITY_ID,
				PERIOD_OPEN_ID,
				"2026-04-15",
				makeCtx(),
				repo,
			),
		).rejects.toMatchObject({ code: "ENTRY_NOT_REVERSIBLE" });
	});

	test("throws PERIOD_NOT_POSTABLE if reversal period is HARD_CLOSED", async () => {
		await expect(
			reverseJournalEntry(
				ORIGINAL_ENTRY_ID,
				ENTITY_ID,
				PERIOD_HARD_ID,
				"2026-04-15",
				makeCtx(),
				repoWithEntry,
			),
		).rejects.toMatchObject({ code: "PERIOD_NOT_POSTABLE" });
	});
});

// ── closePeriod ───────────────────────────────────────────────────────────────

describe("closePeriod", () => {
	test("OPEN → SOFT_CLOSED succeeds", () => {
		const result = closePeriod(openPeriod, "SOFT_CLOSED");
		expect(result.previousStatus).toBe("OPEN");
		expect(result.newStatus).toBe("SOFT_CLOSED");
		expect(result.periodId).toBe(PERIOD_OPEN_ID);
	});

	test("OPEN → HARD_CLOSED succeeds", () => {
		const result = closePeriod(openPeriod, "HARD_CLOSED");
		expect(result.newStatus).toBe("HARD_CLOSED");
	});

	test("SOFT_CLOSED → HARD_CLOSED succeeds", () => {
		const result = closePeriod(softClosedPeriod, "HARD_CLOSED");
		expect(result.previousStatus).toBe("SOFT_CLOSED");
		expect(result.newStatus).toBe("HARD_CLOSED");
	});

	test("HARD_CLOSED → SOFT_CLOSED throws INVALID_PERIOD_TRANSITION", () => {
		try {
			closePeriod(hardClosedPeriod, "SOFT_CLOSED");
			throw new Error("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(GLError);
			expect((e as GLError).code).toBe("INVALID_PERIOD_TRANSITION");
		}
	});

	test("HARD_CLOSED → HARD_CLOSED throws INVALID_PERIOD_TRANSITION", () => {
		expect(() => closePeriod(hardClosedPeriod, "HARD_CLOSED")).toThrow(GLError);
	});

	test("FUTURE → HARD_CLOSED throws INVALID_PERIOD_TRANSITION", () => {
		expect(() => closePeriod(futurePeriod, "HARD_CLOSED")).toThrow(GLError);
	});
});

// ── reopenPeriod ──────────────────────────────────────────────────────────────

describe("reopenPeriod", () => {
	test("SOFT_CLOSED → OPEN succeeds", () => {
		const result = reopenPeriod(softClosedPeriod);
		expect(result.previousStatus).toBe("SOFT_CLOSED");
		expect(result.newStatus).toBe("OPEN");
	});

	test("OPEN → reopen throws INVALID_PERIOD_REOPEN", () => {
		try {
			reopenPeriod(openPeriod);
			throw new Error("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(GLError);
			expect((e as GLError).code).toBe("INVALID_PERIOD_REOPEN");
		}
	});

	test("HARD_CLOSED → reopen throws INVALID_PERIOD_REOPEN (irreversible)", () => {
		expect(() => reopenPeriod(hardClosedPeriod)).toThrow(GLError);
	});

	test("FUTURE → reopen throws INVALID_PERIOD_REOPEN", () => {
		expect(() => reopenPeriod(futurePeriod)).toThrow(GLError);
	});
});
