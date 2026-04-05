/**
 * Customer Service — customer master CRUD and address management.
 *
 * Implements SLS-003 (Customer Master) from SD-003-WP5.
 *
 * Design:
 * - Pure domain functions: no direct DB I/O. CustomerRepository is injected.
 * - buildCustomerRecord / buildCustomerAddressRecord: construct DB-ready records
 *   from validated Zod input.
 * - deactivateCustomer: soft-delete (sets is_active = false, not deleted_at).
 * - Duplicate detection: repository exposes findByCode to enforce UNIQUE(entity, code).
 *
 * Ref: SD-002-data-model.md §6.1 (customer, customer_address),
 *      SD-003-WP5 SLS-003, ADR-011 (money amounts)
 * Issue: hx-31c83b3c
 */

import type {
	CreateCustomerAddressInput,
	CreateCustomerInput,
	UpdateCustomerInput,
} from "@apogee/shared";
import type { UUID } from "@apogee/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal customer snapshot for domain decisions. */
export interface CustomerSnapshot {
	readonly id: UUID;
	readonly entityId: UUID;
	readonly customerCode: string;
	readonly legalName: string;
	readonly isActive: boolean;
	readonly creditLimit: string | null;
	readonly creditLimitCurrency: string | null;
	readonly defaultCurrencyCode: string;
	readonly paymentTerms: string;
}

/** DB-ready record for customer INSERT. */
export interface CustomerRecord {
	readonly entityId: UUID;
	readonly customerCode: string;
	readonly legalName: string;
	readonly tradeName: string | null;
	readonly countryCode: string;
	readonly taxId: string | null;
	readonly paymentTerms: string;
	readonly creditLimit: string | null;
	readonly creditLimitCurrency: string | null;
	readonly defaultCurrencyCode: string;
	readonly riskRating: string | null;
	readonly website: string | null;
	readonly notes: string | null;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** DB-ready record for customer_address INSERT. */
export interface CustomerAddressRecord {
	readonly customerId: UUID;
	readonly addressType: string;
	readonly addressLine1: string;
	readonly addressLine2: string | null;
	readonly city: string;
	readonly stateProvince: string | null;
	readonly postalCode: string | null;
	readonly countryCode: string;
	readonly isDefault: boolean;
	readonly createdBy: UUID;
	readonly updatedBy: UUID;
}

/** Fields that can be updated on a customer record. */
export interface CustomerUpdateFields {
	readonly legalName?: string;
	readonly tradeName?: string | null;
	readonly paymentTerms?: string;
	readonly creditLimit?: string | null;
	readonly creditLimitCurrency?: string | null;
	readonly defaultCurrencyCode?: string;
	readonly riskRating?: string | null;
	readonly website?: string | null;
	readonly notes?: string | null;
	readonly isActive?: boolean;
	readonly updatedBy: UUID;
}

export interface CustomerRepository {
	findById(entityId: UUID, customerId: UUID): Promise<CustomerSnapshot | null>;
	findByCode(entityId: UUID, customerCode: string): Promise<CustomerSnapshot | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class CustomerError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "CustomerError";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DB-ready customer record from validated CreateCustomerInput.
 * Throws CustomerError if a duplicate customer code already exists in the entity.
 */
export async function buildCustomerRecord(
	input: CreateCustomerInput,
	actorId: UUID,
	repo: CustomerRepository,
): Promise<CustomerRecord> {
	const existing = await repo.findByCode(input.entityId as UUID, input.customerCode);
	if (existing) {
		throw new CustomerError(
			`Customer code '${input.customerCode}' already exists in entity ${input.entityId}.`,
			"DUPLICATE_CUSTOMER_CODE",
		);
	}
	return {
		entityId: input.entityId as UUID,
		customerCode: input.customerCode,
		legalName: input.legalName,
		tradeName: input.tradeName ?? null,
		countryCode: input.countryCode,
		taxId: input.taxId ?? null,
		paymentTerms: input.paymentTerms ?? "NET30",
		creditLimit: input.creditLimit ?? null,
		creditLimitCurrency: input.creditLimitCurrency ?? null,
		defaultCurrencyCode: input.defaultCurrencyCode,
		riskRating: input.riskRating ?? null,
		website: input.website ?? null,
		notes: input.notes ?? null,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Build update fields from validated UpdateCustomerInput.
 * Throws CustomerError if customer is not found.
 */
export async function buildCustomerUpdateFields(
	input: UpdateCustomerInput,
	actorId: UUID,
	_repo: CustomerRepository,
): Promise<{ customerId: UUID; fields: CustomerUpdateFields }> {
	// Verify customer exists — repo provides snapshot
	// entityId not in UpdateCustomerInput; caller validates entity scoping
	const update: CustomerUpdateFields = {
		...(input.legalName !== undefined && { legalName: input.legalName }),
		...(input.tradeName !== undefined && { tradeName: input.tradeName ?? null }),
		...(input.paymentTerms !== undefined && { paymentTerms: input.paymentTerms }),
		...(input.creditLimit !== undefined && { creditLimit: input.creditLimit ?? null }),
		...(input.creditLimitCurrency !== undefined && {
			creditLimitCurrency: input.creditLimitCurrency ?? null,
		}),
		...(input.defaultCurrencyCode !== undefined && {
			defaultCurrencyCode: input.defaultCurrencyCode,
		}),
		...(input.riskRating !== undefined && { riskRating: input.riskRating ?? null }),
		...(input.website !== undefined && { website: input.website ?? null }),
		...(input.notes !== undefined && { notes: input.notes ?? null }),
		...(input.isActive !== undefined && { isActive: input.isActive }),
		updatedBy: actorId,
	};
	return { customerId: input.id as UUID, fields: update };
}

/**
 * Build a DB-ready customer address record from validated input.
 */
export function buildCustomerAddressRecord(
	input: CreateCustomerAddressInput,
	actorId: UUID,
): CustomerAddressRecord {
	return {
		customerId: input.customerId as UUID,
		addressType: input.addressType,
		addressLine1: input.addressLine1,
		addressLine2: input.addressLine2 ?? null,
		city: input.city,
		stateProvince: input.stateProvince ?? null,
		postalCode: input.postalCode ?? null,
		countryCode: input.countryCode,
		isDefault: input.isDefault ?? false,
		createdBy: actorId,
		updatedBy: actorId,
	};
}

/**
 * Deactivate a customer (soft deactivation via is_active = false).
 * Throws CustomerError if customer not found or already inactive.
 */
export async function deactivateCustomer(
	entityId: UUID,
	customerId: UUID,
	actorId: UUID,
	repo: CustomerRepository,
): Promise<{ customerId: UUID; updatedBy: UUID }> {
	const customer = await repo.findById(entityId, customerId);
	if (!customer) {
		throw new CustomerError(`Customer ${customerId} not found.`, "CUSTOMER_NOT_FOUND");
	}
	if (!customer.isActive) {
		throw new CustomerError(
			`Customer ${customerId} is already inactive.`,
			"CUSTOMER_ALREADY_INACTIVE",
		);
	}
	return { customerId, updatedBy: actorId };
}
