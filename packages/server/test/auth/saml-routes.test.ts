/**
 * Unit tests: SAML 2.0 SSO routes (hx-c647f862)
 *
 * Uses a stub SamlAdapter to avoid real XML signing and IdP network calls.
 * Covers: login redirect, ACS success, ACS invalid response, MFA gate,
 * locked account, missing SAMLResponse body field.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.2, §12
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AuthProvider } from "../../src/auth/provider.js";
import { registerSamlRoutes } from "../../src/auth/routes/saml.js";
import type { SamlAdapter, SamlProfile } from "../../src/auth/routes/saml.js";
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
		provider: "saml",
		...overrides,
	};
}

function stubAuthProvider(user: ApogeeUser | Error): AuthProvider {
	return {
		async resolveUser() {
			if (user instanceof Error) throw user;
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

function stubSamlAdapter(opts: {
	authorizeUrl?: string;
	profile?: SamlProfile | Error;
}): SamlAdapter {
	return {
		async getAuthorizeUrl() {
			return opts.authorizeUrl ?? "https://idp.example.com/sso";
		},
		async validateResponse(_samlResponse) {
			const p = opts.profile ?? {
				nameID: "alice-nameid",
				email: "alice@example.com",
				displayName: "Alice",
				attributes: {},
			};
			if (p instanceof Error) throw p;
			return p;
		},
	};
}

async function buildApp(opts: {
	user?: ApogeeUser | Error;
	session?: Session;
	adapter?: SamlAdapter;
}): Promise<FastifyInstance> {
	const user = opts.user ?? makeUser();
	const session = opts.session ?? makeSession();

	const app = Fastify({ logger: false });

	await registerSamlRoutes(app, {
		providerConfig: {
			type: "saml",
			entryPoint: "https://idp.example.com/sso",
			issuer: "https://app.example.com",
			cert: "FAKECERT",
			callbackUrl: "https://app.example.com/auth/saml/acs",
		},
		authProvider: stubAuthProvider(user),
		sessionManager: stubSessionManager(session),
		adapter: opts.adapter ?? stubSamlAdapter({}),
	});

	return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SAML routes", () => {
	let app: FastifyInstance;

	afterEach(async () => {
		await app?.close();
	});

	describe("GET /auth/saml/login", () => {
		beforeEach(async () => {
			app = await buildApp({});
		});

		test("redirects to IdP SSO URL", async () => {
			const res = await app.inject({ method: "GET", url: "/auth/saml/login" });
			expect(res.statusCode).toBe(302);
			expect(res.headers.location).toBe("https://idp.example.com/sso");
		});

		test("returns 500 when adapter.getAuthorizeUrl throws", async () => {
			const brokenAdapter = stubSamlAdapter({});
			brokenAdapter.getAuthorizeUrl = async () => {
				throw new Error("SAML init error");
			};
			const app2 = await buildApp({ adapter: brokenAdapter });
			const res = await app2.inject({ method: "GET", url: "/auth/saml/login" });
			expect(res.statusCode).toBe(500);
			await app2.close();
		});
	});

	describe("POST /auth/saml/acs", () => {
		test("validates SAMLResponse, creates session, redirects to /dashboard", async () => {
			app = await buildApp({ user: makeUser({ mfaEnabled: false }) });

			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ SAMLResponse: "base64-encoded-saml-response" }),
				headers: { "content-type": "application/json" },
			});

			expect(res.statusCode).toBe(302);
			expect(res.headers.location).toBe("/dashboard");

			const setCookies = res.headers["set-cookie"] as string | string[];
			const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
			expect(arr.some((c) => c.startsWith("apogee_session="))).toBe(true);
		});

		test("redirects to /auth/mfa/verify when user has MFA enabled", async () => {
			app = await buildApp({
				user: makeUser({ mfaEnabled: true }),
				session: makeSession({ mfaVerified: false }),
			});

			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ SAMLResponse: "base64-encoded-saml-response" }),
				headers: { "content-type": "application/json" },
			});

			expect(res.statusCode).toBe(302);
			expect(res.headers.location).toBe("/auth/mfa/verify");
		});

		test("returns 400 when SAMLResponse field is missing", async () => {
			app = await buildApp({});
			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ other: "field" }),
				headers: { "content-type": "application/json" },
			});
			expect(res.statusCode).toBe(400);
		});

		test("returns 401 when SAMLResponse validation fails", async () => {
			app = await buildApp({
				adapter: stubSamlAdapter({ profile: new Error("Invalid signature") }),
			});
			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ SAMLResponse: "invalid" }),
				headers: { "content-type": "application/json" },
			});
			expect(res.statusCode).toBe(401);
		});

		test("returns 401 when resolveUser throws locked error", async () => {
			const lockedErr = Object.assign(new Error("Account locked"), { statusCode: 401 });
			app = await buildApp({ user: lockedErr });

			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ SAMLResponse: "valid-but-locked" }),
				headers: { "content-type": "application/json" },
			});
			expect(res.statusCode).toBe(401);
			expect((res.json() as { error: string }).error).toContain("locked");
		});

		test("sets HttpOnly session cookie on success", async () => {
			app = await buildApp({});
			const res = await app.inject({
				method: "POST",
				url: "/auth/saml/acs",
				body: JSON.stringify({ SAMLResponse: "valid" }),
				headers: { "content-type": "application/json" },
			});
			const setCookies = res.headers["set-cookie"] as string | string[];
			const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
			const sessionCookie = arr.find((c) => c.startsWith("apogee_session="));
			expect(sessionCookie).toBeTruthy();
			expect(sessionCookie).toContain("HttpOnly");
			expect(sessionCookie).toContain("SameSite=Lax");
		});
	});
});
