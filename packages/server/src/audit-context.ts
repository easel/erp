/**
 * Audit context helper: sets transaction-local session variables that the
 * audit_stamp() PostgreSQL trigger reads to record actor identity.
 *
 * Call setAuditContext() inside an explicit transaction before any INSERT,
 * UPDATE, or DELETE on a table that carries the audit_stamp trigger.  The
 * settings are transaction-scoped (set_config(..., TRUE)) and are
 * automatically cleared when the transaction ends.
 *
 * Pattern:
 *   await client.query('BEGIN');
 *   await setAuditContext(client, userId, userEmail, entityId);
 *   await client.query('UPDATE legal_entity SET ...');
 *   await client.query('COMMIT');
 *
 * Ref: SD-003-WP1 PLT-003, ADR-004
 * Issue: hx-c3e547b2
 */

import type { UUID } from "@apogee/shared";

/**
 * Minimal interface satisfied by pg.PoolClient and pg.Client.
 * Using a structural type keeps this module free of a runtime `pg` dependency
 * so tests can inject a mock without importing the real driver.
 */
export interface QueryableClient {
	query(sql: string, params: unknown[]): Promise<unknown>;
}

/**
 * Set transaction-local audit actor context.
 *
 * @param client  - A database client already inside an open transaction.
 * @param actorId - UUID of the authenticated user performing the mutation.
 * @param actorEmail - Email of the authenticated user (informational, for logs).
 * @param entityId   - Active legal-entity UUID from the request context, or
 *                     null for operations with no entity scope (e.g., system tasks).
 */
export async function setAuditContext(
	client: QueryableClient,
	actorId: UUID,
	actorEmail: string,
	entityId: UUID | null = null,
): Promise<void> {
	// set_config(name, value, is_local=TRUE) is equivalent to SET LOCAL and
	// supports parameterized values, unlike the SET LOCAL statement itself.
	await client.query(
		`SELECT
			set_config('app.actor_id',    $1, TRUE),
			set_config('app.actor_email', $2, TRUE),
			set_config('app.entity_id',   $3, TRUE)`,
		[actorId, actorEmail, entityId ?? ""],
	);
}
