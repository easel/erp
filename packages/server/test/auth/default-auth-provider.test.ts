/**
 * Unit tests: DefaultAuthProvider — JIT provisioning, lockout, auto-unlock.
 *
 * All tests use an in-memory mock DB so no real database connection is required.
 *
 * Ref: SD-004-authn-provider-abstraction.md §5, §8
 * Issue: hx-b2239605
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { DefaultAuthProvider, SYSTEM_ACTOR_ID } from "../../src/auth/provider.js";
import type { AuthDbClient } from "../../src/auth/provider.js";
import type { IdentityAssertion } from "../../src/auth/types.js";

// ── In-memory DB mock ─────────────────────────────────────────────────────────

interface MockUser {
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

interface MockIdentityLink {
	id: string;
	user_id: string;
	provider: string;
	external_id: string;
}

interface MockStore {
	users: Map<string, MockUser>;
	links: Map<string, MockIdentityLink>; // key: "provider:external_id"
}

function createMockDb(store: MockStore): AuthDbClient {
	return {
		async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
			const s = sql.replace(/\s+/g, " ").trim();

			// SELECT from authn_identity_links
			if (s.includes("FROM authn_identity_links WHERE provider")) {
				const provider = params[0] as string;
				const externalId = params[1] as string;
				const key = `${provider}:${externalId}`;
				const link = store.links.get(key);
				return { rows: link ? [{ user_id: link.user_id } as T] : [] };
			}

			// SELECT from user_account
			if (s.includes("FROM user_account WHERE id")) {
				const id = params[0] as string;
				const user = store.users.get(id);
				return { rows: user ? [user as T] : [] };
			}

			// INSERT into user_account (JIT provisioning)
			if (s.includes("INSERT INTO user_account")) {
				const email = params[0] as string;
				const displayName = params[1] as string;
				// Check for existing user by email
				let existingUser: MockUser | undefined;
				for (const u of store.users.values()) {
					if (u.email === email) {
						existingUser = u;
						break;
					}
				}
				if (existingUser) {
					existingUser.display_name = displayName;
					return { rows: [{ id: existingUser.id } as T] };
				}
				const newUser: MockUser = {
					id: crypto.randomUUID(),
					email,
					display_name: displayName,
					mfa_enabled: false,
					mfa_totp_secret: null,
					failed_login_count: 0,
					locked_until: null,
					is_active: true,
					deleted_at: null,
				};
				store.users.set(newUser.id, newUser);
				return { rows: [{ id: newUser.id } as T] };
			}

			// INSERT into authn_identity_links
			if (s.includes("INSERT INTO authn_identity_links")) {
				const userId = params[0] as string;
				const provider = params[1] as string;
				const externalId = params[2] as string;
				const key = `${provider}:${externalId}`;
				if (!store.links.has(key)) {
					store.links.set(key, {
						id: crypto.randomUUID(),
						user_id: userId,
						provider,
						external_id: externalId,
					});
				}
				return { rows: [] };
			}

			// UPDATE user_account: auto-unlock
			if (s.includes("UPDATE user_account") && s.includes("locked_until = NULL")) {
				const id = params[0] as string;
				const user = store.users.get(id);
				if (user) {
					user.locked_until = null;
					user.failed_login_count = 0;
				}
				return { rows: [] };
			}

			// UPDATE user_account: display_name refresh
			if (s.includes("UPDATE user_account") && s.includes("display_name = $1")) {
				const displayName = params[0] as string;
				const id = params[1] as string;
				const user = store.users.get(id);
				if (user) user.display_name = displayName;
				return { rows: [] };
			}

			throw new Error(`Unexpected SQL: ${sql}`);
		},
	};
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OIDC_ASSERTION: IdentityAssertion = {
	provider: "oidc",
	externalId: "sub-001",
	email: "alice@example.com",
	displayName: "Alice",
	rawClaims: {},
};

function makeStore(): MockStore {
	return { users: new Map(), links: new Map() };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DefaultAuthProvider — JIT provisioning", () => {
	let store: MockStore;
	let provider: DefaultAuthProvider;

	beforeEach(() => {
		store = makeStore();
		provider = new DefaultAuthProvider(createMockDb(store));
	});

	test("first login: creates user_account and identity link", async () => {
		expect(store.users.size).toBe(0);
		expect(store.links.size).toBe(0);

		const user = await provider.resolveUser(OIDC_ASSERTION);

		expect(store.users.size).toBe(1);
		expect(store.links.size).toBe(1);
		expect(user.email).toBe("alice@example.com");
		expect(user.displayName).toBe("Alice");
		expect(user.accountStatus).toBe("active");
		expect(user.mfaEnabled).toBe(false);
		expect(user.failedLoginCount).toBe(0);
	});

	test("second login: returns existing user via identity link (no new account)", async () => {
		await provider.resolveUser(OIDC_ASSERTION);
		const userCountAfterFirst = store.users.size;

		const user = await provider.resolveUser(OIDC_ASSERTION);

		expect(store.users.size).toBe(userCountAfterFirst); // no new user created
		expect(user.email).toBe("alice@example.com");
	});

	test("display name is updated on subsequent login when IdP provides new value", async () => {
		await provider.resolveUser(OIDC_ASSERTION);

		const updatedAssertion: IdentityAssertion = {
			...OIDC_ASSERTION,
			displayName: "Alice Updated",
		};
		const user = await provider.resolveUser(updatedAssertion);

		expect(user.displayName).toBe("Alice Updated");
	});

	test("JIT provisioning uses email prefix as display name when no displayName provided", async () => {
		const assertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "sub-002",
			email: "bob@example.com",
			rawClaims: {},
		};
		const user = await provider.resolveUser(assertion);
		expect(user.displayName).toBe("bob");
	});

	test("different providers create separate identity links for the same email", async () => {
		const oidcAssertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "ext-A",
			email: "shared@example.com",
			displayName: "Shared",
			rawClaims: {},
		};
		const samlAssertion: IdentityAssertion = {
			provider: "saml",
			externalId: "ext-B",
			email: "shared@example.com",
			displayName: "Shared",
			rawClaims: {},
		};

		const user1 = await provider.resolveUser(oidcAssertion);
		const user2 = await provider.resolveUser(samlAssertion);

		// Both should resolve to the same user_account (by email conflict resolution)
		expect(user1.id).toBe(user2.id);
		// But there are 2 distinct identity links
		expect(store.links.size).toBe(2);
	});
});

describe("DefaultAuthProvider — lockout enforcement", () => {
	let store: MockStore;
	let provider: DefaultAuthProvider;

	beforeEach(() => {
		store = makeStore();
		provider = new DefaultAuthProvider(createMockDb(store));
	});

	test("locked account with lockedUntil in the future throws 401", async () => {
		// Pre-seed a locked user with identity link
		const userId = crypto.randomUUID();
		const lockedUser: MockUser = {
			id: userId,
			email: "locked@example.com",
			display_name: "Locked",
			mfa_enabled: false,
			mfa_totp_secret: null,
			failed_login_count: 5,
			locked_until: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
			is_active: true,
			deleted_at: null,
		};
		store.users.set(userId, lockedUser);
		store.links.set("oidc:locked-sub", {
			id: crypto.randomUUID(),
			user_id: userId,
			provider: "oidc",
			external_id: "locked-sub",
		});

		const assertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "locked-sub",
			email: "locked@example.com",
			rawClaims: {},
		};

		const err = await provider.resolveUser(assertion).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as { statusCode: number }).statusCode).toBe(401);
		expect((err as Error).message).toContain("locked");
	});

	test("auto-unlock: expired lockout resets failedLoginCount and allows login", async () => {
		const userId = crypto.randomUUID();
		const expiredLockUser: MockUser = {
			id: userId,
			email: "autoUnlock@example.com",
			display_name: "AutoUnlock",
			mfa_enabled: false,
			mfa_totp_secret: null,
			failed_login_count: 5,
			locked_until: new Date(Date.now() - 1), // 1ms in the past — expired
			is_active: true,
			deleted_at: null,
		};
		store.users.set(userId, expiredLockUser);
		store.links.set("oidc:unlock-sub", {
			id: crypto.randomUUID(),
			user_id: userId,
			provider: "oidc",
			external_id: "unlock-sub",
		});

		const assertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "unlock-sub",
			email: "autoUnlock@example.com",
			rawClaims: {},
		};

		const user = await provider.resolveUser(assertion);

		expect(user.accountStatus).toBe("active");
		expect(user.failedLoginCount).toBe(0);
		expect(user.lockedUntil).toBeNull();
		// Also verify the DB was updated
		expect(store.users.get(userId)?.locked_until).toBeNull();
		expect(store.users.get(userId)?.failed_login_count).toBe(0);
	});

	test("deactivated account (is_active=false) throws 401", async () => {
		const userId = crypto.randomUUID();
		store.users.set(userId, {
			id: userId,
			email: "inactive@example.com",
			display_name: "Inactive",
			mfa_enabled: false,
			mfa_totp_secret: null,
			failed_login_count: 0,
			locked_until: null,
			is_active: false,
			deleted_at: null,
		});
		store.links.set("oidc:inactive-sub", {
			id: crypto.randomUUID(),
			user_id: userId,
			provider: "oidc",
			external_id: "inactive-sub",
		});

		const assertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "inactive-sub",
			email: "inactive@example.com",
			rawClaims: {},
		};

		const err = await provider.resolveUser(assertion).catch((e: unknown) => e);
		expect((err as { statusCode: number }).statusCode).toBe(401);
		expect((err as Error).message).toContain("deactivated");
	});

	test("soft-deleted account (deleted_at set) throws 401", async () => {
		const userId = crypto.randomUUID();
		store.users.set(userId, {
			id: userId,
			email: "deleted@example.com",
			display_name: "Deleted",
			mfa_enabled: false,
			mfa_totp_secret: null,
			failed_login_count: 0,
			locked_until: null,
			is_active: true,
			deleted_at: new Date(Date.now() - 1000),
		});
		store.links.set("oidc:deleted-sub", {
			id: crypto.randomUUID(),
			user_id: userId,
			provider: "oidc",
			external_id: "deleted-sub",
		});

		const assertion: IdentityAssertion = {
			provider: "oidc",
			externalId: "deleted-sub",
			email: "deleted@example.com",
			rawClaims: {},
		};

		const err = await provider.resolveUser(assertion).catch((e: unknown) => e);
		expect((err as { statusCode: number }).statusCode).toBe(401);
		expect((err as Error).message).toContain("deactivated");
	});

	test("SYSTEM_ACTOR_ID is exported and is a valid non-nil UUID string", () => {
		expect(SYSTEM_ACTOR_ID).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		expect(SYSTEM_ACTOR_ID).not.toBe("00000000-0000-0000-0000-000000000000");
	});
});
