/**
 * Customs Document Generation Service — LOG-002
 *
 * Auto-generates customs documents for a shipment:
 *   - Commercial Invoice (with Destination Control Statement for ITAR items)
 *   - Packing List
 *   - SLI (Shipper's Letter of Instruction)
 *   - AES/EEI Filing data
 *
 * All functions are pure (no I/O). The caller persists the returned
 * `GeneratedCustomsDoc[]` to the `customs_document` table.
 *
 * Generation is blocked when a line item has `licenseType = LICENSE_REQUIRED`
 * but no `licenseNumber` is provided — per LOG-002 acceptance criterion 5.
 *
 * Ref: SD-003-WP6 §LOG-002, FEAT-007 §LOG-002, hx-3937d062
 */

import type {
	CommercialInvoiceData,
	CommercialInvoiceLine,
	EEIData,
	EEILine,
	PackingListData,
	SLIData,
} from "@apogee/shared";

// ── Input types ───────────────────────────────────────────────────────────────

/** Export-control classification for one shipment line item. */
export interface ItemClassification {
	/** Matches `ShipmentLineItem.inventoryItemId` or `lineNumber` */
	lineNumber: number;
	jurisdiction: "ITAR" | "EAR" | "NOT_CONTROLLED";
	eccn?: string;
	usmlCategory?: string;
	licenseRequirement: "LICENSE_REQUIRED" | "LICENSE_EXCEPTION" | "NLR";
	licenseNumber?: string;
}

/** One line in the shipment (denormalized for generation; no DB I/O needed). */
export interface ShipmentLineItem {
	lineNumber: number;
	description: string;
	partNumber?: string;
	hsCode?: string;
	countryOfOrigin: string;
	quantity: string;
	unitOfMeasure: string;
	unitPrice: string;
	totalPrice: string;
	weightKg: number;
}

/** One physical package in the shipment. */
export interface ShipmentPackage {
	packageNumber: number;
	marks?: string;
	lineNumbers: number[];
	weightKg: number;
	dimensionsCm?: { length: number; width: number; height: number };
}

/** Party information (seller, buyer). */
export interface Party {
	name: string;
	address: string;
	countryCode: string;
	ein?: string;
}

/** All inputs required to generate customs documents for one shipment. */
export interface GenerateCustomsDocumentsInput {
	/** Shipment number used as document reference */
	shipmentNumber: string;
	/** ISO date YYYY-MM-DD */
	shipDate: string;
	seller: Party;
	buyer: Party;
	/** ISO 3166-1 alpha-2 destination country */
	destinationCountry: string;
	shipToAddress?: string;
	incoterm?: string;
	currency: string;
	carrierName?: string;
	portOfExport?: string;
	portOfUnlading?: string;
	modeOfTransport: "AIR" | "OCEAN" | "GROUND" | "COURIER";
	/** Exporter EIN for AES filing */
	exporterEin?: string;
	lines: ShipmentLineItem[];
	packages: ShipmentPackage[];
	classifications: ItemClassification[];
}

/** One generated customs document ready to persist. */
export interface GeneratedCustomsDoc {
	documentType: "COMMERCIAL_INVOICE" | "PACKING_LIST" | "SLI" | "AES_FILING";
	documentNumber: string;
	documentData: CommercialInvoiceData | PackingListData | SLIData | EEIData;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Thrown when customs document generation is blocked by a missing export license. */
export class ExportLicenseRequiredError extends Error {
	constructor(public readonly lineNumbers: number[]) {
		super(
			`Export license required but not attached for line(s): ${lineNumbers.join(", ")}. Attach the license number before generating customs documents.`,
		);
		this.name = "ExportLicenseRequiredError";
	}
}

// ── Destination Control Statement ─────────────────────────────────────────────

/**
 * Standard DCS text per EAR §758.6(a) and ITAR §123.9.
 * Used on the commercial invoice when any item is ITAR or EAR-controlled.
 */
const EAR_DCS =
	"These commodities, technology, or software were exported from the United States " +
	"in accordance with the Export Administration Regulations. Diversion contrary to U.S. law is prohibited.";

const ITAR_DCS =
	"These commodities are controlled by the U.S. Government and authorized for export only to the country of " +
	"ultimate destination for use by the ultimate consignee or end-user(s) herein identified. They may not be " +
	"resold, transferred, or otherwise disposed of to any other country or to any person other than the authorized " +
	"ultimate consignee or end-user(s), either in their original form or after being incorporated into other items, " +
	"without first obtaining approval from the U.S. Government or as otherwise authorized by U.S. law and regulations.";

// ── Internal helpers ──────────────────────────────────────────────────────────

function classificationFor(
	lineNumber: number,
	classifications: ItemClassification[],
): ItemClassification | undefined {
	return classifications.find((c) => c.lineNumber === lineNumber);
}

/** Returns true when any line is ITAR-controlled. */
function hasItarItems(lines: ShipmentLineItem[], classifications: ItemClassification[]): boolean {
	return lines.some(
		(l) => classificationFor(l.lineNumber, classifications)?.jurisdiction === "ITAR",
	);
}

/** Returns true when any line is ITAR or EAR-controlled. */
function hasControlledItems(
	lines: ShipmentLineItem[],
	classifications: ItemClassification[],
): boolean {
	return lines.some((l) => {
		const c = classificationFor(l.lineNumber, classifications);
		return c !== undefined && c.jurisdiction !== "NOT_CONTROLLED";
	});
}

/** Validates that no line requiring a license is missing one. */
function assertLicensesAttached(
	lines: ShipmentLineItem[],
	classifications: ItemClassification[],
): void {
	const missing = lines
		.filter((l) => {
			const c = classificationFor(l.lineNumber, classifications);
			return c?.licenseRequirement === "LICENSE_REQUIRED" && !c.licenseNumber;
		})
		.map((l) => l.lineNumber);

	if (missing.length > 0) {
		throw new ExportLicenseRequiredError(missing);
	}
}

function documentNumber(shipmentNumber: string, suffix: string): string {
	return `${shipmentNumber}-${suffix}`;
}

// ── Commercial Invoice ────────────────────────────────────────────────────────

function generateCommercialInvoice(input: GenerateCustomsDocumentsInput): CommercialInvoiceData {
	const { lines, classifications } = input;

	const invoiceLines: CommercialInvoiceLine[] = lines.map((l) => {
		const cls = classificationFor(l.lineNumber, classifications);
		return {
			lineNumber: l.lineNumber,
			description: l.description,
			partNumber: l.partNumber,
			hsCode: l.hsCode,
			countryOfOrigin: l.countryOfOrigin,
			quantity: l.quantity,
			unitOfMeasure: l.unitOfMeasure,
			unitPrice: l.unitPrice,
			totalPrice: l.totalPrice,
			eccn: cls?.eccn,
			usmlCategory: cls?.usmlCategory,
			jurisdiction: cls?.jurisdiction,
		};
	});

	const totalValue = lines.reduce((sum, l) => sum + Number.parseFloat(l.totalPrice), 0).toFixed(2);

	// Determine DCS requirement per ITAR §123.9 and EAR §758.6
	let destinationControlStatement: string | undefined;
	if (hasItarItems(lines, classifications)) {
		destinationControlStatement = ITAR_DCS;
	} else if (hasControlledItems(lines, classifications)) {
		destinationControlStatement = EAR_DCS;
	}

	// Attach license reference from first line that has one (simplification for Phase 1;
	// multi-license shipments would enumerate all license numbers in notes).
	const licenseRef = classifications.find((c) => c.licenseNumber);

	return {
		invoiceNumber: documentNumber(input.shipmentNumber, "CI"),
		invoiceDate: input.shipDate,
		seller: {
			name: input.seller.name,
			address: input.seller.address,
			countryCode: input.seller.countryCode,
			ein: input.seller.ein,
		},
		buyer: {
			name: input.buyer.name,
			address: input.buyer.address,
			countryCode: input.buyer.countryCode,
		},
		shipToAddress: input.shipToAddress,
		incoterm: input.incoterm,
		currency: input.currency,
		lineItems: invoiceLines,
		totalValue,
		destinationControlStatement,
		exportLicenseNumber: licenseRef?.licenseNumber,
	};
}

// ── Packing List ──────────────────────────────────────────────────────────────

function generatePackingList(input: GenerateCustomsDocumentsInput): PackingListData {
	const { lines, packages } = input;

	const lineMap = new Map(lines.map((l) => [l.lineNumber, l]));

	const pkgs = packages.map((pkg) => ({
		packageNumber: pkg.packageNumber,
		marks: pkg.marks,
		contents: pkg.lineNumbers.map((ln) => {
			const l = lineMap.get(ln);
			return {
				lineNumber: ln,
				description: l?.description ?? "",
				quantity: l?.quantity ?? "0",
				unitOfMeasure: l?.unitOfMeasure ?? "EA",
			};
		}),
		weightKg: pkg.weightKg,
		dimensionsCm: pkg.dimensionsCm,
	}));

	const totalWeightKg = packages.reduce((s, p) => s + p.weightKg, 0);

	return {
		packingListNumber: documentNumber(input.shipmentNumber, "PL"),
		shipmentReference: input.shipmentNumber,
		date: input.shipDate,
		shipper: { name: input.seller.name },
		consignee: { name: input.buyer.name },
		packages: pkgs,
		totalPackages: packages.length,
		totalWeightKg,
	};
}

// ── SLI ───────────────────────────────────────────────────────────────────────

function generateSLI(input: GenerateCustomsDocumentsInput): SLIData {
	const { lines } = input;

	return {
		referenceNumber: documentNumber(input.shipmentNumber, "SLI"),
		date: input.shipDate,
		shipper: {
			name: input.seller.name,
			address: input.seller.address,
			countryCode: input.seller.countryCode,
		},
		consignee: {
			name: input.buyer.name,
			address: input.buyer.address,
			countryCode: input.buyer.countryCode,
		},
		portOfLoading: input.portOfExport,
		portOfDischarge: input.portOfUnlading,
		incoterm: input.incoterm,
		lineItems: lines.map((l) => ({
			description: l.description,
			hsCode: l.hsCode,
			quantity: l.quantity,
			unitOfMeasure: l.unitOfMeasure,
			weightKg: l.weightKg,
		})),
	};
}

// ── EEI / AES Filing ──────────────────────────────────────────────────────────

function generateEEIData(input: GenerateCustomsDocumentsInput): EEIData {
	const { lines, classifications } = input;

	const commodities: EEILine[] = lines.map((l) => {
		const cls = classificationFor(l.lineNumber, classifications);
		return {
			scheduleB: l.hsCode ?? "9999999999",
			commodityDescription: l.description,
			quantity: Math.round(Number.parseFloat(l.quantity)),
			unitOfMeasure: l.unitOfMeasure,
			value: l.totalPrice,
			eccn: cls?.eccn ?? "EAR99",
			licenseType:
				cls?.licenseRequirement === "LICENSE_REQUIRED"
					? "LICENSE_REQUIRED"
					: cls?.licenseRequirement === "LICENSE_EXCEPTION"
						? "LICENSE_EXCEPTION"
						: "NLR",
			licenseNumber: cls?.licenseNumber,
			usmlCategory: cls?.usmlCategory,
			countryOfOrigin: l.countryOfOrigin,
		};
	});

	return {
		shipmentReference: input.shipmentNumber,
		exportDate: input.shipDate,
		exporterEin: input.exporterEin ?? "",
		exporterName: input.seller.name,
		exporterAddress: input.seller.address,
		ultimateConsigneeName: input.buyer.name,
		destinationCountry: input.destinationCountry,
		portOfExport: input.portOfExport ?? "",
		portOfUnlading: input.portOfUnlading,
		modeOfTransport: input.modeOfTransport,
		carrierName: input.carrierName,
		commodities,
	};
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Generate all required customs documents for a shipment.
 *
 * Throws `ExportLicenseRequiredError` if any line requires a license that has
 * not been attached — per LOG-002 acceptance criterion 5.
 *
 * Returns an array of `GeneratedCustomsDoc` ready to insert as
 * `customs_document` records.
 */
export function generateCustomsDocuments(
	input: GenerateCustomsDocumentsInput,
): GeneratedCustomsDoc[] {
	// Gate: block if any item requires a license that is not attached
	assertLicensesAttached(input.lines, input.classifications);

	return [
		{
			documentType: "COMMERCIAL_INVOICE",
			documentNumber: documentNumber(input.shipmentNumber, "CI"),
			documentData: generateCommercialInvoice(input),
		},
		{
			documentType: "PACKING_LIST",
			documentNumber: documentNumber(input.shipmentNumber, "PL"),
			documentData: generatePackingList(input),
		},
		{
			documentType: "SLI",
			documentNumber: documentNumber(input.shipmentNumber, "SLI"),
			documentData: generateSLI(input),
		},
		{
			documentType: "AES_FILING",
			documentNumber: documentNumber(input.shipmentNumber, "EEI"),
			documentData: generateEEIData(input),
		},
	];
}
