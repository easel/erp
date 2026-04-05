/**
 * Unit tests: Session management API routes.
 *
 * Tests run against a Fastify app with stub session middleware and an
 * in-memory SessionManager — no database connection required.
 *
 * Coverage:
 *   GET    /api/v1/auth/sessions                 — list active sessions
 *   DELETE /api/v1/auth/sessions/:id             — revoke single session
 *   DELETE /api/v1/admin/users/:userId/sessions  — admin revoke all
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.4, §7.6
 * Issue: hx-4f0c6b67
 */

import { beforeEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AuthDbClient } from "../../src/auth/provider.js";
import { registerSessionRoutes } from "../../src/auth/routes/sessions.js";
import type { SessionManager } from "../../src/auth/session-manager.js";
import type { ApogeeUser, Session } from "../../src/auth/types.js";

// ── In-memory SessionManager ──────────────────────────────────────────────────

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

class MemorySessionManager implements SessionManager {
	readonly sessions: Map<string, Session & { revokedAt: Date | null }>;

	constructor(initial: Session[] = []) {
		this.sessions = new Map(initial.map((s) => [s.id, { ...s, revokedAt: null }]));
	}

	async create(params: {
		userId: string;
		mfaVerified: boolean;
		provider: "oidc" | "saml";
		ipAddress: string;
		userAgent: string;
	}): Promise<Session> {
		const s = makeSession({ ...params, id: crypto.randomUUID() });
		this.sessions.set(s.id, { ...s, revokedAt: null });
		return s;
	}

	async load(id: string): Promise<Session | null> {
		const s = this.sessions.get(id);
		if (!s || s.revokedAt !== null) return null;
		return s;
	}

	async touch(id: string): Promise<void> {
		const s = this.sessions.get(id);
		if (s) s.lastActivity = new Date();
	}

	async revoke(id: string): Promise<void> {
		const s = this.sessions.get(id);
		if (s && s.revokedAt === null) s.revokedAt = new Date();
	}

	async revokeAll(userId: string): Promise<void> {
		for (const s of this.sessions.values()) {
			if (s.userId === userId && s.revokedAt === null) s.revokedAt = new Date();
		}
	}

	async list(userId: string): Promise<Session[]> {
		return [...this.sessions.values()].filter((s) => s.userId === userId && s.revokedAt === null);
	}
}

// ── In-memory audit DB ────────────────────────────────────────────────────────

interface AuditEntry {
	table_name: string;
	record_id: string;
	action: string;
	new_value: unknown;
	user_id: string;
	user_email: string;
}

class MemoryAuditDb implements AuthDbClient {
	readonly entries: AuditEntry[] = [];

	async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
		const s = sql.replace(/\s+/g, " ").trim();
		if (s.includes("INSERT INTO audit_entry")) {
			this.entries.push({
				table_name: "authn_sessions",
				record_id: params[0] as string,
				action: "UPDATE",
				new_value: JSON.parse(params[1] as string),
				user_id: params[2] as string,
				user_email: params[3] as string,
			});
		}
		return { rows: [] };
	}
}

// ── App builder ───────────────────────────────────────────────────────────────

const ACTOR_USER: ApogeeUser = {
	id: "user-001",
	email: "actor@example.com",
	displayName: "Actor",
	mfaEnabled: false,
	mfaTotpSecret: null,
	accountStatus: "active",
	failedLoginCount: 0,
	lockedUntil: null,
};

async function buildApp(
	sessionManager: SessionManager,
	db: AuthDbClient,
	currentSession: Session,
): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// Stub: inject user + session onto every request (simulates session middleware)
	app.decorateRequest("user", null);
	app.decorateRequest("session", null);
	app.addHook("onRequest", async (req) => {
		(req as unknown as Record<string, unknown>).user = ACTOR_USER;
		(req as unknown as Record<string, unknown>).session = currentSession;
	});

	await registerSessionRoutes(app, { sessionManager, db });
	await app.ready();
	return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/auth/sessions — list active sessions", () => {
	let sm: MemorySessionManager;
	let db: MemoryAuditDb;
	let currentSession: Session;
	let app: FastifyInstance;

	beforeEach(async () => {
		currentSession = makeSession({ userId: "user-001" });
		const other = makeSession({ userId: "user-001" });
		const otherUser = makeSession({ userId: "user-002" });

		sm = new MemorySessionManager([currentSession, other, otherUser]);
		db = new MemoryAuditDb();
		app = await buildApp(sm, db, currentSession);
	});

	test("returns only sessions belonging to the current user", async () => {
		const res = await app.inject({ method: "GET", url: "/api/v1/auth/sessions" });
		expect(res.statusCode).toBe(200);
		const body = res.json() as { id: string; userId?: string }[];
		expect(body.length).toBe(2); // currentSession + other, not otherUser's
		for (const s of body) {
			expect(s).not.toHaveProperty("userId");
		}
	});

	test("marks the calling session as current=true", async () => {
		const res = await app.inject({ method: "GET", url: "/api/v1/auth/sessions" });
		const body = res.json() as { id: string; current: boolean }[];
		const current = body.find((s) => s.id === currentSession.id);
		expect(current?.current).toBe(true);
		const others = body.filter((s) => s.id !== currentSession.id);
		for (const s of others) expect(s.current).toBe(false);
	});

	test("response includes expected fields", async () => {
		const res = await app.inject({ method: "GET", url: "/api/v1/auth/sessions" });
		const body = res.json() as Record<string, unknown>[];
		const s = body[0];
		if (!s) throw new Error("Expected at least one session in body");
		expect(s).toHaveProperty("id");
		expect(s).toHaveProperty("createdAt");
		expect(s).toHaveProperty("lastActivity");
		expect(s).toHaveProperty("expiresAt");
		expect(s).toHaveProperty("ipAddress");
		expect(s).toHaveProperty("userAgent");
		expect(s).toHaveProperty("mfaVerified");
		expect(s).toHaveProperty("provider");
		expect(s).toHaveProperty("current");
	});

	test("does not include revoked sessions", async () => {
		// Revoke the non-current session
		const sessions = await sm.list("user-001");
		const other = sessions.find((s) => s.id !== currentSession.id);
		if (!other) throw new Error("Expected a second session");
		await sm.revoke(other.id);

		const res = await app.inject({ method: "GET", url: "/api/v1/auth/sessions" });
		const body = res.json() as { id: string }[];
		expect(body.length).toBe(1);
		expect(body[0]?.id).toBe(currentSession.id);
	});
});

describe("DELETE /api/v1/auth/sessions/:id — revoke single session", () => {
	let sm: MemorySessionManager;
	let db: MemoryAuditDb;
	let currentSession: Session;
	let otherOwnSession: Session;
	let app: FastifyInstance;

	beforeEach(async () => {
		currentSession = makeSession({ userId: "user-001" });
		otherOwnSession = makeSession({ userId: "user-001" });
		const strangerSession = makeSession({ userId: "user-999" });

		sm = new MemorySessionManager([currentSession, otherOwnSession, strangerSession]);
		db = new MemoryAuditDb();
		app = await buildApp(sm, db, currentSession);
	});

	test("user can revoke their own other session (204)", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: `/api/v1/auth/sessions/${otherOwnSession.id}`,
		});
		expect(res.statusCode).toBe(204);
		expect(sm.sessions.get(otherOwnSession.id)?.revokedAt).not.toBeNull();
	});

	test("user can revoke their current session (204)", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: `/api/v1/auth/sessions/${currentSession.id}`,
		});
		expect(res.statusCode).toBe(204);
		expect(sm.sessions.get(currentSession.id)?.revokedAt).not.toBeNull();
	});

	test("user cannot revoke another user's session (404)", async () => {
		const strangerSessions = [...sm.sessions.values()].filter((s) => s.userId === "user-999");
		const strangerId = strangerSessions[0]?.id;

		const res = await app.inject({
			method: "DELETE",
			url: `/api/v1/auth/sessions/${strangerId}`,
		});
		expect(res.statusCode).toBe(404);
		// Session still active
		expect(sm.sessions.get(strangerId)?.revokedAt).toBeNull();
	});

	test("revocation emits an audit entry with reason=user_revoke", async () => {
		await app.inject({
			method: "DELETE",
			url: `/api/v1/auth/sessions/${otherOwnSession.id}`,
		});
		expect(db.entries.length).toBe(1);
		const entry = db.entries[0];
		if (!entry) throw new Error("Expected audit entry");
		expect(entry.record_id).toBe(otherOwnSession.id);
		expect(entry.user_id).toBe(ACTOR_USER.id);
		expect((entry.new_value as { reason: string }).reason).toBe("user_revoke");
	});

	test("unknown session ID returns 404", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: "/api/v1/auth/sessions/00000000-0000-0000-0000-000000000000",
		});
		expect(res.statusCode).toBe(404);
	});
});

describe("DELETE /api/v1/admin/users/:userId/sessions — admin revoke all", () => {
	let sm: MemorySessionManager;
	let db: MemoryAuditDb;
	let currentSession: Session;
	let targetSessions: Session[];
	let app: FastifyInstance;
	const TARGET_USER = "user-target";

	beforeEach(async () => {
		currentSession = makeSession({ userId: "user-001" });
		targetSessions = [
			makeSession({ userId: TARGET_USER }),
			makeSession({ userId: TARGET_USER }),
			makeSession({ userId: TARGET_USER }),
		];
		const unrelated = makeSession({ userId: "user-other" });

		sm = new MemorySessionManager([currentSession, ...targetSessions, unrelated]);
		db = new MemoryAuditDb();
		app = await buildApp(sm, db, currentSession);
	});

	test("revokes all active sessions for the target user and returns count", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: `/api/v1/admin/users/${TARGET_USER}/sessions`,
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as { revoked: number };
		expect(body.revoked).toBe(3);

		for (const s of targetSessions) {
			expect(sm.sessions.get(s.id)?.revokedAt).not.toBeNull();
		}
	});

	test("does not affect sessions of other users", async () => {
		await app.inject({
			method: "DELETE",
			url: `/api/v1/admin/users/${TARGET_USER}/sessions`,
		});

		// actor's own session untouched
		expect(sm.sessions.get(currentSession.id)?.revokedAt).toBeNull();

		// unrelated user untouched
		const unrelated = [...sm.sessions.values()].find((s) => s.userId === "user-other");
		if (!unrelated) throw new Error("Expected unrelated session");
		expect(unrelated.revokedAt).toBeNull();
	});

	test("emits one audit entry per revoked session with reason=admin_revoke_all", async () => {
		await app.inject({
			method: "DELETE",
			url: `/api/v1/admin/users/${TARGET_USER}/sessions`,
		});
		expect(db.entries.length).toBe(3);
		for (const entry of db.entries) {
			expect(entry.user_id).toBe(ACTOR_USER.id);
			expect((entry.new_value as { reason: string }).reason).toBe("admin_revoke_all");
		}
	});

	test("returns revoked=0 when user has no active sessions", async () => {
		// Pre-revoke all target sessions
		await sm.revokeAll(TARGET_USER);

		const res = await app.inject({
			method: "DELETE",
			url: `/api/v1/admin/users/${TARGET_USER}/sessions`,
		});
		expect(res.statusCode).toBe(200);
		const body = res.json() as { revoked: number };
		expect(body.revoked).toBe(0);
	});
});
