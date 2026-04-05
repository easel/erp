import type { ValidationError, ValidationErrorResponse } from "@apogee/shared";
/**
 * Server-side Zod validation utilities for Pothos resolvers.
 *
 * Resolvers call `validateInput(schema, rawInput)` to run Layer 1 structural
 * validation using the same Zod schema that the client form uses. This is the
 * mechanism that provides the compile-time guarantee: if a schema field is
 * renamed or removed in @apogee/shared, TypeScript will error here.
 *
 * See ADR-010 §Server-side Pothos resolvers.
 */
import type { ZodType } from "zod";

/**
 * Thrown when Layer 1 (structural) validation fails.
 * Fastify's error handler converts this to a 422 response.
 */
export class ZodValidationError extends Error {
	readonly statusCode = 422;
	readonly response: ValidationErrorResponse;

	constructor(errors: readonly ValidationError[]) {
		super("Validation failed");
		this.name = "ZodValidationError";
		this.response = { errors };
	}
}

/**
 * Validate `rawInput` against `schema`. If validation fails, throws
 * ZodValidationError with structured errors matching the ValidationError
 * contract from @apogee/shared.
 *
 * On success, returns the parsed and typed value.
 *
 * @param schema  A Zod schema from @apogee/shared (Layer 1 structural rules)
 * @param rawInput Unvalidated resolver argument (GraphQL input type)
 */
export function validateInput<TSchema extends ZodType>(
	schema: TSchema,
	rawInput: unknown,
): TSchema["_output"] {
	const result = schema.safeParse(rawInput);
	if (result.success) {
		return result.data as TSchema["_output"];
	}

	const errors: ValidationError[] = result.error.issues.map((issue) => ({
		code: "VALIDATION_ERROR" as const,
		// exactOptionalPropertyTypes: omit field entirely when absent (not undefined)
		...(issue.path.length > 0 ? { field: issue.path.join(".") } : {}),
		message: issue.message,
		rule: issue.code,
	}));

	throw new ZodValidationError(errors);
}
