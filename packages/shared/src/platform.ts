/**
 * Platform entity types — legal_entity, user_account, role, permission, ITAR.
 * Ref: SD-002-data-model.md §3.1–3.2
 */

import type { AuditColumns, CountryCode, CurrencyCode, UUID } from "./types.js";

/** Top-level organizational unit (company, subsidiary, or branch). */
export interface LegalEntity extends AuditColumns {
	readonly id: UUID;
	readonly code: string;
	readonly name: string;
	readonly countryCode: CountryCode;
	readonly baseCurrencyCode: CurrencyCode;
	readonly taxId: string | null;
	readonly parentEntityId: UUID | null;
	readonly isActive: boolean;
	readonly ext: Record<string, unknown>;
}

/** Application user — authentication is external (OIDC/SAML). */
export interface UserAccount extends AuditColumns {
	readonly id: UUID;
	readonly externalId: string | null;
	readonly email: string;
	readonly displayName: string;
	readonly isActive: boolean;
	readonly lastLoginAt: Date | null;
	readonly ext: Record<string, unknown>;
}

/** Named role with a set of permissions. */
export interface Role extends AuditColumns {
	readonly id: UUID;
	readonly code: string;
	readonly name: string;
	readonly description: string | null;
	readonly isSystem: boolean;
}

/** Granular permission token (e.g. "gl:journal_entry:post"). */
export interface Permission {
	readonly id: UUID;
	readonly code: string;
	readonly module: string;
	readonly description: string | null;
	readonly createdAt: Date;
	readonly createdBy: UUID;
}

/** Assigns a role to a user, optionally scoped to an entity. */
export interface UserRole {
	readonly id: UUID;
	readonly userId: UUID;
	readonly roleId: UUID;
	readonly entityId: UUID | null;
	readonly grantedAt: Date;
	readonly grantedBy: UUID;
	readonly revokedAt: Date | null;
}

/** Controls which entities a user can operate within. */
export interface UserEntityAccess {
	readonly id: UUID;
	readonly userId: UUID;
	readonly entityId: UUID;
	readonly isDefault: boolean;
	readonly grantedAt: Date;
	readonly grantedBy: UUID;
}

/** ITAR information segregation compartment. */
export interface ItarCompartment extends AuditColumns {
	readonly id: UUID;
	readonly code: string;
	readonly name: string;
	readonly description: string | null;
	readonly classificationLevel: string;
	readonly isActive: boolean;
}

/**
 * Request-scoped entity context — injected by the entity-context Fastify plugin.
 * Every authenticated request carries the actor's resolved entity context.
 */
export interface EntityContext {
	/** The active legal entity for this request. */
	readonly entityId: UUID;
	/** The authenticated user. */
	readonly userId: UUID;
	/** User's email (denormalised for audit logs). */
	readonly userEmail: string;
	/** Active role codes for this user in this entity. */
	readonly roles: readonly string[];
	/** Active permission codes for this user in this entity. */
	readonly permissions: readonly string[];
	/** ITAR compartment IDs this user has access to. */
	readonly compartmentIds: readonly UUID[];
}

/** Well-known system user UUID used for bootstrap records. */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001" as UUID;

/** System role codes */
export const SystemRoles = {
	ADMIN: "admin",
	FINANCE: "finance",
	SALES: "sales",
	COMPLIANCE: "compliance",
	READ_ONLY: "read_only",
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];
