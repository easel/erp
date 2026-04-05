import { describe, expect, test } from "bun:test";
import {
	CountryCodeSchema,
	CurrencyCodeSchema,
	MoneyAmountSchema,
	MoneySchema,
	UUIDSchema,
} from "../src/index.js";

describe("CurrencyCodeSchema", () => {
	test("accepts valid ISO 4217 codes", () => {
		expect(CurrencyCodeSchema.parse("USD")).toBe("USD");
		expect(CurrencyCodeSchema.parse("EUR")).toBe("EUR");
		expect(CurrencyCodeSchema.parse("KWD")).toBe("KWD");
	});

	test("rejects lowercase", () => {
		expect(() => CurrencyCodeSchema.parse("usd")).toThrow();
	});

	test("rejects wrong length", () => {
		expect(() => CurrencyCodeSchema.parse("US")).toThrow();
		expect(() => CurrencyCodeSchema.parse("USDT")).toThrow();
	});

	test("rejects non-alpha characters", () => {
		expect(() => CurrencyCodeSchema.parse("U5D")).toThrow();
		expect(() => CurrencyCodeSchema.parse("")).toThrow();
	});
});

describe("CountryCodeSchema", () => {
	test("accepts valid ISO 3166-1 alpha-2 codes", () => {
		expect(CountryCodeSchema.parse("US")).toBe("US");
		expect(CountryCodeSchema.parse("GB")).toBe("GB");
		expect(CountryCodeSchema.parse("DE")).toBe("DE");
	});

	test("rejects lowercase", () => {
		expect(() => CountryCodeSchema.parse("us")).toThrow();
	});

	test("rejects wrong length", () => {
		expect(() => CountryCodeSchema.parse("U")).toThrow();
		expect(() => CountryCodeSchema.parse("USA")).toThrow();
	});

	test("rejects non-alpha characters", () => {
		expect(() => CountryCodeSchema.parse("U1")).toThrow();
	});
});

describe("UUIDSchema", () => {
	test("accepts valid UUID v4", () => {
		const id = "550e8400-e29b-41d4-a716-446655440000";
		expect(UUIDSchema.parse(id)).toBe(id);
	});

	test("rejects non-UUID strings", () => {
		expect(() => UUIDSchema.parse("not-a-uuid")).toThrow();
		expect(() => UUIDSchema.parse("")).toThrow();
	});
});

describe("MoneyAmountSchema", () => {
	test("accepts valid decimal amounts", () => {
		expect(MoneyAmountSchema.parse("100")).toBe("100");
		expect(MoneyAmountSchema.parse("1234.567890")).toBe("1234.567890");
		expect(MoneyAmountSchema.parse("0.000001")).toBe("0.000001");
	});

	test("rejects more than 6 decimal places", () => {
		expect(() => MoneyAmountSchema.parse("1.1234567")).toThrow();
	});

	test("rejects negative amounts", () => {
		expect(() => MoneyAmountSchema.parse("-10.00")).toThrow();
	});

	test("accepts max NUMERIC(19,6) integer digits (13) with 6 decimal places", () => {
		expect(MoneyAmountSchema.parse("1234567890123.123456")).toBe("1234567890123.123456");
	});

	test("rejects more than 13 integer digits (exceeds NUMERIC(19,6) limit)", () => {
		expect(() => MoneyAmountSchema.parse("12345678901234")).toThrow();
	});
});

describe("MoneySchema", () => {
	test("accepts valid money object", () => {
		const result = MoneySchema.parse({ amount: "99.99", currencyCode: "USD" });
		expect(result.amount).toBe("99.99");
		expect(result.currencyCode).toBe("USD");
	});

	test("rejects invalid currency code", () => {
		expect(() => MoneySchema.parse({ amount: "10.00", currencyCode: "us" })).toThrow();
	});

	test("rejects invalid amount", () => {
		expect(() => MoneySchema.parse({ amount: "-5.00", currencyCode: "USD" })).toThrow();
	});
});
