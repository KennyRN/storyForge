import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
	archiveNotesItem,
	collectArchivedNotes,
	collectNotesPaths,
	createNotesNote,
	firstFilePathInNotesTree,
	formatIdeaNoteBasename,
	ideaNoteSequenceLetter,
	moveNotesItem,
	nextIdeaNoteBasename,
	notesTreeContainsPath,
	parseIdeaNoteChapterTitle,
	getNotesView,
	resolveSelectedNotesPath,
	sanitizeNotesBasename,
	unarchiveNotesNote,
	reorderArchivedNotes,
	uniqueNotesFilename,
} from "../notes";
import { isNotesArchiveNotePath, isNotesNotePath, NOTES_ARCHIVE_ROOT, NOTES_ROOT, notesFilePath } from "../paths";
import { BACKSTAGE_ROOT } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

function fakeNotesApp(existingPaths: string[] = []): {
	app: App;
	created: string[];
	renamed: Array<[string, string]>;
} {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Map<string, ReturnType<typeof makeTFolder>>();
	folders.set(NOTES_ROOT, makeTFolder(NOTES_ROOT));
	folders.set(BACKSTAGE_ROOT, makeTFolder(BACKSTAGE_ROOT));
	folders.set("_backstage", makeTFolder("_backstage"));
	const notesMeta = notesFilePath();
	files.set(notesMeta, makeTFile(notesMeta));
	const created: string[] = [];
	const renamed: Array<[string, string]> = [];
	const notesFm: Record<string, unknown> = { folders: {}, order: [], types: {} };

	function refreshChildren(): void {
		const root = folders.get(NOTES_ROOT);
		if (root) {
			root.children = [...files.values()].filter((file) => isNotesNotePath(file.path));
			const archive = folders.get(NOTES_ARCHIVE_ROOT);
			if (archive) root.children.push(archive);
		}
		const archive = folders.get(NOTES_ARCHIVE_ROOT);
		if (archive) {
			archive.children = [...files.values()].filter((file) => isNotesArchiveNotePath(file.path));
		}
	}

	for (const path of existingPaths) {
		if (path === NOTES_ARCHIVE_ROOT || path.startsWith(`${NOTES_ARCHIVE_ROOT}/`)) {
			if (!folders.has(NOTES_ARCHIVE_ROOT)) folders.set(NOTES_ARCHIVE_ROOT, makeTFolder(NOTES_ARCHIVE_ROOT));
		}
		if (path.toLowerCase().endsWith(".md")) files.set(path, makeTFile(path));
		else folders.set(path, makeTFolder(path));
	}
	refreshChildren();

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => folders.get(path) ?? files.get(path) ?? null,
			createFolder: async (path: string) => {
				folders.set(path, makeTFolder(path));
				refreshChildren();
			},
			create: async (path: string) => {
				created.push(path);
				const file = makeTFile(path);
				files.set(path, file);
				refreshChildren();
				return file;
			},
		},
		metadataCache: {
			getCache: (path: string) => (path === notesMeta ? { frontmatter: notesFm } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === notesMeta) fn(notesFm);
			},
			renameFile: async (file: { path: string }, dest: string) => {
				renamed.push([file.path, dest]);
				files.delete(file.path);
				const next = makeTFile(dest);
				file.path = dest;
				Object.assign(file, next);
				files.set(dest, file as ReturnType<typeof makeTFile>);
				refreshChildren();
			},
		},
	} as unknown as App;
	return { app, created, renamed };
}

describe("isNotesNotePath / isNotesArchiveNotePath", () => {
	it("accepts only flat notes/*.md and excludes archive/", () => {
		expect(isNotesNotePath("notes/idea.md")).toBe(true);
		expect(isNotesNotePath("notes/archive/old.md")).toBe(false);
		expect(isNotesNotePath("notes/nested/idea.md")).toBe(false);
		expect(isNotesArchiveNotePath("notes/archive/old.md")).toBe(true);
		expect(isNotesArchiveNotePath("notes/idea.md")).toBe(false);
		expect(isNotesArchiveNotePath("notes/archive/nested/old.md")).toBe(false);
	});
});

describe("sanitizeNotesBasename / uniqueNotesFilename / formatIdeaNoteBasename", () => {
	it("strips path-unsafe characters from titles", () => {
		expect(sanitizeNotesBasename("Chapter: 1")).toBe("Chapter 1");
		expect(sanitizeNotesBasename("../secret.md")).toBe("secret");
	});

	it("uses the centre-pane title with no date or time", () => {
		expect(formatIdeaNoteBasename("Chapter 1")).toBe("Chapter 1");
		expect(formatIdeaNoteBasename("")).toBe("Untitled");
	});

	it("disambiguates collisions under notes/", () => {
		const { app } = fakeNotesApp(["notes/2026-09-02 16-04 - Chapter 1.md"]);
		expect(uniqueNotesFilename(app, "2026-09-02 16-04 - Chapter 1")).toBe(
			"2026-09-02 16-04 - Chapter 1 2.md",
		);
	});
});

describe("nextIdeaNoteBasename", () => {
	it("keeps the centre-pane name for the first page about a chapter", () => {
		const { app } = fakeNotesApp();
		expect(nextIdeaNoteBasename(app, "Chapter 1")).toBe("Chapter 1");
	});

	it("letters further pages about the same chapter b, c, … then aa", () => {
		expect(ideaNoteSequenceLetter(1)).toBe("b");
		expect(ideaNoteSequenceLetter(25)).toBe("z");
		expect(ideaNoteSequenceLetter(26)).toBe("aa");
		expect(parseIdeaNoteChapterTitle("Chapter 1 b")).toEqual({
			title: "Chapter 1",
			letter: "b",
		});
		const { app } = fakeNotesApp(["notes/Chapter 1.md"]);
		expect(nextIdeaNoteBasename(app, "Chapter 1")).toBe("Chapter 1 b");
		const second = fakeNotesApp(["notes/Chapter 1.md", "notes/Chapter 1 b.md"]);
		expect(nextIdeaNoteBasename(second.app, "Chapter 1")).toBe("Chapter 1 c");
	});

	it("still groups older timestamped pages under the same chapter title", () => {
		const { app } = fakeNotesApp(["notes/2026-09-02 15-00 - Chapter 1.md"]);
		expect(nextIdeaNoteBasename(app, "Chapter 1")).toBe("Chapter 1 b");
	});

	it("restores the unlettered name if the first page was removed", () => {
		const { app } = fakeNotesApp(["notes/Chapter 1 b.md"]);
		expect(nextIdeaNoteBasename(app, "Chapter 1")).toBe("Chapter 1");
	});
});

describe("firstFilePathInNotesTree / resolveSelectedNotesPath", () => {
	it("returns the first file in display order, walking into folders", () => {
		expect(
			firstFilePathInNotesTree({
				type: "folder",
				id: "root",
				name: "Ideas",
				children: [
					{ type: "folder", id: "f", name: "Folder", children: [{ type: "file", name: "Inside", path: "notes/inside.md" }] },
					{ type: "file", name: "Root", path: "notes/root.md" },
				],
			}),
		).toBe("notes/inside.md");
	});

	it("keeps a still-visible selection and falls back to the topmost note", () => {
		const { app } = fakeNotesApp(["notes/alpha.md", "notes/beta.md"]);
		expect(resolveSelectedNotesPath(app, null)).toBe("notes/alpha.md");
		expect(resolveSelectedNotesPath(app, "notes/beta.md")).toBe("notes/beta.md");
		expect(resolveSelectedNotesPath(app, "notes/gone.md")).toBe("notes/alpha.md");
		expect(notesTreeContainsPath(null, "notes/alpha.md")).toBe(false);
	});
});

describe("collectNotesPaths ignores archive/", () => {
	it("lists only flat notes and not archived files", () => {
		const { app } = fakeNotesApp(["notes/live.md", "notes/archive/old.md"]);
		expect(collectNotesPaths(app)).toEqual(["notes/live.md"]);
		expect(collectArchivedNotes(app).map((n) => n.path)).toEqual(["notes/archive/old.md"]);
	});
});

describe("archive / unarchive moves files into notes/archive/", () => {
	it("moves a note into archive and back, never listing archive in the shelf", async () => {
		const { app, renamed } = fakeNotesApp(["notes/spark.md"]);
		await archiveNotesItem(app, "notes/spark.md");
		expect(renamed).toEqual([["notes/spark.md", "notes/archive/spark.md"]]);
		expect(collectNotesPaths(app)).toEqual([]);
		expect(collectArchivedNotes(app).map((n) => n.path)).toEqual(["notes/archive/spark.md"]);

		await unarchiveNotesNote(app, "notes/archive/spark.md");
		expect(collectNotesPaths(app)).toEqual(["notes/spark.md"]);
		expect(collectArchivedNotes(app)).toEqual([]);
	});

	it("reorders archived notes by the persisted archive list", async () => {
		const { app } = fakeNotesApp(["notes/a.md", "notes/b.md"]);
		await archiveNotesItem(app, "notes/a.md");
		await archiveNotesItem(app, "notes/b.md");
		expect(collectArchivedNotes(app).map((n) => n.path)).toEqual([
			"notes/archive/a.md",
			"notes/archive/b.md",
		]);
		await reorderArchivedNotes(app, ["notes/archive/b.md", "notes/archive/a.md"]);
		expect(collectArchivedNotes(app).map((n) => n.path)).toEqual([
			"notes/archive/b.md",
			"notes/archive/a.md",
		]);
	});

	it("never creates a note outside notes/ even with a traversal filename", async () => {
		const { app, created } = fakeNotesApp();
		await createNotesNote(app, null, { filename: "../Library/secret.md" });
		expect(created.filter((p) => p.startsWith(`${NOTES_ROOT}/`)).length).toBeGreaterThan(0);
		expect(created.some((p) => p.includes(".."))).toBe(false);
	});
});

describe("moveNotesItem", () => {
	it("reorders on the first drop even when metadataCache is still stale", async () => {
		const { app } = fakeNotesApp();
		await createNotesNote(app, null, { filename: "a.md" });
		await createNotesNote(app, null, { filename: "b.md" });
		await createNotesNote(app, null, { filename: "c.md" });
		await moveNotesItem(app, "notes/a.md", "file", null, null);
		const cache = app.metadataCache.getCache(notesFilePath());
		const stale = cache?.frontmatter as { order?: string[] } | undefined;
		if (stale) stale.order = ["notes/a.md", "notes/b.md", "notes/c.md"];
		const tree = getNotesView(app);
		expect(tree?.children.map((child) => (child.type === "file" ? child.path : child.id))).toEqual([
			"notes/b.md",
			"notes/c.md",
			"notes/a.md",
		]);
		expect(firstFilePathInNotesTree(tree)).toBe("notes/b.md");
	});
});
