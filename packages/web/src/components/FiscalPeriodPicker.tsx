/**
 * FiscalPeriodPicker — dropdown for selecting a fiscal year / period for posting.
 *
 * Design rules (ADR-007, ADR-011 PLT-018):
 *  - Shows fiscal years and their child periods with status colour-coding.
 *  - HARD_CLOSED periods are disabled and cannot be selected for posting.
 *  - SOFT_CLOSED periods show an inline warning: "Only adjusting entries allowed."
 *  - Status colours: FUTURE (gray), OPEN (green), SOFT_CLOSED (amber), HARD_CLOSED (red).
 *
 * Accessibility: WCAG 2.1 AA — grouped <optgroup> with status labels, aria-describedby
 * for warnings, disabled attribute on HARD_CLOSED options.
 *
 * @example
 * <FiscalPeriodPicker
 *   fiscalYears={years}
 *   value={postingPeriodId}
 *   onChange={setPostingPeriodId}
 *   disableHardClosed
 * />
 */

import type { FiscalPeriodStatus } from "@apogee/shared";
import type React from "react";
import { useId } from "react";
import { cn } from "../lib/utils.js";
import {
	FISCAL_PERIOD_LABELS,
	getFiscalPeriodWarning,
	isFiscalPeriodSelectable,
} from "../utils/fiscalPeriod.js";

export interface FiscalPeriod {
	id: string;
	name: string;
	status: FiscalPeriodStatus;
	/** ISO date string for the period start (used for sort ordering). */
	startDate: string;
}

export interface FiscalYear {
	id: string;
	name: string;
	periods: FiscalPeriod[];
}

export interface FiscalPeriodPickerProps {
	fiscalYears: FiscalYear[];
	/** Selected period id. */
	value: string | null;
	onChange: (periodId: string) => void;
	/** When true, HARD_CLOSED periods are disabled (default true). */
	disableHardClosed?: boolean;
	id?: string;
	label?: string;
	required?: boolean;
	disabled?: boolean;
	error?: string;
}

const STATUS_INDICATORS: Record<FiscalPeriodStatus, { symbol: string; color: string }> = {
	FUTURE: { symbol: "○", color: "#6b7280" },
	OPEN: { symbol: "●", color: "#10b981" },
	SOFT_CLOSED: { symbol: "◑", color: "#f59e0b" },
	HARD_CLOSED: { symbol: "■", color: "#ef4444" },
};

/**
 * FiscalPeriodPicker renders an accessible grouped select with visual status
 * indicators for each fiscal period.
 */
export function FiscalPeriodPicker({
	fiscalYears,
	value,
	onChange,
	disableHardClosed = true,
	id: idProp,
	label = "Fiscal Period",
	required = false,
	disabled = false,
	error,
}: FiscalPeriodPickerProps): React.ReactElement {
	const generatedId = useId();
	const id = idProp ?? generatedId;
	const warningId = useId();
	const errorId = useId();

	// Find the status of the currently selected period
	const selectedPeriod = fiscalYears.flatMap((y) => y.periods).find((p) => p.id === value);

	const warning = selectedPeriod ? getFiscalPeriodWarning(selectedPeriod.status) : null;

	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selected = fiscalYears.flatMap((y) => y.periods).find((p) => p.id === e.target.value);

		if (!selected) return;
		if (disableHardClosed && !isFiscalPeriodSelectable(selected.status)) return;
		onChange(e.target.value);
	};

	const describedBy = [warning ? warningId : null, error ? errorId : null]
		.filter(Boolean)
		.join(" ");

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

			<select
				id={id}
				value={value ?? ""}
				onChange={handleChange}
				disabled={disabled}
				required={required}
				aria-required={required}
				aria-invalid={!!error}
				aria-describedby={describedBy || undefined}
				className={cn(
					"w-full p-2 border rounded-md",
					error ? "border-red-600" : "border-gray-300",
					disabled ? "bg-gray-50 cursor-not-allowed" : "bg-white cursor-pointer",
				)}
			>
				<option value="" disabled>
					Select a fiscal period…
				</option>

				{fiscalYears.map((year) => (
					<optgroup key={year.id} label={year.name}>
						{year.periods.map((period) => {
							const indicator = STATUS_INDICATORS[period.status];
							const isDisabled = disableHardClosed && !isFiscalPeriodSelectable(period.status);
							return (
								<option
									key={period.id}
									value={period.id}
									disabled={isDisabled}
									aria-label={`${period.name} — ${FISCAL_PERIOD_LABELS[period.status]}${isDisabled ? " (not available for posting)" : ""}`}
								>
									{indicator.symbol} {period.name} — {FISCAL_PERIOD_LABELS[period.status]}
									{isDisabled ? " (locked)" : ""}
								</option>
							);
						})}
					</optgroup>
				))}
			</select>

			{warning && (
				<p
					id={warningId}
					aria-live="assertive"
					aria-atomic="true"
					className="mt-1 text-sm text-amber-800 bg-amber-100 py-1.5 px-2 rounded"
				>
					⚠ {warning}
				</p>
			)}

			{error && (
				<p
					id={errorId}
					aria-live="assertive"
					aria-atomic="true"
					className="mt-1 text-sm text-red-600"
				>
					{error}
				</p>
			)}
		</div>
	);
}
