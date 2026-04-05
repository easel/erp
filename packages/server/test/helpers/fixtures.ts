/**
 * Shared test fixtures for integration and unit tests.
 *
 * Provides deterministic UUIDs, sample entities, users, and module-specific
 * seed data. Fixtures are pure data — no DB calls, no side effects.
 *
 * Modules covered:
 *   - Platform: legal entities, users, roles
 *   - Finance: chart of accounts, fiscal periods
 *   - Procurement: vendors, purchase orders
 *   - Logistics: inventory items, shipments
 *
 * Ref: SD-003 §7 Integration Tests
 * Issue: hx-57d6a848
 */

import type { UUID } from "@apogee/shared";

// ── Deterministic UUIDs ────────────────────────────────────────────────────────

function u(suffix: string): UUID {
	return `00000000-test-0000-0000-${suffix.padStart(12, "0")}` as UUID;
}

// ── Platform fixtures ─────────────────────────────────────────────────────────

/** Three legal entities matching the SD-003 seed data specification. */
export const ENTITIES = {
	/** SATCO-US — US parent entity (default). */
	US: {
		id: u("entity00001"),
		code: "SATCO-US",
		name: "SatelliteCo US Inc.",
		countryCode: "US",
		baseCurrencyCode: "USD",
	},
	/** SATCO-UK — UK subsidiary. */
	UK: {
		id: u("entity00002"),
		code: "SATCO-UK",
		name: "SatelliteCo UK Ltd.",
		countryCode: "GB",
		baseCurrencyCode: "GBP",
	},
	/** SATCO-SG — Singapore subsidiary. */
	SG: {
		id: u("entity00003"),
		code: "SATCO-SG",
		name: "SatelliteCo Singapore Pte.",
		countryCode: "SG",
		baseCurrencyCode: "SGD",
	},
} as const;

/** Five seed users across standard ERP roles. */
export const USERS = {
	admin: {
		id: u("user000001"),
		email: "admin@satco.example",
		displayName: "System Admin",
		role: "ADMIN",
	},
	finance: {
		id: u("user000002"),
		email: "finance@satco.example",
		displayName: "Finance Manager",
		role: "FINANCE",
	},
	sales: {
		id: u("user000003"),
		email: "sales@satco.example",
		displayName: "Sales Manager",
		role: "SALES",
	},
	compliance: {
		id: u("user000004"),
		email: "compliance@satco.example",
		displayName: "Compliance Officer",
		role: "COMPLIANCE",
	},
	readonly: {
		id: u("user000005"),
		email: "readonly@satco.example",
		displayName: "Read Only User",
		role: "READ_ONLY",
	},
} as const;

// ── Finance fixtures ───────────────────────────────────────────────────────────

/** Standard chart of accounts IDs for test entries. */
export const ACCOUNTS = {
	/** Cash / Bank (ASSET) */
	cash: u("acct000001"),
	/** Accounts Receivable (ASSET) */
	ar: u("acct000002"),
	/** Inventory (ASSET) */
	inventory: u("acct000003"),
	/** Accounts Payable (LIABILITY) */
	ap: u("acct000004"),
	/** Revenue (REVENUE) */
	revenue: u("acct000005"),
	/** Cost of Goods Sold (EXPENSE) */
	cogs: u("acct000006"),
	/** Retained Earnings (EQUITY) */
	retainedEarnings: u("acct000007"),
	/** AP Accrual (LIABILITY) */
	apAccrual: u("acct000008"),
} as const;

/** Test fiscal period (Q1 2026). */
export const FISCAL_PERIOD = {
	id: u("period00001"),
	entityId: ENTITIES.US.id,
	name: "Q1-2026",
	startDate: "2026-01-01",
	endDate: "2026-03-31",
	status: "OPEN" as const,
} as const;

// ── Procurement fixtures ───────────────────────────────────────────────────────

/** Sample vendor for procurement tests. */
export const VENDOR = {
	id: u("vendor00001"),
	entityId: ENTITIES.US.id,
	code: "VEND-001",
	name: "Orbital Components Ltd.",
	countryCode: "US",
} as const;

/** Sample purchase order line for three-way match tests. */
export const PO_LINE = {
	id: u("poline0001"),
	poId: u("po000000001"),
	lineNumber: 1,
	description: "Satellite solar panel array (model X-200)",
	quantity: "10.0000",
	unitPrice: "1500.000000",
	currencyCode: "USD",
} as const;

// ── Logistics / Fulfillment fixtures ──────────────────────────────────────────

/** Sample inventory item for logistics tests. */
export const INVENTORY_ITEM = {
	id: u("invitem0001"),
	entityId: ENTITIES.US.id,
	sku: "SAT-PANEL-X200",
	description: "Satellite solar panel array (model X-200)",
	quantityOnHand: "100.0000",
	unitOfMeasure: "EA",
} as const;

/** Sample customer for sales order tests. */
export const CUSTOMER = {
	id: u("customer001"),
	entityId: ENTITIES.US.id,
	code: "CUST-001",
	name: "Stellar Orbit Corp.",
	countryCode: "US",
} as const;

// ── Exchange rate fixtures ─────────────────────────────────────────────────────

/** Sample exchange rates for multi-currency tests. */
export const EXCHANGE_RATES = [
	{
		fromCurrency: "USD",
		toCurrency: "GBP",
		rate: "0.7900000000",
		effectiveDate: "2026-01-01",
		rateTypeCode: "SPOT" as const,
	},
	{
		fromCurrency: "USD",
		toCurrency: "SGD",
		rate: "1.3500000000",
		effectiveDate: "2026-01-01",
		rateTypeCode: "SPOT" as const,
	},
	{
		fromCurrency: "GBP",
		toCurrency: "USD",
		rate: "1.2658000000",
		effectiveDate: "2026-01-01",
		rateTypeCode: "SPOT" as const,
	},
] as const;
