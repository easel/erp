/**
 * Unit tests: session auth middleware (registerSessionAuthHook).
 *
 * Verifies that the Fastify onRequest hook correctly:
 *   - Rejects requests with no apogee_session cookie (401)
 *   - Rejects requests with an expired/revoked/unknown session (401)
 *   - Accepts valid sessions: loads user, touches session, attaches req.user + req.session
 *   - Skips enforcement on bypass routes
 *   - Rejects requests when user account no longer exists (401)
 *
 * Ref: SD-004-authn-provider-abstraction.md §10
 * Issue: hx-c90fbc0a
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerSessionAuthHook } from "../../src/auth/middleware.js";
import type { AuthDbClient } from "../../src/auth/provider.js";
import type { SessionManager } from "../../src/auth/session-manager.js";
import type { ApogeeUser, Session } from "../../src/auth/types.js";

// ── Stubs ─────────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: crypto.randomUUID(),
		userId: "user-001",
		createdAt: new Date(),
		lastActivity: new Date(),
		expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
		ipAddress: "127.0.0.1",
		userAgent: "test-agent",
		mfaVerified: true,
		provider: "oidc",
		...overrides,
	};
}

const STUB_USER: ApogeeUser = {
	id: "user-001",
	email: "alice@example.com",
	displayName: "Alice",
	mfaEnabled: false,
	mfaTotpSecret: null,
	accountStatus: "active",
	failedLoginCount: 0,
	lockedUntil: null,
};

class StubSessionManager implements SessionManager {
	private sessions: Map<string, Session> = new Map();
	touchCalls: string[] = [];

	seed(session: Session): void {
		this.sessions.set(session.id, session);
	}

	async create(): Promise<Session> {
		throw new Error("not used in middleware tests");
	}

	async load(id: string): Promise<Session | null> {
		return this.sessions.get(id) ?? null;
	}

	async touch(id: string): Promise<void> {
		this.touchCalls.push(id);
	}

	async revoke(id: string): Promise<void> {
		this.sessions.delete(id);
	}

	async revokeAll(): Promise<void> {}

	async list(): Promise<Session[]> {
		return [];
	}
}

class StubDb implements AuthDbClient {
	private user: ApogeeUser | null;

	constructor(user: ApogeeUser | null = STUB_USER) {
		this.user = user;
	}

	async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
		const normalized = sql.replace(/\s+/g, " ").trim();
		if (normalized.includes("FROM user_account WHERE id")) {
			const userId = params[0] as string;
			if (this.user?.id === userId) {
				// Return a row matching the UserRow shape expected by loadUser
				return {
					rows: [
						{
							id: this.user.id,
							email: this.user.email,
							display_name: this.user.displayName,
							mfa_enabled: this.user.mfaEnabled,
							mfa_totp_secret: this.user.mfaTotpSecret,
							failed_login_count: this.user.failedLoginCount,
							locked_until: this.user.lockedUntil,
							is_active: true,
							deleted_at: null,
						} as unknown as T,
					],
				};
			}
			return { rows: [] };
		}
		return { rows: [] };
	}
}

// ── App builder ───────────────────────────────────────────────────────────────

async function buildApp(
	sm: SessionManager,
	db: AuthDbClient,
	bypass?: RegExp[],
): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });
	await app.register(cookie);
	registerSessionAuthHook(app, { sessionManager: sm, db, bypass });

	// Protected route under test
	app.get("/protected", async (req) => ({
		userId: req.user?.id,
		sessionId: req.session?.id,
	}));

	// Route that should bypass auth
	app.get("/health/live", async () => ({ status: "ok" }));
	app.get("/auth/oidc/login", async () => ({ status: "ok" }));

	await app.ready();
	return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("session auth middleware — missing cookie", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		const sm = new StubSessionManager();
		app = await buildApp(sm, new StubDb());
	});

	afterEach(async () => {
		await app.close();
	});

	test("returns 401 when no Cookie header is present", async () => {
		const res = await app.inject({ method: "GET", url: "/protected" });
		expect(res.statusCode).toBe(401);
	});

	test("returns 401 when Cookie header has no apogee_session", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: "other_cookie=abc" },
		});
		expect(res.statusCode).toBe(401);
	});
});

describe("session auth middleware — invalid session", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		const sm = new StubSessionManager(); // empty — no sessions
		app = await buildApp(sm, new StubDb());
	});

	afterEach(async () => {
		await app.close();
	});

	test("returns 401 for unknown session ID", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: "apogee_session=unknown-session-id" },
		});
		expect(res.statusCode).toBe(401);
	});
});

describe("session auth middleware — valid session", () => {
	let sm: StubSessionManager;
	let session: Session;
	let app: FastifyInstance;

	beforeEach(async () => {
		sm = new StubSessionManager();
		session = makeSession({ userId: STUB_USER.id });
		sm.seed(session);
		app = await buildApp(sm, new StubDb());
	});

	afterEach(async () => {
		await app.close();
	});

	test("returns 200 and attaches user + session to request", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as { userId: string; sessionId: string };
		expect(body.userId).toBe(STUB_USER.id);
		expect(body.sessionId).toBe(session.id);
	});

	test("calls touch() on the session for every authenticated request", async () => {
		await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(sm.touchCalls).toEqual([session.id, session.id]);
	});
});

describe("session auth middleware — user not found", () => {
	let sm: StubSessionManager;
	let session: Session;
	let app: FastifyInstance;

	beforeEach(async () => {
		sm = new StubSessionManager();
		session = makeSession({ userId: "deleted-user" });
		sm.seed(session);
		// DB returns no user (account deleted)
		app = await buildApp(sm, new StubDb(null));
	});

	afterEach(async () => {
		await app.close();
	});

	test("returns 401 when the user account no longer exists", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/protected",
			headers: { cookie: `apogee_session=${session.id}` },
		});
		expect(res.statusCode).toBe(401);
	});
});

describe("session auth middleware — bypass routes", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		const sm = new StubSessionManager(); // no sessions
		app = await buildApp(sm, new StubDb());
	});

	afterEach(async () => {
		await app.close();
	});

	test("health route responds 200 without session cookie", async () => {
		const res = await app.inject({ method: "GET", url: "/health/live" });
		expect(res.statusCode).toBe(200);
	});

	test("/auth/* routes respond without session cookie", async () => {
		const res = await app.inject({ method: "GET", url: "/auth/oidc/login" });
		expect(res.statusCode).toBe(200);
	});
});

describe("session auth middleware — custom bypass", () => {
	test("custom bypass patterns override defaults", async () => {
		const sm = new StubSessionManager();
		const app = Fastify({ logger: false });
		await app.register(cookie);
		registerSessionAuthHook(app, {
			sessionManager: sm,
			db: new StubDb(),
			bypass: [/^\/public\//],
		});
		app.get("/public/info", async () => ({ public: true }));
		app.get("/protected", async () => ({ secret: true }));
		await app.ready();

		const pubRes = await app.inject({ method: "GET", url: "/public/info" });
		expect(pubRes.statusCode).toBe(200);

		const protRes = await app.inject({ method: "GET", url: "/protected" });
		expect(protRes.statusCode).toBe(401);

		await app.close();
	});
});
