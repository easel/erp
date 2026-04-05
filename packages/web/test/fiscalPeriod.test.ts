import { describe, expect, it } from "bun:test";
import {
	FISCAL_PERIOD_LABELS,
	getFiscalPeriodWarning,
	isFiscalPeriodSelectable,
} from "../src/utils/fiscalPeriod.js";
import type { FiscalPeriodStatus } from "@apogee/shared";

describe("isFiscalPeriodSelectable", () => {
	it("returns true for FUTURE", () => {
		expect(isFiscalPeriodSelectable("FUTURE")).toBe(true);
	});

	it("returns true for OPEN", () => {
		expect(isFiscalPeriodSelectable("OPEN")).toBe(true);
	});

	it("returns true for SOFT_CLOSED", () => {
		expect(isFiscalPeriodSelectable("SOFT_CLOSED")).toBe(true);
	});

	it("returns false for HARD_CLOSED", () => {
		expect(isFiscalPeriodSelectable("HARD_CLOSED")).toBe(false);
	});
});

describe("getFiscalPeriodWarning", () => {
	it("returns null for FUTURE", () => {
		expect(getFiscalPeriodWarning("FUTURE")).toBeNull();
	});

	it("returns null for OPEN", () => {
		expect(getFiscalPeriodWarning("OPEN")).toBeNull();
	});

	it("returns a warning for SOFT_CLOSED", () => {
		const warning = getFiscalPeriodWarning("SOFT_CLOSED");
		expect(warning).not.toBeNull();
		expect(warning).toContain("adjusting");
	});

	it("returns null for HARD_CLOSED", () => {
		expect(getFiscalPeriodWarning("HARD_CLOSED")).toBeNull();
	});
});

describe("FISCAL_PERIOD_LABELS", () => {
	const allStatuses: FiscalPeriodStatus[] = ["FUTURE", "OPEN", "SOFT_CLOSED", "HARD_CLOSED"];

	it("has a label for every status", () => {
		for (const status of allStatuses) {
			expect(FISCAL_PERIOD_LABELS[status]).toBeTruthy();
		}
	});

	it("labels are human-readable strings", () => {
		expect(FISCAL_PERIOD_LABELS.FUTURE).toBe("Future");
		expect(FISCAL_PERIOD_LABELS.OPEN).toBe("Open");
		expect(FISCAL_PERIOD_LABELS.SOFT_CLOSED).toBe("Soft Closed");
		expect(FISCAL_PERIOD_LABELS.HARD_CLOSED).toBe("Hard Closed");
	});
});
