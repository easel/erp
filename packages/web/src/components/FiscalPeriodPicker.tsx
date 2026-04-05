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

import React, { useId } from "react";
import type { FiscalPeriodStatus } from "@apogee/shared";
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
	const selectedPeriod = fiscalYears
		.flatMap((y) => y.periods)
		.find((p) => p.id === value);

	const warning = selectedPeriod ? getFiscalPeriodWarning(selectedPeriod.status) : null;

	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selected = fiscalYears
			.flatMap((y) => y.periods)
			.find((p) => p.id === e.target.value);

		if (!selected) return;
		if (disableHardClosed && !isFiscalPeriodSelectable(selected.status)) return;
		onChange(e.target.value);
	};

	const describedBy = [warning ? warningId : null, error ? errorId : null]
		.filter(Boolean)
		.join(" ");

	return (
		<div>
			<label
				htmlFor={id}
				style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}
			>
				{label}
				{required && (
					<span aria-hidden="true" style={{ marginLeft: "0.25rem", color: "#dc2626" }}>
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
				style={{
					width: "100%",
					padding: "0.5rem",
					border: `1px solid ${error ? "#dc2626" : "#d1d5db"}`,
					borderRadius: "0.375rem",
					background: disabled ? "#f9fafb" : "#fff",
					cursor: disabled ? "not-allowed" : "pointer",
				}}
			>
				<option value="" disabled>
					Select a fiscal period…
				</option>

				{fiscalYears.map((year) => (
					<optgroup key={year.id} label={year.name}>
						{year.periods.map((period) => {
							const indicator = STATUS_INDICATORS[period.status];
							const isDisabled =
								disableHardClosed && !isFiscalPeriodSelectable(period.status);
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
					role="alert"
					style={{
						margin: "0.25rem 0 0",
						fontSize: "0.875rem",
						color: "#92400e",
						background: "#fef3c7",
						padding: "0.375rem 0.5rem",
						borderRadius: "0.25rem",
					}}
				>
					⚠ {warning}
				</p>
			)}

			{error && (
				<p
					id={errorId}
					role="alert"
					style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#dc2626" }}
				>
					{error}
				</p>
			)}
		</div>
	);
}
