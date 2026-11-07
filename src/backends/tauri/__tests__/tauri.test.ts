import * as fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../node-fs";
import { cleanupFixtures, copyFixture, snapshot } from "../../../../test/helpers/fixtures";
import { RustBridge, available } from "../../../../test/helpers/rustBridge";
import { ForbiddenWriteError } from "../../../core/backend/guard";
import type { Backend } from "../../../core/backend/types";
import { openProject } from "../../../core/openProject";
import { renameCodexNote } from "../../../core/linkRewriter";
import { Project } from "../../../core/project";
import { ReadOnlyProjectError, TauriBackend } from "../index";

afterEach(cleanupFixtures);
const suite = available() ? describe : describe.skip;

suite("TauriBackend over the Rust code", () => {
	it("the Rust guard is a second line of defence: a raw write to a chapter is refused", async () => {
		const root = copyFixture("series");
		const bridge = await RustBridge.open(root);
		try {
			const b = new TauriBackend(bridge.invoke);
			await expect(b.writeText("_story-library/aaa/ch-a1.md", "x")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(b.writeText("_export/x.json", "{}")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(b.writeText("_sf-backup/x.zip", "{}")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(b.rename("Codex/Jane.md", "Codex/Janet.md")).rejects.toBeInstanceOf(ForbiddenWriteError);
			await expect(b.writeTextIfUnchanged("notes/idea.md", "", "x", { op: "prose-write" })).rejects.toBeInstanceOf(ForbiddenWriteError);
			expect(fs.readFileSync(`${root}/_story-library/aaa/ch-a1.md`, "utf8")).toContain("Synthetic sentence number 1");
		} finally {
			bridge.close();
		}
	});

	it("opening a project is one scan call, with no read per file", async () => {
		const root = copyFixture("series");
		const bridge = await RustBridge.open(root);
		try {
			const calls: string[] = [];
			const b = new TauriBackend(async (cmd, args) => (calls.push(cmd), bridge.invoke(cmd, args)));
			const project = await Project.open(b);
			expect(calls).toEqual(["scan"]);
			expect(project.wordCount("_story-library/aaa/ch-a1.md")).toBeGreaterThan(0);
			expect(project.frontmatter("_story-library/series.md")).toMatchObject({ "series-title": "The Lantern Cycle" });
			// the index equals the one built from node-fs
			const viaNode = await Project.open(new NodeFsBackend(root));
			const norm = (p: Project) => p.index.all().map((e) => ({ ...e, mtimeMs: 0 })).sort((a, c) => (a.path < c.path ? -1 : 1));
			expect(norm(project)).toEqual(norm(viaNode));
		} finally {
			bridge.close();
		}
	});

	it("a project opened read-only refuses every write and still reads", async () => {
		const root = copyFixture("series");
		const bridge = await RustBridge.open(root, true);
		try {
			const b = new TauriBackend(bridge.invoke);
			await expect(b.writeText("_backstage/storyforge/x.md", "x")).rejects.toBeInstanceOf(ReadOnlyProjectError);
			await expect(b.createFile("_sf-backup/recovery/a/b.md", "x", { op: "recovery-create" })).rejects.toBeInstanceOf(ReadOnlyProjectError);
			await expect(b.createFile("_sf-backup/x.zip", new Uint8Array([1]), { op: "backup-create" })).rejects.toBeInstanceOf(ReadOnlyProjectError);
			await expect(b.retire("_backstage/storyforge/codex.md")).rejects.toBeInstanceOf(ReadOnlyProjectError);
			expect(await b.readText("Codex/Jane.md")).toContain("aliases");
		} finally {
			bridge.close();
		}
	});

	it("the whole core behaves the same over the Rust backend as over node-fs (open, save, back up, rename a Codex note)", async () => {
		const NOW = () => new Date(2026, 9, 23, 10, 0, 0);
		async function scenario(root: string, backend: Backend) {
			const opened = await openProject(root, { backend, now: NOW, projectName: "p" });
			const s = await opened.writer.open("_story-library/aaa/ch-a3.md");
			s.setBody("Typed through the prose writer.");
			await s.save();
			const note = await opened.writer.open("Codex/Sam.md");
			note.setBody("Sam, as [Jane](Jane.md) sees him.");
			await note.save();
			const result = await renameCodexNote(opened.project, "Codex/Jane.md", "Janet", { backups: opened.backups, writer: opened.writer });
			await opened.close();
			return result;
		}
		const a = copyFixture("series");
		const b = copyFixture("series");
		const bridge = await RustBridge.open(b);
		try {
			const ra = await scenario(a, new NodeFsBackend(a));
			const rb = await scenario(b, new TauriBackend(bridge.invoke));
			expect(rb.status).toBe("done");
			expect(rb.linksUpdated).toBe(ra.linksUpdated);
			const sa = snapshot(a);
			const sb = snapshot(b);
			const only = (x: Map<string, string>, y: Map<string, string>) => [...x.keys()].filter((k) => !y.has(k));
			expect({ onlyInNode: only(sa, sb), onlyInRust: only(sb, sa) }).toEqual({ onlyInNode: [], onlyInRust: [] });
			for (const [k, v] of sa) {
				if (k.endsWith(".zip")) continue; // zip bytes carry file times
				expect(sb.get(k), k).toBe(v);
			}
			expect(fs.readFileSync(`${b}/Codex/Sam.md`, "utf8")).toContain("[Janet](Janet.md)");
		} finally {
			bridge.close();
		}
	});
});
