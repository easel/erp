/**
 * Authentication and MFA enforcement schemas.
 * 
 * Ref: SD-004-authn-provider-abstraction.md §9
 */

import { z } from "zod";
import { UUIDSchema } from "../schemas.js";

// ── MFA Enforcement Configuration ────────────────────────────────────────────

export const UpdateMfaEnforcementConfigSchema = z.object({
	requiredForAll: z.boolean().optional(),
	requiredForRoles: z.array(z.string()).optional(),
});

export type UpdateMfaEnforcementConfigInput = z.infer<typeof UpdateMfaEnforcementConfigSchema>;
