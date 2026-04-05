/**
 * Session management REST endpoints.
 *
 * Routes:
 *   GET    /api/v1/auth/sessions                    — list caller's active sessions
 *   DELETE /api/v1/auth/sessions/:id                — revoke a specific session
 *   DELETE /api/v1/admin/users/:userId/sessions     — admin: revoke all sessions for a user
 *
 * All revocations are audit-logged to audit_entry.
 *
 * Prerequisites: req.user and req.session must be populated by the session
 * auth middleware (registered in hx-c90fbc0a) before these routes run.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.4, §7.6
 * Issue: hx-4f0c6b67
 */

import type { FastifyInstance } from "fastify";
import type { AuthDbClient } from "../provider.js";
import type { SessionManager } from "../session-manager.js";
import type { ApogeeUser, Session } from "../types.js";

// Fastify augmentations — must match what the session middleware decorates
declare module "fastify" {
	interface FastifyRequest {
		user: ApogeeUser | null;
		session: Session | null;
	}
}

export interface SessionRouteOptions {
	sessionManager: SessionManager;
	/** Database client for audit logging */
	db: AuthDbClient;
}

interface SessionSummary {
	id: string;
	createdAt: string;
	lastActivity: string;
	expiresAt: string;
	ipAddress: string;
	userAgent: string;
	mfaVerified: boolean;
	provider: "oidc" | "saml";
	/** Convenience flag: true when this is the session making the request */
	current: boolean;
}

function toSummary(session: Session, currentSessionId: string): SessionSummary {
	return {
		id: session.id,
		createdAt: session.createdAt.toISOString(),
		lastActivity: session.lastActivity.toISOString(),
		expiresAt: session.expiresAt.toISOString(),
		ipAddress: session.ipAddress,
		userAgent: session.userAgent,
		mfaVerified: session.mfaVerified,
		provider: session.provider,
		current: session.id === currentSessionId,
	};
}

async function auditRevoke(
	db: AuthDbClient,
	actorId: string,
	actorEmail: string,
	sessionId: string,
	reason: "user_revoke" | "admin_revoke_all",
): Promise<void> {
	await db.query(
		`INSERT INTO audit_entry
		   (table_name, record_id, action, new_value, user_id, user_email, occurred_at)
		 VALUES ('authn_sessions', $1, 'UPDATE', $2, $3, $4, now())`,
		[
			sessionId,
			JSON.stringify({ revoked_at: new Date().toISOString(), reason }),
			actorId,
			actorEmail,
		],
	);
}

export async function registerSessionRoutes(
	app: FastifyInstance,
	opts: SessionRouteOptions,
): Promise<void> {
	const { sessionManager, db } = opts;

	// ── GET /api/v1/auth/sessions ───────────────────────────────────────────────

	app.get("/api/v1/auth/sessions", async (req, reply) => {
		if (!req.user || !req.session) {
			return reply.code(401).send({ error: "Not authenticated" });
		}
		const sessions = await sessionManager.list(req.user.id);
		const currentId = req.session.id;
		return sessions.map((s) => toSummary(s, currentId));
	});

	// ── DELETE /api/v1/auth/sessions/:id ────────────────────────────────────────

	app.delete<{ Params: { id: string } }>("/api/v1/auth/sessions/:id", async (req, reply) => {
		if (!req.user || !req.session) {
			return reply.code(401).send({ error: "Not authenticated" });
		}

		const { id } = req.params;

		// Load the target session to verify ownership
		const sessions = await sessionManager.list(req.user.id);
		const target = sessions.find((s) => s.id === id);
		if (!target) {
			return reply.code(404).send({ error: "Session not found" });
		}

		await sessionManager.revoke(id);

		// Audit log
		await auditRevoke(db, req.user.id, req.user.email, id, "user_revoke");

		return reply.code(204).send();
	});

	// ── DELETE /api/v1/admin/users/:userId/sessions ──────────────────────────────

	app.delete<{ Params: { userId: string } }>(
		"/api/v1/admin/users/:userId/sessions",
		async (req, reply) => {
			if (!req.user || !req.session) {
				return reply.code(401).send({ error: "Not authenticated" });
			}

			const { userId } = req.params;

			// Collect active session IDs before revoking (for audit trail)
			const activeSessions = await sessionManager.list(userId);

			await sessionManager.revokeAll(userId);

			// Audit log each revoked session
			for (const session of activeSessions) {
				await auditRevoke(db, req.user.id, req.user.email, session.id, "admin_revoke_all");
			}

			return { revoked: activeSessions.length };
		},
	);
}
