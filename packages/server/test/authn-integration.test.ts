/**
 * Integration tests: PLT-006 AuthN stack — OIDC, SAML, MFA gate, lockout
 *
 * Tests use Fastify inject() against a stub auth plugin that correctly
 * implements the SD-004 contract without external IdP libraries.  When the
 * real implementations land (PLT-006-B through PLT-006-H) they must satisfy
 * the same HTTP-level behaviour asserted here.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7, 8, 12
 * Issue: hx-0c6108f0
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ── TOTP helpers (RFC 6238 — no external deps, Web Crypto only) ─────────────

/** Minimal base32 decoder for TOTP secret keys. */
function base32Decode(encoded: string): Uint8Array {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	const clean = encoded.replace(/=+$/, "").toUpperCase();
	let bits = 0;
	let value = 0;
	const output: number[] = [];
	for (const char of clean) {
		const idx = alphabet.indexOf(char);
		if (idx === -1) continue;
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			output.push((value >> bits) & 0xff);
		}
	}
	return new Uint8Array(output);
}

/**
 * Generate a TOTP code (RFC 6238) for the given base32 secret and timestamp.
 * Defaults to the current 30-second window.
 */
async function generateTOTP(secret: string, atMs?: number): Promise<string> {
	const keyBytes = base32Decode(secret);
	const counter = Math.floor((atMs ?? Date.now()) / 30_000);
	const counterBytes = new Uint8Array(8);
	for (let i = 7; i >= 0; i--) {
		counterBytes[i] = counter & 0xff;
		// biome-ignore lint/suspicious/noAssignInExpressions: bitshift loop idiom
		counter >> 8; // intentional no-op after extraction — we used & 0xff above
	}
	// Rebuild counter as big-endian 8 bytes
	let c = Math.floor((atMs ?? Date.now()) / 30_000);
	for (let i = 7; i >= 0; i--) {
		counterBytes[i] = c & 0xff;
		c = Math.floor(c / 256);
	}

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
	const offset = (hmac[19] ?? 0) & 0x0f;
	const code =
		(((hmac[offset] ?? 0) & 0x7f) << 24) |
		(((hmac[offset + 1] ?? 0) & 0xff) << 16) |
		(((hmac[offset + 2] ?? 0) & 0xff) << 8) |
		((hmac[offset + 3] ?? 0) & 0xff);
	return String(code % 1_000_000).padStart(6, "0");
}

// ── In-memory stores ─────────────────────────────────────────────────────────

interface StubUser {
	id: string;
	email: string;
	displayName: string;
	mfaEnabled: boolean;
	mfaTotpSecret: string | null;
	accountStatus: "active" | "locked" | "deactivated";
	failedLoginCount: number;
	lockedUntil: Date | null;
}

interface StubSession {
	id: string;
	userId: string;
	createdAt: Date;
	lastActivity: Date;
	expiresAt: Date;
	ipAddress: string;
	userAgent: string;
	mfaVerified: boolean;
	provider: "oidc" | "saml";
	revokedAt: Date | null;
}

/** Shared test state — reset in beforeEach */
interface StoreState {
	users: Map<string, StubUser>;
	/** externalId (provider:id) → userId */
	identityLinks: Map<string, string>;
	sessions: Map<string, StubSession>;
	/** Mutable clock override — null means use Date.now() */
	now: (() => number) | null;
}

function createStore(): StoreState {
	return {
		users: new Map(),
		identityLinks: new Map(),
		sessions: new Map(),
		now: null,
	};
}

function createSession(
	store: StoreState,
	opts: {
		userId: string;
		provider?: "oidc" | "saml";
		mfaVerified?: boolean;
		expiresInMs?: number;
		createdMsAgo?: number;
	},
): StubSession {
	const nowMs = store.now ? store.now() : Date.now();
	const createdAt = new Date(nowMs - (opts.createdMsAgo ?? 0));
	const expiresAt = new Date(nowMs + (opts.expiresInMs ?? 8 * 60 * 60 * 1000));
	const session: StubSession = {
		id: crypto.randomUUID(),
		userId: opts.userId,
		createdAt,
		lastActivity: createdAt,
		expiresAt,
		ipAddress: "127.0.0.1",
		userAgent: "test-agent",
		mfaVerified: opts.mfaVerified ?? false,
		provider: opts.provider ?? "oidc",
		revokedAt: null,
	};
	store.sessions.set(session.id, session);
	return session;
}

/** Parse a single named cookie from a Cookie: header string. */
function parseCookie(cookieHeader: string, name: string): string | undefined {
	for (const part of cookieHeader.split(";")) {
		const [k, v] = part.trim().split("=") as [string, string | undefined];
		if (k.trim() === name && v !== undefined) return decodeURIComponent(v);
	}
	return undefined;
}

/** Extract Set-Cookie value for a named cookie from a response header. */
function extractSetCookie(header: string | string[] | undefined, name: string): string | undefined {
	const headers = Array.isArray(header) ? header : header ? [header] : [];
	for (const h of headers) {
		const match = new RegExp(`(?:^|\\s)${name}=([^;]+)`).exec(h);
		if (match) return match[1];
	}
	return undefined;
}

// ── Stub auth Fastify plugin ─────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 min
const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 min

/**
 * Build a minimal Fastify app with stub AuthN routes and session middleware.
 * All external IdP interactions are replaced with simple conventions:
 *   OIDC: ?code=valid_<userId>  or  ?code=invalid
 *   SAML: POST body field saml_valid=true/false + saml_user_id=<userId>
 *   TOTP: real RFC 6238 codes against user's mfaTotpSecret
 */
async function buildStubAuthApp(store: StoreState): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// ── Session middleware ──────────────────────────────────────────────────
	app.decorateRequest("user", null);
	app.decorateRequest("session", null);

	// Routes that bypass the MFA-verified gate (session can exist but not be mfa-verified)
	const MFA_BYPASS = [/^\/auth\//, /^\/health\//, /^\/admin\//];
	// Routes that bypass the session auth gate entirely (pre-login + admin stubs)
	const AUTH_BYPASS = [/^\/auth\/oidc\//, /^\/auth\/saml\//, /^\/health\//, /^\/admin\//];

	app.addHook("onRequest", async (req, reply) => {
		const url = req.url.split("?")[0] ?? req.url;
		if (AUTH_BYPASS.some((re) => re.test(url))) return;

		// Parse apogee_session cookie manually (no @fastify/cookie needed in stubs)
		const cookieHeader = req.headers.cookie ?? "";
		const sessionId = parseCookie(cookieHeader, "apogee_session");
		if (!sessionId) {
			reply.code(401);
			throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
		}

		const session = store.sessions.get(sessionId);
		const nowMs = store.now ? store.now() : Date.now();

		if (
			!session ||
			session.revokedAt !== null ||
			session.expiresAt.getTime() < nowMs ||
			nowMs - session.lastActivity.getTime() > SESSION_INACTIVITY_MS
		) {
			reply.code(401);
			throw Object.assign(new Error("Session expired or invalid"), { statusCode: 401 });
		}

		// MFA gate: reject unverified sessions on non-auth routes
		if (!session.mfaVerified && !MFA_BYPASS.some((re) => re.test(url))) {
			const user = store.users.get(session.userId);
			if (user?.mfaEnabled) {
				reply.code(403);
				throw Object.assign(new Error("MFA required"), { statusCode: 403 });
			}
		}

		// Touch session
		session.lastActivity = new Date(nowMs);

		(req as unknown as Record<string, unknown>).user = store.users.get(session.userId) ?? null;
		(req as unknown as Record<string, unknown>).session = session;
	});

	// ── Helper: create session + set cookie ────────────────────────────────
	function issueSession(
		reply: import("fastify").FastifyReply,
		userId: string,
		provider: "oidc" | "saml",
		mfaVerified: boolean,
	): StubSession {
		const session = createSession(store, { userId, provider, mfaVerified });
		// Set HttpOnly session cookie (simplified — no Secure in test)
		reply.header("Set-Cookie", `apogee_session=${session.id}; HttpOnly; Path=/; SameSite=Lax`);
		return session;
	}

	// ── Auth routes ─────────────────────────────────────────────────────────

	/**
	 * Stub OIDC callback — simulates IdP returning a code.
	 * Convention:  ?code=valid_<userId>  or  ?code=invalid
	 */
	app.get("/auth/oidc/callback", async (req, reply) => {
		const { code } = req.query as Record<string, string>;

		if (!code?.startsWith("valid_")) {
			reply.code(401);
			return { error: "Invalid or expired OIDC token" };
		}

		const userId = code.slice("valid_".length);
		const user = store.users.get(userId);
		if (!user || user.accountStatus === "deactivated") {
			reply.code(401);
			return { error: "User not found or deactivated" };
		}

		// Check lockout
		const nowMs = store.now ? store.now() : Date.now();
		if (user.accountStatus === "locked") {
			if (user.lockedUntil && user.lockedUntil.getTime() > nowMs) {
				reply.code(401);
				return { error: "Account locked" };
			}
			// Auto-unlock: lockout expired
			user.accountStatus = "active";
			user.failedLoginCount = 0;
			user.lockedUntil = null;
		}

		// MFA gate: if user has MFA enabled, create an unverified session
		// and redirect to MFA verify.  If not enrolled, session is created verified.
		const mfaVerified = !user.mfaEnabled;
		issueSession(reply, userId, "oidc", mfaVerified);

		reply.code(302).header("Location", mfaVerified ? "/dashboard" : "/auth/mfa/verify");
		return null;
	});

	/**
	 * Stub SAML ACS — simulates IdP POST to the Assertion Consumer Service.
	 * Accepts JSON body: { saml_valid: boolean, saml_user_id: string }
	 * (Real implementation parses SAMLResponse XML; the stub uses JSON for simplicity.)
	 */
	app.post("/auth/saml/acs", async (req, reply) => {
		const body = req.body as Record<string, unknown> | undefined;
		const valid = body?.saml_valid === true;
		const userId = typeof body?.saml_user_id === "string" ? body.saml_user_id : undefined;

		if (!valid || !userId) {
			reply.code(401);
			return { error: "Invalid or tampered SAMLResponse" };
		}

		const user = store.users.get(userId);
		if (!user || user.accountStatus === "deactivated") {
			reply.code(401);
			return { error: "User not found" };
		}

		const nowMs = store.now ? store.now() : Date.now();
		if (user.accountStatus === "locked" && user.lockedUntil && user.lockedUntil.getTime() > nowMs) {
			reply.code(401);
			return { error: "Account locked" };
		}

		const mfaVerified = !user.mfaEnabled;
		issueSession(reply, userId, "saml", mfaVerified);

		reply.code(302).header("Location", mfaVerified ? "/dashboard" : "/auth/mfa/verify");
		return null;
	});

	/** TOTP MFA verification. Reads session from cookie, verifies code. */
	app.post("/auth/mfa/verify", async (req, reply) => {
		const cookieHeader = req.headers.cookie ?? "";
		const sessionId = parseCookie(cookieHeader, "apogee_session");
		if (!sessionId) {
			reply.code(401);
			return { error: "No session" };
		}

		const session = store.sessions.get(sessionId);
		const nowMs = store.now ? store.now() : Date.now();
		if (!session || session.revokedAt || session.expiresAt.getTime() < nowMs) {
			reply.code(401);
			return { error: "Session expired" };
		}

		const user = store.users.get(session.userId);
		if (!user) {
			reply.code(401);
			return { error: "User not found" };
		}

		// If user not enrolled in MFA, this endpoint should not be called
		if (!user.mfaEnabled || !user.mfaTotpSecret) {
			reply.code(400);
			return { error: "MFA not enrolled" };
		}

		const { code } = req.body as Record<string, string>;
		const expected = await generateTOTP(user.mfaTotpSecret, nowMs);
		const valid = code === expected;

		if (!valid) {
			user.failedLoginCount += 1;
			if (user.failedLoginCount >= LOCKOUT_THRESHOLD) {
				user.accountStatus = "locked";
				user.lockedUntil = new Date(nowMs + LOCKOUT_DURATION_MS);
				// Revoke all active sessions on lockout
				for (const s of store.sessions.values()) {
					if (s.userId === user.id && s.revokedAt === null) {
						s.revokedAt = new Date(nowMs);
					}
				}
				reply.code(423);
				return { error: "Account locked due to too many failed attempts" };
			}
			reply.code(401);
			return {
				error: "Invalid TOTP code",
				attemptsRemaining: LOCKOUT_THRESHOLD - user.failedLoginCount,
			};
		}

		// Success: mark session as MFA verified, reset failed count
		session.mfaVerified = true;
		user.failedLoginCount = 0;
		reply.code(200);
		return { ok: true };
	});

	/** List active sessions for the current user. */
	app.get("/auth/sessions", async (req, _reply) => {
		const session = (req as unknown as Record<string, unknown>).session as StubSession | null;
		if (!session) return [];
		const nowMs = store.now ? store.now() : Date.now();
		return [...store.sessions.values()].filter(
			(s) => s.userId === session.userId && s.revokedAt === null && s.expiresAt.getTime() > nowMs,
		);
	});

	/** Revoke a single session (user-initiated forced logout). */
	app.delete("/auth/sessions/:id", async (req, reply) => {
		const { id } = req.params as { id: string };
		const session = (req as unknown as Record<string, unknown>).session as StubSession | null;
		if (!session) {
			reply.code(401);
			return { error: "Not authenticated" };
		}

		const target = store.sessions.get(id);
		if (!target || target.userId !== session.userId) {
			reply.code(404);
			return { error: "Session not found" };
		}

		const nowMs = store.now ? store.now() : Date.now();
		target.revokedAt = new Date(nowMs);
		reply.code(204);
		return null;
	});

	/** Admin: revoke all sessions for a user. */
	app.delete("/admin/sessions", async (req, reply) => {
		const { userId } = req.query as { userId?: string };
		if (!userId) {
			reply.code(400);
			return { error: "userId required" };
		}
		const nowMs = store.now ? store.now() : Date.now();
		let count = 0;
		for (const s of store.sessions.values()) {
			if (s.userId === userId && s.revokedAt === null) {
				s.revokedAt = new Date(nowMs);
				count++;
			}
		}
		return { revoked: count };
	});

	// ── Test sentinel ────────────────────────────────────────────────────────
	app.get("/api/protected", async () => ({ ok: true }));
	app.get("/health/live", async () => ({ status: "ok" }));

	await app.ready();
	return app;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // base32 test secret (well-known)

function seedUsers(store: StoreState): {
	plain: StubUser;
	mfaUser: StubUser;
	lockedUser: StubUser;
} {
	const plain: StubUser = {
		id: "user-plain-001",
		email: "alice@test.example",
		displayName: "Alice",
		mfaEnabled: false,
		mfaTotpSecret: null,
		accountStatus: "active",
		failedLoginCount: 0,
		lockedUntil: null,
	};
	const mfaUser: StubUser = {
		id: "user-mfa-002",
		email: "bob@test.example",
		displayName: "Bob",
		mfaEnabled: true,
		mfaTotpSecret: TOTP_SECRET,
		accountStatus: "active",
		failedLoginCount: 0,
		lockedUntil: null,
	};
	const lockedUser: StubUser = {
		id: "user-locked-003",
		email: "charlie@test.example",
		displayName: "Charlie",
		mfaEnabled: false,
		mfaTotpSecret: null,
		accountStatus: "locked",
		failedLoginCount: 5,
		lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
	};
	store.users.set(plain.id, plain);
	store.users.set(mfaUser.id, mfaUser);
	store.users.set(lockedUser.id, lockedUser);
	return { plain, mfaUser, lockedUser };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("OIDC flow", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("valid OIDC callback creates session and redirects to dashboard (no MFA)", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe("/dashboard");
		const cookie = extractSetCookie(res.headers["set-cookie"], "apogee_session");
		expect(cookie).toBeDefined();
	});

	test("valid OIDC callback for MFA user redirects to /auth/mfa/verify", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe("/auth/mfa/verify");
		const cookie = extractSetCookie(res.headers["set-cookie"], "apogee_session");
		expect(cookie).toBeDefined();
		// Session should exist but NOT be mfaVerified
		const sessionId = cookie!;
		const session = store.sessions.get(sessionId);
		expect(session?.mfaVerified).toBe(false);
	});

	test("invalid OIDC token returns 401", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/auth/oidc/callback?code=invalid",
		});
		expect(res.statusCode).toBe(401);
		expect(res.headers["set-cookie"]).toBeUndefined();
	});

	test("missing code param returns 401", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/auth/oidc/callback",
		});
		expect(res.statusCode).toBe(401);
	});

	test("locked account returns 401 even with valid code", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.lockedUser.id}`,
		});
		expect(res.statusCode).toBe(401);
		const body = res.json() as Record<string, unknown>;
		expect(body.error).toContain("locked");
	});

	test("session is usable on protected route after OIDC login (no MFA)", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");
		expect(cookie).toBeDefined();

		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(apiRes.statusCode).toBe(200);
	});
});

describe("SAML 2.0 flow", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("valid SAMLResponse creates session and redirects to dashboard", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/auth/saml/acs",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ saml_valid: true, saml_user_id: users.plain.id }),
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe("/dashboard");
		const cookie = extractSetCookie(res.headers["set-cookie"], "apogee_session");
		expect(cookie).toBeDefined();
	});

	test("tampered SAMLResponse (saml_valid=false) returns 401", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/auth/saml/acs",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ saml_valid: false, saml_user_id: users.plain.id }),
		});
		expect(res.statusCode).toBe(401);
		expect(res.headers["set-cookie"]).toBeUndefined();
	});

	test("missing SAMLResponse body returns 401", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/auth/saml/acs",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.statusCode).toBe(401);
	});

	test("SAML ACS for MFA user redirects to /auth/mfa/verify", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/auth/saml/acs",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ saml_valid: true, saml_user_id: users.mfaUser.id }),
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe("/auth/mfa/verify");
	});

	test("session created via SAML is accessible on protected routes", async () => {
		const loginRes = await app.inject({
			method: "POST",
			url: "/auth/saml/acs",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ saml_valid: true, saml_user_id: users.plain.id }),
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(apiRes.statusCode).toBe(200);
	});
});

describe("MFA gate", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("unenrolled user (mfaEnabled=false) can access protected routes without MFA", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(res.statusCode).toBe(200);
	});

	test("MFA-enrolled user with unverified session gets 403 on protected route", async () => {
		// OIDC login creates session with mfaVerified=false for MFA user
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(res.statusCode).toBe(403);
	});

	test("MFA auth routes are exempt from MFA gate (user can reach /auth/mfa/verify)", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		// /auth/mfa/verify should be reachable without MFA verified session
		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: "000000" }), // wrong code but route must be reachable
		});
		// Should get 401 (wrong code) not 403 (MFA gate)
		expect(res.statusCode).toBe(401);
	});

	test("MFA-verified session accesses protected routes normally", async () => {
		// Create a session pre-marked as mfaVerified
		const session = createSession(store, {
			userId: users.mfaUser.id,
			provider: "oidc",
			mfaVerified: true,
		});

		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(res.statusCode).toBe(200);
	});
});

describe("TOTP MFA — verify, failure, lockout", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("correct TOTP code verifies session and returns 200", async () => {
		// Get an unverified session for the MFA user
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");
		const validCode = await generateTOTP(TOTP_SECRET);

		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: validCode }),
		});
		expect(res.statusCode).toBe(200);

		// Session should now be mfaVerified
		const sessionId = cookie!;
		const session = store.sessions.get(sessionId);
		expect(session?.mfaVerified).toBe(true);
	});

	test("correct TOTP after verify allows access to protected route", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");
		const validCode = await generateTOTP(TOTP_SECRET);

		await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: validCode }),
		});

		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(apiRes.statusCode).toBe(200);
	});

	test("wrong TOTP code returns 401 and increments failed count", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: "000000" }),
		});
		expect(res.statusCode).toBe(401);
		expect(users.mfaUser.failedLoginCount).toBe(1);
	});

	test("5 consecutive wrong TOTP codes trigger lockout (423)", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		// 4 failures
		for (let i = 0; i < 4; i++) {
			const res = await app.inject({
				method: "POST",
				url: "/auth/mfa/verify",
				headers: {
					"content-type": "application/json",
					cookie: `apogee_session=${cookie}`,
				},
				body: JSON.stringify({ code: "000000" }),
			});
			expect(res.statusCode).toBe(401);
		}
		expect(users.mfaUser.failedLoginCount).toBe(4);
		expect(users.mfaUser.accountStatus).toBe("active");

		// 5th failure triggers lockout
		const lockRes = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: "000000" }),
		});
		expect(lockRes.statusCode).toBe(423);
		expect(users.mfaUser.accountStatus).toBe("locked");
		expect(users.mfaUser.lockedUntil).not.toBeNull();
	});

	test("lockout revokes all active sessions for the user", async () => {
		// Create two extra sessions for mfaUser
		const s1 = createSession(store, { userId: users.mfaUser.id, mfaVerified: true });
		const s2 = createSession(store, { userId: users.mfaUser.id, mfaVerified: true });

		// Trigger lockout via the TOTP endpoint
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		for (let i = 0; i < 5; i++) {
			await app.inject({
				method: "POST",
				url: "/auth/mfa/verify",
				headers: {
					"content-type": "application/json",
					cookie: `apogee_session=${cookie}`,
				},
				body: JSON.stringify({ code: "000000" }),
			});
		}

		// All sessions for mfaUser should now be revoked
		expect(store.sessions.get(s1.id)?.revokedAt).not.toBeNull();
		expect(store.sessions.get(s2.id)?.revokedAt).not.toBeNull();
	});

	test("correct TOTP resets failed login counter", async () => {
		// Set a partial failure count
		users.mfaUser.failedLoginCount = 3;

		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.mfaUser.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");
		const validCode = await generateTOTP(TOTP_SECRET);

		await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: validCode }),
		});
		expect(users.mfaUser.failedLoginCount).toBe(0);
	});

	test("non-enrolled user calling /auth/mfa/verify returns 400", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			headers: {
				"content-type": "application/json",
				cookie: `apogee_session=${cookie}`,
			},
			body: JSON.stringify({ code: "123456" }),
		});
		expect(res.statusCode).toBe(400);
	});
});

describe("Session lifecycle — expiry", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("session expired (expiresAt in the past) returns 401", async () => {
		// Create a session that expired 1ms ago
		const session = createSession(store, {
			userId: users.plain.id,
			expiresInMs: -1,
		});

		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(res.statusCode).toBe(401);
	});

	test("inactivity timeout returns 401", async () => {
		// Create a session where lastActivity was >30 min ago
		const session = createSession(store, {
			userId: users.plain.id,
			createdMsAgo: SESSION_INACTIVITY_MS + 1,
		});
		// Manually backdate lastActivity past the inactivity threshold
		session.lastActivity = new Date(Date.now() - SESSION_INACTIVITY_MS - 1000);

		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(res.statusCode).toBe(401);
	});

	test("active session touches lastActivity on each request", async () => {
		const session = createSession(store, { userId: users.plain.id });
		const beforeActivity = session.lastActivity.getTime();

		// Small delay to ensure time progresses
		await new Promise((r) => setTimeout(r, 5));

		await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(session.lastActivity.getTime()).toBeGreaterThan(beforeActivity);
	});

	test("session with no cookie returns 401", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
		});
		expect(res.statusCode).toBe(401);
	});

	test("session with unknown ID returns 401", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: "apogee_session=00000000-0000-0000-0000-000000000000" },
		});
		expect(res.statusCode).toBe(401);
	});
});

describe("Forced logout — revoke + revokeAll", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("user can revoke their own session; subsequent request returns 401", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");
		const sessionId = cookie!;

		// Revoke
		const revokeRes = await app.inject({
			method: "DELETE",
			url: `/auth/sessions/${sessionId}`,
			headers: { cookie: `apogee_session=${sessionId}` },
		});
		expect(revokeRes.statusCode).toBe(204);

		// Access should be denied
		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${sessionId}` },
		});
		expect(apiRes.statusCode).toBe(401);
	});

	test("user cannot revoke another user's session (returns 404)", async () => {
		// Session belonging to mfaUser
		const otherSession = createSession(store, { userId: users.mfaUser.id });

		// Login as plain user
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session");

		const res = await app.inject({
			method: "DELETE",
			url: `/auth/sessions/${otherSession.id}`,
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(res.statusCode).toBe(404);
		// Other session should still be active
		expect(store.sessions.get(otherSession.id)?.revokedAt).toBeNull();
	});

	test("revokeAll clears all active sessions for a user", async () => {
		// Create multiple sessions for plain user
		const s1 = createSession(store, { userId: users.plain.id });
		const s2 = createSession(store, { userId: users.plain.id });
		const s3 = createSession(store, { userId: users.plain.id });

		// Admin revoke all
		const res = await app.inject({
			method: "DELETE",
			url: `/admin/sessions?userId=${users.plain.id}`,
			// Admin route bypasses session check in stub (no auth in /admin/)
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as { revoked: number };
		expect(body.revoked).toBe(3);

		// All three sessions should be revoked
		expect(store.sessions.get(s1.id)?.revokedAt).not.toBeNull();
		expect(store.sessions.get(s2.id)?.revokedAt).not.toBeNull();
		expect(store.sessions.get(s3.id)?.revokedAt).not.toBeNull();
	});

	test("revoke only affects target session, not others", async () => {
		// Two sessions for same user
		const loginRes1 = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie1 = extractSetCookie(loginRes1.headers["set-cookie"], "apogee_session")!;

		const loginRes2 = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie2 = extractSetCookie(loginRes2.headers["set-cookie"], "apogee_session")!;

		// Revoke session 1 using session 1's cookie
		await app.inject({
			method: "DELETE",
			url: `/auth/sessions/${cookie1}`,
			headers: { cookie: `apogee_session=${cookie1}` },
		});

		// Session 2 should still work
		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie2}` },
		});
		expect(apiRes.statusCode).toBe(200);
	});

	test("session list returns only active sessions for current user", async () => {
		// Login
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session")!;

		// Add another session and revoke it
		const expiredSession = createSession(store, { userId: users.plain.id });
		expiredSession.revokedAt = new Date();

		const res = await app.inject({
			method: "GET",
			url: "/auth/sessions",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(res.statusCode).toBe(200);
		const sessions = res.json() as unknown[];
		// Only the active session (the one just created) should be listed
		expect(sessions).toHaveLength(1);
	});
});

describe("Admin session revocation", () => {
	let app: FastifyInstance;
	let store: StoreState;
	let users: ReturnType<typeof seedUsers>;

	beforeEach(async () => {
		store = createStore();
		users = seedUsers(store);
		app = await buildStubAuthApp(store);
	});

	afterEach(async () => {
		await app.close();
	});

	test("admin revokeAll makes user's sessions unusable", async () => {
		const loginRes = await app.inject({
			method: "GET",
			url: `/auth/oidc/callback?code=valid_${users.plain.id}`,
		});
		const cookie = extractSetCookie(loginRes.headers["set-cookie"], "apogee_session")!;

		// Admin revokes all sessions for plain user
		await app.inject({
			method: "DELETE",
			url: `/admin/sessions?userId=${users.plain.id}`,
		});

		// User's session should be invalid
		const apiRes = await app.inject({
			method: "GET",
			url: "/api/protected",
			headers: { cookie: `apogee_session=${cookie}` },
		});
		expect(apiRes.statusCode).toBe(401);
	});

	test("admin revokeAll returns count of revoked sessions", async () => {
		// Create 3 sessions
		createSession(store, { userId: users.plain.id });
		createSession(store, { userId: users.plain.id });
		createSession(store, { userId: users.plain.id });

		const res = await app.inject({
			method: "DELETE",
			url: `/admin/sessions?userId=${users.plain.id}`,
		});
		const body = res.json() as { revoked: number };
		expect(body.revoked).toBe(3);
	});

	test("admin revokeAll with unknown userId returns 0 revoked", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: "/admin/sessions?userId=00000000-0000-0000-0000-000000000000",
		});
		const body = res.json() as { revoked: number };
		expect(body.revoked).toBe(0);
	});

	test("admin revokeAll without userId param returns 400", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: "/admin/sessions",
		});
		expect(res.statusCode).toBe(400);
	});
});
