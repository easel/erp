/**
 * AuthN configuration types.
 *
 * Ref: SD-004-authn-provider-abstraction.md §9
 * Issues: hx-657045c3, hx-7352cda5, hx-c647f862
 */

export interface OidcProviderConfig {
	type: "oidc";
	/** OIDC issuer base URL — discovery at {issuer}/.well-known/openid-configuration */
	issuer: string;
	clientId: string;
	clientSecret: string;
	/** OAuth 2.0 scopes. Default: ["openid", "email", "profile"] */
	scopes?: string[];
	/** Redirect URI registered at the IdP */
	callbackUrl: string;
}

export interface SamlProviderConfig {
	type: "saml";
	/** IdP SSO URL */
	entryPoint: string;
	/** SP Entity ID sent in AuthnRequest */
	issuer: string;
	/** IdP signing certificate (PEM or base64 DER) */
	cert: string;
	/** ACS (Assertion Consumer Service) URL */
	callbackUrl: string;
	/** SP private key for signing AuthnRequests (optional) */
	privateKey?: string;
}

export interface MfaConfig {
	/** Issuer label shown in authenticator apps (e.g. "Apogee ERP") */
	totpIssuer: string;
	/** Enforce MFA only for these roles. Ignored when requiredForAll=true. */
	requiredForRoles?: string[];
	/** Enforce MFA for every user regardless of role. */
	requiredForAll?: boolean;
	/** Failed TOTP attempts before lockout. Default: 5 */
	lockoutThreshold: number;
	/** Lockout duration in minutes. Default: 30 */
	lockoutDurationMinutes: number;
}

export interface SessionConfig {
	/** Minutes of inactivity before session expires. Default: 30 */
	inactivityTimeoutMinutes: number;
	/** Hours after creation before absolute expiry. Default: 8 */
	absoluteTimeoutHours: number;
	/** AES-256-GCM key for encrypting refresh tokens / TOTP secrets at rest */
	encryptionKey: string;
}

export interface AuthConfigV2 {
	providers: Array<OidcProviderConfig | SamlProviderConfig>;
	session: SessionConfig;
	mfa: MfaConfig;
	/** Routes bypassing session auth (health checks, metrics). */
	bypass?: RegExp[];
}
