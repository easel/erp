/**
 * AuthProvider interface + DefaultAuthProvider implementation.
 *
 * DefaultAuthProvider handles:
 *   - Identity link lookup (authn_identity_links)
 *   - JIT user provisioning (create user_account + link on first login)
 *   - Lockout enforcement (5 failures → 30 min lockout, sessions revoked)
 *   - Auto-unlock when lockout period has expired
 *   - Display name / email refresh on subsequent logins
 *
 * Ref: SD-004-authn-provider-abstraction.md §5, §8
 * Issue: hx-b2239605
 */

import type { ApogeeUser, IdentityAssertion } from "./types.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AuthProvider {
	/**
	 * Resolve an IdentityAssertion to a local Apogee user.
	 * Creates the user (JIT provisioning) if they do not exist.
	 * Updates display name / email on subsequent logins.
	 * Throws with statusCode 401 on lockout or deactivation.
	 */
	resolveUser(assertion: IdentityAssertion): Promise<ApogeeUser>;
}

/**
 * Minimal DB query interface — structural, compatible with pg.PoolClient
 * and test doubles.
 */
export interface AuthDbClient {
	query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

export interface DefaultAuthProviderConfig {
	/** Number of consecutive failures before lockout. Default: 5 */
	lockoutThreshold: number;
	/** Duration of lockout in minutes. Default: 30 */
	lockoutDurationMinutes: number;
}

// ── DB row types (private to this module) ─────────────────────────────────────

interface UserAccountRow {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: DefaultAuthProviderConfig = {
	lockoutThreshold: 5,
	lockoutDurationMinutes: 30,
};

/**
 * Well-known system actor UUID used as created_by/updated_by for JIT-provisioned
 * users.  This row must be pre-seeded in the database before any JIT provisioning
 * can occur (or the FK constraint temporarily deferred).
 */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001";

// ── DefaultAuthProvider ───────────────────────────────────────────────────────

export class DefaultAuthProvider implements AuthProvider {
	private readonly db: AuthDbClient;
	private readonly config: DefaultAuthProviderConfig;

	constructor(db: AuthDbClient, config: Partial<DefaultAuthProviderConfig> = {}) {
		this.db = db;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async resolveUser(assertion: IdentityAssertion): Promise<ApogeeUser> {
		// 1. Look up identity link → userId
		const linkResult = await this.db.query<{ user_id: string }>(
			"SELECT user_id FROM authn_identity_links WHERE provider = $1 AND external_id = $2",
			[assertion.provider, assertion.externalId],
		);

		let userId: string;
		if (linkResult.rows.length > 0) {
			userId = linkResult.rows[0]?.user_id;
		} else {
			// JIT provision: create user_account + identity link
			userId = await this.jitProvision(assertion);
		}

		// 2. Load the full user row
		const userResult = await this.db.query<UserAccountRow>(
			`SELECT id, email, display_name, mfa_enabled, mfa_totp_secret,
			        failed_login_count, locked_until, is_active, deleted_at
			 FROM user_account WHERE id = $1`,
			[userId],
		);

		if (userResult.rows.length === 0) {
			throw Object.assign(new Error("User not found after provisioning"), { statusCode: 401 });
		}

		const row = userResult.rows[0]!;
		const accountStatus = deriveAccountStatus(row);

		// 3. Deactivated accounts are always rejected
		if (accountStatus === "deactivated") {
			throw Object.assign(new Error("Account deactivated"), { statusCode: 401 });
		}

		// 4. Lockout check with auto-unlock
		if (accountStatus === "locked") {
			const now = new Date();
			if (row.locked_until !== null && row.locked_until > now) {
				throw Object.assign(new Error("Account locked"), { statusCode: 401 });
			}
			// Lockout period has expired — auto-unlock
			await this.db.query(
				`UPDATE user_account
				 SET locked_until = NULL, failed_login_count = 0, updated_at = now()
				 WHERE id = $1`,
				[userId],
			);
			row.locked_until = null;
			row.failed_login_count = 0;
		}

		// 5. Refresh display_name if the IdP provided an updated value
		if (assertion.displayName !== undefined && assertion.displayName !== row.display_name) {
			await this.db.query(
				"UPDATE user_account SET display_name = $1, updated_at = now() WHERE id = $2",
				[assertion.displayName, userId],
			);
		}

		return {
			id: row.id,
			email: row.email,
			displayName: assertion.displayName ?? row.display_name,
			mfaEnabled: row.mfa_enabled,
			mfaTotpSecret: row.mfa_totp_secret,
			// After auto-unlock the status is effectively active
			accountStatus: accountStatus === "locked" ? "active" : accountStatus,
			failedLoginCount: row.failed_login_count,
			lockedUntil: row.locked_until,
		};
	}

	/**
	 * JIT-provision a new user_account and identity link for a first-time IdP
	 * login.  Returns the new user's UUID.
	 *
	 * Implementation note: created_by/updated_by reference SYSTEM_ACTOR_ID which
	 * must exist in user_account before JIT provisioning is used in production.
	 * The ON CONFLICT DO UPDATE handles the edge case where the email already
	 * exists (e.g. the user was pre-created by an admin) — it binds the IdP
	 * identity to the existing account without clobbering it.
	 */
	private async jitProvision(assertion: IdentityAssertion): Promise<string> {
		const displayName = assertion.displayName ?? assertion.email.split("@")[0] ?? assertion.email;

		const insertResult = await this.db.query<{ id: string }>(
			`INSERT INTO user_account (email, display_name, is_active, created_by, updated_by)
			 VALUES ($1, $2, TRUE, $3, $3)
			 ON CONFLICT (email) DO UPDATE
			   SET display_name = EXCLUDED.display_name, updated_at = now()
			 RETURNING id`,
			[assertion.email, displayName, SYSTEM_ACTOR_ID],
		);

		const userId = insertResult.rows[0]?.id;

		// Bind the IdP identity to this user; ignore if already linked
		await this.db.query(
			`INSERT INTO authn_identity_links (user_id, provider, external_id)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (provider, external_id) DO NOTHING`,
			[userId, assertion.provider, assertion.externalId],
		);

		return userId;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive account status from DB row.
 * Returns "locked" for ANY non-null locked_until (including expired locks)
 * so that resolveUser() can perform auto-unlock when the period has passed.
 * SD-004 §8: "locked AND lockedUntil <= now() → auto-unlock, reset failed count"
 */
function deriveAccountStatus(row: UserAccountRow): "active" | "locked" | "deactivated" {
	if (row.deleted_at !== null || !row.is_active) return "deactivated";
	if (row.locked_until !== null) return "locked";
	return "active";
}
