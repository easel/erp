/**
 * MFA enforcement middleware tests.
 * 
 * Ref: SD-004-authn-provider-abstraction.md §7.3
 * Issue: apogee-246f9f41
 */

import { describe, it, expect } from "bun:test";
import { requiresMfa, type MfaEnforcementConfig } from "../../src/auth/mfa-enforcement.js";

describe("MFA enforcement", () => {
	describe("requiresMfa", () => {
		it("returns false when no config exists", () => {
			expect(requiresMfa(null, ["admin"])).toBe(false);
		});

		it("returns true when requiredForAll is enabled", () => {
			const config: MfaEnforcementConfig = {
				requiredForAll: true,
				requiredForRoles: [],
			};
			expect(requiresMfa(config, [])).toBe(true);
			expect(requiresMfa(config, ["user"])).toBe(true);
		});

		it("returns true when user has a role in requiredForRoles", () => {
			const config: MfaEnforcementConfig = {
				requiredForAll: false,
				requiredForRoles: ["compliance", "admin"],
			};
			expect(requiresMfa(config, ["compliance"])).toBe(true);
			expect(requiresMfa(config, ["admin", "user"])).toBe(true);
		});

		it("returns false when user has no roles in requiredForRoles", () => {
			const config: MfaEnforcementConfig = {
				requiredForAll: false,
				requiredForRoles: ["compliance", "admin"],
			};
			expect(requiresMfa(config, ["user"])).toBe(false);
			expect(requiresMfa(config, [])).toBe(false);
		});

		it("handles empty requiredForRoles array", () => {
			const config: MfaEnforcementConfig = {
				requiredForAll: false,
				requiredForRoles: [],
			};
			expect(requiresMfa(config, ["user"])).toBe(false);
		});
	});
});
