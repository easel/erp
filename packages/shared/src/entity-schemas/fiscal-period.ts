/**
 * Zod schemas for Fiscal Year and Fiscal Period entities.
 * Single source of truth per ADR-010 §Single Schema Source of Truth.
 * Matches SD-002-data-model.md §3.1.
 *
 * Layer 1 (structural) validation only. Layer 2 (e.g., overlapping date ranges,
 * period count consistency) runs server-side.
 */
import { z } from "zod";
import { UUIDSchema } from "../schemas.js";

const FISCAL_PERIOD_STATUSES = ["FUTURE", "OPEN", "SOFT_CLOSED", "HARD_CLOSED"] as const;

// ── Fiscal Year ───────────────────────────────────────────────────────────────

export const CreateFiscalYearSchema = z
	.object({
		entityId: UUIDSchema,
		yearLabel: z
			.string()
			.min(1, "Year label is required")
			.max(10, "Year label must be 10 characters or fewer")
			.regex(/^FY\d{4}$/, 'Year label must follow format FY{YYYY} (e.g. "FY2026")'),
		startDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		endDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	})
	.refine((data) => data.endDate > data.startDate, {
		message: "End date must be after start date",
		path: ["endDate"],
	});

export type CreateFiscalYearInput = z.infer<typeof CreateFiscalYearSchema>;

export const CloseFiscalYearSchema = z.object({
	id: UUIDSchema,
});

export type CloseFiscalYearInput = z.infer<typeof CloseFiscalYearSchema>;

// ── Fiscal Period ─────────────────────────────────────────────────────────────

export const CreateFiscalPeriodSchema = z
	.object({
		fiscalYearId: UUIDSchema,
		entityId: UUIDSchema,
		periodNumber: z.number().int().min(1).max(52, "Period number must be between 1 and 52"),
		periodLabel: z
			.string()
			.min(1, "Period label is required")
			.max(20, "Period label must be 20 characters or fewer"),
		startDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
		endDate: z.string().date("Must be a valid date (YYYY-MM-DD)"),
	})
	.refine((data) => data.endDate > data.startDate, {
		message: "End date must be after start date",
		path: ["endDate"],
	});

export type CreateFiscalPeriodInput = z.infer<typeof CreateFiscalPeriodSchema>;

export const UpdateFiscalPeriodStatusSchema = z.object({
	id: UUIDSchema,
	status: z.enum(FISCAL_PERIOD_STATUSES, { error: "Invalid period status" }),
});

export type UpdateFiscalPeriodStatusInput = z.infer<typeof UpdateFiscalPeriodStatusSchema>;
