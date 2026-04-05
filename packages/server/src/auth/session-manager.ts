/**
 * SessionManager interface + DbSessionManager implementation.
 *
 * DbSessionManager is a PostgreSQL-backed session store using the
 * authn_sessions table.  It enforces both absolute and inactivity timeouts
 * at query time so expired sessions are never returned even before the
 * background cleanup job runs.
 *
 * Ref: SD-004-authn-provider-abstraction.md §5.4, §7.4
 * Issue: hx-4f0c6b67
 */

import type { AuthDbClient } from "./provider.js";
import type { Session } from "./types.js";

// ── Interface ─────────────────────────────────────────────────────────────────

export interface SessionManager {
	create(params: {
		userId: string;
		mfaVerified: boolean;
		provider: "oidc" | "saml";
		ipAddress: string;
		userAgent: string;
		/** AES-256-GCM encrypted IdP refresh token (store when OIDC provides one). */
		idpRefreshTokenEnc?: string;
		/** When the IdP access token expires (for background refresh scheduling). */
		idpAccessTokenExpiresAt?: Date;
	}): Promise<Session>;

	/** Load and validate session. Returns null if missing, expired, or revoked. */
	load(sessionId: string): Promise<Session | null>;

	/** Update last_activity to now. Called on every authenticated request. */
	touch(sessionId: string): Promise<void>;

	/** Immediately revoke a session (forced logout). */
	revoke(sessionId: string): Promise<void>;

	/** Revoke all active sessions for a user (forced logout of all devices). */
	revokeAll(userId: string): Promise<void>;

	/** List non-expired, non-revoked sessions for a user (session management UI). */
	list(userId: string): Promise<Session[]>;
}

// ── DB row type (private) ─────────────────────────────────────────────────────

interface SessionRow {
	id: string;
	user_id: string;
	created_at: Date;
	last_activity: Date;
	expires_at: Date;
	ip_address: string;
	user_agent: string;
	mfa_verified: boolean;
	provider: "oidc" | "saml";
}

function rowToSession(row: SessionRow): Session {
	return {
		id: row.id,
		userId: row.user_id,
		createdAt: new Date(row.created_at),
		lastActivity: new Date(row.last_activity),
		expiresAt: new Date(row.expires_at),
		ipAddress: row.ip_address,
		userAgent: row.user_agent,
		mfaVerified: row.mfa_verified,
		provider: row.provider,
	};
}

// ── DbSessionManager ──────────────────────────────────────────────────────────

export class DbSessionManager implements SessionManager {
	private readonly db: AuthDbClient;
	private readonly inactivityTimeoutMinutes: number;
	private readonly absoluteTimeoutHours: number;

	constructor(
		db: AuthDbClient,
		opts: { inactivityTimeoutMinutes?: number; absoluteTimeoutHours?: number } = {},
	) {
		this.db = db;
		this.inactivityTimeoutMinutes = opts.inactivityTimeoutMinutes ?? 30;
		this.absoluteTimeoutHours = opts.absoluteTimeoutHours ?? 8;
	}

	async create(params: {
		userId: string;
		mfaVerified: boolean;
		provider: "oidc" | "saml";
		ipAddress: string;
		userAgent: string;
		idpRefreshTokenEnc?: string;
		idpAccessTokenExpiresAt?: Date;
	}): Promise<Session> {
		const expiresAt = new Date(Date.now() + this.absoluteTimeoutHours * 60 * 60 * 1000);
		const result = await this.db.query<SessionRow>(
			`INSERT INTO authn_sessions
			   (user_id, expires_at, ip_address, user_agent, mfa_verified, provider,
			    idp_refresh_token_enc, idp_access_token_expires_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, user_id, created_at, last_activity, expires_at,
			           ip_address, user_agent, mfa_verified, provider`,
			[
				params.userId,
				expiresAt,
				params.ipAddress,
				params.userAgent,
				params.mfaVerified,
				params.provider,
				params.idpRefreshTokenEnc ?? null,
				params.idpAccessTokenExpiresAt ?? null,
			],
		);
		return rowToSession(result.rows[0]!);
	}

	async load(sessionId: string): Promise<Session | null> {
		const result = await this.db.query<SessionRow>(
			`SELECT id, user_id, created_at, last_activity, expires_at,
			        ip_address, user_agent, mfa_verified, provider
			 FROM authn_sessions
			 WHERE id = $1
			   AND revoked_at IS NULL
			   AND expires_at > now()
			   AND last_activity > now() - ($2 || ' minutes')::interval`,
			[sessionId, String(this.inactivityTimeoutMinutes)],
		);
		if (result.rows.length === 0) return null;
		return rowToSession(result.rows[0]!);
	}

	async touch(sessionId: string): Promise<void> {
		await this.db.query(
			`UPDATE authn_sessions SET last_activity = now()
			 WHERE id = $1 AND revoked_at IS NULL`,
			[sessionId],
		);
	}

	async revoke(sessionId: string): Promise<void> {
		await this.db.query(
			`UPDATE authn_sessions SET revoked_at = now()
			 WHERE id = $1 AND revoked_at IS NULL`,
			[sessionId],
		);
	}

	async revokeAll(userId: string): Promise<void> {
		await this.db.query(
			`UPDATE authn_sessions SET revoked_at = now()
			 WHERE user_id = $1 AND revoked_at IS NULL`,
			[userId],
		);
	}

	async list(userId: string): Promise<Session[]> {
		const result = await this.db.query<SessionRow>(
			`SELECT id, user_id, created_at, last_activity, expires_at,
			        ip_address, user_agent, mfa_verified, provider
			 FROM authn_sessions
			 WHERE user_id = $1
			   AND revoked_at IS NULL
			   AND expires_at > now()
			 ORDER BY last_activity DESC`,
			[userId],
		);
		return result.rows.map(rowToSession);
	}
}
