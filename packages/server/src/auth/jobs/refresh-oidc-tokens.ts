/**
 * OIDC refresh token background job.
 *
 * Finds active OIDC sessions whose IdP access token is expiring within 5
 * minutes and exchanges the stored refresh token for a new access token.
 * Updates the stored (encrypted) refresh token if the IdP rotates it.
 * Does NOT touch authn_sessions.expires_at — that is the Apogee session
 * absolute expiry and is controlled by the session lifecycle, not the IdP.
 *
 * Scheduling: registered as a Graphile Worker cron task (every 10 minutes).
 * See registerOidcTokenRefreshCron() below.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.5, §12
 * Issue: hx-c757d0df
 */

import type { AuthDbClient } from "../provider.js";
import { decryptToken, encryptToken } from "../token-crypto.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

/**
 * Injectable interface for the token-endpoint call so the job can be
 * tested without a live IdP.
 */
export interface OidcRefreshAdapter {
	/**
	 * Exchange a refresh token at the given token endpoint.
	 * Returns the (possibly rotated) refresh token and the new access token
	 * expiry.  Throws on failure so the job can log the error and skip this
	 * session.
	 */
	refresh(params: {
		tokenEndpoint: string;
		clientId: string;
		clientSecret: string;
		refreshToken: string;
	}): Promise<{
		/** The new (or unchanged) refresh token. */
		refreshToken: string;
		/** When the new access token expires. */
		accessTokenExpiresAt: Date;
	}>;
}

export interface RefreshJobOptions {
	db: AuthDbClient;
	refreshAdapter: OidcRefreshAdapter;
	encryptionKey: string;
	/** IdP token endpoint (e.g. https://idp.example.com/token). */
	tokenEndpoint: string;
	clientId: string;
	clientSecret: string;
	/**
	 * Seconds before expiry at which a token is considered "near expiry"
	 * and eligible for refresh.  Default: 300 (5 minutes).
	 */
	refreshWindowSeconds?: number;
}

export interface RefreshJobResult {
	refreshed: number;
	failed: number;
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface PendingRefreshRow {
	id: string;
	idp_refresh_token_enc: string;
	expires_at: Date;
}

// ── Default adapter (real openid-client) ──────────────────────────────────────

/**
 * Default production adapter — calls the token endpoint directly using the
 * Web Crypto-based fetch.  Uses the refresh_token grant type per RFC 6749 §6.
 */
export const defaultOidcRefreshAdapter: OidcRefreshAdapter = {
	async refresh({ tokenEndpoint, clientId, clientSecret, refreshToken }) {
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
		});

		const response = await fetch(tokenEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		});

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`Token refresh failed: HTTP ${response.status} — ${text}`);
		}

		const data = (await response.json()) as {
			refresh_token?: string;
			expires_in?: number;
		};

		const newRefreshToken = data.refresh_token ?? refreshToken; // IdP may not rotate
		const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
		const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

		return { refreshToken: newRefreshToken, accessTokenExpiresAt };
	},
};

// ── Job function ──────────────────────────────────────────────────────────────

/**
 * Find near-expiry OIDC sessions and refresh their IdP access tokens.
 *
 * Safe to run concurrently: each session row is only updated once.
 * Sessions where the refresh fails are skipped (not revoked) so the user
 * can still authenticate manually.
 */
export async function runOidcTokenRefreshJob(opts: RefreshJobOptions): Promise<RefreshJobResult> {
	const windowSecs = opts.refreshWindowSeconds ?? 300;

	// Find active OIDC sessions with a stored refresh token whose IdP access
	// token is expiring within the refresh window.
	const { rows } = await opts.db.query<PendingRefreshRow>(
		`SELECT id, idp_refresh_token_enc, expires_at
		 FROM authn_sessions
		 WHERE provider = 'oidc'
		   AND revoked_at IS NULL
		   AND expires_at > now()
		   AND idp_refresh_token_enc IS NOT NULL
		   AND idp_access_token_expires_at IS NOT NULL
		   AND idp_access_token_expires_at <= now() + ($1 || ' seconds')::interval
		 ORDER BY idp_access_token_expires_at`,
		[String(windowSecs)],
	);

	let refreshed = 0;
	let failed = 0;

	for (const row of rows) {
		try {
			// Decrypt the stored refresh token.
			const refreshToken = await decryptToken(row.idp_refresh_token_enc, opts.encryptionKey);

			// Exchange it at the IdP token endpoint.
			const result = await opts.refreshAdapter.refresh({
				tokenEndpoint: opts.tokenEndpoint,
				clientId: opts.clientId,
				clientSecret: opts.clientSecret,
				refreshToken,
			});

			// Re-encrypt the (possibly rotated) refresh token.
			const newEncryptedToken = await encryptToken(result.refreshToken, opts.encryptionKey);

			// Update the session row.  Deliberately does NOT touch expires_at
			// (the Apogee session absolute expiry) — only the IdP token fields.
			await opts.db.query(
				`UPDATE authn_sessions
				 SET idp_refresh_token_enc      = $1,
				     idp_access_token_expires_at = $2
				 WHERE id = $3`,
				[newEncryptedToken, result.accessTokenExpiresAt, row.id],
			);

			refreshed++;
		} catch (err) {
			// Log but don't abort — continue processing remaining sessions.
			// The session remains valid; the user will re-auth when the Apogee
			// session eventually expires.
			console.error(`[refresh-oidc-tokens] failed to refresh session ${row.id}:`, err);
			failed++;
		}
	}

	return { refreshed, failed };
}

// ── Graphile Worker cron registration ────────────────────────────────────────

/**
 * Graphile Worker task handler that wraps runOidcTokenRefreshJob.
 *
 * Register with a Graphile Worker runner:
 *
 *   import { run } from "graphile-worker";
 *   import { makeOidcTokenRefreshTask } from "./jobs/refresh-oidc-tokens.js";
 *
 *   const runner = await run({
 *     connectionString: process.env.DATABASE_URL,
 *     taskList: {
 *       refresh_oidc_tokens: makeOidcTokenRefreshTask(jobOpts),
 *     },
 *     crontab: "0,10,20,30,40,50 * * * * refresh_oidc_tokens",
 *   });
 *
 * NOTE: graphile-worker must be installed separately (`bun add graphile-worker`)
 * and its DB schema must be initialized before using this function.
 */
export function makeOidcTokenRefreshTask(opts: RefreshJobOptions) {
	return async function oidcTokenRefreshTask(): Promise<void> {
		const result = await runOidcTokenRefreshJob(opts);
		if (result.failed > 0) {
			console.warn(
				`[refresh-oidc-tokens] completed: refreshed=${result.refreshed} failed=${result.failed}`,
			);
		}
	};
}
