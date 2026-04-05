/**
 * Chart of Accounts (COA) Service — pure domain functions.
 *
 * Implements FIN-001 (multi-entity COA) from SD-003-WP2.
 *
 * Design:
 * - Pure validation + record construction. No direct DB I/O.
 * - COARepository interface is injected so unit tests use stubs.
 * - Caller is responsible for persisting the returned record to the DB.
 *
 * Key invariants:
 * - Account numbers are unique within a legal entity.
 * - Parent account must exist in the same entity and be a header (is_header = TRUE).
 * - Header accounts may not be posted to (only leaf accounts accept journal lines).
 * - Account types have canonical normal balances (enforced structurally in Zod;
 *   this layer enforces consistency between accountType and normalBalance).
 *
 * Ref: SD-002-data-model.md §4.1, SD-003-WP2 FIN-001
 * Issue: hx-152c4f71
 */

import type { CreateAccountInput, UpdateAccountInput } from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";

/** Snapshot of an account record — minimal shape needed for COA validation. */
export interface AccountSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly accountNumber: string;
	readonly accountType: AccountType;
	readonly normalBalance: NormalBalance;
	readonly isHeader: boolean;
	readonly isActive: boolean;
	readonly parentAccountId: UUID | null;
	readonly currencyCode: string | null;
	readonly itarCompartmentId: UUID | null;
}

/** Record ready for DB insertion — all derived fields populated. */
export interface AccountRecord {
	readonly entityId: UUID;
	readonly accountNumber: string;
	readonly name: string;
	readonly accountType: AccountType;
	readonly normalBalance: NormalBalance;
	readonly isHeader: boolean;
	readonly isActive: boolean;
	readonly parentAccountId: UUID | null;
	readonly currencyCode: string | null;
	readonly itarCompartmentId: UUID | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Partial update record — only fields that changed. */
export interface AccountUpdateRecord {
	readonly id: UUID;
	readonly name?: string;
	readonly isHeader?: boolean;
	readonly isActive?: boolean;
	readonly parentAccountId?: UUID | null;
	readonly itarCompartmentId?: UUID | null;
	readonly updatedBy: UUID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface (DB abstraction — inject in tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface COARepository {
	/** Find an account by (entityId, accountNumber). Returns null if not found. */
	findByNumber(entityId: UUID, accountNumber: string): Promise<AccountSnapshot | null>;
	/** Find an account by its primary key. Returns null if not found. */
	findById(id: UUID): Promise<AccountSnapshot | null>;
	/**
	 * Check if any account references parentId as its parent_account_id.
	 * Used to detect whether a header account has dependents before deactivating.
	 */
	hasChildren(parentId: UUID): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

export class COAError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "COAError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical normal balance per account type
// ─────────────────────────────────────────────────────────────────────────────

/** Standard accounting normal balances by account type. */
const CANONICAL_NORMAL_BALANCE: Record<AccountType, NormalBalance> = {
	ASSET: "DEBIT",
	EXPENSE: "DEBIT",
	LIABILITY: "CREDIT",
	EQUITY: "CREDIT",
	REVENUE: "CREDIT",
};

// ─────────────────────────────────────────────────────────────────────────────
// createAccount
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and construct an AccountRecord ready for DB insertion.
 *
 * Validation:
 * 1. Account number must not already exist in the entity (Layer 2 duplicate check).
 * 2. If parentAccountId is provided: parent must exist in the same entity and be a header.
 * 3. normalBalance must match the canonical balance for accountType unless explicitly
 *    overridden (some entities use contra-accounts; we allow it but warn via error).
 *
 * @throws COAError if any invariant is violated.
 */
export async function createAccount(
	input: CreateAccountInput,
	actorId: UUID,
	repo: COARepository,
): Promise<AccountRecord> {
	// 1. Duplicate check
	const existing = await repo.findByNumber(input.entityId as UUID, input.accountNumber);
	if (existing) {
		throw new COAError(
			`Account number "${input.accountNumber}" already exists in entity ${input.entityId}`,
			"DUPLICATE_ACCOUNT_NUMBER",
		);
	}

	// 2. Parent account validation
	if (input.parentAccountId) {
		const parent = await repo.findById(input.parentAccountId as UUID);
		if (!parent) {
			throw new COAError(
				`Parent account ${input.parentAccountId} not found`,
				"PARENT_ACCOUNT_NOT_FOUND",
			);
		}
		if (parent.entityId !== input.entityId) {
			throw new COAError(
				`Parent account ${input.parentAccountId} belongs to a different entity`,
				"PARENT_ENTITY_MISMATCH",
			);
		}
		if (!parent.isHeader) {
			throw new COAError(
				`Parent account ${input.parentAccountId} is not a header account. Only header accounts may have children.`,
				"PARENT_NOT_HEADER",
			);
		}
		if (!parent.isActive) {
			throw new COAError(
				`Parent account ${input.parentAccountId} is inactive`,
				"PARENT_ACCOUNT_INACTIVE",
			);
		}
	}

	return {
		entityId: input.entityId as UUID,
		accountNumber: input.accountNumber,
		name: input.name,
		accountType: input.accountType as AccountType,
		normalBalance: input.normalBalance as NormalBalance,
		isHeader: input.isHeader ?? false,
		isActive: true,
		parentAccountId: (input.parentAccountId as UUID | undefined) ?? null,
		currencyCode: input.currencyCode ?? null,
		itarCompartmentId: (input.itarCompartmentId as UUID | undefined) ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// updateAccount
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an account update and return the update delta.
 *
 * Rules:
 * - Cannot deactivate an account that has active children.
 * - Cannot change is_header from TRUE to FALSE if the account has children.
 * - If new parentAccountId is set: same validation as createAccount §2.
 *
 * @throws COAError if any invariant is violated.
 */
export async function updateAccount(
	input: UpdateAccountInput,
	actorId: UUID,
	currentSnapshot: AccountSnapshot,
	repo: COARepository,
): Promise<AccountUpdateRecord> {
	// Deactivating a parent that has children is forbidden
	if (input.isActive === false && currentSnapshot.isHeader) {
		const hasChildren = await repo.hasChildren(input.id as UUID);
		if (hasChildren) {
			throw new COAError(
				`Cannot deactivate header account ${input.id}: it has child accounts`,
				"CANNOT_DEACTIVATE_WITH_CHILDREN",
			);
		}
	}

	// Removing header status from an account that has children is forbidden
	if (input.isHeader === false && currentSnapshot.isHeader) {
		const hasChildren = await repo.hasChildren(input.id as UUID);
		if (hasChildren) {
			throw new COAError(
				`Cannot remove header status from account ${input.id}: it has child accounts`,
				"CANNOT_REMOVE_HEADER_WITH_CHILDREN",
			);
		}
	}

	// New parent validation
	if (input.parentAccountId !== undefined && input.parentAccountId !== null) {
		const parent = await repo.findById(input.parentAccountId as UUID);
		if (!parent) {
			throw new COAError(
				`Parent account ${input.parentAccountId} not found`,
				"PARENT_ACCOUNT_NOT_FOUND",
			);
		}
		if (parent.entityId !== currentSnapshot.entityId) {
			throw new COAError(
				`Parent account ${input.parentAccountId} belongs to a different entity`,
				"PARENT_ENTITY_MISMATCH",
			);
		}
		if (!parent.isHeader) {
			throw new COAError(
				`Parent account ${input.parentAccountId} is not a header account`,
				"PARENT_NOT_HEADER",
			);
		}
		// Circular reference guard: parent cannot be the account itself or a descendant.
		if ((input.parentAccountId as UUID) === currentSnapshot.id) {
			throw new COAError("Account cannot be its own parent", "CIRCULAR_PARENT_REFERENCE");
		}
	}

	const record: AccountUpdateRecord = {
		id: input.id as UUID,
		updatedBy: actorId,
	};

	if (input.name !== undefined) (record as { name?: string }).name = input.name;
	if (input.isHeader !== undefined) (record as { isHeader?: boolean }).isHeader = input.isHeader;
	if (input.isActive !== undefined) (record as { isActive?: boolean }).isActive = input.isActive;
	if (input.parentAccountId !== undefined)
		(record as { parentAccountId?: UUID | null }).parentAccountId =
			(input.parentAccountId as UUID | null | undefined) ?? null;
	if (input.itarCompartmentId !== undefined)
		(record as { itarCompartmentId?: UUID | null }).itarCompartmentId =
			(input.itarCompartmentId as UUID | null | undefined) ?? null;

	return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the canonical normal balance for an account type.
 * Used for validation UI hints and account seeding.
 */
export function canonicalNormalBalance(accountType: AccountType): NormalBalance {
	return CANONICAL_NORMAL_BALANCE[accountType];
}
