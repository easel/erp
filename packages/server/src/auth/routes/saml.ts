/**
 * SAML 2.0 SP-initiated SSO routes — @node-saml/node-saml.
 *
 * Routes:
 *   GET  /auth/saml/login  — generate signed AuthnRequest, redirect to IdP SSO URL
 *   POST /auth/saml/acs    — Assertion Consumer Service: validate SAMLResponse,
 *                            build IdentityAssertion, resolve user, create session
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.2, §9, §11, §12
 * Issue: hx-c647f862
 */

import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import type { FastifyInstance } from "fastify";
import type { SamlProviderConfig } from "../config.js";
import type { AuthProvider } from "../provider.js";
import type { SessionManager } from "../session-manager.js";

// ── Public interface ───────────────────────────────────────────────────────────

export interface SamlRouteOptions {
	providerConfig: SamlProviderConfig;
	authProvider: AuthProvider;
	sessionManager: SessionManager;
	/**
	 * Injectable SAML adapter for testing.  Defaults to the real
	 * @node-saml/node-saml implementation.
	 */
	adapter?: SamlAdapter;
}

/**
 * Injectable interface wrapping @node-saml/node-saml operations so unit
 * tests can inject a stub without network or cryptography dependencies.
 */
export interface SamlAdapter {
	/** Return the IdP redirect URL for an SP-initiated AuthnRequest. */
	getAuthorizeUrl(relayState?: string): Promise<string>;

	/**
	 * Validate a base64-encoded SAMLResponse from an ACS POST.
	 * Returns normalized profile attributes on success.
	 * Throws on invalid signature, expired conditions, or audience mismatch.
	 */
	validateResponse(samlResponse: string): Promise<SamlProfile>;
}

export interface SamlProfile {
	/** NameID — used as the external identity key. */
	nameID: string;
	/** Email address from SAML attribute. */
	email: string;
	/** Display name, best-effort. */
	displayName?: string;
	/** Raw attributes for audit/debug. */
	attributes: Record<string, unknown>;
}

// ── Default adapter (real @node-saml/node-saml) ───────────────────────────────

export function buildSamlAdapter(config: SamlProviderConfig): SamlAdapter {
	const saml = new SAML({
		entryPoint: config.entryPoint,
		issuer: config.issuer,
		idpCert: config.cert,
		callbackUrl: config.callbackUrl,
		...(config.privateKey !== undefined ? { privateKey: config.privateKey } : {}),
		// Validate audience, destination, and timestamps per SD-004 §7.2.
		validateInResponseTo: ValidateInResponseTo.never,
		// Clock skew tolerance for IdP assertion timestamps.
		acceptedClockSkewMs: 5000,
	});

	return {
		async getAuthorizeUrl(relayState?: string) {
			return saml.getAuthorizeUrlAsync(relayState ?? "", undefined, {});
		},

		async validateResponse(samlResponse: string) {
			const { profile } = await saml.validatePostResponseAsync({
				SAMLResponse: samlResponse,
			});

			if (!profile) throw new Error("SAML validation returned no profile");

			const nameID = profile.nameID;
			if (!nameID) throw new Error("SAML profile missing NameID");

			// Email: prefer dedicated attribute, fall back to nameID if it looks
			// like an email address.
			const rawEmail =
				(profile.email as string | undefined) ??
				(profile["urn:oid:1.2.840.113549.1.9.1"] as string | undefined) ??
				(nameID.includes("@") ? nameID : undefined);

			if (!rawEmail) throw new Error("SAML profile missing email attribute");

			const displayName =
				(profile.displayName as string | undefined) ??
				(profile["urn:oid:2.16.840.1.113730.3.1.241"] as string | undefined);

			return {
				nameID,
				email: rawEmail,
				...(displayName !== undefined ? { displayName } : {}),
				attributes: profile as unknown as Record<string, unknown>,
			} as SamlProfile;
		},
	};
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerSamlRoutes(
	app: FastifyInstance,
	opts: SamlRouteOptions,
): Promise<void> {
	const { providerConfig, authProvider, sessionManager } = opts;
	const adapter = opts.adapter ?? buildSamlAdapter(providerConfig);

	// ── GET /auth/saml/login ──────────────────────────────────────────────────

	app.get("/auth/saml/login", async (req, reply) => {
		let redirectUrl: string;
		try {
			redirectUrl = await adapter.getAuthorizeUrl();
		} catch (err: unknown) {
			req.log.error({ err }, "Failed to build SAML AuthnRequest");
			return reply.code(500).send({ error: "SAML initialization failed" });
		}
		return reply.code(302).header("Location", redirectUrl).send();
	});

	// ── POST /auth/saml/acs ───────────────────────────────────────────────────

	app.post<{ Body: Record<string, string | undefined> }>("/auth/saml/acs", async (req, reply) => {
		const samlResponse = req.body?.SAMLResponse;
		if (!samlResponse) {
			return reply.code(400).send({ error: "Missing SAMLResponse in POST body" });
		}

		let profile: SamlProfile;
		try {
			profile = await adapter.validateResponse(samlResponse);
		} catch (err: unknown) {
			req.log.warn({ err }, "SAML response validation failed");
			return reply.code(401).send({ error: "SAML authentication failed" });
		}

		// Resolve (or JIT-provision) the local user.
		let user: import("../types.js").ApogeeUser;
		try {
			user = await authProvider.resolveUser({
				provider: "saml",
				externalId: profile.nameID,
				email: profile.email,
				...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
				rawClaims: profile.attributes,
			});
		} catch (err: unknown) {
			const statusCode = (err as { statusCode?: number }).statusCode ?? 401;
			const message = (err as Error).message ?? "Authentication failed";
			return reply.code(statusCode).send({ error: message });
		}

		// MFA gate — same logic as OIDC callback.
		const mfaVerified = !user.mfaEnabled;

		const session = await sessionManager.create({
			userId: user.id,
			mfaVerified,
			provider: "saml",
			ipAddress: req.ip,
			userAgent: req.headers["user-agent"] ?? "",
		});

		reply.header(
			"Set-Cookie",
			`apogee_session=${session.id}; HttpOnly; Secure; Path=/; SameSite=Lax`,
		);

		const redirectTarget = mfaVerified ? "/dashboard" : "/auth/mfa/verify";
		return reply.code(302).header("Location", redirectTarget).send();
	});
}
