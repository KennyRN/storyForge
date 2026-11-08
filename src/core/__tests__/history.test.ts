import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import {
	getBookWordStats,
	getChapterDaily,
	recordChapterArchive,
	recordChapterEdit,
	recordChapterUnarchive,
} from "../history";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, bookFilePath, bookWordCountFilePath } from "../paths";
import { parseYamlText } from "../frontmatter";

async function makeBooks(books: Record<string, Record<string, string>>, archive: Record<string, string[]> = {}) {
	const files: Record<string, string | null> = {};
	for (const [book, chapters] of Object.entries(books)) {
		files[`${LIBRARY_ROOT}/${book}`] = null;
		files[`${BACKSTAGE_ROOT}/${book}`] = null;
		files[bookFilePath(book)] = fmFile({ archive: archive[book] ?? [], "chapter-order": Object.keys(chapters) });
		for (const [name, text] of Object.entries(chapters)) files[`${LIBRARY_ROOT}/${book}/${name}`] = text;
	}
	const mp = await memoryProject(files);
	return {
		...mp,
		/** Simulates the file changing under us, then tells the index (as the watcher will). */
		async setChapter(book: string, name: string, text: string) {
			const path = `${LIBRARY_ROOT}/${book}/${name}`;
			mp.backend.setFile(path, text);
			await mp.project.index.applyChange({ type: "modified", path });
		},
		async setArchive(book: string, names: string[]) {
			await mp.project.modifyFrontmatter(bookFilePath(book), "---\n---\n", (fm) => {
				fm.archive = names;
			});
		},
	};
}

describe("recordChapterEdit", () => {
	it("increments lifetimeWritten and daily chapter net on positive delta", async () => {
		const { project, setChapter } = await makeBooks({ BookA: { "ch1.md": "one two" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(project, "BookA", "ch1.md", 2, now);
		let stats = await getBookWordStats(project, "BookA", now);
		expect(stats.lifetimeWritten).toBe(2);
		expect(stats.current).toBe(2);
		expect(stats.todayNet).toBe(2);
		expect(await getChapterDaily(project, "BookA", "ch1.md", "2026-07-19")).toBe(2);

		// Grow the chapter.
		await setChapter("BookA", "ch1.md", "one two three four five");
		await recordChapterEdit(project, "BookA", "ch1.md", 5, now);
		stats = await getBookWordStats(project, "BookA", now);
		expect(stats.lifetimeWritten).toBe(5);
		expect(stats.todayNet).toBe(5);
		expect(await getChapterDaily(project, "BookA", "ch1.md", "2026-07-19")).toBe(5);
	});

	it("does not change lifetimeRemoved on negative mid-edit delta", async () => {
		const { project, setChapter } = await makeBooks({ BookA: { "ch1.md": "one two three four five" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(project, "BookA", "ch1.md", 5, now);
		await setChapter("BookA", "ch1.md", "one two");
		await recordChapterEdit(project, "BookA", "ch1.md", 2, now);

		const stats = await getBookWordStats(project, "BookA", now);
		expect(stats.lifetimeWritten).toBe(5);
		expect(stats.lifetimeRemoved).toBe(0);
		expect(stats.todayNet).toBe(2);
		expect(stats.current).toBe(2);
	});

	it("writes the history file in the plain-YAML shape and keeps keys it doesn't know", async () => {
		const { project, backend } = await makeBooks({ BookA: { "ch1.md": "one two" } });
		const now = new Date("2026-07-19T12:00:00Z");
		await recordChapterEdit(project, "BookA", "ch1.md", 2, now);
		const path = bookWordCountFilePath("BookA");
		const data = parseYamlText(backend.files.get(path) as string);
		expect(data).toMatchObject({ version: 2, current: 2, lifetimeWritten: 2 });
		// someone adds a key and a comment by hand; the next recording keeps both
		backend.files.set(path, "# my notes\n" + (backend.files.get(path) as string) + "x-extra: kept\n");
		await project.index.applyChange({ type: "modified", path });
		backend.setFile(`${LIBRARY_ROOT}/BookA/ch1.md`, "one two three");
		await project.index.applyChange({ type: "modified", path: `${LIBRARY_ROOT}/BookA/ch1.md` });
		await recordChapterEdit(project, "BookA", "ch1.md", 3, now);
		const text = backend.files.get(path) as string;
		expect(text.startsWith("# my notes\n")).toBe(true);
		expect(text).toContain("x-extra: kept");
		expect(parseYamlText(text)).toMatchObject({ current: 3, lifetimeWritten: 3 });
	});

	it("does not write when nothing changed", async () => {
		const { project, backend } = await makeBooks({ BookA: { "ch1.md": "one two" } });
		const now = new Date("2026-07-19T12:00:00Z");
		await recordChapterEdit(project, "BookA", "ch1.md", 2, now);
		backend.writes.length = 0;
		await recordChapterEdit(project, "BookA", "ch1.md", 2, now);
		expect(backend.writes).toEqual([]);
	});
});

describe("recordChapterArchive / unarchive", () => {
	it("increments lifetimeRemoved on archive and restores on unarchive", async () => {
		const { project, setArchive } = await makeBooks({ BookA: { "ch1.md": "alpha beta gamma" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(project, "BookA", "ch1.md", 3, now);
		await setArchive("BookA", ["ch1.md"]);
		await recordChapterArchive(project, "BookA", "ch1.md", 3, now);

		let stats = await getBookWordStats(project, "BookA", now);
		expect(stats.lifetimeRemoved).toBe(3);
		expect(stats.lifetimeWritten).toBe(3);
		expect(stats.current).toBe(0);

		await setArchive("BookA", []);
		await recordChapterUnarchive(project, "BookA", "ch1.md", now);

		stats = await getBookWordStats(project, "BookA", now);
		expect(stats.lifetimeRemoved).toBe(0);
		expect(stats.current).toBe(3);
	});
});

describe("concurrent writes", () => {
	it("serialises concurrent edits for different books so neither clobbers the other", async () => {
		const { project, backend } = await makeBooks({ BookA: { "a.md": "one" }, BookB: { "b.md": "one two" } });
		const now = new Date("2026-07-19T12:00:00Z");
		await Promise.all([recordChapterEdit(project, "BookA", "a.md", 1, now), recordChapterEdit(project, "BookB", "b.md", 2, now)]);

		const statsA = await getBookWordStats(project, "BookA", now);
		const statsB = await getBookWordStats(project, "BookB", now);
		expect(statsA.current).toBe(1);
		expect(statsB.current).toBe(2);
		expect(backend.files.has(bookWordCountFilePath("BookA"))).toBe(true);
		expect(backend.files.has(bookWordCountFilePath("BookB"))).toBe(true);
	});
});

describe("heatmapStartMonday (Tweaks 3 §1.4)", () => {
	it("starts in the week of a stored date, else of the earliest recorded day, else the default window", async () => {
		const { heatmapStartMonday } = await import("../history");
		expect(heatmapStartMonday("2026-11-08", ["2026-10-14", "2026-09-30"], "2026-08-05")).toBe("2026-08-03"); // the stored date's Monday
		expect(heatmapStartMonday("2026-11-08", ["2026-10-14", "2026-09-30"], null)).toBe("2026-09-28"); // earliest recorded
		expect(heatmapStartMonday("2026-11-08", ["2026-10-14", "2026-09-30"], "not a date")).toBe("2026-09-28"); // unreadable: the fallback
		expect(heatmapStartMonday("2026-11-08", [], null)).toBe("2026-07-20"); // the default 16 weeks (the Monday of this week less 15 weeks)
		expect(heatmapStartMonday("2026-11-08", ["2027-01-01"], null)).toBe("2026-07-20"); // a day in the future is not a record
	});
});
