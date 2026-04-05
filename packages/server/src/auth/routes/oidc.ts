/**
 * OIDC SSO routes — openid-client v6.
 *
 * Routes:
 *   GET /auth/oidc/login     — redirect to IdP authorization endpoint
 *   GET /auth/oidc/callback  — exchange code, validate id_token, create session
 *
 * State and nonce are generated per-request and bound to short-lived
 * HttpOnly cookies before the redirect so they survive the round-trip
 * to the IdP without exposing them to JavaScript.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.1, §9, §11, §12
 * Issue: hx-657045c3
 */

import type { FastifyInstance } from "fastify";
import {
	type Configuration,
	authorizationCodeGrant,
	buildAuthorizationUrl,
	discovery,
	randomNonce,
	randomState,
} from "openid-client";
import type { OidcProviderConfig } from "../config.js";
import type { AuthProvider } from "../provider.js";
import type { SessionManager } from "../session-manager.js";
import { encryptToken } from "../token-crypto.js";

// ── Public interface ───────────────────────────────────────────────────────────

export interface OidcRouteOptions {
	providerConfig: OidcProviderConfig;
	authProvider: AuthProvider;
	sessionManager: SessionManager;
	/**
	 * Base URL of this server — used to build the absolute callback URL when
	 * parsing the current request URL inside the callback handler.
	 */
	serverBaseUrl: string;
	/**
	 * Adapter for external IdP interactions.  Defaults to the real
	 * openid-client implementation.  Override in tests to avoid network calls.
	 */
	adapter?: OidcAdapter;
	/**
	 * AES-256-GCM encryption key (64 hex chars / 32 bytes) for storing refresh
	 * tokens at rest.  When provided, the refresh token from the IdP is encrypted
	 * and stored in authn_sessions.idp_refresh_token_enc so the background job
	 * can refresh near-expiry access tokens automatically.
	 *
	 * Reads from APP_SESSION_ENCRYPTION_KEY env var if not supplied explicitly.
	 */
	encryptionKey?: string;
}

/**
 * Injectable interface for the openid-client operations that touch the
 * network.  The default implementation delegates to openid-client; tests
 * inject a mock.
 */
export interface OidcAdapter {
	/** Perform OIDC discovery and return a Configuration. */
	discover(issuer: string, clientId: string, clientSecret: string): Promise<Configuration>;

	/** Build the IdP authorization redirect URL. */
	buildAuthUrl(
		config: Configuration,
		params: { redirect_uri: string; scope: string; state: string; nonce: string },
	): URL;

	/** Exchange an authorization code for ID-token claims. */
	exchangeCode(
		config: Configuration,
		currentUrl: URL,
		checks: { expectedState: string; expectedNonce: string },
	): Promise<OidcClaims>;
}

export interface OidcClaims {
	sub: string;
	email: string;
	name?: string;
	/** Refresh token returned by the IdP, if present. */
	refreshToken?: string;
	/** When the access token expires. Undefined if the IdP did not provide expires_in. */
	accessTokenExpiresAt?: Date;
	[key: string]: unknown;
}

// ── Default adapter (real openid-client) ──────────────────────────────────────

export const defaultOidcAdapter: OidcAdapter = {
	async discover(issuer, clientId, clientSecret) {
		return discovery(new URL(issuer), clientId, clientSecret);
	},

	buildAuthUrl(config, params) {
		return buildAuthorizationUrl(config, params);
	},

	async exchangeCode(config, currentUrl, checks) {
		const tokens = await authorizationCodeGrant(config, currentUrl, {
			expectedState: checks.expectedState,
			expectedNonce: checks.expectedNonce,
		});
		const claims = tokens.claims();
		if (!claims) throw new Error("No ID-token claims in token response");
		const sub = claims.sub;
		const email = claims.email as string | undefined;
		if (!email) throw new Error("OIDC id_token missing email claim");

		const refreshToken =
			typeof tokens.refresh_token === "string" ? tokens.refresh_token : undefined;
		const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : undefined;
		const accessTokenExpiresAt = expiresIn
			? new Date(Date.now() + expiresIn * 1000)
			: undefined;

		return { ...claims, sub, email, refreshToken, accessTokenExpiresAt };
	},
};

// ── Cookie helpers ─────────────────────────────────────────────────────────────

/** Name of the short-lived CSRF-protection state cookie. */
const STATE_COOKIE = "oidc_state";
/** Name of the short-lived nonce cookie. */
const NONCE_COOKIE = "oidc_nonce";
/** Cookie max-age: 10 minutes — enough for an IdP redirect round-trip. */
const TEMP_COOKIE_MAX_AGE = 600;

function buildTempCookie(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/auth/oidc; SameSite=Lax; Max-Age=${TEMP_COOKIE_MAX_AGE}`;
}

function clearTempCookie(name: string): string {
	return `${name}=; HttpOnly; Path=/auth/oidc; SameSite=Lax; Max-Age=0`;
}

/** Parse a cookie value from the Cookie: request header. */
function parseCookieValue(cookieHeader: string, name: string): string | undefined {
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		if (key === name) {
			return decodeURIComponent(trimmed.slice(eqIdx + 1).trim());
		}
	}
	return undefined;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerOidcRoutes(
	app: FastifyInstance,
	opts: OidcRouteOptions,
): Promise<void> {
	const { providerConfig, authProvider, sessionManager, serverBaseUrl } = opts;
	const adapter = opts.adapter ?? defaultOidcAdapter;
	const encryptionKey =
		opts.encryptionKey !== undefined
			? opts.encryptionKey
			: (process.env.APP_SESSION_ENCRYPTION_KEY ?? "");
	const scopes = providerConfig.scopes ?? ["openid", "email", "profile"];

	// Perform OIDC discovery once at registration time so the routes are ready
	// to serve without per-request network calls.
	const oidcConfig = await adapter.discover(
		providerConfig.issuer,
		providerConfig.clientId,
		providerConfig.clientSecret,
	);

	// ── GET /auth/oidc/login ──────────────────────────────────────────────────

	app.get("/auth/oidc/login", async (_req, reply) => {
		const state = randomState();
		const nonce = randomNonce();

		const authUrl = adapter.buildAuthUrl(oidcConfig, {
			redirect_uri: providerConfig.callbackUrl,
			scope: scopes.join(" "),
			state,
			nonce,
		});

		// Bind state + nonce to short-lived HttpOnly cookies so we can validate
		// them on the callback without server-side storage.
		reply.header("Set-Cookie", buildTempCookie(STATE_COOKIE, state));
		reply.header("Set-Cookie", buildTempCookie(NONCE_COOKIE, nonce));

		return reply.code(302).header("Location", authUrl.href).send();
	});

	// ── GET /auth/oidc/callback ───────────────────────────────────────────────

	app.get("/auth/oidc/callback", async (req, reply) => {
		const cookieHeader = req.headers.cookie ?? "";
		const expectedState = parseCookieValue(cookieHeader, STATE_COOKIE);
		const expectedNonce = parseCookieValue(cookieHeader, NONCE_COOKIE);

		// Clear the temporary cookies regardless of outcome.
		reply.header("Set-Cookie", clearTempCookie(STATE_COOKIE));
		reply.header("Set-Cookie", clearTempCookie(NONCE_COOKIE));

		if (!expectedState || !expectedNonce) {
			return reply.code(400).send({ error: "Missing OIDC state or nonce cookie" });
		}

		let claims: OidcClaims;
		try {
			// Build the full URL so openid-client can parse the code + state params.
			const currentUrl = new URL(req.url, serverBaseUrl);
			claims = await adapter.exchangeCode(oidcConfig, currentUrl, {
				expectedState,
				expectedNonce,
			});
		} catch (err: unknown) {
			req.log.warn({ err }, "OIDC token exchange failed");
			return reply.code(401).send({ error: "OIDC authentication failed" });
		}

		// Resolve (or JIT-provision) the local user.
		let user: import("../types.js").ApogeeUser;
		try {
			user = await authProvider.resolveUser({
				provider: "oidc",
				externalId: claims.sub,
				email: claims.email,
				...(claims.name !== undefined ? { displayName: claims.name } : {}),
				rawClaims: claims,
			});
		} catch (err: unknown) {
			const statusCode = (err as { statusCode?: number }).statusCode ?? 401;
			const message = (err as Error).message ?? "Authentication failed";
			return reply.code(statusCode).send({ error: message });
		}

		// MFA gate: create an unverified session when TOTP is enrolled, so the
		// browser is redirected to /auth/mfa/verify before getting full access.
		const mfaVerified = !user.mfaEnabled;

		// Encrypt and store the IdP refresh token when the IdP provides one and
		// an encryption key is configured.
		let idpRefreshTokenEnc: string | undefined;
		if (claims.refreshToken && encryptionKey) {
			try {
				idpRefreshTokenEnc = await encryptToken(claims.refreshToken, encryptionKey);
			} catch {
				req.log.warn("Failed to encrypt OIDC refresh token — storing session without it");
			}
		}

		const session = await sessionManager.create({
			userId: user.id,
			mfaVerified,
			provider: "oidc",
			ipAddress: req.ip,
			userAgent: req.headers["user-agent"] ?? "",
			idpRefreshTokenEnc,
			idpAccessTokenExpiresAt: claims.accessTokenExpiresAt,
		});

		reply.header(
			"Set-Cookie",
			`apogee_session=${session.id}; HttpOnly; Secure; Path=/; SameSite=Lax`,
		);

		const redirectTarget = mfaVerified ? "/dashboard" : "/auth/mfa/verify";
		return reply.code(302).header("Location", redirectTarget).send();
	});
}
