import { z } from "zod";
import type { CountryCode, CurrencyCode, UUID } from "./types.js";

/** ISO 4217 currency code — 3 uppercase letters */
export const CurrencyCodeSchema = z
	.string()
	.regex(/^[A-Z]{3}$/, "Currency code must be 3 uppercase letters (ISO 4217)")
	.transform((v) => v as CurrencyCode);

/** ISO 3166-1 alpha-2 country code — 2 uppercase letters */
export const CountryCodeSchema = z
	.string()
	.regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters (ISO 3166-1 alpha-2)")
	.transform((v) => v as CountryCode);

/**
 * UUID — accepts any 8-4-4-4-12 hex string. Not restricted to v4 because
 * deterministic seed UUIDs use a structured format (e.g. a0000000-0000-0000-...)
 * for human readability while still being unique.
 */
export const UUIDSchema = z
	.string()
	.regex(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		"Must be a valid UUID",
	)
	.transform((v) => v as UUID);

/**
 * Monetary amount — non-negative string representation of NUMERIC(19,6). See ADR-003.
 * Allows up to 13 integer digits and 6 decimal digits (NUMERIC(19,6) = 19 total - 6 decimal).
 *
 * Design decision (erp-82b5cf50): amounts are always unsigned (non-negative). Sign is encoded
 * via debit/credit type fields or separate debit/credit columns in the data model (SD-002).
 * The `MoneyInput` UI component accepts only positive values; credit/adjustment contexts
 * pair a positive amount with a DEBIT | CREDIT type selector. See ADR-011.
 */
export const MoneyAmountSchema = z
	.string()
	.regex(
		/^\d{1,13}(\.\d{1,6})?$/,
		"Money amount must be a non-negative decimal with up to 13 integer digits and 6 decimal places (NUMERIC(19,6))",
	);

export const MoneySchema = z.object({
	amount: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
});
