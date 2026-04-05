import { describe, expect, it } from "bun:test";
import {
	formatMoneyDisplay,
	getDecimalPlaces,
	isValidMoneyAmount,
	parseMoneyInput,
} from "../src/utils/money.js";

describe("getDecimalPlaces", () => {
	it("returns 2 for USD", () => {
		expect(getDecimalPlaces("USD")).toBe(2);
	});

	it("returns 0 for JPY", () => {
		expect(getDecimalPlaces("JPY")).toBe(0);
	});

	it("returns 0 for KRW", () => {
		expect(getDecimalPlaces("KRW")).toBe(0);
	});

	it("returns 3 for KWD", () => {
		expect(getDecimalPlaces("KWD")).toBe(3);
	});

	it("returns 3 for BHD", () => {
		expect(getDecimalPlaces("BHD")).toBe(3);
	});

	it("returns 3 for OMR", () => {
		expect(getDecimalPlaces("OMR")).toBe(3);
	});

	it("defaults to 2 for unknown currency", () => {
		expect(getDecimalPlaces("XYZ")).toBe(2);
	});

	it("returns 2 for EUR", () => {
		expect(getDecimalPlaces("EUR")).toBe(2);
	});
});

describe("formatMoneyDisplay", () => {
	it("formats USD with 2 decimal places and thousand separators", () => {
		const result = formatMoneyDisplay("1234567.89", "USD");
		expect(result).toBe("1,234,567.89");
	});

	it("formats JPY with 0 decimal places", () => {
		const result = formatMoneyDisplay("1234567", "JPY");
		expect(result).toBe("1,234,567");
	});

	it("formats KWD with 3 decimal places", () => {
		const result = formatMoneyDisplay("1234.567", "KWD");
		expect(result).toBe("1,234.567");
	});

	it("returns the raw amount if not a valid number", () => {
		expect(formatMoneyDisplay("not-a-number", "USD")).toBe("not-a-number");
	});

	it("formats zero correctly for USD", () => {
		expect(formatMoneyDisplay("0", "USD")).toBe("0.00");
	});
});

describe("parseMoneyInput", () => {
	it("strips thousand separators", () => {
		expect(parseMoneyInput("1,234,567.89")).toBe("1234567.89");
	});

	it("trims whitespace", () => {
		expect(parseMoneyInput("  100.00  ")).toBe("100.00");
	});

	it("accepts a plain integer string", () => {
		expect(parseMoneyInput("42")).toBe("42");
	});

	it("returns null for an empty string", () => {
		expect(parseMoneyInput("")).toBeNull();
	});

	it("returns null for non-numeric input", () => {
		expect(parseMoneyInput("abc")).toBeNull();
	});

	it("returns null for negative input (MoneyAmountSchema is non-negative)", () => {
		expect(parseMoneyInput("-100")).toBeNull();
	});

	it("returns null when integer part exceeds 13 digits", () => {
		expect(parseMoneyInput("99999999999999.00")).toBeNull();
	});

	it("accepts up to 6 decimal places", () => {
		expect(parseMoneyInput("1.123456")).toBe("1.123456");
	});

	it("returns null when decimal places exceed 6", () => {
		expect(parseMoneyInput("1.1234567")).toBeNull();
	});
});

describe("isValidMoneyAmount", () => {
	it("returns true for a valid amount", () => {
		expect(isValidMoneyAmount("100.00")).toBe(true);
	});

	it("returns true for a zero-decimal amount", () => {
		expect(isValidMoneyAmount("1000")).toBe(true);
	});

	it("returns false for an empty string", () => {
		expect(isValidMoneyAmount("")).toBe(false);
	});

	it("returns false for a negative string", () => {
		expect(isValidMoneyAmount("-1")).toBe(false);
	});

	it("returns false for non-numeric input", () => {
		expect(isValidMoneyAmount("abc")).toBe(false);
	});
});
