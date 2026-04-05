import type { FastifyInstance, FastifyRequest } from "fastify";

export interface AuthConfig {
	/** JWT secret for HS256 token validation */
	secret: string;
	/** Route URL patterns that bypass auth (default: health + metrics) */
	bypass?: RegExp[];
}

const DEFAULT_BYPASS: RegExp[] = [/^\/health\//, /^\/metrics$/];

/**
 * Register an onRequest hook that validates Bearer JWTs (HS256) on all
 * routes not in the bypass list.
 *
 * In local dev / tests the secret comes from APP_JWT_SECRET or the
 * authSecret option passed to buildApp().  In production the secret is
 * derived from the Keycloak realm's HMAC signing key (or you can swap
 * verifyJWT for a JWKS-based verifier).
 */
export function registerAuthHook(app: FastifyInstance, config: AuthConfig): void {
	const bypass = config.bypass ?? DEFAULT_BYPASS;

	// Decorate request so Fastify allows the user property to be set per-request.
	app.decorateRequest("user", null);

	app.addHook("onRequest", async (req: FastifyRequest, _reply) => {
		// Bypass auth for excluded routes
		if (bypass.some((re) => re.test(req.url))) return;

		const authHeader = req.headers.authorization;

		if (!authHeader?.startsWith("Bearer ")) {
			// Throwing from an onRequest hook routes through Fastify's error
			// handler and avoids the double-writeHead issue that arises when
			// reply.send() is called directly inside an async hook.
			throw Object.assign(new Error("Missing or invalid Authorization header"), {
				statusCode: 401,
				name: "Unauthorized",
			});
		}

		const token = authHeader.slice(7);
		const payload = await verifyHS256JWT(token, config.secret);

		if (payload === null) {
			throw Object.assign(new Error("Invalid or expired token"), {
				statusCode: 401,
				name: "Unauthorized",
			});
		}

		// Store verified payload so downstream hooks (entity-context) can read it.
		(req as unknown as { user: Record<string, unknown> }).user = payload;
	});
}

/**
 * Verify an HS256-signed JWT using the Web Crypto API (available natively
 * in Bun and modern Node.js).  Returns the decoded payload on success,
 * null on any failure (bad signature, expired, malformed).
 */
export async function verifyHS256JWT(
	token: string,
	secret: string,
): Promise<Record<string, unknown> | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);

		const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);
		// Base64url → Base64 → Uint8Array
		const sigBase64 = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
		const sigBytes = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));

		const valid = await crypto.subtle.verify("HMAC", key, sigBytes, signingInput);
		if (!valid) return null;

		const payloadBase64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
		const payloadJson = atob(payloadBase64);
		const payload = JSON.parse(payloadJson) as Record<string, unknown>;

		// Reject expired tokens
		if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
}

/**
 * Create a signed HS256 JWT for testing purposes.
 * Not for production use.
 */
export async function createTestJWT(
	secret: string,
	claims: Record<string, unknown> = {},
	expiresInSeconds = 3600,
): Promise<string> {
	const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = base64url(
		JSON.stringify({
			sub: "test-user",
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
			...claims,
		}),
	);

	const signingInput = `${header}.${payload}`;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
	const signature = base64url(sigBuffer);

	return `${signingInput}.${signature}`;
}

function base64url(input: string | ArrayBuffer): string {
	let bytes: Uint8Array;
	if (typeof input === "string") {
		bytes = new TextEncoder().encode(input);
	} else {
		bytes = new Uint8Array(input);
	}
	// Convert to base64 then make URL-safe
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}
