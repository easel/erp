/**
 * Entity-context Fastify hook.
 *
 * Resolves the active legal entity and user for every authenticated request.
 * The resolved context is available at `req.entityContext`.
 *
 * Resolution order:
 *   1. `X-Entity-Id` request header
 *   2. `entity_id` claim in the JWT payload
 *   3. (future) The user's default entity from `user_entity_access` DB lookup
 *
 * Ref: SD-003-WP1 PLT-004, ADR-009
 * Issue: hx-369c3437 (scaffold — full DB lookup wired in hx-cd2573f7)
 */

import type { EntityContext, UUID } from "@apogee/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

// Extend FastifyRequest with entityContext
declare module "fastify" {
	interface FastifyRequest {
		entityContext: EntityContext | null;
	}
}

/** JWT payload shape as stored by the auth plugin. */
interface JwtPayload {
	sub: string;
	email?: string;
	entity_id?: string;
	roles?: string[];
	permissions?: string[];
	compartment_ids?: string[];
}

/**
 * Register the entity-context decorator and onRequest hook on a Fastify instance.
 *
 * Call once on the root app after the auth hook is registered:
 *   registerEntityContext(app)
 */
export function registerEntityContext(app: FastifyInstance): void {
	app.decorateRequest("entityContext", null);

	app.addHook("onRequest", async (req: FastifyRequest) => {
		// Populated by the auth plugin (registerAuthHook)
		const jwt = (req as unknown as { user?: JwtPayload }).user;

		if (!jwt) {
			req.entityContext = null;
			return;
		}

		const headerEntityId = req.headers["x-entity-id"] as string | undefined;
		const entityId = (headerEntityId ?? jwt.entity_id ?? null) as UUID | null;

		const userId = jwt.sub as UUID;
		const userEmail = jwt.email ?? "";

		req.entityContext = entityId
			? {
					entityId,
					userId,
					userEmail,
					// Full role/permission resolution wired in hx-cd2573f7 (RBAC engine)
					roles: jwt.roles ?? [],
					permissions: jwt.permissions ?? [],
					compartmentIds: (jwt.compartment_ids ?? []) as UUID[],
				}
			: null;
	});
}
