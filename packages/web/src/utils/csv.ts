/**
 * CSV export utility for DataTable.
 */

/**
 * Escapes a single cell value for RFC 4180-compliant CSV output.
 */
function escapeCsvCell(value: unknown): string {
	const str = value == null ? "" : String(value);
	// Quote fields that contain commas, quotes, or newlines
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Converts an array of row objects to a CSV string.
 * @param rows - Array of plain-object rows.
 * @param columns - Ordered list of column keys (used as headers).
 * @param headers - Optional display names; falls back to the column key.
 */
export function exportToCSV(
	rows: Record<string, unknown>[],
	columns: string[],
	headers?: Record<string, string>,
): string {
	const headerRow = columns.map((col) => escapeCsvCell(headers?.[col] ?? col)).join(",");
	const dataRows = rows.map((row) =>
		columns.map((col) => escapeCsvCell(row[col])).join(","),
	);
	return [headerRow, ...dataRows].join("\r\n");
}

/**
 * Triggers a browser download of a CSV string.
 */
export function downloadCSV(csv: string, filename: string): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
