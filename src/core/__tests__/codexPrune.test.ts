import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { pruneMissingCodexNotes, readCodexFrontmatter, rekeyCodexNotePath, stripMissingCodexNoteRefs } from "../codex";
import { codexFilePath } from "../paths";

describe("stripMissingCodexNoteRefs", () => {
	it("removes gone files from root order, nested order, archive, types, and linkedNotePath", () => {
		const folders = {
			characters: {
				name: "Characters",
				order: ["Codex/Jane.md", "Codex/Gone.md"],
				linkedNotePath: "Codex/Crew.md",
			},
		};
		const next = stripMissingCodexNoteRefs(
			folders,
			["characters", "Codex/Gone.md", "Codex/Kept.md"],
			["Codex/ArchivedGone.md", "Codex/ArchivedKept.md"],
			{ "Codex/Jane.md": "person", "Codex/Gone.md": "place" },
			(path) => path === "Codex/Jane.md" || path === "Codex/Kept.md" || path === "Codex/ArchivedKept.md",
		);
		expect(next.order).toEqual(["characters", "Codex/Kept.md"]);
		expect(next.folders.characters.order).toEqual(["Codex/Jane.md"]);
		expect(next.folders.characters.linkedNotePath).toBeUndefined();
		expect(next.archive).toEqual(["Codex/ArchivedKept.md"]);
		expect(next.types).toEqual({ "Codex/Jane.md": "person" });
	});

	it("keeps virtual folder ids even when they have no remaining files", () => {
		const next = stripMissingCodexNoteRefs({ empty: { name: "Empty", order: ["Codex/Gone.md"] } }, ["empty"], [], {}, () => false);
		expect(next.order).toEqual(["empty"]);
		expect(next.folders.empty.order).toEqual([]);
	});
});

async function codexOrderProject(existingNotePaths: string[], initialFm: Record<string, unknown>) {
	const files: Record<string, string | null> = { Codex: null, [codexFilePath()]: fmFile(initialFm) };
	for (const p of existingNotePaths) files[p] = "note";
	return memoryProject(files);
}

describe("pruneMissingCodexNotes", () => {
	it("writes the stripped order back to codex.md", async () => {
		const { project, fm } = await codexOrderProject(["Codex/Kept.md"], {
			folders: {},
			order: ["Codex/Kept.md", "Codex/Gone.md"],
			archive: [],
			types: { "Codex/Kept.md": "person", "Codex/Gone.md": "place" },
		});
		expect(await pruneMissingCodexNotes(project)).toBe(true);
		expect(fm(codexFilePath()).order).toEqual(["Codex/Kept.md"]);
		expect(fm(codexFilePath()).types).toEqual({ "Codex/Kept.md": "person" });
		expect(readCodexFrontmatter(project).order).toEqual(["Codex/Kept.md"]);
	});

	it("no-ops (and writes nothing) when every referenced note still exists", async () => {
		const { project, backend } = await codexOrderProject(["Codex/Kept.md"], {
			folders: {},
			order: ["Codex/Kept.md"],
			archive: [],
			types: { "Codex/Kept.md": "person" },
		});
		const before = backend.files.get(codexFilePath());
		backend.writes.length = 0;
		expect(await pruneMissingCodexNotes(project)).toBe(false);
		expect(backend.files.get(codexFilePath())).toBe(before);
		expect(backend.writes).toEqual([]);
	});

	it("strips notes deleted outside the app once the index is told", async () => {
		const { project, backend, fm } = await codexOrderProject(["Codex/Kept.md", "Codex/Gone.md"], {
			folders: {},
			order: ["Codex/Kept.md", "Codex/Gone.md"],
			archive: [],
			types: { "Codex/Kept.md": "person", "Codex/Gone.md": "place" },
		});
		backend.files.delete("Codex/Gone.md");
		await project.index.applyChange({ type: "deleted", path: "Codex/Gone.md" });
		expect(await pruneMissingCodexNotes(project)).toBe(true);
		expect(fm(codexFilePath()).order).toEqual(["Codex/Kept.md"]);
		expect(fm(codexFilePath()).types).toEqual({ "Codex/Kept.md": "person" });
	});

	it("keeps unknown keys, in codex.md and inside folder entries, when it rewrites", async () => {
		const { project, backend, fm } = await codexOrderProject(["Codex/Kept.md"], {
			folders: { f1: { name: "Cast", order: ["Codex/Kept.md", "Codex/Gone.md"], "x-folder-unknown": "keep me" } },
			order: ["f1"],
			archive: [],
			types: {},
			"x-top-unknown": { a: 1 },
		});
		await pruneMissingCodexNotes(project);
		expect(fm(codexFilePath())["x-top-unknown"]).toEqual({ a: 1 });
		expect((fm(codexFilePath()).folders as Record<string, Record<string, unknown>>).f1).toEqual({
			name: "Cast",
			order: ["Codex/Kept.md"],
			"x-folder-unknown": "keep me",
		});
		expect(backend.files.get(codexFilePath())).toContain("x-folder-unknown: keep me");
	});
});

describe("rekeyCodexNotePath", () => {
	it("strips a deleted note from order and types", async () => {
		const { project, fm } = await codexOrderProject(["Codex/Kept.md"], {
			folders: { characters: { name: "Characters", order: ["Codex/Jane.md", "Codex/Kept.md"] } },
			order: ["characters", "Codex/Jane.md"],
			archive: ["Codex/Jane.md"],
			types: { "Codex/Jane.md": "person", "Codex/Kept.md": "person" },
		});
		await rekeyCodexNotePath(project, "Codex/Jane.md", null);
		expect(fm(codexFilePath()).order).toEqual(["characters"]);
		expect((fm(codexFilePath()).folders as { characters: { order: string[] } }).characters.order).toEqual(["Codex/Kept.md"]);
		expect(fm(codexFilePath()).archive).toEqual([]);
		expect(fm(codexFilePath()).types).toEqual({ "Codex/Kept.md": "person" });
	});

	it("rekeys a renamed note everywhere it is referenced", async () => {
		const { project, fm } = await codexOrderProject(["Codex/Janet.md"], {
			folders: { f: { name: "F", order: ["Codex/Jane.md"], linkedNotePath: "Codex/Jane.md" } },
			order: ["f", "Codex/Jane.md"],
			archive: ["Codex/Jane.md"],
			types: { "Codex/Jane.md": "person" },
		});
		await rekeyCodexNotePath(project, "Codex/Jane.md", "Codex/Janet.md");
		const data = fm(codexFilePath());
		expect(data.order).toEqual(["f", "Codex/Janet.md"]);
		expect(data.archive).toEqual(["Codex/Janet.md"]);
		expect(data.types).toEqual({ "Codex/Janet.md": "person" });
		expect(data.folders).toEqual({ f: { name: "F", order: ["Codex/Janet.md"], linkedNotePath: "Codex/Janet.md" } });
	});
});
