/** Core SatERP shared types — isomorphic, no platform-specific dependencies */

/** UUID v4 primary key */
export type UUID = string & { readonly __brand: "UUID" };

/** ISO 4217 currency code */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

/** ISO 3166-1 alpha-2 country code */
export type CountryCode = string & { readonly __brand: "CountryCode" };

/**
 * Monetary amount — string representation of NUMERIC(19,6).
 * Always paired with a CurrencyCode. Never use JavaScript number for money.
 * See ADR-003.
 */
export interface Money {
	readonly amount: string;
	readonly currencyCode: CurrencyCode;
}

/** Standard audit columns present on all mutable entities */
export interface AuditColumns {
	readonly createdAt: Date;
	readonly createdBy: UUID;
	readonly updatedAt: Date;
	readonly updatedBy: UUID;
	readonly version: number;
	readonly deletedAt: Date | null;
}

/** Sync metadata for local-first offline-capable entities. See ADR-009. */
export interface SyncMetadata {
	readonly syncVersion: number;
	readonly lastSyncedAt: Date | null;
	readonly syncStatus: SyncStatus;
}

export type SyncStatus = "synced" | "pending_push" | "conflict";

/** Offline tier assignment per ADR-009 */
export type OfflineTier = 1 | 2 | 3;

/** Compliance status for transactional entities. See ADR-006. */
export type ComplianceStatus = "pending" | "cleared" | "held";

/** Fiscal period status per ADR-007 */
export type FiscalPeriodStatus = "FUTURE" | "OPEN" | "SOFT_CLOSED" | "HARD_CLOSED";
