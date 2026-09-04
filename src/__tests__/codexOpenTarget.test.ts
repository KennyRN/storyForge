import { describe, expect, it } from "vitest";
import { storytellingCodexOpenTarget } from "../view/codexOpenTarget";

describe("storytellingCodexOpenTarget", () => {
	it("opens lore in the right-rail codex-page while Story Context is in Focus Mode", () => {
		expect(storytellingCodexOpenTarget(true)).toBe("codex-page");
	});

	it("opens lore in the center pane when Focus Mode is off", () => {
		expect(storytellingCodexOpenTarget(false)).toBe("center");
	});
});
