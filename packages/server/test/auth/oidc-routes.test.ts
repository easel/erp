/**
 * Unit tests: OIDC SSO routes (hx-657045c3)
 *
 * Uses a mock OidcAdapter to avoid real network calls to an IdP.
 * Exercises: login redirect, callback success, state mismatch, lockout.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.1, §12
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Configuration } from "openid-client";
import type { AuthProvider } from "../../src/auth/provider.js";
import { registerOidcRoutes } from "../../src/auth/routes/oidc.js";
import type { OidcAdapter, OidcClaims } from "../../src/auth/routes/oidc.js";
import type { SessionManager } from "../../src/auth/session-manager.js";
import type { ApogeeUser, Session } from "../../src/auth/types.js";

// ── Stub helpers ─────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<ApogeeUser> = {}): ApogeeUser {
	return {
		id: "user-1",
		email: "alice@example.com",
		displayName: "Alice",
		mfaEnabled: false,
		mfaTotpSecret: null,
		accountStatus: "active",
		failedLoginCount: 0,
		lockedUntil: null,
		...overrides,
	};
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "sess-1",
		userId: "user-1",
		createdAt: new Date(),
		lastActivity: new Date(),
		expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
		ipAddress: "127.0.0.1",
		userAgent: "test",
		mfaVerified: false,
		provider: "oidc",
		...overrides,
	};
}

function stubAuthProvider(user: ApogeeUser): AuthProvider {
	return {
		async resolveUser() {
			return user;
		},
	};
}

function stubSessionManager(session: Session): SessionManager {
	return {
		async create() {
			return session;
		},
		async load() {
			return null;
		},
		async touch() {},
		async revoke() {},
		async revokeAll() {},
		async list() {
			return [];
		},
	};
}

/**
 * Build a mock OidcAdapter.  The discover step returns a sentinel object;
 * buildAuthUrl returns a predictable URL; exchangeCode returns fixed claims.
 */
function stubOidcAdapter(claims: OidcClaims | Error): OidcAdapter {
	return {
		async discover() {
			// Configuration is opaque to our routes — return an empty sentinel.
			return {} as Configuration;
		},
		buildAuthUrl(_config, params) {
			return new URL(
				`https://idp.example.com/authorize?state=${params.state}&nonce=${params.nonce}&redirect_uri=${params.redirect_uri}`,
			);
		},
		async exchangeCode(_config, _url, _checks) {
			if (claims instanceof Error) throw claims;
			return claims;
		},
	};
}

// ── Build test app ────────────────────────────────────────────────────────────

async function buildApp(opts: {
	user?: ApogeeUser;
	session?: Session;
	adapterClaims?: OidcClaims | Error;
}): Promise<FastifyInstance> {
	const user = opts.user ?? makeUser();
	const session = opts.session ?? makeSession({ mfaVerified: !user.mfaEnabled });
	const claims: OidcClaims =
		opts.adapterClaims instanceof Error
			? ({ sub: "sub1", email: "alice@example.com" } as OidcClaims)
			: (opts.adapterClaims ?? { sub: "sub1", email: "alice@example.com", name: "Alice" });

	const adapter = stubOidcAdapter(opts.adapterClaims ?? claims);

	const app = Fastify({ logger: false });

	await registerOidcRoutes(app, {
		providerConfig: {
			type: "oidc",
			issuer: "https://idp.example.com",
			clientId: "apogee",
			clientSecret: "secret",
			callbackUrl: "https://app.example.com/auth/oidc/callback",
		},
		authProvider: stubAuthProvider(user),
		sessionManager: stubSessionManager(session),
		serverBaseUrl: "https://app.example.com",
		adapter,
	});

	return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OIDC routes", () => {
	let app: FastifyInstance;

	afterEach(async () => {
		await app?.close();
	});

	describe("GET /auth/oidc/login", () => {
		beforeEach(async () => {
			app = await buildApp({});
		});

		test("redirects to IdP authorization URL", async () => {
			const res = await app.inject({ method: "GET", url: "/auth/oidc/login" });
			expect(res.statusCode).toBe(302);
			const location = res.headers.location as string;
			expect(location).toContain("idp.example.com/authorize");
		});

		test("sets state and nonce cookies", async () => {
			const res = await app.inject({ method: "GET", url: "/auth/oidc/login" });
			const cookies = res.headers["set-cookie"];
			const cookieArr = Array.isArray(cookies) ? cookies : [cookies as string];
			const hasState = cookieArr.some((c) => c.startsWith("oidc_state="));
			const hasNonce = cookieArr.some((c) => c.startsWith("oidc_nonce="));
			expect(hasState).toBe(true);
			expect(hasNonce).toBe(true);
		});

		test("cookies are HttpOnly and SameSite=Lax", async () => {
			const res = await app.inject({ method: "GET", url: "/auth/oidc/login" });
			const cookies = res.headers["set-cookie"];
			const cookieArr = Array.isArray(cookies) ? cookies : [cookies as string];
			for (const c of cookieArr) {
				expect(c).toContain("HttpOnly");
				expect(c).toContain("SameSite=Lax");
			}
		});
	});

	describe("GET /auth/oidc/callback", () => {
		test("creates session and redirects to /dashboard when MFA not enabled", async () => {
			app = await buildApp({ user: makeUser({ mfaEnabled: false }) });

			// First get the state/nonce from the login route.
			const loginRes = await app.inject({ method: "GET", url: "/auth/oidc/login" });
			const cookies = loginRes.headers["set-cookie"] as string[];
			const stateCookie = cookies.find((c) => c.startsWith("oidc_state=")) ?? "";
			const nonceCookie = cookies.find((c) => c.startsWith("oidc_nonce=")) ?? "";

			// Extract state value.
			const stateMatch = /oidc_state=([^;]+)/.exec(stateCookie);
			const nonceMatch = /oidc_nonce=([^;]+)/.exec(nonceCookie);
			const state = stateMatch ? decodeURIComponent(stateMatch[1]!) : "";
			const nonce = nonceMatch ? decodeURIComponent(nonceMatch[1]!) : "";

			const cookieHeader = `oidc_state=${state}; oidc_nonce=${nonce}`;

			const callbackRes = await app.inject({
				method: "GET",
				url: `/auth/oidc/callback?code=code123&state=${state}`,
				headers: { cookie: cookieHeader },
			});

			expect(callbackRes.statusCode).toBe(302);
			expect(callbackRes.headers.location).toBe("/dashboard");

			// Session cookie must be set.
			const setCookies = callbackRes.headers["set-cookie"] as string | string[];
			const cookieArr = Array.isArray(setCookies) ? setCookies : [setCookies];
			expect(cookieArr.some((c) => c.startsWith("apogee_session="))).toBe(true);
		});

		test("redirects to /auth/mfa/verify when user has MFA enabled", async () => {
			app = await buildApp({
				user: makeUser({ mfaEnabled: true }),
				session: makeSession({ mfaVerified: false }),
			});

			const loginRes = await app.inject({ method: "GET", url: "/auth/oidc/login" });
			const cookies = loginRes.headers["set-cookie"] as string[];
			const stateCookie = cookies.find((c) => c.startsWith("oidc_state=")) ?? "";
			const nonceCookie = cookies.find((c) => c.startsWith("oidc_nonce=")) ?? "";
			const state = decodeURIComponent((/oidc_state=([^;]+)/.exec(stateCookie) ?? ["", ""])[1]!);
			const nonce = decodeURIComponent((/oidc_nonce=([^;]+)/.exec(nonceCookie) ?? ["", ""])[1]!);
			const cookieHeader = `oidc_state=${state}; oidc_nonce=${nonce}`;

			const res = await app.inject({
				method: "GET",
				url: `/auth/oidc/callback?code=code123&state=${state}`,
				headers: { cookie: cookieHeader },
			});

			expect(res.statusCode).toBe(302);
			expect(res.headers.location).toBe("/auth/mfa/verify");
		});

		test("returns 400 when state/nonce cookies are missing", async () => {
			app = await buildApp({});

			const res = await app.inject({
				method: "GET",
				url: "/auth/oidc/callback?code=code123&state=somestate",
			});
			expect(res.statusCode).toBe(400);
		});

		test("returns 401 when token exchange fails", async () => {
			app = await buildApp({ adapterClaims: new Error("IdP rejected token") });

			// Provide valid-looking cookies so the guard passes.
			const res = await app.inject({
				method: "GET",
				url: "/auth/oidc/callback?code=bad&state=s",
				headers: { cookie: "oidc_state=s; oidc_nonce=n" },
			});
			expect(res.statusCode).toBe(401);
		});

		test("clears state/nonce cookies on callback regardless of outcome", async () => {
			app = await buildApp({ adapterClaims: new Error("fail") });

			const res = await app.inject({
				method: "GET",
				url: "/auth/oidc/callback?code=x&state=s",
				headers: { cookie: "oidc_state=s; oidc_nonce=n" },
			});
			const setCookies = res.headers["set-cookie"] as string | string[];
			const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
			// Max-Age=0 means clear.
			expect(arr.some((c) => c.includes("oidc_state=") && c.includes("Max-Age=0"))).toBe(true);
			expect(arr.some((c) => c.includes("oidc_nonce=") && c.includes("Max-Age=0"))).toBe(true);
		});

		test("returns 401 when resolveUser throws locked error", async () => {
			const lockedProvider: AuthProvider = {
				async resolveUser() {
					throw Object.assign(new Error("Account locked"), { statusCode: 401 });
				},
			};

			const app2 = Fastify({ logger: false });
			await registerOidcRoutes(app2, {
				providerConfig: {
					type: "oidc",
					issuer: "https://idp.example.com",
					clientId: "apogee",
					clientSecret: "secret",
					callbackUrl: "https://app.example.com/auth/oidc/callback",
				},
				authProvider: lockedProvider,
				sessionManager: stubSessionManager(makeSession()),
				serverBaseUrl: "https://app.example.com",
				adapter: stubOidcAdapter({ sub: "sub1", email: "alice@example.com" }),
			});

			const res = await app2.inject({
				method: "GET",
				url: "/auth/oidc/callback?code=x&state=s",
				headers: { cookie: "oidc_state=s; oidc_nonce=n" },
			});
			await app2.close();
			expect(res.statusCode).toBe(401);
		});
	});
});
