/**
 * MFA enforcement middleware — checks if user's roles require MFA and blocks access until verified.
 *
 * This middleware runs after session authentication and enforces MFA requirements
 * based on user roles or global configuration.
 *
 * Ref: SD-004-authn-provider-abstraction.md §7.3 MFA enforcement
 * Issue: apogee-246f9f41
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthDbClient } from "./provider.js";

// Augment FastifyRequest to include mfaEnforcementConfig
declare module "fastify" {
	interface FastifyRequest {
		mfaEnforcementConfig?: MfaEnforcementConfig | null;
	}
}

export interface MfaEnforcementConfig {
	requiredForAll: boolean;
	requiredForRoles: string[];
}

export interface MfaEnforcementMiddlewareOptions {
	db: AuthDbClient;
	/** Routes that bypass MFA enforcement (e.g., /auth/mfa/* for enrollment) */
	bypass?: RegExp[];
}

// ── DB config row type (private) ──────────────────────────────────────────────

interface MfaEnforcementConfigRow {
	id: string;
	required_for_all: boolean;
	required_for_roles: string; // JSON array stored as text
	updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Load MFA enforcement configuration from database. */
async function loadMfaEnforcementConfig(db: AuthDbClient): Promise<MfaEnforcementConfig | null> {
	const result = await db.query<MfaEnforcementConfigRow>(
		`SELECT id, required_for_all, required_for_roles, updated_at
		 FROM mfa_enforcement_config
		 LIMIT 1`,
		[],
	);

	if (result.rows.length === 0) {
		return null;
	}

	const row = result.rows[0]!;
	try {
		const requiredForRoles = row.required_for_roles
			? (JSON.parse(row.required_for_roles) as string[])
			: [];
		return {
			requiredForAll: row.required_for_all,
			requiredForRoles,
		};
	} catch {
		// If JSON parse fails, treat as empty array
		return {
			requiredForAll: row.required_for_all,
			requiredForRoles: [],
		};
	}
}

/** Check if user's roles require MFA based on configuration. */
export function requiresMfa(
	config: MfaEnforcementConfig | null,
	userRoles: string[],
): boolean {
	if (!config) {
		return false;
	}

	// If MFA is required for all users, enforce it
	if (config.requiredForAll) {
		return true;
	}

	// Check if any of the user's roles are in the required list
	return config.requiredForRoles.some((role) => userRoles.includes(role));
}

// ── registerMfaEnforcementHook ────────────────────────────────────────────────

/**
 * Register the MFA enforcement hook on a Fastify instance.
 *
 * Must be called after registerSessionAuthHook so that req.user and req.session are available.
 */
export function registerMfaEnforcementHook(app: FastifyInstance, opts: MfaEnforcementMiddlewareOptions): void {
	const bypass = opts.bypass ?? [/^\/auth\/mfa\//];

	app.decorateRequest("mfaEnforcementConfig", null);

	app.addHook("onRequest", async (req, _reply) => {
		// Skip if route is in bypass list
		if (bypass.some((re) => re.test(req.url))) {
			return;
		}

		// Skip if user is not authenticated (session auth hook should have caught this)
		if (!req.user || !req.session) {
			return;
		}

		// Load MFA enforcement configuration (could be cached in production)
		const config = await loadMfaEnforcementConfig(opts.db);

		// Store config on request for use in other hooks
		req.mfaEnforcementConfig = config;

		// If no config exists, MFA enforcement is not active
		if (!config) {
			return;
		}

		// Check if user's roles require MFA
		// Note: req.user.roles should be populated by entity-context middleware
		// For now, we'll check if the user has MFA enabled and session is verified
		const userRoles = (req.user as unknown as { roles?: string[] }).roles ?? [];

		if (!requiresMfa(config, userRoles)) {
			return;
		}

		// MFA is required for this user's roles
		// Check if session has been MFA verified
		if (!req.session.mfaVerified) {
			// User requires MFA but hasn't verified yet
			// Redirect to MFA enrollment/verification page or return 403
			throw Object.assign(
				new Error("MFA verification required for your role. Please complete MFA setup."),
				{
					statusCode: 403,
					name: "MFARequired",
				},
			);
		}
	});
}
