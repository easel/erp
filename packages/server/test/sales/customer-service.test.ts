/**
 * Customer Service unit tests.
 *
 * Covers SLS-003 acceptance criteria:
 * - buildCustomerRecord: duplicate detection, field mapping
 * - buildCustomerAddressRecord: field mapping
 * - buildCustomerUpdateFields: partial update construction
 * - deactivateCustomer: state guard
 *
 * Ref: SD-003-WP5 SLS-003, hx-31c83b3c
 */

import { describe, expect, test } from "bun:test";
import {
	CustomerError,
	type CustomerRepository,
	type CustomerSnapshot,
	buildCustomerAddressRecord,
	buildCustomerRecord,
	buildCustomerUpdateFields,
	deactivateCustomer,
} from "../../src/sales/customer-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTITY_ID = "10000000-0000-0000-0000-000000000001" as const;
const CUSTOMER_ID = "20000000-0000-0000-0000-000000000001" as const;
const ACTOR_ID = "50000000-0000-0000-0000-000000000001" as const;

const baseCustomerInput = {
	entityId: ENTITY_ID,
	customerCode: "CUST-001",
	legalName: "Orbital Dynamics Corp",
	countryCode: "US" as const,
	defaultCurrencyCode: "USD" as const,
};

function makeCustomerSnapshot(overrides: Partial<CustomerSnapshot> = {}): CustomerSnapshot {
	return {
		id: CUSTOMER_ID,
		entityId: ENTITY_ID,
		customerCode: "CUST-001",
		legalName: "Orbital Dynamics Corp",
		isActive: true,
		creditLimit: null,
		creditLimitCurrency: null,
		defaultCurrencyCode: "USD",
		paymentTerms: "NET30",
		...overrides,
	};
}

function makeNullRepo(): CustomerRepository {
	return {
		async findById() {
			return null;
		},
		async findByCode() {
			return null;
		},
	};
}

// ── buildCustomerRecord ───────────────────────────────────────────────────────

describe("buildCustomerRecord", () => {
	test("builds a valid customer record with minimal input", async () => {
		const record = await buildCustomerRecord(baseCustomerInput, ACTOR_ID, makeNullRepo());
		expect(record.entityId).toBe(ENTITY_ID);
		expect(record.customerCode).toBe("CUST-001");
		expect(record.legalName).toBe("Orbital Dynamics Corp");
		expect(record.countryCode).toBe("US");
		expect(record.defaultCurrencyCode).toBe("USD");
		expect(record.paymentTerms).toBe("NET30");
		expect(record.creditLimit).toBeNull();
		expect(record.createdBy).toBe(ACTOR_ID);
		expect(record.updatedBy).toBe(ACTOR_ID);
	});

	test("builds record with all optional fields", async () => {
		const input = {
			...baseCustomerInput,
			tradeName: "OD Corp",
			taxId: "12-3456789",
			paymentTerms: "NET60",
			creditLimit: "500000.000000",
			creditLimitCurrency: "USD" as const,
			riskRating: "LOW" as const,
			website: "https://example.com",
			notes: "Tier 1",
		};
		const record = await buildCustomerRecord(input, ACTOR_ID, makeNullRepo());
		expect(record.tradeName).toBe("OD Corp");
		expect(record.paymentTerms).toBe("NET60");
		expect(record.creditLimit).toBe("500000.000000");
		expect(record.riskRating).toBe("LOW");
	});

	test("throws DUPLICATE_CUSTOMER_CODE if code already exists", async () => {
		const repo: CustomerRepository = {
			async findById() {
				return null;
			},
			async findByCode() {
				return makeCustomerSnapshot();
			},
		};
		try {
			await buildCustomerRecord(baseCustomerInput, ACTOR_ID, repo);
			throw new Error("Expected CustomerError");
		} catch (e) {
			expect(e).toBeInstanceOf(CustomerError);
			expect((e as CustomerError).code).toBe("DUPLICATE_CUSTOMER_CODE");
		}
	});
});

// ── buildCustomerAddressRecord ────────────────────────────────────────────────

describe("buildCustomerAddressRecord", () => {
	const addressInput = {
		customerId: CUSTOMER_ID,
		addressType: "BILLING" as const,
		addressLine1: "123 Main St",
		city: "Houston",
		countryCode: "US" as const,
	};

	test("builds a valid address record", () => {
		const record = buildCustomerAddressRecord(addressInput, ACTOR_ID);
		expect(record.customerId).toBe(CUSTOMER_ID);
		expect(record.addressType).toBe("BILLING");
		expect(record.addressLine1).toBe("123 Main St");
		expect(record.city).toBe("Houston");
		expect(record.countryCode).toBe("US");
		expect(record.isDefault).toBe(false);
		expect(record.addressLine2).toBeNull();
		expect(record.stateProvince).toBeNull();
	});

	test("maps optional fields correctly", () => {
		const record = buildCustomerAddressRecord(
			{
				...addressInput,
				addressLine2: "Suite 400",
				stateProvince: "TX",
				postalCode: "77001",
				isDefault: true,
			},
			ACTOR_ID,
		);
		expect(record.addressLine2).toBe("Suite 400");
		expect(record.stateProvince).toBe("TX");
		expect(record.postalCode).toBe("77001");
		expect(record.isDefault).toBe(true);
	});
});

// ── buildCustomerUpdateFields ─────────────────────────────────────────────────

describe("buildCustomerUpdateFields", () => {
	test("builds update fields from partial input", async () => {
		const input = {
			id: CUSTOMER_ID,
			legalName: "Updated Name",
			paymentTerms: "NET45",
		};
		const result = await buildCustomerUpdateFields(input, ACTOR_ID, makeNullRepo());
		expect(result.customerId).toBe(CUSTOMER_ID);
		expect(result.fields.legalName).toBe("Updated Name");
		expect(result.fields.paymentTerms).toBe("NET45");
		expect(result.fields.updatedBy).toBe(ACTOR_ID);
	});

	test("omits undefined fields from update", async () => {
		const input = { id: CUSTOMER_ID, legalName: "Only Name" };
		const result = await buildCustomerUpdateFields(input, ACTOR_ID, makeNullRepo());
		expect("paymentTerms" in result.fields).toBe(false);
		expect("creditLimit" in result.fields).toBe(false);
	});
});

// ── deactivateCustomer ────────────────────────────────────────────────────────

describe("deactivateCustomer", () => {
	test("returns deactivation payload for active customer", async () => {
		const repo: CustomerRepository = {
			async findById() {
				return makeCustomerSnapshot({ isActive: true });
			},
			async findByCode() {
				return null;
			},
		};
		const result = await deactivateCustomer(ENTITY_ID, CUSTOMER_ID, ACTOR_ID, repo);
		expect(result.customerId).toBe(CUSTOMER_ID);
		expect(result.updatedBy).toBe(ACTOR_ID);
	});

	test("throws CUSTOMER_NOT_FOUND when customer missing", async () => {
		const repo: CustomerRepository = {
			async findById() {
				return null;
			},
			async findByCode() {
				return null;
			},
		};
		try {
			await deactivateCustomer(ENTITY_ID, CUSTOMER_ID, ACTOR_ID, repo);
			throw new Error("Expected CustomerError");
		} catch (e) {
			expect(e).toBeInstanceOf(CustomerError);
			expect((e as CustomerError).code).toBe("CUSTOMER_NOT_FOUND");
		}
	});

	test("throws CUSTOMER_ALREADY_INACTIVE for inactive customer", async () => {
		const repo: CustomerRepository = {
			async findById() {
				return makeCustomerSnapshot({ isActive: false });
			},
			async findByCode() {
				return null;
			},
		};
		try {
			await deactivateCustomer(ENTITY_ID, CUSTOMER_ID, ACTOR_ID, repo);
			throw new Error("Expected CustomerError");
		} catch (e) {
			expect(e).toBeInstanceOf(CustomerError);
			expect((e as CustomerError).code).toBe("CUSTOMER_ALREADY_INACTIVE");
		}
	});
});
