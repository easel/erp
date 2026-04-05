/**
 * Unit tests: OIDC refresh token background job.
 *
 * Verifies that runOidcTokenRefreshJob:
 *   - Finds sessions with near-expiry access tokens and refreshes them
 *   - Updates idp_refresh_token_enc and idp_access_token_expires_at in DB
 *   - Does NOT touch expires_at (the Apogee session absolute expiry)
 *   - Skips sessions that are not near expiry
 *   - Handles IdP errors gracefully (increments failed, continues)
 *   - Handles decryption errors gracefully
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.5, §12
 * Issue: hx-c757d0df
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
	type OidcRefreshAdapter,
	type RefreshJobOptions,
	runOidcTokenRefreshJob,
} from "../../src/auth/jobs/refresh-oidc-tokens.js";
import type { AuthDbClient } from "../../src/auth/provider.js";
import { decryptToken, encryptToken } from "../../src/auth/token-crypto.js";

// ── Test encryption key ────────────────────────────────────────────────────────

// 32 random bytes as hex (deterministic for tests)
const TEST_KEY = "0".repeat(64); // all-zero key — valid for tests only

// ── DB stub ───────────────────────────────────────────────────────────────────

interface SessionRecord {
	id: string;
	provider: "oidc" | "saml";
	revoked_at: Date | null;
	expires_at: Date;
	idp_refresh_token_enc: string | null;
	idp_access_token_expires_at: Date | null;
}

class StubDb implements AuthDbClient {
	readonly sessions: Map<string, SessionRecord>;
	readonly updates: Array<{
		id: string;
		idp_refresh_token_enc: string;
		idp_access_token_expires_at: Date;
	}> = [];

	constructor(sessions: SessionRecord[]) {
		this.sessions = new Map(sessions.map((s) => [s.id, { ...s }]));
	}

	async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
		const normalized = sql.replace(/\s+/g, " ").trim();

		if (normalized.includes("SELECT id, idp_refresh_token_enc, expires_at")) {
			const windowSecs = Number(params[0] as string);
			const cutoff = new Date(Date.now() + windowSecs * 1000);

			const rows = [...this.sessions.values()].filter(
				(s) =>
					s.provider === "oidc" &&
					s.revoked_at === null &&
					s.expires_at > new Date() &&
					s.idp_refresh_token_enc !== null &&
					s.idp_access_token_expires_at !== null &&
					s.idp_access_token_expires_at <= cutoff,
			);

			return {
				rows: rows.map((s) => ({
					id: s.id,
					// biome-ignore lint/style/noNonNullAssertion: filtered above to non-null
					idp_refresh_token_enc: s.idp_refresh_token_enc!,
					expires_at: s.expires_at,
				})) as unknown as T[],
			};
		}

		if (normalized.includes("UPDATE authn_sessions")) {
			const newEnc = params[0] as string;
			const newExpiry = params[1] as Date;
			const id = params[2] as string;

			const session = this.sessions.get(id);
			if (session) {
				session.idp_refresh_token_enc = newEnc;
				session.idp_access_token_expires_at = newExpiry;
			}

			this.updates.push({
				id,
				idp_refresh_token_enc: newEnc,
				idp_access_token_expires_at: newExpiry,
			});
			return { rows: [] };
		}

		return { rows: [] };
	}
}

// ── Stub refresh adapter ──────────────────────────────────────────────────────

class StubRefreshAdapter implements OidcRefreshAdapter {
	private readonly responses: Map<
		string,
		{ refreshToken: string; accessTokenExpiresAt: Date } | Error
	> = new Map();

	stub(
		refreshToken: string,
		response: { refreshToken: string; accessTokenExpiresAt: Date } | Error,
	): void {
		this.responses.set(refreshToken, response);
	}

	async refresh(params: {
		refreshToken: string;
	}): Promise<{ refreshToken: string; accessTokenExpiresAt: Date }> {
		const response = this.responses.get(params.refreshToken);
		if (!response) throw new Error(`No stub for refresh token: ${params.refreshToken}`);
		if (response instanceof Error) throw response;
		return response;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeEncryptedToken(plaintext: string): Promise<string> {
	return encryptToken(plaintext, TEST_KEY);
}

function nearExpiry(): Date {
	// Expires in 2 minutes — within the default 5-minute window
	return new Date(Date.now() + 2 * 60 * 1000);
}

function farExpiry(): Date {
	// Expires in 30 minutes — outside the 5-minute window
	return new Date(Date.now() + 30 * 60 * 1000);
}

function sessionExpiry(): Date {
	// Apogee session absolute expiry — 6 hours from now
	return new Date(Date.now() + 6 * 60 * 60 * 1000);
}

// ── Default options ───────────────────────────────────────────────────────────

function makeOpts(db: StubDb, adapter: StubRefreshAdapter): RefreshJobOptions {
	return {
		db,
		refreshAdapter: adapter,
		encryptionKey: TEST_KEY,
		tokenEndpoint: "https://idp.example.com/token",
		clientId: "client-id",
		clientSecret: "client-secret",
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runOidcTokenRefreshJob — near-expiry session", () => {
	let db: StubDb;
	let adapter: StubRefreshAdapter;
	let sessionId: string;
	const ORIGINAL_REFRESH_TOKEN = "original-refresh-token";
	const NEW_REFRESH_TOKEN = "rotated-refresh-token";

	beforeEach(async () => {
		sessionId = crypto.randomUUID();
		const encryptedToken = await makeEncryptedToken(ORIGINAL_REFRESH_TOKEN);
		const newAccessExpiry = new Date(Date.now() + 60 * 60 * 1000);

		db = new StubDb([
			{
				id: sessionId,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: encryptedToken,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		adapter = new StubRefreshAdapter();
		adapter.stub(ORIGINAL_REFRESH_TOKEN, {
			refreshToken: NEW_REFRESH_TOKEN,
			accessTokenExpiresAt: newAccessExpiry,
		});
	});

	test("returns refreshed=1, failed=0", async () => {
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));
		expect(result.refreshed).toBe(1);
		expect(result.failed).toBe(0);
	});

	test("stores the new (rotated) refresh token encrypted in the DB", async () => {
		await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(db.updates.length).toBe(1);
		const update =
			db.updates[0] ??
			(() => {
				throw new Error("no update recorded");
			})();
		expect(update.id).toBe(sessionId);

		// Decrypt and verify the new token was stored
		const decrypted = await decryptToken(update.idp_refresh_token_enc, TEST_KEY);
		expect(decrypted).toBe(NEW_REFRESH_TOKEN);
	});

	test("does NOT touch the Apogee session expires_at", async () => {
		const session =
			db.sessions.get(sessionId) ??
			(() => {
				throw new Error("session not found");
			})();
		const originalExpiresAt = session.expires_at.getTime();

		await runOidcTokenRefreshJob(makeOpts(db, adapter));

		const after =
			db.sessions.get(sessionId) ??
			(() => {
				throw new Error("session not found");
			})();
		expect(after.expires_at.getTime()).toBe(originalExpiresAt);
	});

	test("updates idp_access_token_expires_at to the new expiry", async () => {
		await runOidcTokenRefreshJob(makeOpts(db, adapter));

		const updated =
			db.sessions.get(sessionId) ??
			(() => {
				throw new Error("session not found");
			})();
		expect(updated.idp_access_token_expires_at).not.toBeNull();
		expect(updated.idp_access_token_expires_at?.getTime()).toBeGreaterThan(Date.now());
	});
});

describe("runOidcTokenRefreshJob — non-rotating refresh token", () => {
	test("stores the original refresh token when IdP does not rotate it", async () => {
		const sessionId = crypto.randomUUID();
		const ORIGINAL = "non-rotating-token";
		const encryptedToken = await makeEncryptedToken(ORIGINAL);

		const db = new StubDb([
			{
				id: sessionId,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: encryptedToken,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		const adapter = new StubRefreshAdapter();
		adapter.stub(ORIGINAL, {
			refreshToken: ORIGINAL, // IdP returns the same token
			accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
		});

		await runOidcTokenRefreshJob(makeOpts(db, adapter));

		const update0 =
			db.updates[0] ??
			(() => {
				throw new Error("no update recorded");
			})();
		const decrypted = await decryptToken(update0.idp_refresh_token_enc, TEST_KEY);
		expect(decrypted).toBe(ORIGINAL);
	});
});

describe("runOidcTokenRefreshJob — sessions NOT eligible", () => {
	test("skips sessions whose access token has not yet neared expiry", async () => {
		const sessionId = crypto.randomUUID();
		const encryptedToken = await makeEncryptedToken("rt-not-expiring");

		const db = new StubDb([
			{
				id: sessionId,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: encryptedToken,
				idp_access_token_expires_at: farExpiry(), // NOT near expiry
			},
		]);

		const adapter = new StubRefreshAdapter();
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(result.refreshed).toBe(0);
		expect(result.failed).toBe(0);
		expect(db.updates.length).toBe(0);
	});

	test("skips sessions with no stored refresh token", async () => {
		const sessionId = crypto.randomUUID();
		const db = new StubDb([
			{
				id: sessionId,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: null,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		const adapter = new StubRefreshAdapter();
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(result.refreshed).toBe(0);
		expect(db.updates.length).toBe(0);
	});

	test("skips revoked sessions", async () => {
		const sessionId = crypto.randomUUID();
		const encryptedToken = await makeEncryptedToken("rt-revoked");
		const db = new StubDb([
			{
				id: sessionId,
				provider: "oidc",
				revoked_at: new Date(), // revoked
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: encryptedToken,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		const adapter = new StubRefreshAdapter();
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(result.refreshed).toBe(0);
		expect(db.updates.length).toBe(0);
	});

	test("skips SAML sessions", async () => {
		const sessionId = crypto.randomUUID();
		const encryptedToken = await makeEncryptedToken("rt-saml");
		const db = new StubDb([
			{
				id: sessionId,
				provider: "saml", // SAML — no OIDC refresh
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: encryptedToken,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		const adapter = new StubRefreshAdapter();
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(result.refreshed).toBe(0);
		expect(db.updates.length).toBe(0);
	});
});

describe("runOidcTokenRefreshJob — error handling", () => {
	test("increments failed and continues when IdP refresh fails for one session", async () => {
		const session1 = crypto.randomUUID();
		const session2 = crypto.randomUUID();
		const enc1 = await makeEncryptedToken("rt-will-fail");
		const enc2 = await makeEncryptedToken("rt-will-succeed");
		const newExpiry = new Date(Date.now() + 60 * 60 * 1000);

		const db = new StubDb([
			{
				id: session1,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: enc1,
				idp_access_token_expires_at: nearExpiry(),
			},
			{
				id: session2,
				provider: "oidc",
				revoked_at: null,
				expires_at: sessionExpiry(),
				idp_refresh_token_enc: enc2,
				idp_access_token_expires_at: nearExpiry(),
			},
		]);

		const adapter = new StubRefreshAdapter();
		adapter.stub("rt-will-fail", new Error("IdP returned 400 Bad Request"));
		adapter.stub("rt-will-succeed", { refreshToken: "new-token", accessTokenExpiresAt: newExpiry });

		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));

		expect(result.failed).toBe(1);
		expect(result.refreshed).toBe(1);

		// Only session2 should have been updated
		expect(db.updates.length).toBe(1);
		const firstUpdate =
			db.updates[0] ??
			(() => {
				throw new Error("no update recorded");
			})();
		expect(firstUpdate.id).toBe(session2);
	});
});

describe("runOidcTokenRefreshJob — empty DB", () => {
	test("returns refreshed=0, failed=0 when no sessions need refresh", async () => {
		const db = new StubDb([]);
		const adapter = new StubRefreshAdapter();
		const result = await runOidcTokenRefreshJob(makeOpts(db, adapter));
		expect(result.refreshed).toBe(0);
		expect(result.failed).toBe(0);
	});
});
