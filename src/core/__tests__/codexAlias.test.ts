import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { ForbiddenWriteError } from "../backend/guard";
import { addCodexNoteAlias } from "../codex";

async function aliasProject(path: string, initial: Record<string, unknown> | null = {}) {
	return memoryProject({ [path]: initial === null ? "no frontmatter\n" : fmFile(initial, "Body of the note.\n") });
}

describe("addCodexNoteAlias", () => {
	it("appends a new alias and keeps the other keys and the body", async () => {
		const { project, fm, backend } = await aliasProject("Codex/Arsenal.md", { book: "TECa" });
		await addCodexNoteAlias(project, "Codex/Arsenal.md", "The Gunners");
		expect(fm("Codex/Arsenal.md").aliases).toEqual(["The Gunners"]);
		expect(fm("Codex/Arsenal.md").book).toBe("TECa");
		expect(backend.files.get("Codex/Arsenal.md")).toContain("Body of the note.\n");
		expect(backend.writes).toEqual(["writeText:Codex/Arsenal.md"]);
	});

	it("skips a duplicate alias case-insensitively (and writes nothing)", async () => {
		const { project, fm, backend } = await aliasProject("Codex/Arsenal.md", { aliases: ["The Gunners"] });
		await addCodexNoteAlias(project, "Codex/Arsenal.md", "the gunners");
		expect(fm("Codex/Arsenal.md").aliases).toEqual(["The Gunners"]);
		expect(backend.writes).toEqual([]);
	});

	it("skips an alias that matches the file basename", async () => {
		const { project, fm, backend } = await aliasProject("Codex/Arsenal.md");
		await addCodexNoteAlias(project, "Codex/Arsenal.md", "Arsenal");
		expect(fm("Codex/Arsenal.md").aliases).toBeUndefined();
		expect(backend.writes).toEqual([]);
	});

	it("no-ops on a blank alias without writing", async () => {
		const { project, backend } = await aliasProject("Codex/Arsenal.md");
		await addCodexNoteAlias(project, "Codex/Arsenal.md", "   ");
		expect(backend.writes).toEqual([]);
	});

	it("refuses non-Codex paths and writes nothing", async () => {
		const { project, backend } = await aliasProject("notes/Jane.md");
		await expect(addCodexNoteAlias(project, "notes/Jane.md", "The Gunners")).rejects.toBeInstanceOf(ForbiddenWriteError);
		expect(backend.writes).toEqual([]);
	});

	it("adds a frontmatter block to a note that has none", async () => {
		const { project, backend } = await aliasProject("Codex/Plain.md", null);
		await addCodexNoteAlias(project, "Codex/Plain.md", "Nick");
		expect(backend.files.get("Codex/Plain.md")).toBe("---\naliases:\n  - Nick\n---\nno frontmatter\n");
	});
});
