/**
 * RBAC engine: permission check helpers, entity isolation, ITAR compartment enforcement.
 *
 * Design:
 * - Pure check functions work against the request-scoped EntityContext
 *   (populated by the entity-context hook from JWT claims + DB lookup).
 * - PermissionLoader interface abstracts DB-backed role/permission resolution
 *   so that unit tests can inject a stub without a live database.
 * - Fastify preHandler factories produce route-level enforcement hooks.
 *
 * Ref: SD-003-WP1 PLT-002, SD-002 §3.2
 * Issue: hx-cd2573f7
 */

import type { EntityContext, UUID } from "@apogee/shared";
import type { FastifyRequest } from "fastify";

// ─────────────────────────────────────────────────────────────────────────────
// Pure check functions (operate on EntityContext, no I/O)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the context includes the given permission code. */
export function hasPermission(ctx: EntityContext, permissionCode: string): boolean {
	return ctx.permissions.includes(permissionCode);
}

/** Returns true if the context includes the given role code. */
export function hasRole(ctx: EntityContext, roleCode: string): boolean {
	return ctx.roles.includes(roleCode);
}

/** Returns true if the context grants access to the ITAR compartment. */
export function hasCompartmentAccess(ctx: EntityContext, compartmentId: UUID): boolean {
	return ctx.compartmentIds.includes(compartmentId);
}

/**
 * Returns true if the user is operating within the expected entity.
 * Use for cross-entity isolation checks (e.g., a finance user from SATCO-US
 * must not access SATCO-UK data without an explicit SATCO-UK entity context).
 */
export function isInEntity(ctx: EntityContext, entityId: UUID): boolean {
	return ctx.entityId === entityId;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed permission loader interface
// ─────────────────────────────────────────────────────────────────────────────

/** Resolved permissions for a user within a legal entity. */
export interface ResolvedPermissions {
	/** Active role codes for this user in this entity (includes global roles). */
	readonly roles: readonly string[];
	/** All permission codes granted to the user via their active roles. */
	readonly permissions: readonly string[];
	/** ITAR compartment IDs this user currently has access to. */
	readonly compartmentIds: readonly UUID[];
}

/**
 * Loader contract: implemented by the DB layer; injected as a dependency so
 * tests can use a stub without a live database.
 */
export interface PermissionLoader {
	/**
	 * Load the active roles, permission codes, and ITAR compartment IDs for
	 * a user in a given legal entity.  Returns null if the user has no
	 * `user_entity_access` record for the entity (entity isolation).
	 */
	load(userId: UUID, entityId: UUID): Promise<ResolvedPermissions | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify preHandler factories
// ─────────────────────────────────────────────────────────────────────────────

type PreHandler = (req: FastifyRequest) => Promise<void>;

/** Throws an HTTP error that Fastify's setErrorHandler will format consistently. */
function httpError(
	statusCode: number,
	name: string,
	message: string,
): Error & { statusCode: number } {
	return Object.assign(new Error(message), { statusCode, name });
}

/**
 * Returns a Fastify preHandler that rejects the request with 403 if the
 * authenticated user does not have the given permission code in their
 * entity context.
 *
 * @example
 * app.get('/gl/journal-entries', {
 *   preHandler: requirePermission('gl:journal_entry:read'),
 * }, handler)
 */
export function requirePermission(permissionCode: string): PreHandler {
	return async (req: FastifyRequest) => {
		const ctx = req.entityContext;
		if (!ctx) {
			throw httpError(401, "Unauthorized", "Authentication and entity context are required");
		}
		if (!hasPermission(ctx, permissionCode)) {
			throw httpError(403, "Forbidden", `Missing permission: ${permissionCode}`);
		}
	};
}

/**
 * Returns a Fastify preHandler that rejects the request with 403 if the
 * authenticated user does not have access to the specified ITAR compartment.
 *
 * @example
 * app.get('/itar/resource', {
 *   preHandler: requireCompartmentAccess('compartment-uuid-here'),
 * }, handler)
 */
export function requireCompartmentAccess(compartmentId: UUID): PreHandler {
	return async (req: FastifyRequest) => {
		const ctx = req.entityContext;
		if (!ctx) {
			throw httpError(401, "Unauthorized", "Authentication and entity context are required");
		}
		if (!hasCompartmentAccess(ctx, compartmentId)) {
			throw httpError(403, "Forbidden", "ITAR compartment access denied");
		}
	};
}

/**
 * Returns a Fastify preHandler that rejects the request with 403 if the
 * authenticated user does not hold at least one of the given roles.
 *
 * @example
 * app.post('/admin/users', {
 *   preHandler: requireRole('admin'),
 * }, handler)
 */
export function requireRole(...roleCodes: [string, ...string[]]): PreHandler {
	return async (req: FastifyRequest) => {
		const ctx = req.entityContext;
		if (!ctx) {
			throw httpError(401, "Unauthorized", "Authentication and entity context are required");
		}
		const hasAny = roleCodes.some((code) => hasRole(ctx, code));
		if (!hasAny) {
			throw httpError(403, "Forbidden", `Required role(s): ${roleCodes.join(", ")}`);
		}
	};
}

/**
 * Returns a Fastify preHandler that rejects the request if the entity context
 * does not match the expected entity ID.  Use for explicit cross-entity guard
 * checks where the entity is embedded in a route parameter.
 *
 * @example
 * app.get('/entities/:entityId/data', {
 *   preHandler: requireEntityAccess((req) => req.params.entityId as UUID),
 * }, handler)
 */
export function requireEntityAccess(resolveEntityId: (req: FastifyRequest) => UUID): PreHandler {
	return async (req: FastifyRequest) => {
		const ctx = req.entityContext;
		if (!ctx) {
			throw httpError(401, "Unauthorized", "Authentication and entity context are required");
		}
		const targetEntityId = resolveEntityId(req);
		if (!isInEntity(ctx, targetEntityId)) {
			throw httpError(
				403,
				"Forbidden",
				"Entity access denied: context entity does not match requested entity",
			);
		}
	};
}
