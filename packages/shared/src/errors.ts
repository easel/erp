/**
 * Error types for @apogee/shared.
 * ValidationError is the canonical server-side Layer 2 error response per ADR-010.
 * Isomorphic — no platform-specific dependencies.
 */

/**
 * Structured validation error returned by server-side Layer 2 validation.
 * See ADR-010 §Error Handling Contract.
 *
 * @field code    — Always "VALIDATION_ERROR" to distinguish from other error shapes.
 * @field field   — The form field that failed, for inline display. Absent for form-level errors.
 * @field message — Human-readable description of the failure.
 * @field rule    — Machine-readable rule identifier (e.g. "CREDIT_LIMIT_EXCEEDED").
 * @field context — Optional additional data (e.g. limit, outstanding balance).
 */
export interface ValidationError {
	readonly code: "VALIDATION_ERROR";
	readonly field?: string;
	readonly message: string;
	readonly rule: string;
	readonly context?: Record<string, unknown>;
}

/**
 * A server response containing one or more Layer 2 validation errors.
 * Returned by resolvers and REST endpoints when state-dependent validation fails.
 */
export interface ValidationErrorResponse {
	readonly errors: readonly ValidationError[];
}

/** Type guard — narrows an unknown API response to ValidationErrorResponse. */
export function isValidationErrorResponse(v: unknown): v is ValidationErrorResponse {
	return (
		typeof v === "object" &&
		v !== null &&
		"errors" in v &&
		Array.isArray((v as Record<string, unknown>).errors) &&
		((v as ValidationErrorResponse).errors as unknown[]).every(isValidationError)
	);
}

/** Type guard — narrows to a single ValidationError. */
export function isValidationError(v: unknown): v is ValidationError {
	return (
		typeof v === "object" &&
		v !== null &&
		(v as Record<string, unknown>).code === "VALIDATION_ERROR" &&
		typeof (v as Record<string, unknown>).message === "string" &&
		typeof (v as Record<string, unknown>).rule === "string"
	);
}
