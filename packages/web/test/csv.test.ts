import { describe, expect, it } from "bun:test";
import { exportToCSV } from "../src/utils/csv.js";

describe("exportToCSV", () => {
	const rows = [
		{ id: "1", name: "Alpha Corp", amount: "1234.56" },
		{ id: "2", name: 'Beta "LLC"', amount: "99.00" },
		{ id: "3", name: "Gamma, Inc.", amount: "0.00" },
	];

	it("produces a header row followed by data rows", () => {
		const csv = exportToCSV(rows, ["id", "name", "amount"]);
		const lines = csv.split("\r\n");
		expect(lines[0]).toBe("id,name,amount");
		expect(lines).toHaveLength(4);
	});

	it("uses custom header labels when provided", () => {
		const csv = exportToCSV(rows, ["id", "name", "amount"], {
			id: "ID",
			name: "Company Name",
			amount: "Amount",
		});
		expect(csv.startsWith("ID,Company Name,Amount")).toBe(true);
	});

	it("quotes fields containing commas", () => {
		const csv = exportToCSV(rows, ["name"]);
		const lines = csv.split("\r\n");
		expect(lines[3]).toBe('"Gamma, Inc."');
	});

	it("escapes double quotes inside fields", () => {
		const csv = exportToCSV(rows, ["name"]);
		const lines = csv.split("\r\n");
		expect(lines[2]).toBe('"Beta ""LLC"""');
	});

	it("handles null/undefined values as empty strings", () => {
		const sparse = [{ id: "1", name: null, amount: undefined }] as unknown as Record<
			string,
			unknown
		>[];
		const csv = exportToCSV(sparse, ["id", "name", "amount"]);
		const lines = csv.split("\r\n");
		expect(lines[1]).toBe("1,,");
	});

	it("returns only a header row for an empty data array", () => {
		const csv = exportToCSV([], ["id", "name"]);
		expect(csv).toBe("id,name");
	});

	it("only includes columns listed in the columns array", () => {
		const csv = exportToCSV(rows, ["id"]);
		const lines = csv.split("\r\n");
		expect(lines[0]).toBe("id");
		expect(lines[1]).toBe("1");
	});
});
