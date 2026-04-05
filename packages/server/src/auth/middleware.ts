/**
 * Session auth middleware — Fastify onRequest hook.
 *
 * Extracts the `apogee_session` HttpOnly cookie, loads and validates the
 * session via SessionManager, touches last_activity, loads the user from the
 * database, and attaches req.user + req.session for downstream handlers.
 *
 * @fastify/cookie must be registered on the Fastify instance before calling
 * registerSessionAuthHook.
 *
 * Ref: SD-004-authn-provider-abstraction.md §10
 * Issue: hx-c90fbc0a
 */

// Pull in @fastify/cookie type augmentation so req.cookies is typed.
import type {} from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { AuthDbClient } from "./provider.js";
import type { SessionManager } from "./session-manager.js";
import type { ApogeeUser, Session } from "./types.js";

// Augment FastifyRequest so handlers can access req.user / req.session.
declare module "fastify" {
	interface FastifyRequest {
		user: ApogeeUser | null;
		session: Session | null;
	}
}

// ── Default bypass patterns ────────────────────────────────────────────────────

const DEFAULT_BYPASS: RegExp[] = [/^\/health\//, /^\/metrics$/, /^\/auth\//];

// ── Public interface ───────────────────────────────────────────────────────────

export interface SessionAuthHookOptions {
	sessionManager: SessionManager;
	/** Database client used to load the full user row for req.user. */
	db: AuthDbClient;
	/**
	 * Route URL patterns that bypass session enforcement.
	 * Defaults to health checks, metrics, and /auth/* (login/callback routes).
	 */
	bypass?: RegExp[];
}

// ── DB user row type (private) ────────────────────────────────────────────────

interface UserRow {
	id: string;
	email: string;
	display_name: string;
	mfa_enabled: boolean;
	mfa_totp_secret: string | null;
	failed_login_count: number;
	locked_until: Date | null;
	is_active: boolean;
	deleted_at: Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadUser(db: AuthDbClient, userId: string): Promise<ApogeeUser | null> {
	const result = await db.query<UserRow>(
		`SELECT id, email, display_name, mfa_enabled, mfa_totp_secret,
		        failed_login_count, locked_until, is_active, deleted_at
		 FROM user_account WHERE id = $1`,
		[userId],
	);
	if (result.rows.length === 0) return null;
	const row = result.rows[0]!;
	if (row.deleted_at !== null || !row.is_active) return null;
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		mfaEnabled: row.mfa_enabled,
		mfaTotpSecret: row.mfa_totp_secret,
		accountStatus: row.locked_until !== null ? "locked" : "active",
		failedLoginCount: row.failed_login_count,
		lockedUntil: row.locked_until,
	};
}

// ── registerSessionAuthHook ───────────────────────────────────────────────────

/**
 * Register the session authentication hook on a Fastify instance.
 *
 * Must be called after `app.register(cookie)` (@fastify/cookie).
 */
export function registerSessionAuthHook(app: FastifyInstance, opts: SessionAuthHookOptions): void {
	const bypass = opts.bypass ?? DEFAULT_BYPASS;

	app.decorateRequest("user", null);
	app.decorateRequest("session", null);

	app.addHook("onRequest", async (req, reply) => {
		if (bypass.some((re) => re.test(req.url))) return;

		const sessionId = req.cookies?.apogee_session;
		if (!sessionId) {
			throw Object.assign(new Error("Not authenticated"), {
				statusCode: 401,
				name: "Unauthorized",
			});
		}

		const session = await opts.sessionManager.load(sessionId);
		if (!session) {
			throw Object.assign(new Error("Session expired or invalid"), {
				statusCode: 401,
				name: "Unauthorized",
			});
		}

		// Touch last_activity on every authenticated request.
		await opts.sessionManager.touch(sessionId);

		const user = await loadUser(opts.db, session.userId);
		if (!user) {
			throw Object.assign(new Error("User not found"), {
				statusCode: 401,
				name: "Unauthorized",
			});
		}

		req.user = user;
		req.session = session;
	});
}
