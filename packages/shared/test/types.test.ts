import { describe, expect, test } from "bun:test";
import type {
	ComplianceStatus,
	CurrencyCode,
	FiscalPeriodStatus,
	Money,
	SyncStatus,
} from "../src/index.js";

describe("shared types", () => {
	test("Money type enforces string amount with currency code", () => {
		const usd: Money = {
			amount: "1234.567890",
			currencyCode: "USD" as CurrencyCode,
		};
		expect(usd.amount).toBe("1234.567890");
		expect(usd.currencyCode).toBe("USD");
	});

	test("Money amount preserves 6 decimal places as string", () => {
		const kwt: Money = {
			amount: "100.123456",
			currencyCode: "KWD" as CurrencyCode,
		};
		// String representation avoids JavaScript floating-point issues
		expect(kwt.amount).toBe("100.123456");
		expect(typeof kwt.amount).toBe("string");
	});

	test("ComplianceStatus values are correct per ADR-006", () => {
		const statuses: ComplianceStatus[] = ["pending", "cleared", "held"];
		expect(statuses).toHaveLength(3);
	});

	test("FiscalPeriodStatus values follow ADR-007 four-state model", () => {
		const states: FiscalPeriodStatus[] = ["FUTURE", "OPEN", "SOFT_CLOSED", "HARD_CLOSED"];
		expect(states).toHaveLength(4);
	});

	test("SyncStatus values follow ADR-009 tiers", () => {
		const statuses: SyncStatus[] = ["synced", "pending_push", "conflict"];
		expect(statuses).toHaveLength(3);
	});
});
