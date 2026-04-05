/**
 * Tests for customs document generation service — LOG-002.
 *
 * Verifies:
 *   - Commercial invoice includes correct classification data and DCS for ITAR items
 *   - Packing list generated from package/line data
 *   - SLI generated with shipper/consignee/port data
 *   - EEI/AES data pre-populated with ECCN/USML, license type, and destination
 *   - Generation blocked when export license required but not attached
 *   - No DCS on non-controlled shipment
 *
 * Ref: FEAT-007 §LOG-002, SD-003-WP6, hx-3937d062
 */

import { describe, expect, it } from "bun:test";
import {
	ExportLicenseRequiredError,
	type GenerateCustomsDocumentsInput,
	type ItemClassification,
	type ShipmentLineItem,
	type ShipmentPackage,
	generateCustomsDocuments,
} from "../src/logistics/customs-document-service.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const SELLER = {
	name: "Apogee Satellite Systems LLC",
	address: "100 Orbit Drive, McLean, VA 22102, USA",
	countryCode: "US",
	ein: "12-3456789",
};

const BUYER = {
	name: "Allied Ground Station GmbH",
	address: "Raumfahrtstraße 1, Munich 80333, DE",
	countryCode: "DE",
};

const LINES_EAR: ShipmentLineItem[] = [
	{
		lineNumber: 1,
		description: "Satellite Modem Model X200",
		partNumber: "SAT-MDM-X200",
		hsCode: "8517620000",
		countryOfOrigin: "US",
		quantity: "2",
		unitOfMeasure: "EA",
		unitPrice: "12500.00",
		totalPrice: "25000.00",
		weightKg: 3.5,
	},
];

const CLASSIFICATIONS_EAR: ItemClassification[] = [
	{
		lineNumber: 1,
		jurisdiction: "EAR",
		eccn: "5A001.b.3",
		licenseRequirement: "NLR",
	},
];

const LINES_ITAR: ShipmentLineItem[] = [
	{
		lineNumber: 1,
		description: "Tactical RF Transceiver Assembly",
		partNumber: "RF-TAC-001",
		hsCode: "8526910000",
		countryOfOrigin: "US",
		quantity: "1",
		unitOfMeasure: "EA",
		unitPrice: "85000.00",
		totalPrice: "85000.00",
		weightKg: 8.2,
	},
];

const CLASSIFICATIONS_ITAR: ItemClassification[] = [
	{
		lineNumber: 1,
		jurisdiction: "ITAR",
		usmlCategory: "XI",
		eccn: undefined,
		licenseRequirement: "LICENSE_REQUIRED",
		licenseNumber: "MDE-2026-12345",
	},
];

const PACKAGES: ShipmentPackage[] = [
	{
		packageNumber: 1,
		marks: "FRAGILE — HANDLE WITH CARE",
		lineNumbers: [1],
		weightKg: 12.0,
		dimensionsCm: { length: 60, width: 40, height: 30 },
	},
];

function baseInput(
	lines: ShipmentLineItem[],
	classifications: ItemClassification[],
	packages: ShipmentPackage[] = PACKAGES,
): GenerateCustomsDocumentsInput {
	return {
		shipmentNumber: "SHP-2026-0042",
		shipDate: "2026-04-10",
		seller: SELLER,
		buyer: BUYER,
		destinationCountry: "DE",
		shipToAddress: "Raumfahrtstraße 1, Munich 80333, Germany",
		incoterm: "DAP",
		currency: "USD",
		carrierName: "DHL Express",
		portOfExport: "Dulles IAD",
		portOfUnlading: "Frankfurt FRA",
		modeOfTransport: "AIR",
		exporterEin: "12-3456789",
		lines,
		packages,
		classifications,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateCustomsDocuments", () => {
	describe("document set", () => {
		it("returns all four document types for a compliant shipment", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const types = docs.map((d) => d.documentType).sort();
			expect(types).toEqual(["AES_FILING", "COMMERCIAL_INVOICE", "PACKING_LIST", "SLI"]);
		});

		it("assigns document numbers based on shipment number", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const byType = Object.fromEntries(docs.map((d) => [d.documentType, d.documentNumber]));
			expect(byType.COMMERCIAL_INVOICE).toBe("SHP-2026-0042-CI");
			expect(byType.PACKING_LIST).toBe("SHP-2026-0042-PL");
			expect(byType.SLI).toBe("SHP-2026-0042-SLI");
			expect(byType.AES_FILING).toBe("SHP-2026-0042-EEI");
		});
	});

	describe("commercial invoice", () => {
		it("includes seller and buyer details", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")
				?.documentData as ReturnType<typeof Object.assign>;
			expect(inv.seller.name).toBe("Apogee Satellite Systems LLC");
			expect(inv.buyer.name).toBe("Allied Ground Station GmbH");
		});

		it("calculates total value from line items", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			expect(inv.totalValue).toBe("25000.00");
		});

		it("includes ECCN on EAR-controlled line items", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			const items = inv.lineItems as Array<Record<string, unknown>>;
			expect(items[0]?.eccn).toBe("5A001.b.3");
			expect(items[0]?.jurisdiction).toBe("EAR");
		});

		it("includes EAR Destination Control Statement when EAR item present", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			const dcs = inv.destinationControlStatement as string;
			expect(dcs).toContain("Export Administration Regulations");
			expect(dcs).not.toContain("USML");
		});

		it("includes ITAR Destination Control Statement when ITAR item present", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_ITAR, CLASSIFICATIONS_ITAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			const dcs = inv.destinationControlStatement as string;
			expect(dcs).toContain("ultimate consignee");
			expect(dcs).toContain("U.S. Government");
		});

		it("includes USML category on ITAR line items", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_ITAR, CLASSIFICATIONS_ITAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			const items = inv.lineItems as Array<Record<string, unknown>>;
			expect(items[0]?.usmlCategory).toBe("XI");
			expect(items[0]?.jurisdiction).toBe("ITAR");
		});

		it("includes export license number when license attached", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_ITAR, CLASSIFICATIONS_ITAR));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			expect(inv.exportLicenseNumber).toBe("MDE-2026-12345");
		});

		it("omits DCS when all items are NOT_CONTROLLED", () => {
			const uncontrolledClassifications: ItemClassification[] = [
				{ lineNumber: 1, jurisdiction: "NOT_CONTROLLED", licenseRequirement: "NLR" },
			];
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, uncontrolledClassifications));
			const inv = docs.find((d) => d.documentType === "COMMERCIAL_INVOICE")?.documentData as Record<
				string,
				unknown
			>;
			expect(inv.destinationControlStatement).toBeUndefined();
		});
	});

	describe("packing list", () => {
		it("generates package entries with dimensions and weight", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const pl = docs.find((d) => d.documentType === "PACKING_LIST")?.documentData as Record<
				string,
				unknown
			>;
			expect(pl.totalPackages).toBe(1);
			expect(pl.totalWeightKg).toBe(12.0);
			const pkgs = pl.packages as Array<Record<string, unknown>>;
			expect(pkgs[0]?.dimensionsCm).toEqual({ length: 60, width: 40, height: 30 });
		});

		it("maps line descriptions into package contents", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const pl = docs.find((d) => d.documentType === "PACKING_LIST")?.documentData as Record<
				string,
				unknown
			>;
			const pkgs = pl.packages as Array<Record<string, unknown>>;
			const contents = pkgs[0]?.contents as Array<Record<string, unknown>>;
			expect(contents[0]?.description).toBe("Satellite Modem Model X200");
		});
	});

	describe("SLI", () => {
		it("includes shipper, consignee, and port information", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const sli = docs.find((d) => d.documentType === "SLI")?.documentData as Record<
				string,
				unknown
			>;
			expect((sli.shipper as Record<string, unknown>).name).toBe("Apogee Satellite Systems LLC");
			expect((sli.consignee as Record<string, unknown>).name).toBe("Allied Ground Station GmbH");
			expect(sli.portOfLoading).toBe("Dulles IAD");
			expect(sli.portOfDischarge).toBe("Frankfurt FRA");
		});

		it("includes line items with weights", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const sli = docs.find((d) => d.documentType === "SLI")?.documentData as Record<
				string,
				unknown
			>;
			const items = sli.lineItems as Array<Record<string, unknown>>;
			expect(items[0]?.weightKg).toBe(3.5);
			expect(items[0]?.hsCode).toBe("8517620000");
		});
	});

	describe("EEI / AES filing", () => {
		it("pre-populates ECCN and license type for EAR items", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const eei = docs.find((d) => d.documentType === "AES_FILING")?.documentData as Record<
				string,
				unknown
			>;
			const commodities = eei.commodities as Array<Record<string, unknown>>;
			expect(commodities[0]?.eccn).toBe("5A001.b.3");
			expect(commodities[0]?.licenseType).toBe("NLR");
		});

		it("pre-populates USML category and license number for ITAR items", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_ITAR, CLASSIFICATIONS_ITAR));
			const eei = docs.find((d) => d.documentType === "AES_FILING")?.documentData as Record<
				string,
				unknown
			>;
			const commodities = eei.commodities as Array<Record<string, unknown>>;
			expect(commodities[0]?.usmlCategory).toBe("XI");
			expect(commodities[0]?.licenseType).toBe("LICENSE_REQUIRED");
			expect(commodities[0]?.licenseNumber).toBe("MDE-2026-12345");
		});

		it("includes destination country and mode of transport", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const eei = docs.find((d) => d.documentType === "AES_FILING")?.documentData as Record<
				string,
				unknown
			>;
			expect(eei.destinationCountry).toBe("DE");
			expect(eei.modeOfTransport).toBe("AIR");
		});

		it("includes exporter EIN and name", () => {
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, CLASSIFICATIONS_EAR));
			const eei = docs.find((d) => d.documentType === "AES_FILING")?.documentData as Record<
				string,
				unknown
			>;
			expect(eei.exporterEin).toBe("12-3456789");
			expect(eei.exporterName).toBe("Apogee Satellite Systems LLC");
		});

		it("falls back to EAR99 when no ECCN is classified", () => {
			const unclassified: ItemClassification[] = [
				{ lineNumber: 1, jurisdiction: "NOT_CONTROLLED", licenseRequirement: "NLR" },
			];
			const docs = generateCustomsDocuments(baseInput(LINES_EAR, unclassified));
			const eei = docs.find((d) => d.documentType === "AES_FILING")?.documentData as Record<
				string,
				unknown
			>;
			const commodities = eei.commodities as Array<Record<string, unknown>>;
			expect(commodities[0]?.eccn).toBe("EAR99");
		});
	});

	describe("export license gate", () => {
		it("throws ExportLicenseRequiredError when license required but not attached", () => {
			const missingLicense: ItemClassification[] = [
				{
					lineNumber: 1,
					jurisdiction: "ITAR",
					usmlCategory: "XI",
					licenseRequirement: "LICENSE_REQUIRED",
					// licenseNumber intentionally omitted
				},
			];
			expect(() => generateCustomsDocuments(baseInput(LINES_ITAR, missingLicense))).toThrow(
				ExportLicenseRequiredError,
			);
		});

		it("error message names the blocked line numbers", () => {
			const missingLicense: ItemClassification[] = [
				{
					lineNumber: 1,
					jurisdiction: "ITAR",
					usmlCategory: "XI",
					licenseRequirement: "LICENSE_REQUIRED",
				},
			];
			let error: ExportLicenseRequiredError | undefined;
			try {
				generateCustomsDocuments(baseInput(LINES_ITAR, missingLicense));
			} catch (e) {
				error = e as ExportLicenseRequiredError;
			}
			expect(error).toBeInstanceOf(ExportLicenseRequiredError);
			expect(error?.lineNumbers).toContain(1);
			expect(error?.message).toContain("line(s): 1");
		});

		it("blocks when any line in a multi-line shipment is missing license", () => {
			const lines: ShipmentLineItem[] = [
				{
					lineNumber: 1,
					description: "Commercial antenna",
					countryOfOrigin: "US",
					quantity: "1",
					unitOfMeasure: "EA",
					unitPrice: "5000.00",
					totalPrice: "5000.00",
					weightKg: 2.0,
				},
				{
					lineNumber: 2,
					description: "ITAR assembly",
					countryOfOrigin: "US",
					quantity: "1",
					unitOfMeasure: "EA",
					unitPrice: "50000.00",
					totalPrice: "50000.00",
					weightKg: 5.0,
				},
			];
			const classifications: ItemClassification[] = [
				{ lineNumber: 1, jurisdiction: "EAR", eccn: "5A001.b.3", licenseRequirement: "NLR" },
				{
					lineNumber: 2,
					jurisdiction: "ITAR",
					usmlCategory: "XI",
					licenseRequirement: "LICENSE_REQUIRED",
					// no licenseNumber
				},
			];
			const packages: ShipmentPackage[] = [
				{ packageNumber: 1, lineNumbers: [1, 2], weightKg: 7.0 },
			];
			expect(() => generateCustomsDocuments(baseInput(lines, classifications, packages))).toThrow(
				ExportLicenseRequiredError,
			);
		});

		it("allows generation when license exception is set without a number", () => {
			const licenseException: ItemClassification[] = [
				{
					lineNumber: 1,
					jurisdiction: "EAR",
					eccn: "5A001.b.3",
					licenseRequirement: "LICENSE_EXCEPTION",
				},
			];
			expect(() => generateCustomsDocuments(baseInput(LINES_EAR, licenseException))).not.toThrow();
		});
	});
});
