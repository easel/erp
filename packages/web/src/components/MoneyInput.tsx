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
			<label htmlFor={id} style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
				{label}
				{required && (
					<span aria-hidden="true" style={{ marginLeft: "0.25rem", color: "#dc2626" }}>
						*
					</span>
				)}
			</label>

			{hint && (
				<p id={hintId} style={{ margin: "0 0 0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
					{hint}
				</p>
			)}

			<div style={{ display: "flex", gap: "0.5rem" }}>
				{/* Currency selector */}
				<select
					id={currencyId}
					aria-label={`Currency for ${label}`}
					value={currencyCode}
					onChange={handleCurrencyChange}
					disabled={disabled}
					style={{
						padding: "0.5rem",
						border: `1px solid ${showError ? "#dc2626" : "#d1d5db"}`,
						borderRadius: "0.375rem",
						background: disabled ? "#f9fafb" : "#fff",
						cursor: disabled ? "not-allowed" : "pointer",
						minWidth: "5rem",
					}}
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
					style={{
						flex: 1,
						padding: "0.5rem",
						textAlign: "right",
						border: `1px solid ${showError ? "#dc2626" : "#d1d5db"}`,
						borderRadius: "0.375rem",
						background: disabled ? "#f9fafb" : "#fff",
						fontVariantNumeric: "tabular-nums",
						cursor: disabled ? "not-allowed" : "text",
					}}
				/>
			</div>

			{showError && (
				<p
					id={errorId}
					role="alert"
					style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#dc2626" }}
				>
					{error ?? "Invalid amount. Use up to 13 integer digits and 6 decimal places."}
				</p>
			)}
		</div>
	);
}
