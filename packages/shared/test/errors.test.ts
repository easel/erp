import { describe, expect, test } from "vitest";
import {
	type ValidationError,
	type ValidationErrorResponse,
	isValidationError,
	isValidationErrorResponse,
} from "../src/index.js";

describe("ValidationError type", () => {
	test("satisfies the ADR-010 error contract shape", () => {
		const err: ValidationError = {
			code: "VALIDATION_ERROR",
			field: "customerId",
			message: "Customer is on the denied-party list",
			rule: "DENIED_PARTY_SCREENING_HIT",
			context: { matchScore: 0.97, listSource: "BIS" },
		};
		expect(err.code).toBe("VALIDATION_ERROR");
		expect(err.field).toBe("customerId");
		expect(err.rule).toBe("DENIED_PARTY_SCREENING_HIT");
	});

	test("field is optional (form-level error)", () => {
		const err: ValidationError = {
			code: "VALIDATION_ERROR",
			message: "Credit limit exceeded",
			rule: "CREDIT_LIMIT_EXCEEDED",
			context: { limit: "50000.00", outstanding: "48000.00", orderValue: "5000.00" },
		};
		expect(err.field).toBeUndefined();
		expect(err.context).toMatchObject({ limit: "50000.00" });
	});

	test("context is optional", () => {
		const err: ValidationError = {
			code: "VALIDATION_ERROR",
			message: "Fiscal period is closed",
			rule: "FISCAL_PERIOD_CLOSED",
		};
		expect(err.context).toBeUndefined();
	});
});

describe("isValidationError", () => {
	test("returns true for a valid ValidationError", () => {
		const err = {
			code: "VALIDATION_ERROR",
			message: "bad",
			rule: "BAD_RULE",
		};
		expect(isValidationError(err)).toBe(true);
	});

	test("returns false when code is missing", () => {
		expect(isValidationError({ message: "bad", rule: "X" })).toBe(false);
	});

	test("returns false for non-object", () => {
		expect(isValidationError("error")).toBe(false);
		expect(isValidationError(null)).toBe(false);
		expect(isValidationError(undefined)).toBe(false);
	});

	test("returns false when code is not VALIDATION_ERROR", () => {
		expect(isValidationError({ code: "OTHER_ERROR", message: "x", rule: "y" })).toBe(false);
	});
});

describe("isValidationErrorResponse", () => {
	test("returns true for a valid response with one error", () => {
		const response: ValidationErrorResponse = {
			errors: [
				{
					code: "VALIDATION_ERROR",
					message: "Denied party",
					rule: "DENIED_PARTY",
				},
			],
		};
		expect(isValidationErrorResponse(response)).toBe(true);
	});

	test("returns true for an empty errors array", () => {
		expect(isValidationErrorResponse({ errors: [] })).toBe(true);
	});

	test("returns false when errors is not an array", () => {
		expect(isValidationErrorResponse({ errors: "bad" })).toBe(false);
	});

	test("returns false when errors contains invalid entries", () => {
		expect(
			isValidationErrorResponse({ errors: [{ code: "OTHER", message: "x", rule: "y" }] }),
		).toBe(false);
	});

	test("returns false for non-object", () => {
		expect(isValidationErrorResponse(null)).toBe(false);
		expect(isValidationErrorResponse([])).toBe(false);
	});
});
