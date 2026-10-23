import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { ForbiddenWriteError } from "../backend/guard";
import {
	CodexRenameUnavailableError,
	createCodexNote,
	reconcileMissingCodexNotes,
	renameCodexNoteFile,
	sanitizeCodexBasename,
	uniqueCodexFilename,
} from "../codex";
import { CODEX_ROOT } from "../paths";

async function codexProject(existingPaths: string[] = []) {
	const files: Record<string, string | null> = { [CODEX_ROOT]: null };
	for (const p of existingPaths) files[p] = "note";
	return memoryProject(files);
}

describe("sanitizeCodexBasename", () => {
	it("keeps a plain title", () => {
		expect(sanitizeCodexBasename("Ada Lovelace")).toBe("Ada Lovelace");
	});

	it("strips path separators and traversal", () => {
		expect(sanitizeCodexBasename("../Library/ch")).toBe("Librarych");
		expect(sanitizeCodexBasename("foo/bar.md")).toBe("foobar");
		expect(sanitizeCodexBasename("..\\outside")).toBe("outside");
	});

	it("rejects empty, dot, and double-dot names", () => {
		expect(sanitizeCodexBasename("")).toBe("");
		expect(sanitizeCodexBasename("...")).toBe("");
		expect(sanitizeCodexBasename("..")).toBe("");
		expect(sanitizeCodexBasename(".")).toBe("");
		expect(sanitizeCodexBasename("   ")).toBe("");
	});
});

describe("uniqueCodexFilename", () => {
	it("falls back to New Note when the name sanitizes to empty", async () => {
		const { project } = await codexProject();
		expect(await uniqueCodexFilename(project, "../")).toBe("New Note.md");
		expect(await uniqueCodexFilename(project, "..")).toBe("New Note.md");
	});

	it("disambiguates collisions", async () => {
		const { project } = await codexProject([`${CODEX_ROOT}/Ada.md`]);
		expect(await uniqueCodexFilename(project, "Ada")).toBe("Ada 2.md");
	});

	it("treats a name differing only by case as taken", async () => {
		const { project } = await codexProject([`${CODEX_ROOT}/Ada.md`]);
		expect(await uniqueCodexFilename(project, "ADA")).toBe("ADA 2.md");
	});

	it("reuses a name whose markdown was deleted outside the app, once the index is told", async () => {
		const { project, backend } = await codexProject([`${CODEX_ROOT}/Berwyn.md`]);
		expect(await uniqueCodexFilename(project, "Berwyn")).toBe("Berwyn 2.md");
		backend.files.delete(`${CODEX_ROOT}/Berwyn.md`);
		await project.index.applyChange({ type: "deleted", path: `${CODEX_ROOT}/Berwyn.md` });
		expect(await uniqueCodexFilename(project, "Berwyn")).toBe("Berwyn.md");
		expect(backend.writes).toEqual([]);
	});
});

describe("reconcileMissingCodexNotes", () => {
	it("never deletes or retires anything", async () => {
		const { project, backend } = await codexProject([`${CODEX_ROOT}/Kept.md`, `${CODEX_ROOT}/Gone.md`]);
		backend.files.delete(`${CODEX_ROOT}/Gone.md`);
		await project.index.applyChange({ type: "deleted", path: `${CODEX_ROOT}/Gone.md` });
		await reconcileMissingCodexNotes(project);
		expect(backend.writes.filter((w) => w.startsWith("retire"))).toEqual([]);
		expect(project.isFile(`${CODEX_ROOT}/Kept.md`)).toBe(true);
	});
});

describe("createCodexNote / renameCodexNoteFile", () => {
	it("never creates a note outside Codex/ even with a traversal filename", async () => {
		const { project, backend } = await codexProject();
		await createCodexNote(project, null, { filename: "../Library/secret.md" });
		const created = backend.writes.filter((w) => w.startsWith("createFile:")).map((w) => w.slice("createFile:".length));
		expect(created.some((p) => p.startsWith(`${CODEX_ROOT}/`))).toBe(true);
		expect(created.every((p) => p.startsWith(`${CODEX_ROOT}/`) || p.includes("codex.md"))).toBe(true);
		expect(created.some((p) => p.includes(".."))).toBe(false);
	});

	it("creates the note, registers it in codex.md, and keeps its content", async () => {
		const { project, backend, fm } = await codexProject();
		const entry = await createCodexNote(project, null, { filename: "Jane", content: "# Jane\n" });
		expect(entry.path).toBe(`${CODEX_ROOT}/Jane.md`);
		expect(backend.files.get(`${CODEX_ROOT}/Jane.md`)).toBe("# Jane\n");
		expect(fm("_backstage/storyforge/codex.md").order).toEqual([`${CODEX_ROOT}/Jane.md`]);
	});

	it("refuses a real rename with a typed error and renames nothing (link rewriting isn't built yet)", async () => {
		const { project, backend } = await codexProject([`${CODEX_ROOT}/Ada.md`]);
		const file = project.entry(`${CODEX_ROOT}/Ada.md`)!;
		await expect(renameCodexNoteFile(project, file, "Grace")).rejects.toBeInstanceOf(CodexRenameUnavailableError);
		await expect(renameCodexNoteFile(project, file, "../Library/stolen")).rejects.toBeInstanceOf(CodexRenameUnavailableError);
		expect(backend.writes).toEqual([]);
		expect(project.isFile(`${CODEX_ROOT}/Ada.md`)).toBe(true);
	});

	it("treats a blank, unchanged or self-resolving name as a no-op rather than an error", async () => {
		const { project, backend } = await codexProject([`${CODEX_ROOT}/Berwyn.md`, `${CODEX_ROOT}/Berwyn 2.md`]);
		const file = project.entry(`${CODEX_ROOT}/Berwyn 2.md`)!;
		await renameCodexNoteFile(project, file, "");
		await renameCodexNoteFile(project, file, "Berwyn 2");
		// "Berwyn" is taken by the other note, so the unique name resolves back to this note's own: nothing to rename
		await renameCodexNoteFile(project, file, "Berwyn");
		expect(backend.writes).toEqual([]);
	});

	it("the guard also refuses a Codex rename at the boundary", async () => {
		const { project } = await codexProject([`${CODEX_ROOT}/Ada.md`]);
		await expect(project.rename(`${CODEX_ROOT}/Ada.md`, `${CODEX_ROOT}/Grace.md`)).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
