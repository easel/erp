/**
 * Unit tests: TOTP MFA routes (hx-7352cda5)
 *
 * Tests enrollment, code verification, and brute-force protection.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.3, §8, §12
 */

import { beforeEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AuthDbClient } from "../../src/auth/provider.js";
import {
	generateTotpSecret,
	registerMfaRoutes,
	verifyTotpCode,
} from "../../src/auth/routes/mfa.js";
import type { SessionManager } from "../../src/auth/session-manager.js";
import type { ApogeeUser, Session } from "../../src/auth/types.js";

// ── Test encryption key (32 bytes of zeros in hex) ────────────────────────────
const TEST_KEY = "0".repeat(64);

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

/**
 * Stub DB that supports the queries used by MFA routes.
 * Internal state is mutable and inspectable from tests.
 */
class StubDb implements AuthDbClient {
	rows: Map<string, Record<string, unknown>> = new Map();

	constructor(initial: Record<string, unknown> = {}) {
		this.rows.set("user-1", {
			mfa_totp_secret: null,
			mfa_enabled: false,
			failed_login_count: 0,
			locked_until: null,
			...initial,
		});
	}

	async query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
		const userId = "user-1";
		const row = this.rows.get(userId) ?? {};

		// SELECT mfa_totp_secret FROM user_account
		if (sql.includes("SELECT") && sql.includes("mfa_totp_secret")) {
			return { rows: [{ ...row }] as T[] };
		}

		// UPDATE user_account SET mfa_totp_secret = $1
		if (sql.includes("SET mfa_totp_secret")) {
			row.mfa_totp_secret = params[0] as string;
			this.rows.set(userId, row);
			return { rows: [] as T[] };
		}

		// UPDATE user_account SET mfa_enabled = TRUE
		if (sql.includes("SET mfa_enabled = TRUE")) {
			row.mfa_enabled = true;
			this.rows.set(userId, row);
			return { rows: [] as T[] };
		}

		// UPDATE user_account SET failed_login_count = $1, locked_until = $2
		if (sql.includes("SET failed_login_count") && sql.includes("locked_until")) {
			row.failed_login_count = params[0] as number;
			row.locked_until = params[1] as Date | null;
			this.rows.set(userId, row);
			return { rows: [] as T[] };
		}

		// UPDATE user_account SET failed_login_count = $1 (reset)
		if (sql.includes("SET failed_login_count")) {
			row.failed_login_count = params[0] as number;
			this.rows.set(userId, row);
			return { rows: [] as T[] };
		}

		// UPDATE authn_sessions SET mfa_verified = TRUE
		if (sql.includes("mfa_verified = TRUE")) {
			return { rows: [] as T[] };
		}

		return { rows: [] as T[] };
	}
}

function stubSessionManager(revokedIds: string[] = []): SessionManager {
	return {
		async create() {
			return makeSession();
		},
		async load() {
			return null;
		},
		async touch() {},
		async revoke(id) {
			revokedIds.push(id);
		},
		async revokeAll(userId) {
			revokedIds.push(`all:${userId}`);
		},
		async list() {
			return [];
		},
	};
}

async function buildApp(user: ApogeeUser, session: Session, db: StubDb): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// Attach stubbed user/session so MFA routes can read req.user / req.session.
	app.decorateRequest("user", null);
	app.decorateRequest("session", null);
	app.addHook("onRequest", async (req) => {
		(req as unknown as Record<string, unknown>).user = user;
		(req as unknown as Record<string, unknown>).session = session;
	});

	await registerMfaRoutes(app, {
		db,
		sessionManager: stubSessionManager(),
		mfaConfig: {
			totpIssuer: "Apogee ERP",
			lockoutThreshold: 5,
			lockoutDurationMinutes: 30,
		},
		encryptionKey: TEST_KEY,
	});

	return app;
}

// ── Pure function tests ───────────────────────────────────────────────────────

describe("generateTotpSecret", () => {
	test("returns a non-empty base32 secret and otpauth URI", () => {
		const { secret, uri } = generateTotpSecret("Apogee ERP", "alice@example.com");
		expect(secret).toBeTruthy();
		expect(uri).toContain("otpauth://totp/");
		expect(uri).toContain("Apogee");
	});

	test("generated secrets are unique each call", () => {
		const a = generateTotpSecret("Apogee", "user@example.com");
		const b = generateTotpSecret("Apogee", "user@example.com");
		expect(a.secret).not.toBe(b.secret);
	});
});

describe("verifyTotpCode", () => {
	test("accepts a valid current-window code", async () => {
		const { secret } = generateTotpSecret("Apogee ERP", "alice@example.com");
		// Import otpauth to generate the expected code.
		const { TOTP, Secret } = await import("otpauth");
		const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 });
		const code = totp.generate();
		expect(verifyTotpCode(secret, code)).toBe(true);
	});

	test("rejects an obviously wrong code", () => {
		const { secret } = generateTotpSecret("Apogee ERP", "alice@example.com");
		expect(verifyTotpCode(secret, "000000")).toBe(false);
	});
});

// ── Route tests ───────────────────────────────────────────────────────────────

describe("GET /auth/mfa/setup", () => {
	let db: StubDb;
	let app: FastifyInstance;

	beforeEach(async () => {
		db = new StubDb();
		app = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);
	});

	test("returns 200 with uri and secret", async () => {
		const res = await app.inject({ method: "GET", url: "/auth/mfa/setup" });
		expect(res.statusCode).toBe(200);
		const body = res.json<{ uri: string; secret: string }>();
		expect(body.uri).toContain("otpauth://totp/");
		expect(body.secret).toBeTruthy();
	});

	test("stores encrypted secret in DB", async () => {
		await app.inject({ method: "GET", url: "/auth/mfa/setup" });
		const stored = db.rows.get("user-1")?.mfa_totp_secret as string | null;
		expect(stored).toBeTruthy();
		// Should be in "ivHex:cipherHex" format.
		expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
	});

	test("returns 409 when MFA already enrolled", async () => {
		const app2 = await buildApp(makeUser({ mfaEnabled: true }), makeSession(), new StubDb());
		const res = await app2.inject({ method: "GET", url: "/auth/mfa/setup" });
		expect(res.statusCode).toBe(409);
		await app2.close();
	});
});

describe("POST /auth/mfa/setup/confirm", () => {
	test("returns 200 and activates MFA with a valid code", async () => {
		const db = new StubDb();
		const app = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);

		// First trigger setup to store the encrypted secret.
		const setupRes = await app.inject({ method: "GET", url: "/auth/mfa/setup" });
		const { secret } = setupRes.json<{ uri: string; secret: string }>();

		// Generate valid TOTP code.
		const { TOTP, Secret } = await import("otpauth");
		const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 });
		const code = totp.generate();

		const confirmRes = await app.inject({
			method: "POST",
			url: "/auth/mfa/setup/confirm",
			body: JSON.stringify({ code }),
			headers: { "content-type": "application/json" },
		});
		expect(confirmRes.statusCode).toBe(200);
		expect(confirmRes.json<{ ok: boolean }>().ok).toBe(true);

		// MFA should be enabled in DB.
		expect(db.rows.get("user-1")?.mfa_enabled).toBe(true);

		await app.close();
	});

	test("returns 400 with an invalid code", async () => {
		const db = new StubDb();
		const app = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);
		await app.inject({ method: "GET", url: "/auth/mfa/setup" });

		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/setup/confirm",
			body: JSON.stringify({ code: "000000" }),
			headers: { "content-type": "application/json" },
		});
		expect(res.statusCode).toBe(400);
		await app.close();
	});
});

describe("POST /auth/mfa/verify", () => {
	test("returns 200 with valid TOTP code", async () => {
		const { generateTotpSecret: genSecret } = await import("../../src/auth/routes/mfa.js");
		const { secret } = genSecret("Apogee ERP", "alice@example.com");

		// Encrypt the secret for the stub DB.
		// We need the encrypted form — use the encryption from mfa.ts indirectly.
		// Since StubDb stores what the routes write, first run setup+confirm cycle.
		const db = new StubDb();
		const app = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);

		// Enroll via setup flow.
		const setupRes = await app.inject({ method: "GET", url: "/auth/mfa/setup" });
		const { secret: enrolledSecret } = setupRes.json<{ secret: string }>();
		const { TOTP, Secret } = await import("otpauth");
		const confirmCode = new TOTP({
			secret: Secret.fromBase32(enrolledSecret),
			digits: 6,
			period: 30,
		}).generate();
		await app.inject({
			method: "POST",
			url: "/auth/mfa/setup/confirm",
			body: JSON.stringify({ code: confirmCode }),
			headers: { "content-type": "application/json" },
		});

		// Now rebuild app with mfaEnabled=true so verify route is exercised.
		const db2 = new StubDb({
			mfa_totp_secret: db.rows.get("user-1")?.mfa_totp_secret,
			mfa_enabled: true,
			failed_login_count: 0,
			locked_until: null,
		});
		const app2 = await buildApp(makeUser({ mfaEnabled: true }), makeSession(), db2);

		const verifyCode = new TOTP({
			secret: Secret.fromBase32(enrolledSecret),
			digits: 6,
			period: 30,
		}).generate();
		const res = await app2.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			body: JSON.stringify({ code: verifyCode }),
			headers: { "content-type": "application/json" },
		});
		expect(res.statusCode).toBe(200);

		await app.close();
		await app2.close();
	});

	test("increments failed_login_count on invalid code", async () => {
		const db = new StubDb();
		const app = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);

		// Setup + confirm to store encrypted secret.
		const setupRes = await app.inject({ method: "GET", url: "/auth/mfa/setup" });
		const { secret: enrolledSecret } = setupRes.json<{ secret: string }>();
		const { TOTP, Secret } = await import("otpauth");
		const confirmCode = new TOTP({
			secret: Secret.fromBase32(enrolledSecret),
			digits: 6,
			period: 30,
		}).generate();
		await app.inject({
			method: "POST",
			url: "/auth/mfa/setup/confirm",
			body: JSON.stringify({ code: confirmCode }),
			headers: { "content-type": "application/json" },
		});

		const encryptedSecret = db.rows.get("user-1")?.mfa_totp_secret;
		const db2 = new StubDb({
			mfa_totp_secret: encryptedSecret,
			mfa_enabled: true,
			failed_login_count: 0,
			locked_until: null,
		});
		const app2 = await buildApp(makeUser({ mfaEnabled: true }), makeSession(), db2);

		await app2.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			body: JSON.stringify({ code: "000000" }),
			headers: { "content-type": "application/json" },
		});

		expect(db2.rows.get("user-1")?.failed_login_count).toBe(1);

		await app.close();
		await app2.close();
	});

	test("locks account after threshold failures", async () => {
		const db = new StubDb();
		const appSetup = await buildApp(makeUser({ mfaEnabled: false }), makeSession(), db);
		const setupRes = await appSetup.inject({ method: "GET", url: "/auth/mfa/setup" });
		const { secret: enrolledSecret } = setupRes.json<{ secret: string }>();
		const { TOTP, Secret } = await import("otpauth");
		const confirmCode = new TOTP({
			secret: Secret.fromBase32(enrolledSecret),
			digits: 6,
			period: 30,
		}).generate();
		await appSetup.inject({
			method: "POST",
			url: "/auth/mfa/setup/confirm",
			body: JSON.stringify({ code: confirmCode }),
			headers: { "content-type": "application/json" },
		});
		await appSetup.close();

		const revokedIds: string[] = [];
		const db2 = new StubDb({
			mfa_totp_secret: db.rows.get("user-1")?.mfa_totp_secret,
			mfa_enabled: true,
			failed_login_count: 4, // one more invalid attempt → lockout
			locked_until: null,
		});

		const app2 = Fastify({ logger: false });
		app2.decorateRequest("user", null);
		app2.decorateRequest("session", null);
		app2.addHook("onRequest", async (req) => {
			(req as unknown as Record<string, unknown>).user = makeUser({ mfaEnabled: true });
			(req as unknown as Record<string, unknown>).session = makeSession();
		});
		await registerMfaRoutes(app2, {
			db: db2,
			sessionManager: stubSessionManager(revokedIds),
			mfaConfig: { totpIssuer: "Apogee ERP", lockoutThreshold: 5, lockoutDurationMinutes: 30 },
			encryptionKey: TEST_KEY,
		});

		const res = await app2.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			body: JSON.stringify({ code: "000000" }),
			headers: { "content-type": "application/json" },
		});

		expect(res.statusCode).toBe(401);
		expect((res.json() as { error: string }).error).toContain("locked");
		// Sessions should have been revoked.
		expect(revokedIds.some((id) => id.startsWith("all:"))).toBe(true);

		await app2.close();
	});

	test("returns 200 alreadyVerified=true when session is already verified", async () => {
		const db = new StubDb({ mfa_totp_secret: null, mfa_enabled: true });
		const app = await buildApp(
			makeUser({ mfaEnabled: true }),
			makeSession({ mfaVerified: true }),
			db,
		);
		const res = await app.inject({
			method: "POST",
			url: "/auth/mfa/verify",
			body: JSON.stringify({ code: "123456" }),
			headers: { "content-type": "application/json" },
		});
		expect(res.statusCode).toBe(200);
		expect((res.json() as { alreadyVerified: boolean }).alreadyVerified).toBe(true);
		await app.close();
	});
});
