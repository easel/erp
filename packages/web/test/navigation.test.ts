/**
 * Navigation architecture tests (ADR-011 PLT-019).
 * These tests cover the pure logic utilities exported by the navigation components.
 * React rendering is not tested here (no DOM environment in bun:test).
 */

import { describe, expect, it } from "bun:test";
import {
	COMPLIANCE_NAV,
	CRM_NAV,
	FINANCE_NAV,
	PROCUREMENT_NAV,
	SALES_NAV,
	SETTINGS_NAV,
	buildBreadcrumbs,
} from "../src/index.js";

describe("buildBreadcrumbs", () => {
	it("returns empty array for root path", () => {
		expect(buildBreadcrumbs("/")).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		expect(buildBreadcrumbs("")).toEqual([]);
	});

	it("converts a single segment to a non-linked breadcrumb (current page)", () => {
		const result = buildBreadcrumbs("/finance");
		expect(result).toHaveLength(1);
		expect(result[0]?.label).toBe("Finance");
		expect(result[0]?.href).toBeUndefined();
	});

	it("converts two segments, first is linked and second is current", () => {
		const result = buildBreadcrumbs("/finance/journal-entries");
		expect(result).toHaveLength(2);
		expect(result[0]?.label).toBe("Finance");
		expect(result[0]?.href).toBe("/finance");
		expect(result[1]?.label).toBe("Journal Entries");
		expect(result[1]?.href).toBeUndefined();
	});

	it("converts three segments correctly", () => {
		const result = buildBreadcrumbs("/finance/reports/trial-balance");
		expect(result).toHaveLength(3);
		expect(result[0]?.label).toBe("Finance");
		expect(result[0]?.href).toBe("/finance");
		expect(result[1]?.label).toBe("Reports");
		expect(result[1]?.href).toBe("/finance/reports");
		expect(result[2]?.label).toBe("Trial Balance");
		expect(result[2]?.href).toBeUndefined();
	});

	it("humanises an unknown kebab-case segment to Title Case", () => {
		const result = buildBreadcrumbs("/finance/some-custom-page");
		expect(result[1]?.label).toBe("Some Custom Page");
	});

	it("handles dynamic [id] segments", () => {
		const result = buildBreadcrumbs("/finance/journal-entries/JE-001");
		expect(result[2]?.label).toBe("JE-001");
	});

	it("resolves known module labels correctly", () => {
		const modules = [
			["/sales", "Sales"],
			["/procurement", "Procurement"],
			["/crm", "CRM"],
			["/compliance", "Compliance"],
			["/settings", "Settings"],
			["/dashboard", "Dashboard"],
		] as const;
		for (const [path, expected] of modules) {
			const result = buildBreadcrumbs(path);
			expect(result[0]?.label).toBe(expected);
		}
	});
});

describe("Module nav configs", () => {
	describe("FINANCE_NAV", () => {
		it("has at least one item", () => {
			expect(FINANCE_NAV.length).toBeGreaterThan(0);
		});

		it("all items have id and label", () => {
			for (const item of FINANCE_NAV) {
				expect(typeof item.id).toBe("string");
				expect(typeof item.label).toBe("string");
			}
		});

		it("contains journal-entries link", () => {
			const allItems = flattenNavItems(FINANCE_NAV);
			expect(allItems.some((i) => i.href === "/finance/journal-entries")).toBe(true);
		});

		it("contains trial-balance report link", () => {
			const allItems = flattenNavItems(FINANCE_NAV);
			expect(allItems.some((i) => i.href === "/finance/reports/trial-balance")).toBe(true);
		});
	});

	describe("SALES_NAV", () => {
		it("has at least one item", () => {
			expect(SALES_NAV.length).toBeGreaterThan(0);
		});

		it("contains quotes link", () => {
			const allItems = flattenNavItems(SALES_NAV);
			expect(allItems.some((i) => i.href === "/sales/quotes")).toBe(true);
		});

		it("contains orders link", () => {
			const allItems = flattenNavItems(SALES_NAV);
			expect(allItems.some((i) => i.href === "/sales/orders")).toBe(true);
		});
	});

	describe("PROCUREMENT_NAV", () => {
		it("has at least one item", () => {
			expect(PROCUREMENT_NAV.length).toBeGreaterThan(0);
		});

		it("contains purchase-orders link", () => {
			const allItems = flattenNavItems(PROCUREMENT_NAV);
			expect(allItems.some((i) => i.href === "/procurement/purchase-orders")).toBe(true);
		});
	});

	describe("CRM_NAV", () => {
		it("has at least one item", () => {
			expect(CRM_NAV.length).toBeGreaterThan(0);
		});

		it("contains contacts link", () => {
			const allItems = flattenNavItems(CRM_NAV);
			expect(allItems.some((i) => i.href === "/crm/contacts")).toBe(true);
		});
	});

	describe("COMPLIANCE_NAV", () => {
		it("has at least one item", () => {
			expect(COMPLIANCE_NAV.length).toBeGreaterThan(0);
		});

		it("contains screening link", () => {
			const allItems = flattenNavItems(COMPLIANCE_NAV);
			expect(allItems.some((i) => i.href === "/compliance/screening")).toBe(true);
		});

		it("contains holds link", () => {
			const allItems = flattenNavItems(COMPLIANCE_NAV);
			expect(allItems.some((i) => i.href === "/compliance/holds")).toBe(true);
		});
	});

	describe("SETTINGS_NAV", () => {
		it("has at least one item", () => {
			expect(SETTINGS_NAV.length).toBeGreaterThan(0);
		});

		it("contains entities link", () => {
			const allItems = flattenNavItems(SETTINGS_NAV);
			expect(allItems.some((i) => i.href === "/settings/entities")).toBe(true);
		});

		it("contains users link", () => {
			const allItems = flattenNavItems(SETTINGS_NAV);
			expect(allItems.some((i) => i.href === "/settings/users")).toBe(true);
		});
	});

	it("all nav configs have unique ids within each module", () => {
		const allConfigs = [
			FINANCE_NAV,
			SALES_NAV,
			PROCUREMENT_NAV,
			CRM_NAV,
			COMPLIANCE_NAV,
			SETTINGS_NAV,
		];

		for (const nav of allConfigs) {
			const ids = flattenNavItems(nav).map((i) => i.id);
			const unique = new Set(ids);
			expect(unique.size).toBe(ids.length);
		}
	});
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface NavItem {
	id: string;
	label: string;
	href?: string;
	children?: NavItem[];
}

function flattenNavItems(items: NavItem[]): NavItem[] {
	const result: NavItem[] = [];
	for (const item of items) {
		result.push(item);
		if (item.children) {
			result.push(...flattenNavItems(item.children));
		}
	}
	return result;
}
