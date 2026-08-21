import { describe, expect, it } from "vitest";
import { DEFAULT_TITLEFORGE_SETTINGS, type TitleForgeSettings } from "../settings.js";

/**
 * `storage.ts`'s `loadSettings()` merges a saved file onto `DEFAULT_TITLEFORGE_SETTINGS` with a
 * shallow `{ ...DEFAULT_TITLEFORGE_SETTINGS, ...parsed }` spread (not exercised directly here,
 * since it touches `app.vault` — this asserts the merge behaviour that call relies on). A file
 * saved by a build before `lastTabByScope`/`lastQuantity` existed only has the old, now-unread
 * `lastTab` and `lastGeneratorId` fields — the shallow spread should fall back to the full default
 * map/value below with no explicit migration code needed. `legacyParsed` is typed loosely (raw
 * JSON, not `Partial<TitleForgeSettings>`) since those two fields aren't part of the shape at all
 * any more — exactly what a real `JSON.parse()` of an old saved file would hand back.
 */
describe("TitleForgeSettings back-compat", () => {
	it("back-fills lastTabByScope and lastQuantity from a pre-scope saved file", () => {
		const legacyParsed: Record<string, unknown> = {
			lastGeneratorId: "western-serial",
			lastTab: "webFiction",
			lastGenre: "epic",
		};

		const merged: TitleForgeSettings = { ...DEFAULT_TITLEFORGE_SETTINGS, ...legacyParsed };

		expect(merged.lastGenre).toBe("epic");
		expect(merged.lastTabByScope).toEqual(DEFAULT_TITLEFORGE_SETTINGS.lastTabByScope);
		expect(merged.lastQuantity).toBe(DEFAULT_TITLEFORGE_SETTINGS.lastQuantity);
	});

	it("leaves a settings file that already has the new fields untouched", () => {
		const current: Partial<TitleForgeSettings> = {
			lastTabByScope: { all: "webFiction", series: "kept", novels: "novels" },
			lastQuantity: 15,
		};

		const merged: TitleForgeSettings = { ...DEFAULT_TITLEFORGE_SETTINGS, ...current };

		expect(merged.lastTabByScope).toEqual(current.lastTabByScope);
		expect(merged.lastQuantity).toBe(15);
	});
});
