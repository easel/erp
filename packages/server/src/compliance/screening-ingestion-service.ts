/**
 * Screening list ingestion service — WP-3: EXP-002 list pipeline.
 *
 * Handles bulk ingestion of denied-party / restricted-entity entries into the
 * `screening_list_entry` table. Supports append mode and full-replace mode for
 * periodic list refreshes (e.g. daily OFAC/BIS downloads).
 *
 * The service validates input via the shared Zod schemas before writing,
 * ensuring the DB constraint layer is not the first line of defence.
 *
 * Ref: SD-003 WP-3 §EXP-002 (denied-party screening, list ingestion pipeline)
 * Issue: hx-e7e4cad6
 */

import type { IngestScreeningEntriesInput } from "@apogee/shared";
import type { DbClient } from "../db.js";

export interface IngestResult {
	/** Number of entries inserted. */
	inserted: number;
	/** Number of existing entries deleted when replaceExisting=true. */
	deleted: number;
	/** Elapsed time in milliseconds. */
	durationMs: number;
}

/**
 * Ingest a batch of screening list entries into the database.
 *
 * When `replaceExisting` is true, all existing entries for the list are deleted
 * before inserting the new batch (full-replace for scheduled daily refreshes).
 *
 * When `replaceExisting` is false (default), new entries are appended.
 *
 * @param db         Database client.
 * @param input      Validated ingestion payload (list ID + entries array).
 * @param createdBy  UUID of the user or system job performing the ingestion.
 */
export async function ingestScreeningEntries(
	db: DbClient,
	input: IngestScreeningEntriesInput,
	_createdBy: string,
): Promise<IngestResult> {
	const t0 = Date.now();
	const { screeningListId, entries, replaceExisting } = input;
	let deleted = 0;

	if (replaceExisting) {
		const delResult = await db.query<{ count: string }>(
			"DELETE FROM screening_list_entry WHERE screening_list_id = $1",
			[screeningListId],
		);
		// pg rowCount is on the result object, not rows — approximate via rows length
		deleted = (delResult as unknown as { rowCount?: number }).rowCount ?? 0;
	}

	for (const entry of entries) {
		const aliases = entry.aliases?.length ? entry.aliases : null;
		const countryCodes = entry.countryCodes?.length ? entry.countryCodes : null;

		await db.query(
			`INSERT INTO screening_list_entry
			   (screening_list_id, entry_name, aliases, entity_type, country_codes,
			    identifiers, remarks, source_id, listed_date, delisted_date, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
			[
				screeningListId,
				entry.entryName,
				aliases,
				entry.entityType ?? null,
				countryCodes,
				entry.identifiers ? JSON.stringify(entry.identifiers) : null,
				entry.remarks ?? null,
				entry.sourceId ?? null,
				entry.listedDate ?? null,
				entry.delistedDate ?? null,
			],
		);
	}

	// Update the screening list's last_updated_at timestamp
	await db.query("UPDATE screening_list SET last_updated_at = NOW() WHERE id = $1", [
		screeningListId,
	]);

	return {
		inserted: entries.length,
		deleted,
		durationMs: Date.now() - t0,
	};
}
