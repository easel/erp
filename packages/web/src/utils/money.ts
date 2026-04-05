/**
 * Money formatting and parsing utilities.
 * All values are stored as strings — never JavaScript number. See ADR-003.
 */

import { MoneyAmountSchema } from "@apogee/shared";

/**
 * ISO 4217 decimal place overrides for currencies that differ from the default 2.
 * Currencies not listed here use 2 decimal places.
 */
const DECIMAL_PLACES: Record<string, number> = {
	// Zero decimal places
	BIF: 0,
	CLP: 0,
	DJF: 0,
	GNF: 0,
	ISK: 0,
	JPY: 0,
	KMF: 0,
	KRW: 0,
	PYG: 0,
	RWF: 0,
	UGX: 0,
	UYI: 0,
	VND: 0,
	VUV: 0,
	XAF: 0,
	XOF: 0,
	XPF: 0,
	// Three decimal places
	BHD: 3,
	IQD: 3,
	JOD: 3,
	KWD: 3,
	LYD: 3,
	MRU: 3,
	OMR: 3,
	TND: 3,
};

/**
 * Returns the number of decimal places for a given ISO 4217 currency code.
 * Defaults to 2 for unknown currencies.
 */
export function getDecimalPlaces(currencyCode: string): number {
	return DECIMAL_PLACES[currencyCode] ?? 2;
}

/**
 * Formats a money amount string for display with thousand separators and correct
 * decimal places per ISO 4217. Returns the raw amount if parsing fails.
 */
export function formatMoneyDisplay(amount: string, currencyCode: string): string {
	const num = Number(amount);
	if (!Number.isFinite(num)) return amount;
	const decimals = getDecimalPlaces(currencyCode);
	return num.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

/**
 * Strips thousand separators and normalises a user's raw input into a storage
 * string (e.g. "1,234.50" → "1234.50").  Returns null if the result is not a
 * valid MoneyAmountSchema value.
 */
export function parseMoneyInput(raw: string): string | null {
	// Remove commas (thousand separators) and trim whitespace
	const cleaned = raw.replace(/,/g, "").trim();
	const result = MoneyAmountSchema.safeParse(cleaned);
	return result.success ? result.data : null;
}

/**
 * Returns true when the given string is a valid MoneyAmountSchema value.
 */
export function isValidMoneyAmount(value: string): boolean {
	return MoneyAmountSchema.safeParse(value).success;
}
