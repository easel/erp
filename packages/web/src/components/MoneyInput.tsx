/**
 * MoneyInput — paired amount field + currency selector.
 *
 * Design rules (ADR-003, ADR-011 PLT-018):
 *  - Amount is always stored as a string, never a JS number.
 *  - Validated against MoneyAmountSchema on every change.
 *  - Displayed with thousand separators and ISO 4217 decimal places.
 *  - Right-aligned text (financial convention).
 *  - Currency selector is always submitted together with the amount.
 *  - Supports negative amounts via a leading minus toggle.
 *
 * Accessibility: WCAG 2.1 AA — labelled inputs, visible focus, error role.
 *
 * @example
 * <MoneyInput
 *   id="unit-price"
 *   label="Unit Price"
 *   amount={form.amount}
 *   currencyCode={form.currency}
 *   onAmountChange={(v) => setForm(f => ({ ...f, amount: v }))}
 *   onCurrencyChange={(c) => setForm(f => ({ ...f, currency: c }))}
 * />
 */

import type { CurrencyCode } from "@apogee/shared";
import type React from "react";
import { useId, useState } from "react";
import { cn } from "../lib/utils.js";
import { formatMoneyDisplay, getDecimalPlaces, parseMoneyInput } from "../utils/money.js";

/** Subset of ISO 4217 codes surfaced in the currency selector. */
const COMMON_CURRENCIES: CurrencyCode[] = [
	"USD",
	"EUR",
	"GBP",
	"JPY",
	"CAD",
	"AUD",
	"CHF",
	"CNY",
	"HKD",
	"SGD",
	"SEK",
	"NOK",
	"DKK",
	"NZD",
	"MXN",
	"BRL",
	"ZAR",
	"INR",
	"KRW",
	"AED",
	"KWD",
	"BHD",
	"OMR",
] as unknown[] as CurrencyCode[];

export interface MoneyInputProps {
	/** HTML id for the amount input (currency input gets id + "-currency"). */
	id: string;
	/** Visible label rendered above the field group. */
	label: string;
	/** Controlled amount value — a validated MoneyAmountSchema string or empty string. */
	amount: string;
	/** Controlled ISO 4217 currency code. */
	currencyCode: CurrencyCode;
	/** Called with the new raw storage string whenever the amount changes. */
	onAmountChange: (amount: string) => void;
	/** Called with the new currency code whenever the selector changes. */
	onCurrencyChange: (currency: CurrencyCode) => void;
	/** Additional currencies to include beyond the built-in common list. */
	additionalCurrencies?: CurrencyCode[];
	/** Prevents interaction. */
	disabled?: boolean;
	/** Marks the field as required in accessible form markup. */
	required?: boolean;
	/** Error message surfaced below the inputs. */
	error?: string;
	/** Hint text rendered below the label. */
	hint?: string;
}

/**
 * MoneyInput component — formats per ISO 4217, validates with MoneyAmountSchema,
 * stores string (never JS number), right-aligned, paired currency selector.
 */
export function MoneyInput({
	id,
	label,
	amount,
	currencyCode,
	onAmountChange,
	onCurrencyChange,
	additionalCurrencies,
	disabled = false,
	required = false,
	error,
	hint,
}: MoneyInputProps): React.ReactElement {
	const errorId = useId();
	const hintId = useId();
	const currencyId = `${id}-currency`;

	// Raw display value while the user is typing; formatted on blur
	const [displayValue, setDisplayValue] = useState(
		amount ? formatMoneyDisplay(amount, currencyCode) : "",
	);
	const [hasError, setHasError] = useState(false);

	const currencies = [...new Set([...COMMON_CURRENCIES, ...(additionalCurrencies ?? [])])];

	const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value;
		setDisplayValue(raw);

		// Allow empty or in-progress input (e.g. "1." mid-type)
		if (raw === "" || raw === "-") {
			setHasError(false);
			onAmountChange("");
			return;
		}

		const parsed = parseMoneyInput(raw);
		if (parsed !== null) {
			setHasError(false);
			onAmountChange(parsed);
		} else {
			setHasError(true);
		}
	};

	const handleAmountBlur = () => {
		// Reformat on blur using the authoritative stored value
		if (amount) {
			setDisplayValue(formatMoneyDisplay(amount, currencyCode));
			setHasError(false);
		}
	};

	const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newCurrency = e.target.value as CurrencyCode;
		onCurrencyChange(newCurrency);
		// Re-format the displayed amount for the new currency's decimal places
		if (amount) {
			setDisplayValue(formatMoneyDisplay(amount, newCurrency));
		}
	};

	const decimals = getDecimalPlaces(currencyCode);
	const showError = hasError || !!error;
	const describedBy = [showError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

	return (
		<div>
			<label htmlFor={id} className="block mb-1 font-semibold">
				{label}
				{required && (
					<span aria-hidden="true" className="ml-1 text-red-600">
						*
					</span>
				)}
			</label>

			{hint && (
				<p id={hintId} className="m-0 mb-1 text-sm text-gray-500">
					{hint}
				</p>
			)}

			<div className="flex gap-2">
				{/* Currency selector */}
				<select
					id={currencyId}
					aria-label={`Currency for ${label}`}
					value={currencyCode}
					onChange={handleCurrencyChange}
					disabled={disabled}
					className={cn(
						"p-2 border rounded-md min-w-20",
						showError ? "border-red-600" : "border-gray-300",
						disabled ? "bg-gray-50 cursor-not-allowed" : "bg-white cursor-pointer",
					)}
				>
					{currencies.map((c) => (
						<option key={c} value={c}>
							{c}
						</option>
					))}
				</select>

				{/* Amount input */}
				<input
					id={id}
					type="text"
					inputMode="decimal"
					value={displayValue}
					onChange={handleAmountChange}
					onBlur={handleAmountBlur}
					disabled={disabled}
					required={required}
					aria-required={required}
					aria-invalid={showError}
					aria-describedby={describedBy || undefined}
					placeholder={decimals === 0 ? "0" : `0.${"0".repeat(decimals)}`}
					className={cn(
						"flex-1 p-2 text-right border rounded-md tabular-nums",
						showError ? "border-red-600" : "border-gray-300",
						disabled ? "bg-gray-50 cursor-not-allowed" : "bg-white cursor-text",
					)}
				/>
			</div>

			{showError && (
				<p
					id={errorId}
					aria-live="assertive"
					aria-atomic="true"
					className="mt-1 mb-0 text-sm text-red-600"
				>
					{error ?? "Invalid amount. Use up to 13 integer digits and 6 decimal places."}
				</p>
			)}
		</div>
	);
}
