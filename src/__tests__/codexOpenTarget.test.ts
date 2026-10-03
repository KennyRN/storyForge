import { describe, expect, it } from "vitest";
import { storytellingCodexClickAction, storytellingCodexOpenTarget } from "../view/codexOpenTarget";

describe("storytellingCodexOpenTarget", () => {
	it("opens lore in the right-rail codex-page while Story Context is in Focus Mode", () => {
		expect(storytellingCodexOpenTarget(true)).toBe("codex-page");
	});

	it("opens lore in the center pane when Focus Mode is off", () => {
		expect(storytellingCodexOpenTarget(false)).toBe("center");
	});
});

describe("storytellingCodexClickAction", () => {
	it("closes the codex-page when the lore already shown there is clicked again", () => {
		expect(storytellingCodexClickAction("Codex/Characters/Ana.md", "Codex/Characters/Ana.md")).toBe("close");
	});

	it("opens different lore over whatever is shown", () => {
		expect(storytellingCodexClickAction("Codex/Characters/Ana.md", "Codex/Places/Dock.md")).toBe("open");
	});

	it("opens lore when nothing is shown", () => {
		expect(storytellingCodexClickAction(null, "Codex/Characters/Ana.md")).toBe("open");
	});
});
