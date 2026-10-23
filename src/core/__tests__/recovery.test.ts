import { afterEach, describe, expect, it } from "vitest";
import { BackendError } from "../backend/types";
import { ForbiddenWriteError } from "../backend/guard";
import { readFrontmatter, parseYamlText } from "../frontmatter";
import {
	chapterRecoveryPath, codexRecoveryPath, prunedRecoveryPath, recoverChapterText, recoverCodexText, recoverPrunedEntry, recoveryStamp, prunedRecoveryText,
} from "../recovery";
import { memoryProject } from "../../../test/helpers/memoryProject";

const NOW = new Date(2026, 0, 2, 3, 4, 5);

describe("recovery paths", () => {
	it("follow the 0.17.1 rule and the brief", () => {
		expect(recoveryStamp(NOW)).toBe("2026-01-02 030405");
		expect(chapterRecoveryPath("ABC", "Chapter 1", NOW)).toBe("_sf-backup/recovery/ABC/Chapter 1 2026-01-02 030405.md");
		expect(chapterRecoveryPath("ABC", "Chapter 1", NOW, 3)).toBe("_sf-backup/recovery/ABC/Chapter 1 2026-01-02 030405 3.md");
		expect(codexRecoveryPath("Jane", NOW)).toBe("_sf-backup/recovery/_codex/Jane 2026-01-02 030405.md");
		expect(prunedRecoveryPath("_codex", "Jane", NOW)).toBe("_sf-backup/recovery/_pruned/_codex/Jane 2026-01-02 030405.md");
		expect(chapterRecoveryPath("ABC", 'a/b:c?"', NOW)).toBe("_sf-backup/recovery/ABC/a-b-c-- 2026-01-02 030405.md");
	});
});

describe("recovery files", () => {
	it("store the text exactly, return the path, and never overwrite", async () => {
		const { project, backend } = await memoryProject({ "_story-library/ABC/c.md": "x" });
		const text = "line one\r\n\r\nline two  \n";
		const a = await recoverChapterText(project, "ABC", "c", text, NOW);
		const b = await recoverChapterText(project, "ABC", "c", "second", NOW);
		const c = await recoverChapterText(project, "ABC", "c", "third", NOW);
		expect([a, b, c].map((r) => r.ok && r.path)).toEqual([
			"_sf-backup/recovery/ABC/c 2026-01-02 030405.md",
			"_sf-backup/recovery/ABC/c 2026-01-02 030405 2.md",
			"_sf-backup/recovery/ABC/c 2026-01-02 030405 3.md",
		]);
		expect(backend.files.get("_sf-backup/recovery/ABC/c 2026-01-02 030405.md")).toBe(text);
		expect(project.exists("_sf-backup/recovery/ABC/c 2026-01-02 030405 3.md")).toBe(true);
	});

	it("Codex text goes under _codex", async () => {
		const { project, backend } = await memoryProject({ "Codex/Jane.md": "x" });
		const r = await recoverCodexText(project, "Jane", "body", NOW);
		expect(r).toEqual({ ok: true, path: "_sf-backup/recovery/_codex/Jane 2026-01-02 030405.md" });
		expect(backend.files.get((r as { path: string }).path)).toBe("body");
	});

	it("reports a failed write and leaves nothing behind", async () => {
		const { project, backend } = await memoryProject();
		backend.createFile = async () => {
			throw new BackendError("EACCES", "read-only", "x");
		};
		const r = await recoverChapterText(project, "ABC", "c", "text", NOW);
		expect(r.ok).toBe(false);
		expect([...backend.files.keys()]).toEqual([]);
	});

	it("is only ever a create: the guard refuses an overwrite through any other route", async () => {
		const { project } = await memoryProject();
		await recoverChapterText(project, "ABC", "c", "text", NOW);
		await expect(project.writeText("_sf-backup/recovery/ABC/c 2026-01-02 030405.md", "new")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.rename("_sf-backup/recovery/ABC/c 2026-01-02 030405.md", "_sf-backup/recovery/ABC/d.md")).rejects.toBeInstanceOf(ForbiddenWriteError);
	});

	it("pruned files are readable YAML of exactly what was removed, with a one-line heading", async () => {
		const { project, backend } = await memoryProject();
		const record = {
			scope: "ABC", name: "Gone.md", source: "_backstage/storyforge/ABC/novel.md", reason: "the chapter file is gone and no match was found",
			data: { chapter: "Gone.md", "chapter-title": "A Title: with colon", tags: ["x", "y"], pov: null },
		};
		const r = await recoverPrunedEntry(project, record, NOW);
		expect(r).toEqual({ ok: true, path: "_sf-backup/recovery/_pruned/ABC/Gone 2026-01-02 030405.md" });
		const text = backend.files.get((r as { path: string }).path) as string;
		expect(text.split("\n")[0]).toBe("# Pruned from _backstage/storyforge/ABC/novel.md: Gone.md (the chapter file is gone and no match was found) at 2026-01-02 030405");
		expect(parseYamlText(text)).toEqual(record.data);
		expect(readFrontmatter(prunedRecoveryText({ ...record, data: {} }, NOW)).state).toBe("none");
	});
});
