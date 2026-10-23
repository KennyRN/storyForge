import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture } from "../../../test/helpers/fixtures";
import { ManualScheduler } from "../../../test/helpers/scheduler";
import { readBookFrontmatter } from "../../core/book";
import { Project } from "../../core/project";
import { ProseWriter } from "../../core/proseWriter";
import { applyBatch, diffAgainstDisk } from "../applyBatch";

afterEach(cleanupFixtures);

const A = "_story-library/aaa";
async function setup() {
	const root = copyFixture("series");
	const project = await Project.open(new NodeFsBackend(root));
	const writer = new ProseWriter(project, { scheduler: new ManualScheduler(), now: () => new Date(2026, 9, 23, 10, 0, 0), builtinSubscribers: true });
	const mv = (from: string, to: string) => {
		fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
		fs.renameSync(path.join(root, from), path.join(root, to));
	};
	const rd = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
	return { root, project, writer, target: { project, writer }, mv, rd };
}

describe("applyBatch", () => {
	it("an echo of the app's own write is ignored: no hook, no reconciliation", async () => {
		const { target, writer, project } = await setup();
		const s = await writer.open(`${A}/ch-a3.md`);
		s.setBody("Our own words.");
		await s.save();
		const sidecarBefore = project.index.get("_backstage/storyforge/aaa/chapters/ch-a3.md")?.hash;
		const r = await applyBatch(target, { rescan: false, paths: [`${A}/ch-a3.md`, "_backstage/storyforge/aaa/chapters/ch-a3.md", "_backstage/storyforge/aaa/wordcount.md", A] });
		expect(r.echoes.sort()).toEqual(["_backstage/storyforge/aaa/chapters/ch-a3.md", "_backstage/storyforge/aaa/wordcount.md", `${A}/ch-a3.md`].sort());
		expect(r.changed).toEqual([]);
		expect(r.reconciliation).toBeNull();
		expect(r.errors).toEqual([]);
		expect(project.index.get("_backstage/storyforge/aaa/chapters/ch-a3.md")?.hash).toBe(sidecarBefore);
	});

	it("a rename made outside is matched using the evidence captured before the index changed", async () => {
		const { target, mv, project } = await setup();
		mv(`${A}/ch-a2.md`, `${A}/Second.md`);
		const r = await applyBatch(target, { rescan: false, paths: [A, `${A}/ch-a2.md`, `${A}/Second.md`] });
		expect(r.vanished).toEqual([`${A}/ch-a2.md`]);
		expect(r.appeared).toEqual([`${A}/Second.md`]);
		expect(r.reconciliation?.matched).toEqual([{ kind: "chapter", tier: 1, from: `${A}/ch-a2.md`, to: `${A}/Second.md` }]);
		expect(r.reconciliation?.pruned).toEqual([]);
		expect(readBookFrontmatter(project, "aaa")!.chapterOrder).toEqual(["ch-a1.md", "Second.md", "ch-a5.md"]);
		expect(readBookFrontmatter(project, "aaa")!.chapters["Second.md"].chapterId).toBe("c-a2m8");
	});

	it("a burst of changes is applied as one change set", async () => {
		const { target, mv, project, root } = await setup();
		mv(`${A}/ch-a2.md`, `${A}/Second.md`);
		mv("Codex/Sam.md", "Codex/Samuel.md");
		fs.writeFileSync(path.join(root, `${A}/brand-new.md`), "A new chapter, written in Obsidian.\n");
		fs.rmSync(path.join(root, `${A}/ch-a3.md`));
		const r = await applyBatch(target, { rescan: false, paths: [`${A}/ch-a2.md`, `${A}/Second.md`, "Codex/Sam.md", "Codex/Samuel.md", `${A}/brand-new.md`, `${A}/ch-a3.md`, A, "Codex"] });
		expect(r.reconciliation?.matched.map((m) => m.to).sort()).toEqual(["Codex/Samuel.md", `${A}/Second.md`]);
		expect(r.reconciliation?.pruned.map((p) => p.path)).toEqual([`${A}/ch-a3.md`]);
		expect(r.reconciliation?.added).toEqual([`${A}/brand-new.md`]);
		expect(Object.keys(readBookFrontmatter(project, "aaa")!.chapters).sort()).toEqual(["Second.md", "brand-new.md", "ch-a1.md", "ch-a4.md", "ch-a5.md"]);
	});

	it("a book folder moved in Finder arrives as a folder plus its files and is matched as a book rename", async () => {
		const { target, mv, project } = await setup();
		mv(A, "_story-library/zzz");
		const paths = [A, "_story-library/zzz", ...["ch-a1", "ch-a2", "ch-a3", "ch-a4", "ch-a5"].flatMap((c) => [`${A}/${c}.md`, `_story-library/zzz/${c}.md`])];
		const r = await applyBatch(target, { rescan: false, paths });
		expect(r.reconciliation?.matched).toEqual([{ kind: "book", tier: "folder", from: A, to: "_story-library/zzz" }]);
		expect(r.reconciliation?.pruned).toEqual([]);
		expect(readBookFrontmatter(project, "zzz")!.chapterOrder).toEqual(["ch-a1.md", "ch-a2.md", "ch-a5.md"]);
	});

	it("an existing chapter changed in Obsidian reloads an open editor (recovering unsaved text first), or runs the hook when none is open", async () => {
		const { target, writer, root, rd } = await setup();
		const open = await writer.open(`${A}/ch-a3.md`);
		open.setBody("Unsaved words in the app.");
		fs.writeFileSync(path.join(root, `${A}/ch-a3.md`), "Changed in Obsidian.\n");
		fs.writeFileSync(path.join(root, `${A}/ch-a2.md`), "Opening by Obsidian.\n\nClosing by Obsidian.\n");
		const r = await applyBatch(target, { rescan: false, paths: [`${A}/ch-a3.md`, `${A}/ch-a2.md`] });
		expect(r.changed.sort()).toEqual([`${A}/ch-a2.md`, `${A}/ch-a3.md`]);
		const kinds = Object.fromEntries(r.diskChanges.map((d) => [d.path, d.result.kind]));
		expect(kinds).toEqual({ [`${A}/ch-a3.md`]: "recovered-and-reloaded", [`${A}/ch-a2.md`]: "no-session" });
		expect(open.body).toBe("Changed in Obsidian.");
		const recovery = fs.readdirSync(path.join(root, "_sf-backup/recovery/aaa"));
		expect(recovery).toHaveLength(1);
		expect(rd(`_sf-backup/recovery/aaa/${recovery[0]}`)).toBe("Unsaved words in the app.");
		expect(rd("_backstage/storyforge/aaa/chapters/ch-a2.md")).toContain("## opening\nOpening by Obsidian.");
	});

	it("an iCloud stub becoming its real file is the same file changing state, never a rename", async () => {
		const { target, project, root } = await setup();
		// the file is evicted: its stub replaces it
		fs.rmSync(path.join(root, `${A}/ch-a2.md`));
		fs.writeFileSync(path.join(root, `${A}/.ch-a2.md.icloud`), "stub");
		let r = await applyBatch(target, { rescan: false, paths: [`${A}/.ch-a2.md.icloud`, `${A}/ch-a2.md`] });
		expect(project.isPlaceholder(`${A}/ch-a2.md`)).toBe(true); // evicted: present, not downloaded
		expect(r.reconciliation?.pruned ?? []).toEqual([]); // a gated book: nothing is pruned
		// it downloads: the stub goes, the real file comes back
		fs.rmSync(path.join(root, `${A}/.ch-a2.md.icloud`));
		fs.writeFileSync(path.join(root, `${A}/ch-a2.md`), "Opening line of a second chapter %%a hidden comment%% continues here.\n\nIt ends.\n");
		r = await applyBatch(target, { rescan: false, paths: [`${A}/.ch-a2.md.icloud`, `${A}/ch-a2.md`] });
		expect(project.isPlaceholder(`${A}/ch-a2.md`)).toBe(false);
		expect(project.isFile(`${A}/ch-a2.md`)).toBe(true);
		expect(r.errors).toEqual([]);
		expect(readBookFrontmatter(project, "aaa")!.chapters["ch-a2.md"].chapterId).toBe("c-a2m8");
	});

	it("a stub that appears marks the file as present-but-not-downloaded", async () => {
		const { target, project, root } = await setup();
		fs.writeFileSync(path.join(root, "notes/.later.md.icloud"), "stub");
		const r = await applyBatch(target, { rescan: false, paths: ["notes/.later.md.icloud"] });
		expect(project.isPlaceholder("notes/later.md")).toBe(true);
		expect(r.stateChanges).toEqual(["notes/later.md"]);
		expect(r.reconciliation).toBeNull();
	});

	it("ignores hidden paths and anything unknown", async () => {
		const { target } = await setup();
		const r = await applyBatch(target, { rescan: false, paths: [".obsidian/app.json", "notes/.x/y.md", "not/there.md", ""] });
		expect(r).toMatchObject({ echoes: [], changed: [], vanished: [], appeared: [], reconciliation: null, errors: [] });
	});

	it("a rescan signal compares the whole disk with the index and reconciles", async () => {
		const { target, mv, project, root } = await setup();
		mv(`${A}/ch-a2.md`, `${A}/Second.md`);
		mv("Codex/Sam.md", "Codex/Samuel.md");
		fs.writeFileSync(path.join(root, "notes/idea.md"), "edited while the watcher was away\n");
		fs.writeFileSync(path.join(root, `${A}/ch-a1.md`), "Opening changed behind our back.\n");
		expect((await diffAgainstDisk(project)).sort()).toEqual(["Codex/Sam.md", "Codex/Samuel.md", `${A}/Second.md`, `${A}/ch-a1.md`, `${A}/ch-a2.md`, "notes/idea.md"].sort());
		const r = await applyBatch(target, { rescan: true, paths: [] });
		expect(r.rescan).toBe(true);
		expect(r.reconciliation?.matched.map((m) => m.to).sort()).toEqual(["Codex/Samuel.md", `${A}/Second.md`]);
		expect(r.changed.sort()).toEqual([`${A}/ch-a1.md`, "notes/idea.md"]);
		expect(await diffAgainstDisk(project)).toEqual([]);
	});

	it("applying the same batch again changes nothing", async () => {
		const { target, mv } = await setup();
		mv(`${A}/ch-a2.md`, `${A}/Second.md`);
		const batch = { rescan: false, paths: [`${A}/ch-a2.md`, `${A}/Second.md`] };
		await applyBatch(target, batch);
		const again = await applyBatch(target, batch);
		expect(again).toMatchObject({ echoes: [`${A}/Second.md`], vanished: [], appeared: [], reconciliation: null });
	});
});
