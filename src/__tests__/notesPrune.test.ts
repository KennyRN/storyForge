import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { pruneMissingNotesNotes, readNotesFrontmatter, rekeyNotesNotePath } from "../notes";
import { NOTES_ROOT, BACKSTAGE_ROOT, notesFilePath } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

function fakeNotesOrderApp(existingNotePaths: string[], initialFm: Record<string, unknown>) {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Map<string, ReturnType<typeof makeTFolder>>();
	folders.set(NOTES_ROOT, makeTFolder(NOTES_ROOT));
	folders.set(BACKSTAGE_ROOT, makeTFolder(BACKSTAGE_ROOT));
	folders.set("_backstage", makeTFolder("_backstage"));
	const meta = notesFilePath();
	files.set(meta, makeTFile(meta));
	for (const path of existingNotePaths) {
		const parent = path.slice(0, path.lastIndexOf("/"));
		if (parent && !folders.has(parent)) folders.set(parent, makeTFolder(parent));
		files.set(path, makeTFile(path));
	}
	const frontmatter: Record<string, unknown> = { ...initialFm };

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => folders.get(path) ?? files.get(path) ?? null,
			createFolder: async () => undefined,
			create: async (path: string) => {
				const file = makeTFile(path);
				files.set(path, file);
				return file;
			},
		},
		metadataCache: {
			getCache: (path: string) => (path === meta ? { frontmatter } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === meta) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter };
}

describe("pruneMissingNotesNotes", () => {
	it("writes the stripped order and archive back to notes.md", async () => {
		const { app, frontmatter } = fakeNotesOrderApp(["notes/Kept.md", "notes/archive/ArchivedKept.md"], {
			folders: {},
			order: ["notes/Kept.md", "notes/Gone.md"],
			archive: ["notes/archive/ArchivedKept.md", "notes/archive/ArchivedGone.md"],
			types: { "notes/Kept.md": "idea", "notes/Gone.md": "scene" },
		});
		expect(await pruneMissingNotesNotes(app)).toBe(true);
		expect(frontmatter.order).toEqual(["notes/Kept.md"]);
		expect(frontmatter.archive).toEqual(["notes/archive/ArchivedKept.md"]);
		expect(frontmatter.types).toEqual({ "notes/Kept.md": "idea" });
		expect(readNotesFrontmatter(app).order).toEqual(["notes/Kept.md"]);
		expect(readNotesFrontmatter(app).archive).toEqual(["notes/archive/ArchivedKept.md"]);
	});

	it("no-ops when every referenced note still exists", async () => {
		const { app, frontmatter } = fakeNotesOrderApp(["notes/Kept.md"], {
			folders: {},
			order: ["notes/Kept.md"],
			archive: [],
			types: { "notes/Kept.md": "idea" },
		});
		const before = JSON.stringify(frontmatter);
		expect(await pruneMissingNotesNotes(app)).toBe(false);
		expect(JSON.stringify(frontmatter)).toBe(before);
	});
});

describe("rekeyNotesNotePath", () => {
	it("strips a deleted live note from order and types", async () => {
		const { app, frontmatter } = fakeNotesOrderApp(["notes/Kept.md"], {
			folders: { sparks: { name: "Sparks", order: ["notes/Idea.md", "notes/Kept.md"] } },
			order: ["sparks", "notes/Idea.md"],
			archive: [],
			types: { "notes/Idea.md": "idea", "notes/Kept.md": "scene" },
		});
		await rekeyNotesNotePath(app, "notes/Idea.md", null);
		expect(frontmatter.order).toEqual(["sparks"]);
		expect((frontmatter.folders as { sparks: { order: string[] } }).sparks.order).toEqual(["notes/Kept.md"]);
		expect(frontmatter.types).toEqual({ "notes/Kept.md": "scene" });
	});

	it("strips a deleted archived note from the archive list", async () => {
		const { app, frontmatter } = fakeNotesOrderApp(["notes/archive/Kept.md"], {
			folders: {},
			order: [],
			archive: ["notes/archive/Gone.md", "notes/archive/Kept.md"],
			types: { "notes/archive/Gone.md": "idea" },
		});
		await rekeyNotesNotePath(app, "notes/archive/Gone.md", null);
		expect(frontmatter.archive).toEqual(["notes/archive/Kept.md"]);
		expect(frontmatter.types).toEqual({});
	});

	it("rekeys an archived path when the archived file is renamed", async () => {
		const { app, frontmatter } = fakeNotesOrderApp(["notes/archive/New.md"], {
			folders: {},
			order: [],
			archive: ["notes/archive/Old.md"],
			types: { "notes/archive/Old.md": "idea" },
		});
		await rekeyNotesNotePath(app, "notes/archive/Old.md", "notes/archive/New.md");
		expect(frontmatter.archive).toEqual(["notes/archive/New.md"]);
		expect(frontmatter.types).toEqual({ "notes/archive/New.md": "idea" });
	});
});
