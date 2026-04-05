/**
 * TOTP MFA routes — enrollment, confirmation, and verification.
 *
 * Routes:
 *   GET  /auth/mfa/setup           — generate secret + QR URI (enrollment start)
 *   POST /auth/mfa/setup/confirm   — verify code, persist encrypted secret
 *   POST /auth/mfa/verify          — verify code during login, elevate session
 *
 * TOTP is implemented with the `otpauth` library (RFC 6238, SHA-1, 6 digits,
 * 30-second step).  Secrets are encrypted at rest using AES-256-GCM with the
 * key from APP_SESSION_ENCRYPTION_KEY.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.3, §8, §12
 * Issue: hx-7352cda5
 */

import type { FastifyInstance } from "fastify";
import * as OTPAuth from "otpauth";
import type { MfaConfig } from "../config.js";
import type { AuthDbClient } from "../provider.js";
import type { SessionManager } from "../session-manager.js";
import type { ApogeeUser, Session } from "../types.js";

// Fastify request augmentations — must match session middleware decorations.
declare module "fastify" {
	interface FastifyRequest {
		user: ApogeeUser | null;
		session: Session | null;
	}
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface MfaRouteOptions {
	db: AuthDbClient;
	sessionManager: SessionManager;
	mfaConfig: MfaConfig;
	/**
	 * AES-256-GCM encryption key (hex-encoded, 32 bytes = 64 hex chars).
	 * Reads from APP_SESSION_ENCRYPTION_KEY by default.
	 */
	encryptionKey?: string;
}

// ── Encryption helpers (AES-256-GCM via Web Crypto) ───────────────────────────

async function importAesKey(hexKey: string): Promise<CryptoKey> {
	const keyBytes = Uint8Array.from(hexKey.match(/.{2}/g)?.map((b) => Number.parseInt(b, 16)) ?? []);
	if (keyBytes.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");
	return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt plaintext with AES-256-GCM. Returns "iv_hex:ciphertext_hex". */
async function encryptSecret(plaintext: string, hexKey: string): Promise<string> {
	const key = await importAesKey(hexKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
	const ivHex = Buffer.from(iv).toString("hex");
	const cipherHex = Buffer.from(ciphertext).toString("hex");
	return `${ivHex}:${cipherHex}`;
}

/** Decrypt a value produced by encryptSecret. */
async function decryptSecret(encrypted: string, hexKey: string): Promise<string> {
	const [ivHex, cipherHex] = encrypted.split(":") as [string, string];
	const key = await importAesKey(hexKey);
	const iv = Uint8Array.from(Buffer.from(ivHex, "hex"));
	const ciphertext = Uint8Array.from(Buffer.from(cipherHex, "hex"));
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return new TextDecoder().decode(plaintext);
}

// ── TOTP helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret and return the base32-encoded secret plus the
 * otpauth:// URI suitable for a QR code scanner.
 */
export function generateTotpSecret(
	issuer: string,
	accountName: string,
): { secret: string; uri: string } {
	const totp = new OTPAuth.TOTP({
		issuer,
		label: accountName,
		algorithm: "SHA1",
		digits: 6,
		period: 30,
		// new OTPAuth.Secret() generates 20 random bytes (160 bits) by default.
		secret: new OTPAuth.Secret(),
	});
	return {
		secret: totp.secret.base32,
		uri: totp.toString(),
	};
}

/**
 * Verify a TOTP code against a base32-encoded secret.
 * Accepts codes from the current and immediately adjacent windows (±1 step)
 * to accommodate slight clock skew.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
	const totp = new OTPAuth.TOTP({
		algorithm: "SHA1",
		digits: 6,
		period: 30,
		secret: OTPAuth.Secret.fromBase32(secret),
	});
	// delta: acceptable window in steps (1 = ±30 seconds)
	const result = totp.validate({ token: code, window: 1 });
	return result !== null;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerMfaRoutes(
	app: FastifyInstance,
	opts: MfaRouteOptions,
): Promise<void> {
	const { db, sessionManager, mfaConfig } = opts;
	const encryptionKey = opts.encryptionKey ?? process.env.APP_SESSION_ENCRYPTION_KEY ?? "";

	if (!encryptionKey) {
		throw new Error(
			"MFA routes require an encryption key (MfaRouteOptions.encryptionKey or APP_SESSION_ENCRYPTION_KEY)",
		);
	}

	// ── GET /auth/mfa/setup ───────────────────────────────────────────────────
	// Requires an active (possibly unverified) session.

	app.get("/auth/mfa/setup", async (req, reply) => {
		if (!req.user || !req.session) {
			return reply.code(401).send({ error: "Not authenticated" });
		}
		if (req.user.mfaEnabled) {
			return reply.code(409).send({ error: "MFA already enrolled" });
		}

		const { secret, uri } = generateTotpSecret(mfaConfig.totpIssuer, req.user.email);

		// Store the pending secret in the DB (encrypted) before confirmation so
		// that the confirm step can retrieve it without passing it back from the
		// client.  We use a separate column to distinguish "pending" from "active".
		// For simplicity in Phase 1, we store it directly in mfa_totp_secret and
		// only set mfa_enabled = true after confirmation.
		const encryptedSecret = await encryptSecret(secret, encryptionKey);
		await db.query(
			`UPDATE user_account
			 SET mfa_totp_secret = $1, updated_at = now()
			 WHERE id = $2`,
			[encryptedSecret, req.user.id],
		);

		return reply.code(200).send({ uri, secret });
	});

	// ── POST /auth/mfa/setup/confirm ──────────────────────────────────────────
	// Verifies the first code and activates MFA.

	app.post<{ Body: { code: string } }>("/auth/mfa/setup/confirm", async (req, reply) => {
		if (!req.user || !req.session) {
			return reply.code(401).send({ error: "Not authenticated" });
		}
		if (req.user.mfaEnabled) {
			return reply.code(409).send({ error: "MFA already enrolled" });
		}

		const { code } = req.body ?? {};
		if (typeof code !== "string" || code.length !== 6) {
			return reply.code(400).send({ error: "Invalid TOTP code format" });
		}

		// Load the pending secret from DB.
		const result = await db.query<{ mfa_totp_secret: string | null }>(
			"SELECT mfa_totp_secret FROM user_account WHERE id = $1",
			[req.user.id],
		);
		const encryptedSecret = result.rows[0]?.mfa_totp_secret;
		if (!encryptedSecret) {
			return reply
				.code(400)
				.send({ error: "No pending MFA setup. Call GET /auth/mfa/setup first." });
		}

		let secret: string;
		try {
			secret = await decryptSecret(encryptedSecret, encryptionKey);
		} catch {
			return reply.code(500).send({ error: "Failed to load MFA secret" });
		}

		if (!verifyTotpCode(secret, code)) {
			return reply.code(400).send({ error: "Invalid TOTP code" });
		}

		// Activate MFA.
		await db.query(
			`UPDATE user_account
			 SET mfa_enabled = TRUE, updated_at = now()
			 WHERE id = $1`,
			[req.user.id],
		);

		// Elevate the current session to mfaVerified.
		await db.query("UPDATE authn_sessions SET mfa_verified = TRUE WHERE id = $1", [req.session.id]);

		return reply.code(200).send({ ok: true });
	});

	// ── POST /auth/mfa/verify ─────────────────────────────────────────────────
	// Verifies TOTP during login to elevate an unverified session.

	app.post<{ Body: { code: string } }>("/auth/mfa/verify", async (req, reply) => {
		if (!req.user || !req.session) {
			return reply.code(401).send({ error: "Not authenticated" });
		}
		if (req.session.mfaVerified) {
			return reply.code(200).send({ ok: true, alreadyVerified: true });
		}

		const { code } = req.body ?? {};
		if (typeof code !== "string" || code.length !== 6) {
			return reply.code(400).send({ error: "Invalid TOTP code format" });
		}

		// Reload user to get current TOTP secret and lockout state.
		const result = await db.query<{
			mfa_totp_secret: string | null;
			failed_login_count: number;
			locked_until: Date | null;
		}>(
			`SELECT mfa_totp_secret, failed_login_count, locked_until
			 FROM user_account WHERE id = $1`,
			[req.user.id],
		);
		const row = result.rows[0];
		if (!row) return reply.code(401).send({ error: "User not found" });

		// Lockout check.
		const now = new Date();
		if (row.locked_until && row.locked_until > now) {
			return reply.code(401).send({ error: "Account locked" });
		}

		if (!row.mfa_totp_secret) {
			return reply.code(400).send({ error: "MFA not enrolled" });
		}

		let secret: string;
		try {
			secret = await decryptSecret(row.mfa_totp_secret, encryptionKey);
		} catch {
			return reply.code(500).send({ error: "Failed to load MFA secret" });
		}

		if (!verifyTotpCode(secret, code)) {
			// Increment failed login count and check lockout threshold.
			const newCount = row.failed_login_count + 1;
			if (newCount >= mfaConfig.lockoutThreshold) {
				const lockedUntil = new Date(now.getTime() + mfaConfig.lockoutDurationMinutes * 60 * 1000);
				await db.query(
					`UPDATE user_account
					 SET failed_login_count = $1, locked_until = $2, updated_at = now()
					 WHERE id = $3`,
					[newCount, lockedUntil, req.user.id],
				);
				// Revoke all active sessions.
				await sessionManager.revokeAll(req.user.id);
				return reply.code(401).send({ error: "Account locked due to too many failed attempts" });
			}

			await db.query(
				`UPDATE user_account
				 SET failed_login_count = $1, updated_at = now()
				 WHERE id = $2`,
				[newCount, req.user.id],
			);
			return reply.code(401).send({ error: "Invalid TOTP code" });
		}

		// Valid code — reset failed count and elevate session.
		await db.query(
			`UPDATE user_account
			 SET failed_login_count = 0, locked_until = NULL, updated_at = now()
			 WHERE id = $1`,
			[req.user.id],
		);
		await db.query("UPDATE authn_sessions SET mfa_verified = TRUE WHERE id = $1", [req.session.id]);

		return reply.code(200).send({ ok: true });
	});
}
