/**
 * Stress / scale tests: large inputs, many chapters, concurrent history writes,
 * and chapter-code growth past the 3-letter ceiling.
 */
import { describe, expect, it } from "vitest";
import { analyzeChapter } from "../recommend/engine";
import { parseFactsFromSection } from "../recommend/facts";
import type { CodexEntryInput } from "../recommend/types";
import { nextChapterCode } from "../chapterCode";
import { nextBookFolderCode } from "../bookCode";
import { resolveOrder } from "../ordering";
import { mintId, slugify } from "../slug";
import {
	getBookWordStats,
	recordChapterEdit,
} from "../history";
import { LIBRARY_ROOT } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";
import type { App } from "obsidian";

function person(path: string, name: string, factsBody = "", aliases: string[] = []): CodexEntryInput {
	return {
		path,
		name,
		aliases,
		type: "person",
		facts: parseFactsFromSection(factsBody, "Facts"),
	};
}

describe("recommend engine stress", () => {
	it("analyzes a ~50k-word chapter against 200 codex entries in under 5s", () => {
		const entries: CodexEntryInput[] = [];
		for (let i = 0; i < 200; i++) {
			entries.push(person(`Codex/Character${i}.md`, `Character${i}`, i % 10 === 0 ? "eye colour: green\n" : ""));
		}
		// Sprinkle known names through a large prose blob.
		const chunks: string[] = [];
		for (let i = 0; i < 5000; i++) {
			chunks.push(`Character${i % 200} walked through the market and bought bread.`);
		}
		const prose = chunks.join(" ");
		expect(prose.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40_000);

		const start = Date.now();
		const report = analyzeChapter(prose, entries, {
			chapterFilename: "big.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const elapsed = Date.now() - start;

		expect(report.matched.length).toBeGreaterThan(50);
		expect(elapsed).toBeLessThan(5000);
	});

	it("prefers existing plot over heuristic synopsis even for huge prose", () => {
		const prose = "Word ".repeat(20_000);
		const report = analyzeChapter(prose, [], {
			chapterFilename: "ch.md",
			existingPlot: "User-authored plot note.",
			includeUnknownNames: false,
		});
		expect(report.synopsisHeuristic).toBe("User-authored plot note.");
	});
});

describe("id minting stress", () => {
	it("mints 500 unique book folder codes without collision", () => {
		const existing: string[] = [];
		for (let i = 0; i < 500; i++) {
			const code = nextBookFolderCode("The Ember Chronicles", existing);
			expect(existing).not.toContain(code);
			existing.push(code);
		}
		expect(new Set(existing).size).toBe(500);
		// Past single-letter suffix into multi-letter (bijective base-26).
		expect(existing[25].length).toBeGreaterThan(existing[0].length - 1);
	});

	it("mints chapter codes past zzz without throwing", () => {
		// Seed as if the book already used aaa..zzz (17576 codes) via a synthetic high watermark.
		const bookId = "ember";
		const nearCeiling = `${bookId}_chapter-zzz`;
		const next = nextChapterCode(bookId, [nearCeiling]);
		expect(next).toBe(`${bookId}_chapter-aaaa`);
		const after = nextChapterCode(bookId, [nearCeiling, next]);
		expect(after).toBe(`${bookId}_chapter-aaab`);
	});

	it("slugify keeps non-Latin titles distinguishable under mintId", () => {
		const ids = [
			mintId("Война и мир", []),
			mintId("日本語のタイトル", []),
			mintId("العربية", []),
		];
		expect(new Set(ids).size).toBe(3);
		expect(ids.every((id) => id !== "book")).toBe(true);
		expect(slugify("🔥🔥🔥")).toBe("book"); // emoji-only still falls back
	});
});

describe("ordering stress", () => {
	it("resolves 2000 members with sparse order list", () => {
		const members = Array.from({ length: 2000 }, (_, i) => ({ id: `ch-${i}.md` }));
		const order = members.filter((_, i) => i % 3 === 0).map((m) => m.id);
		const { ordered, unplaced } = resolveOrder(members, order, (m) => m.id);
		expect(ordered.length + unplaced.length).toBe(2000);
		expect(ordered.map((m) => m.id)).toEqual(order.filter((id) => members.some((m) => m.id === id)));
	});

	it("keeps each order entry that resolves to a member (duplicates allowed in order list)", () => {
		const members = [{ id: "a.md" }, { id: "b.md" }];
		const { ordered } = resolveOrder(members, ["a.md", "a.md", "b.md"], (m) => m.id);
		// resolveOrder maps order entries → members; duplicate keys repeat the same member.
		expect(ordered.map((m) => m.id)).toEqual(["a.md", "a.md", "b.md"]);
	});
});

describe("history concurrent writes", () => {
	function makeHistoryApp(chapterWords: Record<string, string>) {
		const book = "BookA";
		const store = new Map<string, string>();
		const folders = new Set<string>([LIBRARY_ROOT, `${LIBRARY_ROOT}/${book}`, `_sf-backstage`, `_sf-backstage/${book}`]);
		for (const [name, content] of Object.entries(chapterWords)) {
			store.set(`${LIBRARY_ROOT}/${book}/${name}`, content);
		}
		store.set(`_sf-backstage/${book}/novel.md`, "---\n---\n");

		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => {
					if (folders.has(path)) {
						const folder = makeTFolder(path);
						const prefix = `${path}/`;
						for (const p of store.keys()) {
							if (p.startsWith(prefix) && !p.slice(prefix.length).includes("/")) {
								folder.children.push(makeTFile(p));
							}
						}
						return folder;
					}
					if (store.has(path)) return makeTFile(path);
					return null;
				},
				read: async (file: { path: string }) => store.get(file.path) ?? "",
				cachedRead: async (file: { path: string }) => store.get(file.path) ?? "",
				create: async (path: string, content: string) => {
					store.set(path, content);
					return makeTFile(path);
				},
				modify: async (file: { path: string }, content: string) => {
					store.set(file.path, content);
				},
				createFolder: async (path: string) => {
					folders.add(path);
				},
			},
			metadataCache: {
				getCache: (path: string) => {
					if (path.endsWith("novel.md")) {
						return { frontmatter: { archive: [], "chapter-order": Object.keys(chapterWords) } };
					}
					return null;
				},
			},
			fileManager: {
				trashFile: async () => undefined,
				processFrontMatter: async () => undefined,
			},
		} as unknown as App;

		return { app, book, store };
	}

	it("serializes parallel recordChapterEdit calls without losing totals", async () => {
		const chapters: Record<string, string> = {
			"ch1.md": "one two three",
			"ch2.md": "alpha beta",
			"ch3.md": "red blue green yellow",
		};
		const { app, book } = makeHistoryApp(chapters);

		await Promise.all([
			recordChapterEdit(app, book, "ch1.md", 3),
			recordChapterEdit(app, book, "ch2.md", 2),
			recordChapterEdit(app, book, "ch3.md", 4),
		]);

		const stats = await getBookWordStats(app, book);
		expect(stats.current).toBe(9);
		expect(stats.chapters["ch1.md"]?.words).toBe(3);
		expect(stats.chapters["ch2.md"]?.words).toBe(2);
		expect(stats.chapters["ch3.md"]?.words).toBe(4);
	});
});
