import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { NodeFsSnapshotStore } from "../../backends/node-fs/snapshotStore";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot as dirSnapshot } from "../../../test/helpers/fixtures";
import * as book from "../book";
import * as codex from "../codex";
import { LegacyLayoutError } from "../project";
import { NotAProjectError, ProjectAlreadyOpenError, ProjectFolderNotEmptyError, type OpenedProject, createProject, openProject } from "../openProject";
import { readBookFrontmatter } from "../book";
import { readSeriesFrontmatter } from "../series";
import * as reconciliation from "../reconciliation";

const opened: OpenedProject[] = [];
const dirs: string[] = [];
afterEach(async () => {
	for (const o of opened.splice(0)) await o.close();
	cleanupFixtures();
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
	const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-open-")));
	dirs.push(d);
	return d;
};
async function openIt(root: string, snapshotDir?: string) {
	const o = await openProject(root, { backend: new NodeFsBackend(root), snapshotStore: snapshotDir ? new NodeFsSnapshotStore(snapshotDir) : undefined, now: () => new Date(2026, 9, 23, 10, 0, 0) });
	opened.push(o);
	return o;
}
const closeAll = async () => {
	for (const o of opened.splice(0)) await o.close();
};

describe("openProject", () => {
	it("opening an up-to-date project twice leaves the folder byte-identical", async () => {
		const root = copyFixture("series");
		const snaps = tmp();
		await openIt(root, snaps);
		await closeAll();
		const settled = dirSnapshot(root);
		const second = await openIt(root, snaps);
		expect(second.reconciliation).toMatchObject({ matched: [], pruned: [], ambiguous: [], added: [], gated: [], skipped: [], snapshot: "used" });
		await closeAll();
		await openIt(root, snaps);
		await closeAll();
		expect(diffSnapshots(settled, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("also writes nothing without a snapshot store, once settled", async () => {
		const root = copyFixture("series");
		await openIt(root);
		await closeAll();
		const settled = dirSnapshot(root);
		const again = await openIt(root);
		expect(again.reconciliation.snapshot).toBe("missing");
		expect(again.snapshots).toBeNull();
		await closeAll();
		expect(diffSnapshots(settled, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("never writes a chapter, a Codex note or anything in notes/ and _export/, even on the first open", async () => {
		const root = copyFixture("series");
		const before = dirSnapshot(root);
		await openIt(root, tmp());
		await closeAll();
		const diff = diffSnapshots(before, dirSnapshot(root));
		const touched = [...diff.added, ...diff.changed, ...diff.removed];
		expect(touched.filter((p) => /^(_story-library\/[^/]+\/|Codex\/|notes\/|_export\/|elsewhere\/|\.obsidian\/)/.test(p))).toEqual([]);
		expect(diff.removed).toEqual([]);
	});

	it("matches a renamed chapter before it can be mistaken for a new one (reconcile, then ensure)", async () => {
		const root = copyFixture("series");
		const snaps = tmp();
		await openIt(root, snaps);
		await closeAll();
		fs.renameSync(path.join(root, "_story-library/aaa/ch-a2.md"), path.join(root, "_story-library/aaa/Second.md"));
		const o = await openIt(root, snaps);
		expect(o.reconciliation.matched).toEqual([{ kind: "chapter", tier: 1, from: "_story-library/aaa/ch-a2.md", to: "_story-library/aaa/Second.md" }]);
		const fm = readBookFrontmatter(o.project, "aaa")!;
		expect(fm.chapters["Second.md"].chapterId).toBe("c-a2m8");
		expect(Object.keys(fm.chapters).sort()).toEqual(["Second.md", "ch-a1.md", "ch-a3.md", "ch-a4.md", "ch-a5.md"]);
		expect(o.reconciliation.added).toEqual([]);
		expect(fs.existsSync(path.join(root, "_sf-backup"))).toBe(false); // nothing pruned, so no recovery file
	});

	it("does not ensure chapter entries in a gated book", async () => {
		const root = copyFixture("series");
		fs.rmSync(path.join(root, "_story-library/aaa"), { recursive: true });
		fs.mkdirSync(path.join(root, "_story-library/aaa"));
		const before = dirSnapshot(root);
		const o = await openIt(root);
		expect(o.reconciliation.gated.map((g) => g.reason)).toEqual(["folder-empty"]);
		await closeAll();
		const diff = diffSnapshots(before, dirSnapshot(root));
		expect([...diff.added, ...diff.changed].filter((p) => p.includes("aaa"))).toEqual([]);
	});

	it("refuses a pre-0.17 layout without writing", async () => {
		const root = copyFixture("pre-0.17");
		const before = dirSnapshot(root);
		await expect(openIt(root)).rejects.toBeInstanceOf(LegacyLayoutError);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		// a refused open releases the one-project latch
		await openIt(copyFixture("series"));
	});

	it("opening an empty folder never seeds it", async () => {
		const root = copyFixture("empty");
		const before = dirSnapshot(root);
		await expect(openIt(root)).rejects.toBeInstanceOf(NotAProjectError);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		const onlyNotes = tmp();
		fs.mkdirSync(path.join(onlyNotes, "notes"));
		await expect(openIt(onlyNotes)).rejects.toBeInstanceOf(NotAProjectError);
		expect(fs.readdirSync(onlyNotes)).toEqual(["notes"]);
	});

	it("one project per process", async () => {
		const a = await openIt(copyFixture("series"));
		await expect(openIt(copyFixture("series"))).rejects.toBeInstanceOf(ProjectAlreadyOpenError);
		await a.close();
		opened.length = 0;
		const b = await openIt(copyFixture("series"));
		expect(b.project).not.toBe(a.project);
	});

	it("closing flushes unsaved text and saves the snapshot", async () => {
		const root = copyFixture("series");
		const snaps = tmp();
		const o = await openIt(root, snaps);
		const s = await o.writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("Typed just before quitting.");
		const closed = await o.close();
		expect(closed.saves.map((r) => r.kind)).toEqual(["saved"]);
		expect(closed.snapshot).toEqual({ ok: true });
		expect(fs.readFileSync(path.join(root, "_story-library/aaa/ch-a3.md"), "utf8")).toBe("Typed just before quitting.\n");
		// the first save took a session backup first
		const zips = fs.readdirSync(path.join(root, "_sf-backup")).filter((f) => f.endsWith(".zip"));
		expect(zips).toHaveLength(1);
		expect(closed.saves[0]).toMatchObject({ backup: { ok: true, path: `_sf-backup/${zips[0]}` } });
	});

	it("the prune-at-open functions of 0.17.1 are gone", () => {
		for (const name of ["pruneMissingChapterEntries", "pruneMissingChapterCodexRefs", "stripMissingChapterRefs"]) expect(book).not.toHaveProperty(name);
		for (const name of ["pruneMissingCodexNotes", "stripMissingCodexNoteRefs", "reconcileMissingCodexNotes"]) expect(codex).not.toHaveProperty(name);
		expect(reconciliation).not.toHaveProperty("reconcileExternalCodexChange");
	});
});

describe("createProject", () => {
	it("creates the 0.17.1 first-run layout in an empty folder, and it then opens without further writes", async () => {
		const root = tmp();
		fs.mkdirSync(path.join(root, ".obsidian"));
		fs.writeFileSync(path.join(root, ".obsidian/app.json"), "{}");
		fs.writeFileSync(path.join(root, ".DS_Store"), "x");
		fs.writeFileSync(path.join(root, ".gitkeep"), "");
		const backend = new NodeFsBackend(root);
		const made = await createProject(backend, root, { seriesTitle: "The Lantern Cycle" });
		expect(made.folderName).toBe("aaa");
		for (const p of ["_story-library", "Codex", "notes", "_story-library/series.md", "_story-library/novel-aaa.md", `_story-library/aaa/${made.chapterFilename}`, "_backstage/storyforge/tag-registry.md"]) {
			expect(fs.existsSync(path.join(root, p)), p).toBe(true);
		}
		const series = fs.readFileSync(path.join(root, "_story-library/series.md"), "utf8");
		expect(series).toContain("series-title: The Lantern Cycle");
		const settled = dirSnapshot(root);
		const o = await openIt(root);
		expect(readBookFrontmatter(o.project, "aaa")!.chapterOrder).toEqual([made.chapterFilename]);
		await closeAll();
		await openIt(root);
		await closeAll();
		const diff = diffSnapshots(settled, dirSnapshot(root));
		expect(diff.changed).toEqual([]);
		expect(diff.removed).toEqual([]);
	});

	it("a standalone project gives the book the series title", async () => {
		const root = tmp();
		await createProject(new NodeFsBackend(root), root, { seriesTitle: "One Book", standalone: true });
		const o = await openIt(root);
		expect(o.project.frontmatter("_story-library/series.md")).toMatchObject({ "series-title": "One Book" });
		expect(o.project.frontmatter("_story-library/novel-aaa.md")).toMatchObject({ "book-title-reference": "One Book" });
	});

	it("refuses a folder that isn't empty and changes nothing", async () => {
		for (const make of [(r: string) => fs.writeFileSync(path.join(r, "draft.md"), "mine"), (r: string) => fs.mkdirSync(path.join(r, "Codex")), (r: string) => fs.mkdirSync(path.join(r, "_backstage"))]) {
			const root = tmp();
			make(root);
			const before = dirSnapshot(root);
			await expect(createProject(new NodeFsBackend(root), root, { seriesTitle: "X" })).rejects.toBeInstanceOf(ProjectFolderNotEmptyError);
			expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		}
	});
});

describe("renameNote (the front door to the link rewriter)", () => {
	it("plans without writing, then renames and rewrites through the writer's own flush and a backup", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, "Codex/Sam.md"), "Friend of [Jane](Jane.md).\n");
		const opened = await openProject(root, { backend: new NodeFsBackend(root) });
		try {
			const before = dirSnapshot(root);
			const plan = await opened.renameNote.plan("Codex/Jane.md", "Janet");
			expect(plan.totalLinks).toBe(1);
			expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
			const result = await opened.renameNote.apply("Codex/Jane.md", "Janet");
			expect(result.status).toBe("done");
			expect(fs.readFileSync(path.join(root, "Codex/Sam.md"), "utf8")).toBe("Friend of [Janet](Janet.md).\n");
			expect(result.backupPath).toBeTruthy();
		} finally {
			await opened.close();
		}
	});
});

describe("start dates (Tweaks 3 §1.5)", () => {
	it("createProject records the project's and its first novel's start date in England's local time, createBook a later novel's; nothing else writes one", async () => {
		const root = tmp();
		// 23:30 UTC on 1 July is half past midnight on 2 July in England (BST)
		await createProject(new NodeFsBackend(root), root, { seriesTitle: "Dates", now: new Date("2026-07-01T23:30:00Z") });
		const o = await openIt(root);
		expect(readSeriesFrontmatter(o.project).projectStarted).toBe("2026-07-02");
		expect(readBookFrontmatter(o.project, "aaa")!.started).toBe("2026-07-02");
		expect(fs.readFileSync(path.join(root, "_story-library/series.md"), "utf8")).toContain("project-started: 2026-07-02");
		expect(fs.readFileSync(path.join(root, "_story-library/novel-aaa.md"), "utf8")).toContain("book-started: 2026-07-02");
		const second = await book.createBook(o.project, "Two", new Date("2026-11-08T12:00:00Z"));
		expect(readBookFrontmatter(o.project, second.folderName)!.started).toBe("2026-11-08");
		expect(readSeriesFrontmatter(o.project).projectStarted).toBe("2026-07-02"); // the project's date is written once
	});

	it("opening a project writes nothing, with the keys or without; writes keep the keys and never back-fill an older project", async () => {
		const root = tmp();
		await createProject(new NodeFsBackend(root), root, { seriesTitle: "Keep", now: new Date("2026-03-04T12:00:00Z") });
		await closeAll();
		const settled = dirSnapshot(root);
		const o = await openIt(root);
		await closeAll();
		await openIt(root);
		await closeAll();
		expect(diffSnapshots(settled, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] }); // opening wrote nothing, byte for byte
		const again = await openIt(root);
		await book.renameBookTitle(again.project, "aaa", "A new title");
		await book.writeBookChapterOrder(again.project, "aaa", []);
		expect(readSeriesFrontmatter(again.project).projectStarted).toBe("2026-03-04"); // the keys survive writes
		expect(readBookFrontmatter(again.project, "aaa")!.started).toBe("2026-03-04");
		await closeAll();
		// an older project: no keys, and opening and writing back-fills none
		const old = copyFixture("series");
		const o2 = await openIt(old);
		await book.renameBookTitle(o2.project, "aaa", "Renamed");
		expect(readSeriesFrontmatter(o2.project).projectStarted).toBeNull();
		expect(readBookFrontmatter(o2.project, "aaa")!.started).toBeNull();
		expect(fs.readFileSync(path.join(old, "_story-library/series.md"), "utf8")).not.toContain("project-started");
		expect(fs.readFileSync(path.join(old, "_story-library/novel-aaa.md"), "utf8")).not.toContain("book-started");
	});

	it("an unreadable date draws the fallback and is never rewritten", async () => {
		const root = copyFixture("series");
		const f = path.join(root, "_story-library/novel-aaa.md");
		fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("---\n", "---\nbook-started: next tuesday\n"));
		const o = await openIt(root);
		expect(readBookFrontmatter(o.project, "aaa")!.started).toBeNull();
		await book.renameBookTitle(o.project, "aaa", "Renamed");
		expect(fs.readFileSync(f, "utf8")).toContain("book-started: next tuesday");
	});
});
