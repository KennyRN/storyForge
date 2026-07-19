import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { readHistory, upsertTodayTotal } from "../history";
import { wordCountFilePath } from "../paths";

/** Minimal fake vault backing the writeBackstageFile path: getAbstractFileByPath,
 * read, create (new file) and modify (existing file), all against one in-memory store. */
function makeFakeApp(): { app: App } {
	let stored: string | null = null;
	// Must be a real TFile instance (via the "obsidian" test stub), not just a
	// cast object literal — history.ts's readWordCountFile gates on `instanceof TFile`.
	// `new TFile()` (0 args) matches the real obsidian.d.ts constructor signature;
	// the stub sets `path` from whatever's passed, so assign it afterwards.
	const fakeFile = Object.assign(new TFile(), { path: wordCountFilePath() });
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (stored !== null && path === wordCountFilePath() ? fakeFile : null),
			read: async () => stored ?? "",
			create: async (_path: string, content: string) => {
				stored = content;
				return fakeFile;
			},
			modify: async (_file: TFile, content: string) => {
				stored = content;
			},
			createFolder: async () => undefined,
		},
	} as unknown as App;
	return { app };
}

describe("upsertTodayTotal", () => {
	it("serialises concurrent writes for different books so neither clobbers the other", async () => {
		const { app } = makeFakeApp();
		// Noon UTC is safely 19 July in Europe/London regardless of the test
		// runner's own local timezone.
		const now = new Date("2026-07-19T12:00:00Z");

		await Promise.all([upsertTodayTotal(app, "BookA", 1000, now), upsertTodayTotal(app, "BookB", 2000, now)]);

		const { totals: totalsA } = await readHistory(app, "BookA");
		const { totals: totalsB } = await readHistory(app, "BookB");
		expect(totalsA["2026-07-19"]).toBe(1000);
		expect(totalsB["2026-07-19"]).toBe(2000);
	});
});
