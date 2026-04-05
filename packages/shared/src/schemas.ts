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

/** UUID v4 */
export const UUIDSchema = z
	.string()
	.uuid("Must be a valid UUID v4")
	.transform((v) => v as UUID);

/** Monetary amount — string representation of NUMERIC(19,6). See ADR-003. */
export const MoneyAmountSchema = z
	.string()
	.regex(/^\d+(\.\d{1,6})?$/, "Money amount must be a non-negative decimal with up to 6 places");

export const MoneySchema = z.object({
	amount: MoneyAmountSchema,
	currencyCode: CurrencyCodeSchema,
});
