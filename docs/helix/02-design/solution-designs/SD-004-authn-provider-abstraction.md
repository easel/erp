# Solution Design: AuthN Provider Abstraction Layer

**Authority Level:** 4 (Design)
**Status:** Draft
**Created:** 2026-04-05
**Governed by:** [PRD](../../01-frame/prd.md), [FEAT-009](../../01-frame/features/FEAT-009-platform-infrastructure.md), [SD-003](./SD-003-phase1-implementation-plan.md)
**Issue:** hx-f7c25b4e
**Requirement:** PLT-006

---

## 1. Problem Statement

WP-0 delivered JWT validation scaffolding (`packages/server/src/auth.ts`) that validates HS256-signed tokens and exposes a `user` property on Fastify requests. WP-1 (PLT-006) requires the full AuthN stack:

- OIDC SSO with at least Keycloak, Okta, and Azure AD
- SAML 2.0 SSO
- TOTP MFA (authenticator apps)
- Session management with configurable inactivity timeout
- Token refresh and forced logout

The WP-0 scaffolding validates tokens but knows nothing about how they were issued. Before implementation, the **provider abstraction layer** must be designed so that OIDC, SAML, and future providers share a consistent internal contract and the rest of the application remains provider-agnostic.

---

## 2. Goals and Non-Goals

### Goals

- Design the provider abstraction interface used by Fastify middleware and session management
- Define the session model (DB schema + in-memory shape)
- Define the MFA enforcement contract (TOTP Phase 1, WebAuthn deferred to Phase 2)
- Define token refresh and forced logout flows
- Provide enough detail that implementation follows directly without further design work

### Non-Goals (deferred)

- WebAuthn / FIDO2 (Phase 2 per PLT-006 acceptance criteria note)
- API key authentication (separate concern — PLT-US-023)
- Offline / cached session fallback during IdP outage (open design question in FEAT-009 §6)

---

## 3. Authority References

| Requirement | Source |
|-------------|--------|
| PLT-006: OIDC SSO, SAML 2.0, TOTP MFA, session mgmt | PRD + FEAT-009 |
| PLT-US-001: Admin configures SSO via SAML 2.0 or OIDC | FEAT-009 |
| PLT-US-002: Admin enforces MFA by role | FEAT-009 |
| PLT-US-005: Sessions expire on inactivity timeout (default 30 min) | FEAT-009 |
| PLT-006 AC: active sessions visible + revocable | FEAT-009 |
| PLT-006 AC: failed login lockout (5 attempts, 30 min) | FEAT-009 |
| SD-001: passport.js (SAML strategy + OIDC strategy) + custom JWT session management | SD-001 §2 |
| C5: operates without external network for core functions | PRD |
| C2: all data at rest and in transit encrypted | PRD |

---

## 4. Architecture Overview

```
                        ┌──────────────────────────────────────┐
                        │          Fastify request             │
                        └──────────────┬───────────────────────┘
                                       │ onRequest hook
                        ┌──────────────▼───────────────────────┐
                        │        AuthN Middleware               │
                        │  1. Extract session token (cookie)    │
                        │  2. Load session from DB              │
                        │  3. Enforce MFA gate                  │
                        │  4. Attach req.user + req.session     │
                        └──────────────┬───────────────────────┘
                                       │
          ┌────────────────────────────┼──────────────────────────────┐
          │                            │                              │
┌─────────▼──────────┐   ┌────────────▼──────────┐   ┌──────────────▼──────────┐
│   OIDC Flow        │   │   SAML Flow            │   │   Token Refresh Flow    │
│  /auth/oidc/login  │   │  /auth/saml/login      │   │  /auth/token/refresh    │
│  /auth/oidc/cb     │   │  /auth/saml/acs        │   │                         │
│  (passport-openid- │   │  (passport-saml)       │   │                         │
│   connect)         │   │                        │   │                         │
└─────────┬──────────┘   └────────────┬──────────┘   └─────────────────────────┘
          │                           │
          └──────────┬────────────────┘
                     │  Both resolve to IdentityAssertion
          ┌──────────▼────────────────────────────────┐
          │         AuthProvider (interface)            │
          │  resolveUser(assertion) → ApogeeUser        │
          │  JIT-provision if user not found            │
          └──────────┬────────────────────────────────┘
                     │
          ┌──────────▼────────────────────────────────┐
          │         MFA Gate                           │
          │  isMfaRequired(user) → boolean             │
          │  verifyTOTP(user, code) → boolean          │
          └──────────┬────────────────────────────────┘
                     │
          ┌──────────▼────────────────────────────────┐
          │         Session Manager                    │
          │  create(user, mfaVerified) → Session       │
          │  touch(id) → void   (update last_activity) │
          │  revoke(id) → void                         │
          │  list(userId) → Session[]                  │
          └──────────────────────────────────────────┘
```

---

## 5. Core Interfaces

### 5.1 IdentityAssertion

A normalized identity claim produced by either the OIDC or SAML flow before the local user is resolved.

```typescript
// packages/server/src/auth/types.ts

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
```

### 5.2 AuthProvider Interface

```typescript
// packages/server/src/auth/provider.ts

export interface AuthProvider {
  /**
   * Resolve an IdentityAssertion to an Apogee user.
   * Creates the user (JIT provisioning) if they don't exist.
   * Updates display name / email on subsequent logins.
   * Throws on assertion validation failure.
   */
  resolveUser(assertion: IdentityAssertion): Promise<ApogeeUser>;
}

export interface ApogeeUser {
  id: string;            // UUID
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  mfaTotpSecret: string | null;  // null until TOTP is enrolled
  accountStatus: "active" | "locked" | "deactivated";
  failedLoginCount: number;
  lockedUntil: Date | null;
}
```

### 5.3 Session

```typescript
// packages/server/src/auth/session.ts

export interface Session {
  id: string;           // UUID — stored as HttpOnly cookie
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;      // createdAt + absolute max (default 8h)
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
  provider: "oidc" | "saml";
}
```

### 5.4 SessionManager Interface

```typescript
// packages/server/src/auth/session-manager.ts

export interface SessionManager {
  create(params: {
    userId: string;
    mfaVerified: boolean;
    provider: "oidc" | "saml";
    ipAddress: string;
    userAgent: string;
  }): Promise<Session>;

  /** Load and validate session. Returns null if missing, expired, or revoked. */
  load(sessionId: string): Promise<Session | null>;

  /** Update last_activity to now. Called on every authenticated request. */
  touch(sessionId: string): Promise<void>;

  /** Immediately revoke a session (forced logout). */
  revoke(sessionId: string): Promise<void>;

  /** Revoke all sessions for a user (forced logout of all devices). */
  revokeAll(userId: string): Promise<void>;

  /** List active sessions for a user (for session management UI). */
  list(userId: string): Promise<Session[]>;
}
```

---

## 6. Database Schema

```sql
-- migrations/0XXX_authn_sessions.sql

CREATE TABLE authn_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  ip_address    INET NOT NULL,
  user_agent    TEXT NOT NULL,
  mfa_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  provider      TEXT NOT NULL CHECK (provider IN ('oidc', 'saml')),
  revoked_at    TIMESTAMPTZ NULL
);

CREATE INDEX idx_authn_sessions_user_id ON authn_sessions(user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_authn_sessions_expires_at ON authn_sessions(expires_at)
  WHERE revoked_at IS NULL;
```

```sql
-- migrations/0XXX_users_mfa.sql
-- Extends the users table (to be created in PLT-002/PLT-004 work)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_totp_secret       TEXT NULL,
  ADD COLUMN IF NOT EXISTS mfa_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_login_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ NULL;
```

```sql
-- migrations/0XXX_authn_identity_links.sql
-- Links external IdP identities to local users (one user can have multiple IdP links)

CREATE TABLE authn_identity_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('oidc', 'saml')),
  external_id  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
```

---

## 7. Authentication Flows

### 7.1 OIDC Login Flow

```
Browser                Apogee                    IdP (Keycloak/Okta/Azure AD)
  │                       │                              │
  │  GET /auth/oidc/login │                              │
  │──────────────────────►│                              │
  │                       │  redirect_uri + state        │
  │◄──────────────────────│ 302 → IdP authorize endpoint │
  │                       │                              │
  │  authenticate at IdP  │                              │
  │──────────────────────────────────────────────────────►
  │◄─────────────────────────────────── code + state ────┤
  │                       │                              │
  │  GET /auth/oidc/callback?code=...                    │
  │──────────────────────►│                              │
  │                       │  POST /token (code exchange) │
  │                       │─────────────────────────────►│
  │                       │◄──────── id_token + access_token
  │                       │                              │
  │                       │  validate id_token           │
  │                       │  build IdentityAssertion     │
  │                       │  resolveUser() → ApogeeUser  │
  │                       │  MFA gate check              │
  │                       │  SessionManager.create()     │
  │                       │                              │
  │◄──────────────────────│ Set-Cookie: session_id=...   │
  │  302 → /dashboard     │  (HttpOnly, Secure, SameSite=Lax)
```

### 7.2 SAML 2.0 Login Flow

```
Browser                Apogee                    IdP (Okta/Azure AD/ADFS)
  │                       │                              │
  │  GET /auth/saml/login │                              │
  │──────────────────────►│                              │
  │                       │  AuthnRequest (signed)       │
  │◄──────────────────────│ 302 → IdP SSO URL            │
  │                       │                              │
  │  POST to Apogee ACS   │                              │
  │  (IdP-initiated or SP-initiated SAMLResponse)        │
  │──────────────────────►│                              │
  │                       │  validate SAMLResponse       │
  │                       │  (signature, conditions,     │
  │                       │   audience, timestamps)      │
  │                       │  build IdentityAssertion     │
  │                       │  resolveUser() → ApogeeUser  │
  │                       │  MFA gate check              │
  │                       │  SessionManager.create()     │
  │◄──────────────────────│ Set-Cookie: session_id=...   │
  │  302 → /dashboard     │                              │
```

### 7.3 MFA Gate (TOTP)

The MFA gate runs after `resolveUser()` if `isMfaRequired(user)` returns true.

```
resolveUser() returns ApogeeUser
│
├─ mfaEnabled = false AND mfa is required for role
│     → redirect to /auth/mfa/setup (TOTP enrollment)
│     → TOTP enrollment completes → create session with mfaVerified=true
│
└─ mfaEnabled = true AND mfa is required for role
      → redirect to /auth/mfa/verify
      → POST /auth/mfa/verify { code }
      → verifyTOTP(user, code) 
          ├─ valid → create session with mfaVerified=true
          └─ invalid → increment failed count, check lockout
```

TOTP enrollment sequence:
1. Server generates secret via `OTPAuth.Secret.generate()` (32 bytes, base32)
2. Server returns QR code URI (`otpauth://totp/...`)
3. User scans with authenticator app
4. User submits verification code; server confirms before persisting secret
5. On confirm, `users.mfa_totp_secret` is set (encrypted at rest) and `mfa_enabled = true`

### 7.4 Session Lifecycle

```
create → [active: last_activity updated on each request]
       → touch() called on every authenticated request
       → inactivity timeout = now() - last_activity > 30 min → expired
       → absolute timeout = expires_at < now() → expired
       → revoke(id) → forced logout (single session)
       → revokeAll(userId) → forced logout all sessions
```

Session cookie:
- Name: `apogee_session`
- Flags: `HttpOnly; Secure; SameSite=Lax; Path=/`
- No expiry on the cookie itself (session cookie); expiry enforced server-side

### 7.5 Token Refresh

OIDC providers issue refresh tokens. Apogee should store the refresh token encrypted in the session row (or in a separate `authn_session_tokens` table) and refresh the access token in the background when it nears expiry. This keeps the Apogee session alive without the user re-authenticating.

```sql
-- Additional column on authn_sessions (or separate table)
ALTER TABLE authn_sessions
  ADD COLUMN IF NOT EXISTS idp_refresh_token_enc TEXT NULL;
  -- AES-256-GCM encrypted, key from APP_SESSION_ENCRYPTION_KEY env var
```

Background refresh (via Graphile Worker cron):
- Every 10 minutes: find sessions with `idp_refresh_token_enc IS NOT NULL` and IdP access token expiring within 5 minutes
- Exchange refresh token at IdP token endpoint
- Update stored refresh token if rotated

### 7.6 Forced Logout

- **User-initiated:** `DELETE /auth/sessions/:sessionId` → `SessionManager.revoke(id)`
- **Admin-initiated:** `DELETE /auth/sessions?userId=...` → `SessionManager.revokeAll(userId)`
- **System (lockout):** on `failedLoginCount >= 5`, set `lockedUntil = now() + 30 min` and revoke all active sessions

---

## 8. Lockout Policy

```
POST /auth/oidc/callback or /auth/saml/acs
│
└─ resolveUser() checks user.accountStatus
     ├─ "locked" AND lockedUntil > now() → 401 + audit log
     ├─ "locked" AND lockedUntil <= now() → auto-unlock, reset failed count
     └─ "active" → continue
```

Failed logins (invalid TOTP, IdP rejection) increment `users.failed_login_count`. On reaching threshold 5:
- Set `locked_until = now() + interval '30 minutes'`
- Revoke all active sessions
- Audit log the lockout event
- Admin can unlock early: `POST /admin/users/:id/unlock`

---

## 9. Configuration

```typescript
// packages/server/src/auth/config.ts

export interface OidcProviderConfig {
  type: "oidc";
  issuer: string;           // OIDC discovery endpoint base
  clientId: string;
  clientSecret: string;     // from environment
  scopes?: string[];        // default: ["openid", "email", "profile"]
  callbackUrl: string;
}

export interface SamlProviderConfig {
  type: "saml";
  entryPoint: string;       // IdP SSO URL
  issuer: string;           // SP Entity ID
  cert: string;             // IdP signing certificate (PEM)
  callbackUrl: string;      // ACS URL
  privateKey?: string;      // SP signing key (optional, for signed AuthnRequest)
}

export interface AuthConfig {
  providers: Array<OidcProviderConfig | SamlProviderConfig>;
  session: {
    inactivityTimeoutMinutes: number;  // default: 30
    absoluteTimeoutHours: number;       // default: 8
    encryptionKey: string;             // from APP_SESSION_ENCRYPTION_KEY env var
  };
  mfa: {
    totpIssuer: string;                // e.g., "Apogee ERP"
    requiredForRoles?: string[];       // enforce MFA for specific roles
    requiredForAll?: boolean;          // enforce MFA globally
    lockoutThreshold: number;          // default: 5
    lockoutDurationMinutes: number;    // default: 30
  };
  bypass?: RegExp[];  // routes that bypass session check (health, metrics)
}
```

---

## 10. Fastify Integration

The existing `registerAuthHook` in `auth.ts` validates HS256 JWTs for backward compatibility during the WP-0 → WP-1 transition. The new session-based middleware replaces it once this implementation is complete.

```typescript
// packages/server/src/auth/middleware.ts

export function registerSessionAuthHook(
  app: FastifyInstance,
  config: AuthConfig,
  sessionManager: SessionManager,
): void {
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);

  app.addHook("onRequest", async (req, reply) => {
    if ((config.bypass ?? DEFAULT_BYPASS).some((re) => re.test(req.url))) return;

    const sessionId = req.cookies?.apogee_session;
    if (!sessionId) { reply.code(401); throw new Error("Not authenticated"); }

    const session = await sessionManager.load(sessionId);
    if (!session) { reply.code(401); throw new Error("Session expired or invalid"); }

    // MFA gate: if session was created without MFA, reject on protected routes
    if (!session.mfaVerified && isMfaProtectedRoute(req.url)) {
      reply.code(403); throw new Error("MFA required");
    }

    await sessionManager.touch(sessionId);
    req.user = await loadUser(session.userId);
    req.session = session;
  });
}
```

Fastify needs `@fastify/cookie` registered before this hook.

---

## 11. Library Choices

| Concern | Library | Rationale |
|---------|---------|-----------|
| OIDC client | `openid-client` | RFC-compliant, actively maintained, supports all major IdPs |
| SAML 2.0 | `passport-saml` (via `@node-saml/node-saml`) | Most mature Node.js SAML SP implementation; used by passport.js per SD-001 |
| TOTP | `otpauth` | Zero-dependency, browser-compatible TOTP/HOTP; validates RFC 6238 |
| Session cookie | `@fastify/cookie` | First-party Fastify plugin |
| Encryption (refresh tokens) | Web Crypto API (`AES-GCM`) | Already in runtime (Bun + Node.js); no external dep |

---

## 12. Security Properties

| Property | Mechanism |
|----------|-----------|
| Session token confidentiality | HttpOnly + Secure cookie; never exposed to JS |
| Session fixation | New session ID issued after successful IdP callback |
| CSRF | SameSite=Lax cookie + state parameter in OIDC; SAML RelayState |
| SAML signature validation | Verify IdP certificate on every SAMLResponse |
| OIDC state/nonce | Bound to browser session via signed cookie before redirect |
| Refresh token storage | AES-256-GCM encrypted at rest in DB column |
| TOTP secret storage | AES-256-GCM encrypted at rest in users table |
| Lockout | 5 failed attempts → 30 min lockout + all sessions revoked |
| Audit | Every login, logout, MFA event, lockout, unlock → audit_events |

---

## 13. Follow-On Implementation Issues

The following build-phase issues should be created to implement this design:

| Issue | Title | Scope |
|-------|-------|-------|
| PLT-006-A | DB migrations: authn_sessions, authn_identity_links, users MFA columns | DB schema |
| PLT-006-B | AuthProvider interface + DefaultAuthProvider (JIT provisioning + lockout) | Core logic |
| PLT-006-C | OIDC flow: openid-client integration + /auth/oidc/* routes | OIDC |
| PLT-006-D | SAML 2.0 flow: @node-saml/node-saml + /auth/saml/* routes | SAML |
| PLT-006-E | TOTP MFA: enrollment + verification + /auth/mfa/* routes | MFA |
| PLT-006-F | SessionManager implementation + session middleware | Sessions |
| PLT-006-G | Token refresh background job (Graphile Worker) | Token refresh |
| PLT-006-H | Session management API: list + revoke endpoints | Forced logout |
| PLT-006-I | Integration tests: OIDC flow, SAML flow, MFA gate, lockout | Tests |

---

## 14. Open Questions Resolved

| Question | Decision |
|----------|----------|
| Session storage: Redis or DB? | **PostgreSQL only** (Constraint C5 — no mandatory Redis). Redis may be used as a cache layer if available but DB is authoritative. |
| Passport.js vs direct library use? | **Direct library use** (`openid-client`, `@node-saml/node-saml`). Passport.js adds middleware complexity incompatible with Fastify's hook model; using the underlying libraries directly gives cleaner TypeScript types and hook integration. |
| JWT vs session cookie? | **Session cookie** (opaque session ID). The HS256 JWT scaffolding from WP-0 remains for service-to-service auth (API keys); browser clients use session cookies. |
| WebAuthn Phase 1? | **Deferred to Phase 2.** TOTP is sufficient for Phase 1 MFA. |
| Session during IdP outage? | **Sessions remain valid until their timeout.** No active IdP communication is required after session creation. |
