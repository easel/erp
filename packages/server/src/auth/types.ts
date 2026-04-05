/**
 * Core AuthN types: IdentityAssertion, ApogeeUser, Session.
 *
 * Ref: SD-004-authn-provider-abstraction.md §5
 * Issue: hx-b2239605
 */

/**
 * Normalized identity claim produced by either the OIDC or SAML flow before
 * the local user is resolved.
 */
export interface IdentityAssertion {
	/** Provider type that produced this assertion */
	provider: "oidc" | "saml";
	/** Globally unique identifier within this provider (sub claim or NameID) */
	externalId: string;
	/** Email address — required for JIT provisioning */
	email: string;
	/** Display name, best-effort */
	displayName?: string;
	/** Raw provider-specific claims for debugging/auditing */
	rawClaims: Record<string, unknown>;
}

/**
 * Resolved local user returned by AuthProvider.resolveUser().
 * Derived from the user_account row plus MFA/lockout columns.
 */
export interface ApogeeUser {
	/** UUID primary key from user_account.id */
	id: string;
	email: string;
	displayName: string;
	mfaEnabled: boolean;
	/** null until TOTP is enrolled; stored encrypted at rest */
	mfaTotpSecret: string | null;
	accountStatus: "active" | "locked" | "deactivated";
	failedLoginCount: number;
	lockedUntil: Date | null;
}

/**
 * In-memory representation of an active browser session.
 * Backed by the authn_sessions table.
 */
export interface Session {
	/** UUID stored as HttpOnly apogee_session cookie */
	id: string;
	userId: string;
	createdAt: Date;
	lastActivity: Date;
	/** createdAt + absolute max (default 8h) */
	expiresAt: Date;
	ipAddress: string;
	userAgent: string;
	mfaVerified: boolean;
	provider: "oidc" | "saml";
}
