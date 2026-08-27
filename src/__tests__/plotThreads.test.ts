import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import {
	addPlotThread,
	deletePlotThread,
	ensurePlotThreadsFile,
	MAIN_THREAD_FALLBACK_COLOR,
	MAIN_THREAD_ID,
	MAIN_THREAD_LABEL,
	readPlotThreads,
	renamePlotThread,
	reorderPlotThreads,
	seedMainThread,
	setPlotThreadColor,
	setPlotThreadTextColor,
} from "../plotThreads";
import { BACKSTAGE_ROOT, plotThreadsFilePath } from "../paths";
import { collectPlotLines, plotThreadLineKey, resolveMainThreadRowColor } from "../view/novelColor";
import type { StoryForgePluginSettings } from "../main";

function makeFakeApp(
	exists: boolean,
	initialFrontmatter: Record<string, unknown> = {},
): { app: App; frontmatter: Record<string, unknown>; fileExists: () => boolean } {
	const path = plotThreadsFilePath();
	let fileExists = exists;
	const frontmatter: Record<string, unknown> = { ...initialFrontmatter };

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => {
				if (p === path) return fileExists ? makeTFile(p) : null;
				if (p === BACKSTAGE_ROOT) return makeTFolder(p);
				return null;
			},
			create: async (p: string) => {
				fileExists = true;
				return makeTFile(p);
			},
			createFolder: async () => {
				/* no-op — BACKSTAGE_ROOT already resolves via getAbstractFileByPath above */
			},
		},
		metadataCache: {
			getCache: (p: string) => (p === path ? { frontmatter } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === path) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter, fileExists: () => fileExists };
}

describe("ensurePlotThreadsFile", () => {
	it("creates the file seeded with main thread when it doesn't exist yet", async () => {
		const { app, fileExists } = makeFakeApp(false);
		const result = await ensurePlotThreadsFile(app);
		expect(fileExists()).toBe(true);
		expect(result).toEqual([seedMainThread()]);
	});

	it("inserts main thread into an existing empty list", async () => {
		const { app, frontmatter } = makeFakeApp(true, { "plot-threads": [] });
		const result = await ensurePlotThreadsFile(app, "#112233");
		expect(result[0]).toEqual({ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: "#112233" });
		expect(frontmatter["plot-threads"]).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: "#112233" },
		]);
	});

	it("seeds a supplied text colour on a new main thread", async () => {
		const { app, frontmatter } = makeFakeApp(true, { "plot-threads": [] });
		const result = await ensurePlotThreadsFile(app, "#112233", "#f8fafc");
		expect(result[0]).toEqual({
			id: MAIN_THREAD_ID,
			label: MAIN_THREAD_LABEL,
			color: "#112233",
			textColor: "#f8fafc",
		});
		expect(frontmatter["plot-threads"]).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: "#112233", textColor: "#f8fafc" },
		]);
	});

	it("leaves an existing file with main thread untouched", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a" }],
		});
		const result = await ensurePlotThreadsFile(app, "#ffffff");
		expect(result).toEqual([{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a" }]);
	});
});

describe("readPlotThreads", () => {
	it("returns the seeded main thread when the file doesn't exist", () => {
		const { app } = makeFakeApp(false);
		expect(readPlotThreads(app)).toEqual([seedMainThread()]);
	});

	it("synthesizes main thread in front of parsed entries that omit it", () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: "romance", label: "Romance", color: "#4a90d9" }],
		});
		expect(readPlotThreads(app)).toEqual([
			seedMainThread(),
			{ id: "romance", label: "Romance", color: "#4a90d9" },
		]);
	});

	it("parses well-formed entries and silently drops malformed ones", () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: "main thread", color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "romance", label: "Romance", color: "#4a90d9" },
				{ label: "No id", color: "#000000" },
				{ id: "bad-color", label: "Bad", color: "red" },
			],
		});
		expect(readPlotThreads(app)).toEqual([
			{ id: MAIN_THREAD_ID, label: "main thread", color: MAIN_THREAD_FALLBACK_COLOR },
			{ id: "romance", label: "Romance", color: "#4a90d9" },
		]);
	});
});

describe("plot thread CRUD", () => {
	it("mints a slug id from the label and appends it", async () => {
		const { app, frontmatter } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR }],
		});
		const { id, entries } = await addPlotThread(app, "Romance", "#c41e3a");
		expect(id).toBe("romance");
		expect(frontmatter["plot-threads"]).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
			{ id: "romance", label: "Romance", color: "#c41e3a" },
		]);
		expect(entries.map((e) => e.id)).toEqual([MAIN_THREAD_ID, "romance"]);
	});

	it("de-duplicates a slug that's already taken", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "subplot", label: "Subplot", color: "#4a90d9" },
			],
		});
		const { id } = await addPlotThread(app, "Subplot", "#111111");
		expect(id).toBe("subplot-2");
	});

	it("renames by id without touching other entries", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "romance", label: "Romance", color: "#4a90d9" },
			],
		});
		await renamePlotThread(app, "romance", "Love story");
		expect(readPlotThreads(app)).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
			{ id: "romance", label: "Love story", color: "#4a90d9" },
		]);
	});

	it("changes only the colour on setPlotThreadColor", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR }],
		});
		await setPlotThreadColor(app, MAIN_THREAD_ID, "#00ff00");
		expect(readPlotThreads(app)).toEqual([{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: "#00ff00" }]);
	});

	it("stores text colour on setPlotThreadTextColor", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR }],
		});
		await setPlotThreadTextColor(app, MAIN_THREAD_ID, "#111111");
		expect(readPlotThreads(app)).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR, textColor: "#111111" },
		]);
	});

	it("keeps a stored text colour when parsing", () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: "main thread", color: MAIN_THREAD_FALLBACK_COLOR, textColor: "#0a0a0a" },
			],
		});
		expect(readPlotThreads(app)[0].textColor).toBe("#0a0a0a");
	});

	it("rejects a non-hex colour", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR }],
		});
		await expect(addPlotThread(app, "Romance", "red")).rejects.toThrow(/#rrggbb/);
	});

	it("refuses to delete the default main thread", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "romance", label: "Romance", color: "#4a90d9" },
			],
		});
		const { entries } = await deletePlotThread(app, MAIN_THREAD_ID);
		expect(entries.map((e) => e.id)).toEqual([MAIN_THREAD_ID, "romance"]);
		expect(readPlotThreads(app).map((t) => t.id)).toEqual([MAIN_THREAD_ID, "romance"]);
	});

	it("removes only the targeted entry on delete, leaving others untouched", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "romance", label: "Romance", color: "#4a90d9" },
			],
		});
		await deletePlotThread(app, "romance");
		expect(readPlotThreads(app)).toEqual([
			{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
		]);
	});

	it("reorders to the given id sequence and appends anything missing from it", async () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: MAIN_THREAD_LABEL, color: MAIN_THREAD_FALLBACK_COLOR },
				{ id: "a", label: "A", color: "#111111" },
				{ id: "b", label: "B", color: "#222222" },
				{ id: "c", label: "C", color: "#333333" },
			],
		});
		await reorderPlotThreads(app, ["c", MAIN_THREAD_ID, "a"]);
		expect(readPlotThreads(app).map((t) => t.id)).toEqual(["c", MAIN_THREAD_ID, "a", "b"]);
	});
});

const gutterSettings = {} as StoryForgePluginSettings;

describe("collectPlotLines", () => {
	it("always starts with the main thread when plot-threads.md is missing", () => {
		const { app } = makeFakeApp(false);
		expect(collectPlotLines(app, "BookA", gutterSettings)).toEqual([
			{ key: plotThreadLineKey(MAIN_THREAD_ID), color: MAIN_THREAD_FALLBACK_COLOR },
		]);
	});

	it("always starts with the main thread when the registry list is empty", () => {
		const { app } = makeFakeApp(true, { "plot-threads": [] });
		expect(collectPlotLines(app, "BookA", gutterSettings)[0]).toEqual({
			key: plotThreadLineKey(MAIN_THREAD_ID),
			color: MAIN_THREAD_FALLBACK_COLOR,
		});
	});

	it("uses the stored main-thread colour when present", () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a" }],
		});
		expect(collectPlotLines(app, "BookA", gutterSettings)[0]).toEqual({
			key: plotThreadLineKey(MAIN_THREAD_ID),
			color: "#c41e3a",
		});
	});
});

describe("resolveMainThreadRowColor", () => {
	it("uses the stored main-thread colour and text colour", () => {
		const { app } = makeFakeApp(true, {
			"plot-threads": [
				{ id: MAIN_THREAD_ID, label: "main thread", color: "#c41e3a", textColor: "#0a0a0a" },
			],
		});
		expect(resolveMainThreadRowColor(app, gutterSettings)).toEqual({
			background: "#c41e3a",
			text: "#0a0a0a",
		});
	});
});
