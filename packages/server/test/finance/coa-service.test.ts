/**
 * COA Service unit tests.
 *
 * Covers FIN-001 (Chart of Accounts) acceptance criteria:
 * - Account number uniqueness within entity
 * - Parent must be a header account in the same entity
 * - Header accounts with children cannot be deactivated or demoted
 * - Circular parent reference detection
 *
 * Ref: SD-003-WP2 FIN-001, hx-152c4f71
 */

import { describe, expect, test } from "bun:test";
import type { CreateAccountInput, UpdateAccountInput } from "@apogee/shared";
import {
	type AccountSnapshot,
	COAError,
	type COARepository,
	canonicalNormalBalance,
	createAccount,
	updateAccount,
} from "../../src/finance/coa-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_A = "10000000-0000-0000-0000-000000000001" as const;
const ENTITY_B = "10000000-0000-0000-0000-000000000002" as const;
const ACTOR_ID = "30000000-0000-0000-0000-000000000001" as const;
const ACCOUNT_HEADER_ID = "40000000-0000-0000-0000-000000000001" as const;
const ACCOUNT_LEAF_ID = "40000000-0000-0000-0000-000000000002" as const;

const headerAccount: AccountSnapshot = {
	id: ACCOUNT_HEADER_ID,
	entityId: ENTITY_A,
	accountNumber: "1000",
	accountType: "ASSET",
	normalBalance: "DEBIT",
	isHeader: true,
	isActive: true,
	parentAccountId: null,
	currencyCode: null,
	itarCompartmentId: null,
};

const leafAccount: AccountSnapshot = {
	id: ACCOUNT_LEAF_ID,
	entityId: ENTITY_A,
	accountNumber: "1010",
	accountType: "ASSET",
	normalBalance: "DEBIT",
	isHeader: false,
	isActive: true,
	parentAccountId: ACCOUNT_HEADER_ID,
	currencyCode: null,
	itarCompartmentId: null,
};

/** Build a stub COARepository with configurable responses. */
function makeRepo(opts: {
	existingByNumber?: Map<string, AccountSnapshot>;
	existingById?: Map<string, AccountSnapshot>;
	childrenOf?: Set<string>;
}): COARepository {
	return {
		async findByNumber(entityId, accountNumber) {
			return opts.existingByNumber?.get(`${entityId}:${accountNumber}`) ?? null;
		},
		async findById(id) {
			return opts.existingById?.get(id) ?? null;
		},
		async hasChildren(parentId) {
			return opts.childrenOf?.has(parentId) ?? false;
		},
	};
}

/** Empty repository (no existing accounts). */
const emptyRepo = makeRepo({});

// ── createAccount ─────────────────────────────────────────────────────────────

describe("createAccount", () => {
	test("creates a valid leaf account without parent", async () => {
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1010",
			name: "Cash - Checking",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			isHeader: false,
		};

		const record = await createAccount(input, ACTOR_ID, emptyRepo);

		expect(record.entityId).toBe(ENTITY_A);
		expect(record.accountNumber).toBe("1010");
		expect(record.name).toBe("Cash - Checking");
		expect(record.accountType).toBe("ASSET");
		expect(record.normalBalance).toBe("DEBIT");
		expect(record.isHeader).toBe(false);
		expect(record.isActive).toBe(true);
		expect(record.parentAccountId).toBeNull();
		expect(record.createdBy).toBe(ACTOR_ID);
	});

	test("creates a header account with parent", async () => {
		const repo = makeRepo({
			existingById: new Map([[ACCOUNT_HEADER_ID, headerAccount]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1100",
			name: "Accounts Receivable",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			isHeader: true,
			parentAccountId: ACCOUNT_HEADER_ID,
		};

		const record = await createAccount(input, ACTOR_ID, repo);

		expect(record.parentAccountId).toBe(ACCOUNT_HEADER_ID);
		expect(record.isHeader).toBe(true);
	});

	test("throws DUPLICATE_ACCOUNT_NUMBER if account number already exists in entity", async () => {
		const repo = makeRepo({
			existingByNumber: new Map([[`${ENTITY_A}:1010`, leafAccount]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1010",
			name: "Duplicate",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		};

		await expect(createAccount(input, ACTOR_ID, repo)).rejects.toBeInstanceOf(COAError);
		await expect(createAccount(input, ACTOR_ID, repo)).rejects.toMatchObject({
			code: "DUPLICATE_ACCOUNT_NUMBER",
		});
	});

	test("allows same account number in a different entity", async () => {
		const repo = makeRepo({
			existingByNumber: new Map([[`${ENTITY_A}:1010`, leafAccount]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_B,
			accountNumber: "1010",
			name: "Cash",
			accountType: "ASSET",
			normalBalance: "DEBIT",
		};

		// Should not throw
		const record = await createAccount(input, ACTOR_ID, repo);
		expect(record.entityId).toBe(ENTITY_B);
	});

	test("throws PARENT_ACCOUNT_NOT_FOUND if parent ID does not exist", async () => {
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1010",
			name: "Sub Account",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			parentAccountId: "99999999-0000-0000-0000-000000000001",
		};

		await expect(createAccount(input, ACTOR_ID, emptyRepo)).rejects.toMatchObject({
			code: "PARENT_ACCOUNT_NOT_FOUND",
		});
	});

	test("throws PARENT_ENTITY_MISMATCH if parent belongs to a different entity", async () => {
		const wrongEntityParent: AccountSnapshot = { ...headerAccount, entityId: ENTITY_B };
		const repo = makeRepo({
			existingById: new Map([[ACCOUNT_HEADER_ID, wrongEntityParent]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1010",
			name: "Sub Account",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			parentAccountId: ACCOUNT_HEADER_ID,
		};

		await expect(createAccount(input, ACTOR_ID, repo)).rejects.toMatchObject({
			code: "PARENT_ENTITY_MISMATCH",
		});
	});

	test("throws PARENT_NOT_HEADER if parent is not a header account", async () => {
		const repo = makeRepo({
			existingById: new Map([[ACCOUNT_LEAF_ID, leafAccount]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1011",
			name: "Sub Account",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			parentAccountId: ACCOUNT_LEAF_ID,
		};

		await expect(createAccount(input, ACTOR_ID, repo)).rejects.toMatchObject({
			code: "PARENT_NOT_HEADER",
		});
	});

	test("throws PARENT_ACCOUNT_INACTIVE if parent is inactive", async () => {
		const inactiveHeader: AccountSnapshot = { ...headerAccount, isActive: false };
		const repo = makeRepo({
			existingById: new Map([[ACCOUNT_HEADER_ID, inactiveHeader]]),
		});
		const input: CreateAccountInput = {
			entityId: ENTITY_A,
			accountNumber: "1010",
			name: "Sub Account",
			accountType: "ASSET",
			normalBalance: "DEBIT",
			parentAccountId: ACCOUNT_HEADER_ID,
		};

		await expect(createAccount(input, ACTOR_ID, repo)).rejects.toMatchObject({
			code: "PARENT_ACCOUNT_INACTIVE",
		});
	});
});

// ── updateAccount ─────────────────────────────────────────────────────────────

describe("updateAccount", () => {
	test("returns minimal update record for name-only change", async () => {
		const input: UpdateAccountInput = { id: ACCOUNT_HEADER_ID, name: "New Name" };
		const record = await updateAccount(input, ACTOR_ID, headerAccount, emptyRepo);

		expect(record.id).toBe(ACCOUNT_HEADER_ID);
		expect(record.name).toBe("New Name");
		expect(record.isActive).toBeUndefined();
		expect(record.updatedBy).toBe(ACTOR_ID);
	});

	test("allows deactivating a leaf account", async () => {
		const input: UpdateAccountInput = { id: ACCOUNT_LEAF_ID, isActive: false };
		const record = await updateAccount(input, ACTOR_ID, leafAccount, emptyRepo);
		expect(record.isActive).toBe(false);
	});

	test("throws CANNOT_DEACTIVATE_WITH_CHILDREN if header has children", async () => {
		const repo = makeRepo({ childrenOf: new Set([ACCOUNT_HEADER_ID]) });
		const input: UpdateAccountInput = { id: ACCOUNT_HEADER_ID, isActive: false };

		await expect(updateAccount(input, ACTOR_ID, headerAccount, repo)).rejects.toMatchObject({
			code: "CANNOT_DEACTIVATE_WITH_CHILDREN",
		});
	});

	test("allows deactivating header account with no children", async () => {
		const input: UpdateAccountInput = { id: ACCOUNT_HEADER_ID, isActive: false };
		const record = await updateAccount(input, ACTOR_ID, headerAccount, emptyRepo);
		expect(record.isActive).toBe(false);
	});

	test("throws CANNOT_REMOVE_HEADER_WITH_CHILDREN", async () => {
		const repo = makeRepo({ childrenOf: new Set([ACCOUNT_HEADER_ID]) });
		const input: UpdateAccountInput = { id: ACCOUNT_HEADER_ID, isHeader: false };

		await expect(updateAccount(input, ACTOR_ID, headerAccount, repo)).rejects.toMatchObject({
			code: "CANNOT_REMOVE_HEADER_WITH_CHILDREN",
		});
	});

	test("throws CIRCULAR_PARENT_REFERENCE if parent equals self", async () => {
		const input: UpdateAccountInput = {
			id: ACCOUNT_HEADER_ID,
			parentAccountId: ACCOUNT_HEADER_ID,
		};
		const repo = makeRepo({
			existingById: new Map([[ACCOUNT_HEADER_ID, headerAccount]]),
		});

		await expect(updateAccount(input, ACTOR_ID, headerAccount, repo)).rejects.toMatchObject({
			code: "CIRCULAR_PARENT_REFERENCE",
		});
	});
});

// ── canonicalNormalBalance ────────────────────────────────────────────────────

describe("canonicalNormalBalance", () => {
	test("ASSET → DEBIT", () => expect(canonicalNormalBalance("ASSET")).toBe("DEBIT"));
	test("EXPENSE → DEBIT", () => expect(canonicalNormalBalance("EXPENSE")).toBe("DEBIT"));
	test("LIABILITY → CREDIT", () => expect(canonicalNormalBalance("LIABILITY")).toBe("CREDIT"));
	test("EQUITY → CREDIT", () => expect(canonicalNormalBalance("EQUITY")).toBe("CREDIT"));
	test("REVENUE → CREDIT", () => expect(canonicalNormalBalance("REVENUE")).toBe("CREDIT"));
});
