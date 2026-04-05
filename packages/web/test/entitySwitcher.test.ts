import { describe, expect, it } from "bun:test";
import { ENTITY_SWITCHER_KEY } from "../src/components/EntitySwitcher.js";

describe("ENTITY_SWITCHER_KEY", () => {
	it("is a stable string constant", () => {
		expect(typeof ENTITY_SWITCHER_KEY).toBe("string");
		expect(ENTITY_SWITCHER_KEY).toBe("apogee:activeEntityId");
	});
});
