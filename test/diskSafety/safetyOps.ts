/**
 * The safety-core operations (Brief 3 §5): each runs on a fresh copy of the `series` fixture, and must
 * change exactly the files listed, leave all other prose byte-identical, and leave the index equal to
 * a fresh scan. Scenario tests with more detail live in src/core/__tests__.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { NodeFsBackend } from "../../src/backends/node-fs";
import { BackupService } from "../../src/core/backup";
import { archiveChapter } from "../../src/core/book";
import { renameCodexNote, planCodexRename, applyCodexRename } from "../../src/core/linkRewriter";
import { createProject, openProject } from "../../src/core/openProject";
import { ProseWriter, type ProseSession } from "../../src/core/proseWriter";
import { Project } from "../../src/core/project";
import { evidenceFromIndex, reconcileAtOpen, reconcileChanges } from "../../src/core/reconciler";
import { recoverChapterText, recoverCodexText, recoverPrunedEntry } from "../../src/core/recovery";
import { type Snapshot, buildSnapshot } from "../../src/core/snapshot";
import type { Ctx, OpSpec } from "../helpers/diskSafety";
import { ManualScheduler } from "../helpers/scheduler";

const NOW = () => new Date(2026, 9, 23, 10, 0, 0);
const A = "_story-library/aaa";
const N = "_story-library/novel-aaa.md";
const CODEX = "_backstage/storyforge/codex.md";
const WC = "_backstage/storyforge/aaa/wordcount.md";
const SIDE = "_backstage/storyforge/aaa/chapters/ch-a1.md";
const DETAILS = "_backstage/storyforge/aaa/story-details/ch-a1.md";
const fm = (...touched: string[][]) => ({ format: "frontmatter" as const, touched });
const prose = { format: "prose" as const };
const yaml = (...touched: string[][]) => ({ format: "yaml" as const, touched });
// recordChapterEdit re-syncs every live chapter's word count in the history file, as 0.17.1 did
const WC_EDIT = (_chapter: string) => yaml(["chapters"], ["current"], ["lifetimeWritten"], ["lifetimeRemoved"], ["daily", "2026-10-23"]);

interface State {
	writer?: ProseWriter;
	session?: ProseSession;
	snapshot?: Snapshot;
	evidence?: ReturnType<typeof evidenceFromIndex>;
}
const states = new WeakMap<Ctx, State>();
const st = (c: Ctx): State => {
	let s = states.get(c);
	if (!s) states.set(c, (s = {}));
	return s;
};
const writerOf = (c: Ctx, withBackup = false): ProseWriter => {
	const s = st(c);
	if (!s.writer) {
		const backups = new BackupService(c.project, { projectName: "fixture", now: NOW });
		s.writer = new ProseWriter(c.project, {
			scheduler: new ManualScheduler(),
			now: NOW,
			...(withBackup ? { sessionBackup: () => backups.runScoped("session").then((r) => ({ ok: true as const, path: r.path })) } : {}),
		});
	}
	return s.writer;
};
const backupsOf = (c: Ctx) => new BackupService(c.project, { projectName: "fixture", now: NOW });

async function externalRename(c: Ctx, from: string, to: string): Promise<void> {
	fs.mkdirSync(path.dirname(c.abs(to)), { recursive: true });
	fs.renameSync(c.abs(from), c.abs(to));
	await c.project.index.applyChange({ type: "renamed", from, to });
}
/** Takes the snapshot, then changes the folder as a file manager would, then reopens the project: the situation at open. */
async function closedThen(c: Ctx, change: () => void | Promise<void>, withSnapshot = true): Promise<void> {
	st(c).snapshot = withSnapshot ? buildSnapshot(c.project, c.root) : undefined;
	await change();
	// the app "reopens": a fresh scan replaces the project the harness opened
	(c as { project: Project }).project = await Project.open(new NodeFsBackend(c.root));
}
const atOpen = (c: Ctx) => reconcileAtOpen(c.project, st(c).snapshot ?? null, st(c).snapshot ? "used" : "missing", { now: new Date(2026, 9, 23, 12, 0, 0) });

const RECOVERED_A3 = "_sf-backup/recovery/aaa/ch-a3 2026-10-23 100000.md";

export const SAFETY_OPS: OpSpec[] = [
	// ------------------------------------------------------------------------ the prose writer
	{
		name: "ProseWriter: save a placed chapter (body only; fingerprint sidecar and word-count history follow)",
		run: async (c) => {
			const s = await writerOf(c).open(`${A}/ch-a1.md`);
			s.setBody("A new first line.\n\nA new last line.");
			await s.save();
		},
		changed: { [`${A}/ch-a1.md`]: prose, [SIDE]: { format: "text", frontmatterSame: true }, [WC]: WC_EDIT("ch-a1.md") },
	},
	{
		name: "ProseWriter: save an unplaced chapter (a sidecar is created)",
		run: async (c) => {
			const s = await writerOf(c).open(`${A}/ch-a3.md`);
			s.setBody("Unplaced, rewritten.");
			await s.save();
		},
		changed: { [`${A}/ch-a3.md`]: prose, [WC]: WC_EDIT("ch-a3.md") },
		added: ["_backstage/storyforge/aaa/chapters/ch-a3.md"],
	},
	{
		name: "ProseWriter: save a chapter without a trailing newline",
		run: async (c) => {
			const s = await writerOf(c).open(`${A}/ch-a5.md`);
			s.setBody("Still no trailing newline, but different.");
			await s.save();
		},
		changed: { [`${A}/ch-a5.md`]: prose, [WC]: WC_EDIT("ch-a5.md") },
		added: ["_backstage/storyforge/aaa/chapters/ch-a5.md"],
	},
	{
		name: "ProseWriter: save a Codex note (frontmatter carried through; no fingerprint or history)",
		run: async (c) => {
			const s = await writerOf(c).open("Codex/Jane.md");
			s.setBody("Jane, redescribed.");
			await s.save();
		},
		changed: { "Codex/Jane.md": prose },
	},
	{
		name: "ProseWriter: save a CRLF Codex note",
		run: async (c) => {
			const s = await writerOf(c).open("Codex/Windows.md");
			s.setBody("Windows line one.\nWindows line two.\nThree.");
			await s.save();
		},
		changed: { "Codex/Windows.md": prose },
	},
	{ name: "ProseWriter: a save with nothing changed writes nothing", run: async (c) => (await writerOf(c).open(`${A}/ch-a1.md`)).save() },
	{
		name: "ProseWriter: the first save takes the session backup first",
		run: async (c) => {
			const s = await writerOf(c, true).open("Codex/Sam.md");
			s.setBody("Sam, rewritten.");
			await s.save();
		},
		changed: { "Codex/Sam.md": prose },
		added: ["_sf-backup/20261023-100000 - fixture.zip"],
	},
	{
		name: "ProseWriter: a conflict at save time (the disk wins; the author's text is recovered)",
		setup: async (c) => {
			const s = await writerOf(c).open(`${A}/ch-a3.md`);
			s.setBody("The author's text.");
			fs.writeFileSync(c.abs(`${A}/ch-a3.md`), "Written elsewhere.\n");
		},
		run: async (c) => {
			const r = await writerOf(c).session(`${A}/ch-a3.md`)!.save();
			if (r.kind !== "conflict") throw new Error(`expected a conflict, got ${r.kind}`);
		},
		changed: { [WC]: WC_EDIT("ch-a3.md") },
		added: [RECOVERED_A3, "_backstage/storyforge/aaa/chapters/ch-a3.md"],
	},
	{
		name: "ProseWriter: an outside change with unsaved text (recovered, then reloaded)",
		setup: async (c) => {
			const s = await writerOf(c).open(`${A}/ch-a3.md`);
			s.setBody("Unsaved words.");
			fs.writeFileSync(c.abs(`${A}/ch-a3.md`), "Changed in Obsidian.\n");
		},
		run: async (c) => {
			const r = await writerOf(c).onDiskChanged(`${A}/ch-a3.md`, "Changed in Obsidian.\n");
			if (r.kind !== "recovered-and-reloaded") throw new Error(`got ${r.kind}`);
		},
		changed: { [WC]: WC_EDIT("ch-a3.md") },
		added: [RECOVERED_A3, "_backstage/storyforge/aaa/chapters/ch-a3.md"],
	},
	{
		name: "ProseWriter: an outside change to a chapter with no editor open (the after-save hook runs)",
		setup: async (c) => {
			fs.writeFileSync(c.abs(`${A}/ch-a2.md`), "Opening by Obsidian.\n\nClosing by Obsidian.\n");
		},
		run: (c) => writerOf(c).onDiskChanged(`${A}/ch-a2.md`, "Opening by Obsidian.\n\nClosing by Obsidian.\n"),
		changed: { [WC]: WC_EDIT("ch-a2.md") },
		added: ["_backstage/storyforge/aaa/chapters/ch-a2.md"],
	},
	{
		name: "ProseWriter: a save to a chapter archived meanwhile is refused and recovered",
		run: async (c) => {
			const w = writerOf(c);
			const s = await w.open(`${A}/ch-a5.md`);
			s.setBody("Typed after archiving.");
			await archiveChapter(c.project, "aaa", "ch-a5.md");
			const r = await s.save();
			if (r.kind !== "refused") throw new Error(`got ${r.kind}`);
		},
		changed: { [N]: fm(["archive"], ["chapter-order"]) },
		added: ["_sf-backup/recovery/aaa/ch-a5 2026-10-23 100000.md"],
	},
	{
		name: "ProseWriter: a flush saves or recovers every dirty session",
		setup: async (c) => {
			const w = writerOf(c);
			(await w.open(`${A}/ch-a1.md`)).setBody("Flushed A.");
			(await w.open("Codex/Jane.md")).setBody("Flushed note.");
			(await w.open(`${A}/ch-a3.md`)).setBody("Flushed, but changed elsewhere.");
			fs.writeFileSync(c.abs(`${A}/ch-a3.md`), "Elsewhere.\n");
		},
		run: async (c) => void (await writerOf(c).flushAll()),
		changed: { [`${A}/ch-a1.md`]: prose, "Codex/Jane.md": prose, [SIDE]: { format: "text", frontmatterSame: true }, [WC]: WC_EDIT("") },
		added: [RECOVERED_A3, "_backstage/storyforge/aaa/chapters/ch-a3.md"],
	},

	{
		name: "ProseWriter: closeAll saves what is unsaved and frees every session",
		setup: async (c) => {
			(await writerOf(c).open("Codex/Sam.md")).setBody("Saved at close.");
		},
		run: async (c) => {
			await writerOf(c).closeAll();
			if (writerOf(c).openSessions().length !== 0) throw new Error("sessions remain");
		},
		changed: { "Codex/Sam.md": prose },
	},

	// ------------------------------------------------------------------------ recovery files
	{ name: "recoverChapterText", run: async (c) => void (await recoverChapterText(c.project, "aaa", "ch-a1", "x\r\ny", new Date(2026, 9, 23, 10, 0, 0))), added: ["_sf-backup/recovery/aaa/ch-a1 2026-10-23 100000.md"] },
	{ name: "recoverCodexText", run: async (c) => void (await recoverCodexText(c.project, "Jane", "body", new Date(2026, 9, 23, 10, 0, 0))), added: ["_sf-backup/recovery/_codex/Jane 2026-10-23 100000.md"] },
	{
		name: "recoverPrunedEntry",
		run: async (c) => void (await recoverPrunedEntry(c.project, { scope: "aaa", name: "gone.md", source: N, reason: "test", data: { chapter: "gone.md" } }, new Date(2026, 9, 23, 10, 0, 0))),
		added: ["_sf-backup/recovery/_pruned/aaa/gone 2026-10-23 100000.md"],
	},
	{
		name: "recovery files are never overwritten",
		run: async (c) => {
			for (let i = 0; i < 3; i++) await recoverChapterText(c.project, "aaa", "ch-a1", `take ${i}`, new Date(2026, 9, 23, 10, 0, 0));
		},
		added: ["_sf-backup/recovery/aaa/ch-a1 2026-10-23 100000 2.md", "_sf-backup/recovery/aaa/ch-a1 2026-10-23 100000 3.md", "_sf-backup/recovery/aaa/ch-a1 2026-10-23 100000.md"],
	},

	// ---------------------------------------------------------------------------------- backups
	{ name: "BackupService: session backup", run: (c) => backupsOf(c).runScoped("session"), added: ["_sf-backup/20261023-100000 - fixture.zip"] },
	{ name: "BackupService: automatic backup", run: (c) => backupsOf(c).runScoped("automatic"), added: ["_sf-backup/20261023 - fixture.zip"] },
	{ name: "BackupService: full backup", run: (c) => backupsOf(c).runFull(), added: ["_sf-backup/20261023-100000 - fixture - full.zip"] },
	{ name: "BackupService: pre-rewrite backup", run: (c) => backupsOf(c).runPreRewrite(["Codex/Jane.md"]), added: ["_sf-backup/20261023-100000 - fixture - pre-rewrite.zip"] },

	// ------------------------------------------------------------------------ the reconciler
	{
		name: "reconcileAtOpen: a chapter renamed while closed (tier 1)",
		setup: (c) => closedThen(c, () => fs.renameSync(c.abs(`${A}/ch-a1.md`), c.abs(`${A}/Renamed.md`))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [N]: fm(["chapters", "ch-a1.md"], ["chapters", "Renamed.md"], ["chapter-order"]) },
		added: ["_backstage/storyforge/aaa/chapters/Renamed.md", "_backstage/storyforge/aaa/story-details/Renamed.md"],
		removed: [SIDE, DETAILS],
	},
	{
		name: "reconcileAtOpen: a chapter renamed while closed, no snapshot (tier 2)",
		setup: (c) => closedThen(c, () => fs.renameSync(c.abs(`${A}/ch-a1.md`), c.abs(`${A}/Renamed.md`)), false),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [N]: fm(["chapters", "ch-a1.md"], ["chapters", "Renamed.md"], ["chapter-order"]) },
		added: ["_backstage/storyforge/aaa/chapters/Renamed.md", "_backstage/storyforge/aaa/story-details/Renamed.md"],
		removed: [SIDE, DETAILS],
	},
	{
		name: "reconcileAtOpen: a chapter moved to another book while closed",
		setup: (c) => closedThen(c, () => fs.renameSync(c.abs(`${A}/ch-a1.md`), c.abs("_story-library/bbb/ch-a1.md"))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [N]: fm(["chapters", "ch-a1.md"], ["chapter-order"]), "_story-library/novel-bbb.md": fm(["chapters", "ch-a1.md"], ["unplaced"], ["archive"]) },
		added: ["_backstage/storyforge/bbb/chapters/ch-a1.md", "_backstage/storyforge/bbb/story-details/ch-a1.md"],
		removed: [SIDE, DETAILS],
	},
	{
		name: "reconcileAtOpen: a Codex note renamed while closed",
		setup: (c) => closedThen(c, () => fs.renameSync(c.abs("Codex/Sam.md"), c.abs("Codex/Samuel.md"))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [CODEX]: fm(["folders"], ["types"]) },
	},
	{
		name: "reconcileAtOpen: a book folder renamed while closed",
		setup: (c) => closedThen(c, () => fs.renameSync(c.abs(A), c.abs("_story-library/zzz"))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { "_story-library/series.md": fm(["books", "aaa"], ["books", "zzz"], ["order"]) },
		added: [
			"_backstage/storyforge/zzz/chapters/ch-a1.md",
			"_backstage/storyforge/zzz/cover.png",
			"_backstage/storyforge/zzz/story-details/attribution.md",
			"_backstage/storyforge/zzz/story-details/ch-a1.md",
			"_backstage/storyforge/zzz/wordcount.md",
			"_story-library/novel-zzz.md",
		],
		removed: [
			"_backstage/storyforge/aaa/chapters/ch-a1.md",
			"_backstage/storyforge/aaa/cover.png",
			"_backstage/storyforge/aaa/story-details/attribution.md",
			"_backstage/storyforge/aaa/story-details/ch-a1.md",
			"_backstage/storyforge/aaa/wordcount.md",
			N,
		],
	},
	{
		name: "reconcileAtOpen: a chapter deleted while closed (recovered, then pruned; sidecars retired)",
		setup: (c) => closedThen(c, () => fs.rmSync(c.abs(`${A}/ch-a1.md`))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [N]: fm(["chapters", "ch-a1.md"], ["chapter-order"]) },
		added: ["_sf-backup/recovery/_pruned/aaa/ch-a1 2026-10-23 120000.md", `.trash/${SIDE}`, `.trash/${DETAILS}`],
		removed: [SIDE, DETAILS],
	},
	{
		name: "reconcileAtOpen: a Codex note deleted while closed (recovered, then pruned)",
		setup: (c) => closedThen(c, () => fs.rmSync(c.abs("Codex/Sam.md"))),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
		changed: { [CODEX]: fm(["folders"], ["types"]) },
		added: ["_sf-backup/recovery/_pruned/_codex/Sam 2026-10-23 120000.md"],
	},
	{
		name: "reconcileAtOpen: a book folder missing is gated (nothing changes)",
		setup: (c) => closedThen(c, () => fs.rmSync(c.abs(A), { recursive: true })),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
	},
	{
		name: "reconcileAtOpen: iCloud placeholders in place of chapters are gated (nothing changes)",
		setup: (c) =>
			closedThen(c, () => {
				fs.rmSync(c.abs(`${A}/ch-a1.md`));
				fs.writeFileSync(c.abs(`${A}/.ch-a1.md.icloud`), "stub");
			}),
		run: async (c) => ({ project: c.project, summary: await atOpen(c) }),
	},
	{
		name: "reconcileChanges: a rename seen by the watcher (evidence from the live index)",
		setup: async (c) => {
			st(c).evidence = evidenceFromIndex(c.project, [`${A}/ch-a2.md`]);
			await externalRename(c, `${A}/ch-a2.md`, `${A}/Second.md`);
		},
		run: (c) => reconcileChanges(c.project, { vanished: [`${A}/ch-a2.md`], appeared: [`${A}/Second.md`], evidence: st(c).evidence }),
		changed: { [N]: fm(["chapters", "ch-a2.md"], ["chapters", "Second.md"], ["chapter-order"]) },
	},

	// -------------------------------------------------------------------- the link rewriter
	{
		name: "planCodexRename writes nothing",
		run: (c) => planCodexRename(c.project, "Codex/Jane.md", "Janet"),
	},
	{
		name: "renameCodexNote: backup, rename, rewrite, re-key",
		setup: async (c) => {
			fs.writeFileSync(c.abs(`${A}/ch-a1.md`), "Jane walked into [[Jane]]'s house.\nSee [x](Codex/Jane.md).\n");
			fs.writeFileSync(c.abs("notes/idea.md"), fs.readFileSync(c.abs("notes/idea.md"), "utf8") + "\nAbout [[Jane|her]].\n");
			(c as { project: Project }).project = await Project.open(new NodeFsBackend(c.root));
		},
		run: (c) => renameCodexNote(c.project, "Codex/Jane.md", "Janet", { backups: backupsOf(c) }),
		changed: {
			[`${A}/ch-a1.md`]: prose,
			"notes/idea.md": prose,
			[CODEX]: fm(["folders"], ["types"]),
			[N]: fm(["default-pov-path"], ["chapters", "ch-a1.md", "pov"], ["chapters", "ch-a2.md", "pov"], ["chapters", "ch-a2.md", "pov-path"], ["chapters", "ch-a2.md", "pov-name"], ["default-pov-name"]),
		},
		added: ["Codex/Janet.md", "_sf-backup/20261023-100000 - fixture - pre-rewrite.zip"],
		removed: ["Codex/Jane.md"],
	},
	{
		name: "applyCodexRename: a failed backup changes nothing",
		run: async (c) => {
			const backups = backupsOf(c);
			backups.runPreRewrite = async () => {
				throw new Error("no space");
			};
			const plan = await planCodexRename(c.project, "Codex/Jane.md", "Janet");
			const r = await applyCodexRename(c.project, plan, { backups });
			if (r.status !== "stopped") throw new Error("expected a stop");
		},
	},

	// ---------------------------------------------------------------------- open and create
	{
		name: "openProject: a first open of the fixture (ensures only; never prose)",
		run: async (c) => {
			const o = await openProject(c.root, { backend: new NodeFsBackend(c.root), now: NOW });
			await o.close();
			return { project: o.project };
		},
		changed: {},
	},
	{
		name: "createProject: an empty folder gets the first-run layout",
		fixture: "empty",
		run: async (c) => {
			await createProject(new NodeFsBackend(c.root), c.root, { seriesTitle: "A Series" });
			return { project: await Project.open(new NodeFsBackend(c.root)) };
		},
		anyAdded: /^_story-library\/aaa\/[^/]+\.md$/,
		added: [
			"_backstage/storyforge/tag-registry.md",
			"_story-library/novel-aaa.md",
			"_story-library/series.md",
		],
	},
];
