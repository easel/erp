/**
 * Zod schemas for Multi-Currency entities: currency master and exchange rates.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §4.5.
 *
 * Layer 1 (structural) validation only. Layer 2 (e.g., from ≠ to currency,
 * duplicate rate entry) runs server-side.
 */
import { z } from "zod";
import { CurrencyCodeSchema, MoneyAmountSchema, UUIDSchema } from "../schemas.js";

// ── Currency Master ───────────────────────────────────────────────────────────

export const CreateCurrencySchema = z.object({
	code: CurrencyCodeSchema,
	name: z
		.string()
		.min(1, "Currency name is required")
		.max(100, "Currency name must be 100 characters or fewer"),
	symbol: z.string().max(5, "Symbol must be 5 characters or fewer").optional(),
	decimalPlaces: z.number().int().min(0).max(6).optional().default(2),
});

export type CreateCurrencyInput = z.infer<typeof CreateCurrencySchema>;

// ── Exchange Rate Type ────────────────────────────────────────────────────────

export const CreateExchangeRateTypeSchema = z.object({
	code: z
		.string()
		.min(1, "Code is required")
		.max(20, "Code must be 20 characters or fewer")
		.regex(/^[A-Z_]+$/, "Code must be uppercase letters and underscores"),
	name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
	isDefault: z.boolean().optional().default(false),
});

export type CreateExchangeRateTypeInput = z.infer<typeof CreateExchangeRateTypeSchema>;

// ── Exchange Rate ─────────────────────────────────────────────────────────────

/**
 * Exchange rate value — positive decimal with up to 10 decimal places.
 * Corresponds to NUMERIC(18,10) in the DB.
 */
const ExchangeRateValueSchema = z
	.string()
	.regex(
		/^\d{1,8}(\.\d{1,10})?$/,
		"Exchange rate must be a positive decimal (up to 8 integer and 10 decimal digits)",
	)
	.refine((v) => Number.parseFloat(v) > 0, { message: "Exchange rate must be greater than zero" });

export const CreateExchangeRateSchema = z
	.object({
		rateTypeId: UUIDSchema,
		fromCurrency: CurrencyCodeSchema,
		toCurrency: CurrencyCodeSchema,
		rate: ExchangeRateValueSchema,
		effectiveDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		source: z.string().max(50, "Source must be 50 characters or fewer").optional(),
	})
	.refine((data) => data.fromCurrency !== data.toCurrency, {
		message: "From and to currencies must differ",
		path: ["toCurrency"],
	});

export type CreateExchangeRateInput = z.infer<typeof CreateExchangeRateSchema>;

// ── Convenience: Money conversion helper type ─────────────────────────────────

export const MoneyConversionSchema = z.object({
	amount: MoneyAmountSchema,
	fromCurrency: CurrencyCodeSchema,
	toCurrency: CurrencyCodeSchema,
	effectiveDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	rateTypeCode: z.string().max(20).optional(),
});

export type MoneyConversionInput = z.infer<typeof MoneyConversionSchema>;
