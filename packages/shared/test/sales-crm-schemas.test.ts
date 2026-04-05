/**
 * Tests for WP-5 Sales & CRM entity Zod schemas.
 * Covers Layer 1 structural validation for:
 *   Sales: customer, product, price list, quote, sales order, RMA
 *   CRM: company, contact, company relationship, pipeline stage, opportunity, activity, lead
 * Ref: SD-002-data-model.md §6 and §7, FEAT-003-sales-commercial.md,
 *      SD-003-WP5, hx-c116b0f8
 */
import { describe, expect, test } from "vitest";
import {
	// CRM
	CreateActivitySchema,
	CreateCompanyRelationshipSchema,
	CreateCrmCompanySchema,
	CreateCrmContactSchema,
	// Sales
	CreateCustomerAddressSchema,
	CreateCustomerSchema,
	CreateLeadSchema,
	CreateOpportunitySchema,
	CreatePipelineStageSchema,
	CreatePriceListEntrySchema,
	CreatePriceListSchema,
	CreateProductSchema,
	CreateReturnAuthorizationSchema,
	CreateSalesOrderSchema,
	CreateSalesQuoteSchema,
	UpdateCustomerSchema,
} from "../src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";
const UUID3 = "00000000-0000-4000-8000-000000000003";
const FUTURE_DATE = "2099-12-31";
const PAST_DATE = "2020-01-01";
const TODAY = new Date().toISOString().split("T")[0] as string;

// ── Customer ──────────────────────────────────────────────────────────────────

describe("CreateCustomerSchema", () => {
	const valid = {
		entityId: UUID,
		customerCode: "CUST-001",
		legalName: "Acme Satellite Corp",
		countryCode: "US",
		defaultCurrencyCode: "USD",
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateCustomerSchema.parse(valid)).not.toThrow();
	});

	test("accepts full valid input with all optional fields", () => {
		const full = {
			...valid,
			tradeName: "Acme",
			taxId: "12-3456789",
			paymentTerms: "NET60",
			creditLimit: "500000.00",
			creditLimitCurrency: "USD",
			riskRating: "LOW" as const,
			website: "https://acme.example.com",
			notes: "Tier 1 strategic customer",
		};
		expect(() => CreateCustomerSchema.parse(full)).not.toThrow();
	});

	test("rejects missing entityId", () => {
		const { entityId: _e, ...rest } = valid;
		expect(() => CreateCustomerSchema.parse(rest)).toThrow();
	});

	test("rejects missing legalName", () => {
		const { legalName: _l, ...rest } = valid;
		expect(() => CreateCustomerSchema.parse(rest)).toThrow();
	});

	test("rejects invalid country code", () => {
		expect(() => CreateCustomerSchema.parse({ ...valid, countryCode: "usa" })).toThrow();
	});

	test("rejects invalid currency code", () => {
		expect(() => CreateCustomerSchema.parse({ ...valid, defaultCurrencyCode: "us" })).toThrow();
	});

	test("rejects invalid risk rating", () => {
		expect(() => CreateCustomerSchema.parse({ ...valid, riskRating: "CRITICAL" })).toThrow();
	});

	test("rejects customer code with lowercase", () => {
		expect(() => CreateCustomerSchema.parse({ ...valid, customerCode: "cust-001" })).toThrow();
	});

	test("rejects customer code exceeding 20 characters", () => {
		expect(() => CreateCustomerSchema.parse({ ...valid, customerCode: "A".repeat(21) })).toThrow();
	});
});

describe("UpdateCustomerSchema", () => {
	test("accepts id-only update (no-op)", () => {
		expect(() => UpdateCustomerSchema.parse({ id: UUID })).not.toThrow();
	});

	test("accepts partial update", () => {
		expect(() =>
			UpdateCustomerSchema.parse({
				id: UUID,
				legalName: "New Name",
				isActive: false,
			}),
		).not.toThrow();
	});
});

describe("CreateCustomerAddressSchema", () => {
	const valid = {
		customerId: UUID,
		addressType: "BILLING" as const,
		addressLine1: "123 Satellite Way",
		city: "Houston",
		countryCode: "US",
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateCustomerAddressSchema.parse(valid)).not.toThrow();
	});

	test("accepts full address", () => {
		expect(() =>
			CreateCustomerAddressSchema.parse({
				...valid,
				addressType: "BOTH" as const,
				addressLine2: "Suite 400",
				stateProvince: "TX",
				postalCode: "77002",
				isDefault: true,
			}),
		).not.toThrow();
	});

	test("rejects invalid address type", () => {
		expect(() => CreateCustomerAddressSchema.parse({ ...valid, addressType: "OFFICE" })).toThrow();
	});

	test("rejects empty city", () => {
		expect(() => CreateCustomerAddressSchema.parse({ ...valid, city: "" })).toThrow();
	});
});

// ── Product ───────────────────────────────────────────────────────────────────

describe("CreateProductSchema", () => {
	const valid = {
		entityId: UUID,
		productCode: "LEO-TERM-500",
		name: "LEO Terminal Model 500",
		productType: "GOOD" as const,
	};

	test("accepts minimal valid input", () => {
		expect(() => CreateProductSchema.parse(valid)).not.toThrow();
	});

	test("accepts SERVICE and SUBSCRIPTION types", () => {
		expect(() =>
			CreateProductSchema.parse({ ...valid, productCode: "SVC-001", productType: "SERVICE" }),
		).not.toThrow();
		expect(() =>
			CreateProductSchema.parse({
				...valid,
				productCode: "SUB-001",
				productType: "SUBSCRIPTION",
			}),
		).not.toThrow();
	});

	test("accepts full product with account and classification links", () => {
		expect(() =>
			CreateProductSchema.parse({
				...valid,
				description: "High-throughput LEO terminal",
				unitOfMeasure: "EA",
				revenueAccountId: UUID2,
				cogsAccountId: UUID3,
				inventoryItemId: UUID2,
				itarCompartmentId: UUID3,
			}),
		).not.toThrow();
	});

	test("rejects invalid product type", () => {
		expect(() => CreateProductSchema.parse({ ...valid, productType: "HARDWARE" })).toThrow();
	});

	test("rejects lowercase product code", () => {
		expect(() => CreateProductSchema.parse({ ...valid, productCode: "leo-term" })).toThrow();
	});

	test("rejects product code exceeding 30 characters", () => {
		expect(() => CreateProductSchema.parse({ ...valid, productCode: "A".repeat(31) })).toThrow();
	});
});

describe("CreatePriceListSchema", () => {
	const valid = {
		entityId: UUID,
		code: "STD-USD",
		name: "Standard USD",
		currencyCode: "USD",
		effectiveFrom: PAST_DATE,
	};

	test("accepts valid price list", () => {
		expect(() => CreatePriceListSchema.parse(valid)).not.toThrow();
	});

	test("accepts with effectiveTo after effectiveFrom", () => {
		expect(() => CreatePriceListSchema.parse({ ...valid, effectiveTo: FUTURE_DATE })).not.toThrow();
	});

	test("rejects effectiveTo before effectiveFrom", () => {
		expect(() => CreatePriceListSchema.parse({ ...valid, effectiveTo: "2019-12-31" })).toThrow();
	});
});

describe("CreatePriceListEntrySchema", () => {
	const valid = {
		priceListId: UUID,
		productId: UUID2,
		unitPrice: "1250.00",
		effectiveFrom: PAST_DATE,
	};

	test("accepts valid entry", () => {
		expect(() => CreatePriceListEntrySchema.parse(valid)).not.toThrow();
	});

	test("rejects negative unit price", () => {
		// MoneyAmountSchema only allows non-negative strings
		expect(() => CreatePriceListEntrySchema.parse({ ...valid, unitPrice: "-100.00" })).toThrow();
	});
});

// ── Quote ─────────────────────────────────────────────────────────────────────

describe("CreateSalesQuoteSchema", () => {
	const line = {
		description: "LEO Terminal Model 500",
		quantity: "10",
		unitPrice: "1250.00",
		discountPercent: 5,
		currencyCode: "USD",
	};

	const valid = {
		entityId: UUID,
		customerId: UUID2,
		currencyCode: "USD",
		quoteDate: TODAY,
		validUntil: FUTURE_DATE,
		lineItems: [line],
	};

	test("accepts minimal valid quote", () => {
		expect(() => CreateSalesQuoteSchema.parse(valid)).not.toThrow();
	});

	test("accepts quote with product reference and opportunity link", () => {
		expect(() =>
			CreateSalesQuoteSchema.parse({
				...valid,
				opportunityId: UUID3,
				lineItems: [{ ...line, productId: UUID3, taxCode: "GST" }],
				notes: "Standard hardware quote",
				reference: "PO-2026-1234",
			}),
		).not.toThrow();
	});

	test("rejects empty line items (AC-SLS-001-01)", () => {
		expect(() => CreateSalesQuoteSchema.parse({ ...valid, lineItems: [] })).toThrow();
	});

	test("rejects past valid-until date", () => {
		expect(() => CreateSalesQuoteSchema.parse({ ...valid, validUntil: PAST_DATE })).toThrow();
	});

	test("rejects mismatched currency on line item (AC-SLS-001-01)", () => {
		expect(() =>
			CreateSalesQuoteSchema.parse({
				...valid,
				lineItems: [{ ...line, currencyCode: "EUR" }],
			}),
		).toThrow();
	});

	test("rejects zero quantity", () => {
		expect(() =>
			CreateSalesQuoteSchema.parse({
				...valid,
				lineItems: [{ ...line, quantity: "0" }],
			}),
		).toThrow();
	});

	test("rejects discount over 100%", () => {
		expect(() =>
			CreateSalesQuoteSchema.parse({
				...valid,
				lineItems: [{ ...line, discountPercent: 101 }],
			}),
		).toThrow();
	});
});

// ── Sales Order ───────────────────────────────────────────────────────────────

describe("CreateSalesOrderSchema", () => {
	const line = {
		description: "LEO Terminal Model 500",
		quantityOrdered: "10",
		unitPrice: "1250.00",
		currencyCode: "USD",
	};

	const valid = {
		entityId: UUID,
		customerId: UUID2,
		currencyCode: "USD",
		orderDate: TODAY,
		lineItems: [line],
	};

	test("accepts minimal valid order", () => {
		expect(() => CreateSalesOrderSchema.parse(valid)).not.toThrow();
	});

	test("accepts order with all optional fields", () => {
		expect(() =>
			CreateSalesOrderSchema.parse({
				...valid,
				quoteId: UUID3,
				requiredDate: FUTURE_DATE,
				shippingAddressId: UUID3,
				billingAddressId: UUID3,
				paymentTerms: "NET30",
				lineItems: [{ ...line, productId: UUID3, discountPercent: 10, accountId: UUID3 }],
				notes: "Priority order",
			}),
		).not.toThrow();
	});

	test("rejects empty line items", () => {
		expect(() => CreateSalesOrderSchema.parse({ ...valid, lineItems: [] })).toThrow();
	});

	test("rejects required date before order date", () => {
		expect(() => CreateSalesOrderSchema.parse({ ...valid, requiredDate: PAST_DATE })).toThrow();
	});

	test("rejects mismatched line item currency", () => {
		expect(() =>
			CreateSalesOrderSchema.parse({
				...valid,
				lineItems: [{ ...line, currencyCode: "GBP" }],
			}),
		).toThrow();
	});

	test("rejects zero quantity ordered", () => {
		expect(() =>
			CreateSalesOrderSchema.parse({
				...valid,
				lineItems: [{ ...line, quantityOrdered: "0" }],
			}),
		).toThrow();
	});
});

// ── Return Authorization ───────────────────────────────────────────────────────

describe("CreateReturnAuthorizationSchema", () => {
	const line = {
		salesOrderLineId: UUID3,
		quantityReturned: "2",
		disposition: "RESTOCK" as const,
	};

	const valid = {
		entityId: UUID,
		salesOrderId: UUID2,
		customerId: UUID2,
		lines: [line],
	};

	test("accepts minimal valid RMA", () => {
		expect(() => CreateReturnAuthorizationSchema.parse(valid)).not.toThrow();
	});

	test("accepts RMA with credit amount", () => {
		expect(() =>
			CreateReturnAuthorizationSchema.parse({
				...valid,
				reason: "Customer received damaged units",
				lines: [{ ...line, creditAmount: "2500.00", creditCurrencyCode: "USD" }],
			}),
		).not.toThrow();
	});

	test("rejects empty lines", () => {
		expect(() => CreateReturnAuthorizationSchema.parse({ ...valid, lines: [] })).toThrow();
	});

	test("rejects credit amount without currency (AC-SLS-002-04)", () => {
		expect(() =>
			CreateReturnAuthorizationSchema.parse({
				...valid,
				lines: [{ ...line, creditAmount: "100.00" }],
			}),
		).toThrow();
	});

	test("rejects invalid disposition", () => {
		expect(() =>
			CreateReturnAuthorizationSchema.parse({
				...valid,
				lines: [{ ...line, disposition: "DONATE" }],
			}),
		).toThrow();
	});
});

// ── CRM Company ───────────────────────────────────────────────────────────────

describe("CreateCrmCompanySchema", () => {
	const valid = {
		entityId: UUID,
		name: "Orbital Systems Ltd",
	};

	test("accepts minimal valid company", () => {
		expect(() => CreateCrmCompanySchema.parse(valid)).not.toThrow();
	});

	test("accepts full company record", () => {
		expect(() =>
			CreateCrmCompanySchema.parse({
				...valid,
				domain: "orbital-systems.example.com",
				industry: "Satellite Manufacturing",
				employeeCountRange: "1000-5000",
				annualRevenueRange: "$100M-$500M",
				countryCode: "GB",
				phone: "+44-20-1234-5678",
				website: "https://orbital-systems.example.com",
				customerId: UUID2,
				ownerUserId: UUID3,
			}),
		).not.toThrow();
	});

	test("rejects missing name", () => {
		expect(() => CreateCrmCompanySchema.parse({ entityId: UUID })).toThrow();
	});

	test("rejects invalid country code", () => {
		expect(() => CreateCrmCompanySchema.parse({ ...valid, countryCode: "GBR" })).toThrow();
	});
});

// ── CRM Contact ───────────────────────────────────────────────────────────────

describe("CreateCrmContactSchema", () => {
	const valid = {
		entityId: UUID,
		firstName: "Jane",
		lastName: "Smith",
	};

	test("accepts minimal valid contact", () => {
		expect(() => CreateCrmContactSchema.parse(valid)).not.toThrow();
	});

	test("accepts full contact record", () => {
		expect(() =>
			CreateCrmContactSchema.parse({
				...valid,
				crmCompanyId: UUID2,
				email: "jane.smith@orbital-systems.example.com",
				phone: "+1-713-555-0100",
				mobile: "+1-713-555-0199",
				jobTitle: "VP Engineering",
				department: "Systems Engineering",
				countryCode: "US",
				doNotContact: false,
				source: "TRADE_SHOW",
				ownerUserId: UUID3,
			}),
		).not.toThrow();
	});

	test("rejects invalid email", () => {
		expect(() => CreateCrmContactSchema.parse({ ...valid, email: "not-an-email" })).toThrow();
	});

	test("rejects empty first name", () => {
		expect(() => CreateCrmContactSchema.parse({ ...valid, firstName: "" })).toThrow();
	});
});

// ── Company Relationship ──────────────────────────────────────────────────────

describe("CreateCompanyRelationshipSchema", () => {
	const valid = {
		entityId: UUID,
		parentCompanyId: UUID2,
		childCompanyId: UUID3,
		relationshipType: "SUBSIDIARY" as const,
		effectiveFrom: PAST_DATE,
	};

	test("accepts valid relationship", () => {
		expect(() => CreateCompanyRelationshipSchema.parse(valid)).not.toThrow();
	});

	test("rejects same parent and child (SD-002 check constraint)", () => {
		expect(() =>
			CreateCompanyRelationshipSchema.parse({
				...valid,
				parentCompanyId: UUID2,
				childCompanyId: UUID2,
			}),
		).toThrow();
	});

	test("rejects effectiveUntil before effectiveFrom", () => {
		expect(() =>
			CreateCompanyRelationshipSchema.parse({ ...valid, effectiveUntil: "2019-01-01" }),
		).toThrow();
	});

	test("accepts all valid relationship types", () => {
		for (const rt of ["PARENT", "SUBSIDIARY", "PARTNER", "JOINT_VENTURE", "RESELLER"] as const) {
			expect(() =>
				CreateCompanyRelationshipSchema.parse({ ...valid, relationshipType: rt }),
			).not.toThrow();
		}
	});

	test("rejects invalid relationship type", () => {
		expect(() =>
			CreateCompanyRelationshipSchema.parse({ ...valid, relationshipType: "AFFILIATE" }),
		).toThrow();
	});
});

// ── Pipeline Stage ────────────────────────────────────────────────────────────

describe("CreatePipelineStageSchema", () => {
	const valid = {
		entityId: UUID,
		code: "DISCOVERY",
		name: "Discovery",
		stageOrder: 1,
	};

	test("accepts valid stage", () => {
		expect(() => CreatePipelineStageSchema.parse(valid)).not.toThrow();
	});

	test("accepts closed-won stage with win probability", () => {
		expect(() =>
			CreatePipelineStageSchema.parse({
				...valid,
				code: "CLOSED_WON",
				stageOrder: 6,
				winProbability: 100,
				isClosedWon: true,
			}),
		).not.toThrow();
	});

	test("rejects stage that is both closed-won and closed-lost", () => {
		expect(() =>
			CreatePipelineStageSchema.parse({
				...valid,
				isClosedWon: true,
				isClosedLost: true,
			}),
		).toThrow();
	});

	test("rejects stage order less than 1", () => {
		expect(() => CreatePipelineStageSchema.parse({ ...valid, stageOrder: 0 })).toThrow();
	});

	test("rejects win probability over 100", () => {
		expect(() => CreatePipelineStageSchema.parse({ ...valid, winProbability: 101 })).toThrow();
	});
});

// ── Opportunity ───────────────────────────────────────────────────────────────

describe("CreateOpportunitySchema", () => {
	const valid = {
		entityId: UUID,
		name: "LEO Terminal Fleet 2026",
		pipelineStageId: UUID2,
	};

	test("accepts minimal valid opportunity", () => {
		expect(() => CreateOpportunitySchema.parse(valid)).not.toThrow();
	});

	test("accepts opportunity with amount and lines", () => {
		expect(() =>
			CreateOpportunitySchema.parse({
				...valid,
				crmCompanyId: UUID3,
				amount: "5000000.00",
				currencyCode: "USD",
				probability: 65,
				expectedCloseDate: FUTURE_DATE,
				ownerUserId: UUID3,
				lines: [
					{
						description: "LEO Terminal Model 500 x500",
						quantity: "500",
						unitPrice: "1250.00",
						currencyCode: "USD",
					},
				],
			}),
		).not.toThrow();
	});

	test("rejects amount without currency", () => {
		expect(() => CreateOpportunitySchema.parse({ ...valid, amount: "5000000.00" })).toThrow();
	});

	test("rejects line with mismatched currency", () => {
		expect(() =>
			CreateOpportunitySchema.parse({
				...valid,
				amount: "1000.00",
				currencyCode: "USD",
				lines: [
					{
						description: "Terminal",
						quantity: "1",
						unitPrice: "1000.00",
						currencyCode: "EUR",
					},
				],
			}),
		).toThrow();
	});

	test("rejects probability over 100", () => {
		expect(() => CreateOpportunitySchema.parse({ ...valid, probability: 110 })).toThrow();
	});
});

// ── Activity ──────────────────────────────────────────────────────────────────

describe("CreateActivitySchema", () => {
	const valid = {
		entityId: UUID,
		activityType: "CALL" as const,
		subject: "Intro call with VP Engineering",
		ownerUserId: UUID2,
		crmContactId: UUID3,
	};

	test("accepts minimal valid activity (linked to contact)", () => {
		expect(() => CreateActivitySchema.parse(valid)).not.toThrow();
	});

	test("accepts activity linked to opportunity", () => {
		expect(() =>
			CreateActivitySchema.parse({
				...valid,
				activityType: "MEETING" as const,
				opportunityId: UUID3,
			}),
		).not.toThrow();
	});

	test("accepts all activity types", () => {
		for (const at of ["CALL", "EMAIL", "MEETING", "TASK", "NOTE"] as const) {
			expect(() => CreateActivitySchema.parse({ ...valid, activityType: at })).not.toThrow();
		}
	});

	test("rejects activity with no linked entity", () => {
		const { crmContactId: _c, ...rest } = valid;
		expect(() => CreateActivitySchema.parse(rest)).toThrow();
	});

	test("rejects invalid activity type", () => {
		expect(() => CreateActivitySchema.parse({ ...valid, activityType: "WEBINAR" })).toThrow();
	});

	test("rejects empty subject", () => {
		expect(() => CreateActivitySchema.parse({ ...valid, subject: "" })).toThrow();
	});
});

// ── Lead ──────────────────────────────────────────────────────────────────────

describe("CreateLeadSchema", () => {
	const valid = {
		entityId: UUID,
		firstName: "Alex",
		lastName: "Johnson",
	};

	test("accepts minimal valid lead", () => {
		expect(() => CreateLeadSchema.parse(valid)).not.toThrow();
	});

	test("accepts full lead record", () => {
		expect(() =>
			CreateLeadSchema.parse({
				...valid,
				email: "alex.johnson@prospect.example.com",
				phone: "+1-555-123-4567",
				companyName: "GEO Sat Operators Inc",
				jobTitle: "Director of Network Engineering",
				source: "TRADE_SHOW",
				ownerUserId: UUID2,
				notes: "Met at Satellite 2026 conference",
			}),
		).not.toThrow();
	});

	test("rejects invalid email format", () => {
		expect(() => CreateLeadSchema.parse({ ...valid, email: "not-valid" })).toThrow();
	});

	test("rejects empty last name", () => {
		expect(() => CreateLeadSchema.parse({ ...valid, lastName: "" })).toThrow();
	});
});
