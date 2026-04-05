import type { ValidationError, ValidationErrorResponse } from "@apogee/shared";
/**
 * Utilities for mapping server-side ValidationError responses to React Hook Form.
 * See ADR-010 §Error Handling Contract.
 */
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

/**
 * Maps a server ValidationErrorResponse onto a React Hook Form instance.
 *
 * - Errors with a `field` key are set as inline field errors.
 * - Errors without a `field` key are set on the `root` key (form-level banner).
 *
 * @param errors  Structured errors from the server Layer 2 response.
 * @param setError React Hook Form's setError function.
 */
export function applyServerErrors<TFieldValues extends FieldValues>(
	errors: ValidationErrorResponse,
	setError: UseFormSetError<TFieldValues>,
): void {
	for (const err of errors.errors) {
		if (err.field) {
			// Field-level inline error
			setError(err.field as FieldPath<TFieldValues>, {
				type: "server",
				message: err.message,
			});
		} else {
			// Form-level banner error — stored under `root.${rule}`
			setError(`root.${err.rule}` as FieldPath<TFieldValues>, {
				type: "server",
				message: err.message,
			});
		}
	}
}

/**
 * Extracts form-level (no `field`) errors from a ValidationErrorResponse.
 * Used by the OfflineDeferralBanner and form-level error displays.
 */
export function getFormLevelErrors(response: ValidationErrorResponse): readonly ValidationError[] {
	return response.errors.filter((e) => !e.field);
}
