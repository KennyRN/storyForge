import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import {
	getBookWordStats,
	getChapterDaily,
	migrateWordCountV1ToV2,
	recordChapterArchive,
	recordChapterEdit,
	recordChapterUnarchive,
	totalsFromDailyNets,
} from "../history";
import { bookWordCountFilePath, LIBRARY_ROOT, wordCountFilePath } from "../paths";

type Store = Map<string, string>;

function fileAt(path: string, store: Store) {
	if (!store.has(path)) return null;
	return makeTFile(path);
}

function folderAt(path: string, store: Store, folders: Set<string>) {
	if (!folders.has(path)) return null;
	const folder = makeTFolder(path);
	const prefix = path ? `${path}/` : "";
	const childNames = new Set<string>();
	for (const p of store.keys()) {
		if (!p.startsWith(prefix)) continue;
		const rest = p.slice(prefix.length);
		const seg = rest.split("/")[0];
		if (seg) childNames.add(seg);
	}
	for (const f of folders) {
		if (!f.startsWith(prefix)) continue;
		const rest = f.slice(prefix.length);
		if (!rest || rest.includes("/")) continue;
		childNames.add(rest);
	}
	for (const name of childNames) {
		const childPath = path ? `${path}/${name}` : name;
		if (folders.has(childPath)) {
			folder.children.push(makeTFolder(childPath));
		} else if (store.has(childPath)) {
			folder.children.push(makeTFile(childPath));
		}
	}
	return folder;
}

function makeFakeApp(opts?: {
	chapters?: Record<string, string>;
	archive?: string[];
	frontmatter?: Record<string, unknown>;
}): { app: App; store: Store; folders: Set<string>; setArchive: (names: string[]) => void } {
	const book = "BookA";
	const store: Store = new Map();
	const folders = new Set<string>([LIBRARY_ROOT, `${LIBRARY_ROOT}/${book}`, `_sf-backstage`, `_sf-backstage/${book}`]);
	const chapters = opts?.chapters ?? { "ch1.md": "one two three" };
	for (const [name, content] of Object.entries(chapters)) {
		store.set(`${LIBRARY_ROOT}/${book}/${name}`, content);
	}
	store.set(`_sf-backstage/${book}/novel.md`, "---\n---\n");

	let archive = opts?.archive ?? [];
	const frontmatter: Record<string, unknown> = {
		archive: [...archive],
		"chapter-order": Object.keys(chapters),
		...(opts?.frontmatter ?? {}),
	};

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (folders.has(path)) return folderAt(path, store, folders);
				return fileAt(path, store);
			},
			read: async (file: { path: string }) => store.get(file.path) ?? "",
			cachedRead: async (file: { path: string }) => store.get(file.path) ?? "",
			create: async (path: string, content: string) => {
				store.set(path, content);
				const parent = path.slice(0, path.lastIndexOf("/"));
				if (parent) folders.add(parent);
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
				if (path === `_sf-backstage/${book}/novel.md`) {
					return { frontmatter };
				}
				return null;
			},
		},
		fileManager: {
			trashFile: async (file: { path: string }) => {
				store.delete(file.path);
				folders.delete(file.path);
			},
		},
	} as unknown as App;

	return {
		app,
		store,
		folders,
		setArchive: (names: string[]) => {
			archive = names;
			frontmatter.archive = [...names];
		},
	};
}

describe("recordChapterEdit", () => {
	it("increments lifetimeWritten and daily chapter net on positive delta", async () => {
		const { app } = makeFakeApp({ chapters: { "ch1.md": "one two" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(app, "BookA", "ch1.md", 2, now);
		let stats = await getBookWordStats(app, "BookA", now);
		expect(stats.lifetimeWritten).toBe(2);
		expect(stats.current).toBe(2);
		expect(stats.todayNet).toBe(2);
		expect(await getChapterDaily(app, "BookA", "ch1.md", "2026-07-19")).toBe(2);

		// Grow the chapter.
		await recordChapterEdit(app, "BookA", "ch1.md", 5, now);
		stats = await getBookWordStats(app, "BookA", now);
		expect(stats.lifetimeWritten).toBe(5);
		expect(stats.todayNet).toBe(5);
		expect(await getChapterDaily(app, "BookA", "ch1.md", "2026-07-19")).toBe(5);
	});

	it("does not change lifetimeRemoved on negative mid-edit delta", async () => {
		const { app, store } = makeFakeApp({ chapters: { "ch1.md": "one two three four five" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(app, "BookA", "ch1.md", 5, now);
		store.set(`${LIBRARY_ROOT}/BookA/ch1.md`, "one two");
		await recordChapterEdit(app, "BookA", "ch1.md", 2, now);

		const stats = await getBookWordStats(app, "BookA", now);
		expect(stats.lifetimeWritten).toBe(5);
		expect(stats.lifetimeRemoved).toBe(0);
		expect(stats.todayNet).toBe(2);
		expect(stats.current).toBe(2);
	});
});

describe("recordChapterArchive / unarchive", () => {
	it("increments lifetimeRemoved on archive and restores on unarchive", async () => {
		const { app, setArchive, store } = makeFakeApp({ chapters: { "ch1.md": "alpha beta gamma" } });
		const now = new Date("2026-07-19T12:00:00Z");

		await recordChapterEdit(app, "BookA", "ch1.md", 3, now);
		setArchive(["ch1.md"]);
		await recordChapterArchive(app, "BookA", "ch1.md", 3, now);

		let stats = await getBookWordStats(app, "BookA", now);
		expect(stats.lifetimeRemoved).toBe(3);
		expect(stats.lifetimeWritten).toBe(3);
		expect(stats.current).toBe(0);

		setArchive([]);
		store.set(`${LIBRARY_ROOT}/BookA/ch1.md`, "alpha beta gamma");
		await recordChapterUnarchive(app, "BookA", "ch1.md", now);

		stats = await getBookWordStats(app, "BookA", now);
		expect(stats.lifetimeRemoved).toBe(0);
		expect(stats.current).toBe(3);
	});
});

describe("concurrent writes", () => {
	it("serialises concurrent edits for different books so neither clobbers the other", async () => {
		const store: Store = new Map();
		const folders = new Set<string>([
			LIBRARY_ROOT,
			`${LIBRARY_ROOT}/BookA`,
			`${LIBRARY_ROOT}/BookB`,
			`_sf-backstage`,
			`_sf-backstage/BookA`,
			`_sf-backstage/BookB`,
		]);
		store.set(`${LIBRARY_ROOT}/BookA/a.md`, "one");
		store.set(`${LIBRARY_ROOT}/BookB/b.md`, "one two");
		store.set(`_sf-backstage/BookA/novel.md`, "---\n---\n");
		store.set(`_sf-backstage/BookB/novel.md`, "---\n---\n");

		const frontmatterByBook: Record<string, Record<string, unknown>> = {
			BookA: { archive: [], "chapter-order": ["a.md"] },
			BookB: { archive: [], "chapter-order": ["b.md"] },
		};

		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => {
					if (folders.has(path)) return folderAt(path, store, folders);
					return fileAt(path, store);
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
					if (path === `_sf-backstage/BookA/novel.md`) return { frontmatter: frontmatterByBook.BookA };
					if (path === `_sf-backstage/BookB/novel.md`) return { frontmatter: frontmatterByBook.BookB };
					return null;
				},
			},
			fileManager: { trashFile: async () => undefined },
		} as unknown as App;

		const now = new Date("2026-07-19T12:00:00Z");
		await Promise.all([
			recordChapterEdit(app, "BookA", "a.md", 1, now),
			recordChapterEdit(app, "BookB", "b.md", 2, now),
		]);

		const statsA = await getBookWordStats(app, "BookA", now);
		const statsB = await getBookWordStats(app, "BookB", now);
		expect(statsA.current).toBe(1);
		expect(statsB.current).toBe(2);
		expect(store.has(bookWordCountFilePath("BookA"))).toBe(true);
		expect(store.has(bookWordCountFilePath("BookB"))).toBe(true);
	});
});

describe("migrateWordCountV1ToV2", () => {
	it("converts legacy shared wordcount.md into per-book v2 files and removes the legacy file", async () => {
		const store: Store = new Map();
		const folders = new Set<string>([`_sf-backstage`, `_sf-backstage/BookA`]);
		store.set(
			wordCountFilePath(),
			JSON.stringify({
				BookA: { "2026-07-18": 100, "2026-07-19": 150 },
			}),
		);

		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => {
					if (folders.has(path)) return folderAt(path, store, folders);
					return fileAt(path, store);
				},
				read: async (file: { path: string }) => store.get(file.path) ?? "",
				cachedRead: async (file: { path: string }) => store.get(file.path) ?? "",
				create: async (path: string, content: string) => {
					store.set(path, content);
					const parent = path.slice(0, path.lastIndexOf("/"));
					if (parent) folders.add(parent);
					return makeTFile(path);
				},
				modify: async (file: { path: string }, content: string) => {
					store.set(file.path, content);
				},
				createFolder: async (path: string) => {
					folders.add(path);
				},
			},
			metadataCache: { getCache: () => null },
			fileManager: {
				trashFile: async (file: { path: string }) => {
					store.delete(file.path);
				},
			},
		} as unknown as App;

		await migrateWordCountV1ToV2(app);

		expect(store.has(wordCountFilePath())).toBe(false);
		expect(store.has(bookWordCountFilePath("BookA"))).toBe(true);

		const stats = await getBookWordStats(app, "BookA", new Date("2026-07-19T12:00:00Z"));
		expect(stats.lifetimeWritten).toBe(150);
		expect(stats.daily["2026-07-18"]?.net).toBe(100);
		expect(stats.daily["2026-07-19"]?.net).toBe(50);

		const totals = totalsFromDailyNets(stats.daily);
		expect(totals["2026-07-18"]).toBe(100);
		expect(totals["2026-07-19"]).toBe(150);
	});
});
