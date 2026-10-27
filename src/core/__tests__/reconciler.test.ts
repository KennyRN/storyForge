import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot as dirSnapshot } from "../../../test/helpers/fixtures";
import { readBookFrontmatter } from "../book";
import { updateChapterFingerprint } from "../chapterSidecar";
import { readCodexFrontmatter } from "../codex";
import { Project } from "../project";
import { computeGates, evidenceFromIndex, reconcileAtOpen, reconcileChanges, summaryIsEmpty } from "../reconciler";
import { parseYamlText } from "../frontmatter";
import { buildSnapshot } from "../snapshot";

afterEach(cleanupFixtures);

const A = "_story-library/aaa";
const open = (root: string) => Project.open(new NodeFsBackend(root));
const rd = (root: string, rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** The app is closed, `mutate` changes the folder (as Obsidian or Finder would), the app opens again. */
async function whileClosed(mutate: (root: string) => void | Promise<void>, opts: { snapshot?: boolean; prepare?: (project: Project, root: string) => Promise<void> } = {}) {
	const root = copyFixture("series");
	const before = await open(root);
	await opts.prepare?.(before, root);
	const snap = opts.snapshot === false ? null : buildSnapshot(await open(root), root);
	await mutate(root);
	const project = await open(root);
	const summary = await reconcileAtOpen(project, snap, snap ? "used" : "missing", { now: new Date(2026, 9, 23, 12, 0, 0) });
	return { root, project, summary };
}
const mv = (root: string, from: string, to: string) => {
	fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
	fs.renameSync(path.join(root, from), path.join(root, to));
};

describe("a chapter renamed while the app was closed", () => {
	it("with a snapshot: matched at tier 1, and its details follow", async () => {
		const { root, project, summary } = await whileClosed((r) => mv(r, `${A}/ch-a1.md`, `${A}/Renamed one.md`));
		expect(summary.matched).toEqual([{ kind: "chapter", tier: 1, from: `${A}/ch-a1.md`, to: `${A}/Renamed one.md` }]);
		expect(summary.pruned).toEqual([]);
		const fm = readBookFrontmatter(project, "aaa")!;
		expect(fm.chapterOrder).toEqual(["Renamed one.md", "ch-a2.md", "ch-a5.md"]);
		expect(fm.chapters["Renamed one.md"].chapterId).toBe("c-a1k3");
		expect(fm.chapters["ch-a1.md"]).toBeUndefined();
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/aaa/chapters/Renamed one.md"))).toBe(true);
		expect(rd(root, "_backstage/storyforge/aaa/chapters/Renamed one.md")).toContain("chapter: Renamed one.md");
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/aaa/story-details/Renamed one.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/aaa/chapters/ch-a1.md"))).toBe(false);
		expect(summary.added).toEqual([]);
	});

	it("without a snapshot: matched at tier 2 by its opening fingerprint", async () => {
		const { project, summary } = await whileClosed((r) => mv(r, `${A}/ch-a1.md`, `${A}/Renamed one.md`), { snapshot: false });
		expect(summary.snapshot).toBe("missing");
		expect(summary.matched).toEqual([{ kind: "chapter", tier: 2, from: `${A}/ch-a1.md`, to: `${A}/Renamed one.md` }]);
		expect(readBookFrontmatter(project, "aaa")!.chapters["Renamed one.md"].chapterId).toBe("c-a1k3");
	});

	it("renamed and edited, without a snapshot: matched at tier 2 if the opening survived", async () => {
		const { summary } = await whileClosed(
			(r) => {
				mv(r, `${A}/ch-a1.md`, `${A}/Renamed one.md`);
				fs.writeFileSync(path.join(r, `${A}/Renamed one.md`), "Synthetic sentence number 1 walks across the page without meaning anything. And then much more was written.\n\nA new ending.\n");
			},
			{ snapshot: false },
		);
		// The opening is the first sentence, which survived.
		expect(summary.matched.map((m) => m.tier)).toEqual([2]);
	});

	it("renamed and its opening changed, without a snapshot: no match; recovered, pruned, and the new file gets an unplaced entry", async () => {
		const { root, project, summary } = await whileClosed(
			(r) => {
				mv(r, `${A}/ch-a1.md`, `${A}/Renamed one.md`);
				fs.writeFileSync(path.join(r, `${A}/Renamed one.md`), "A completely different opening.\n");
			},
			{ snapshot: false },
		);
		expect(summary.matched).toEqual([]);
		expect(summary.pruned).toHaveLength(1);
		expect(summary.pruned[0].path).toBe(`${A}/ch-a1.md`);
		expect(summary.added).toEqual([`${A}/Renamed one.md`]);
		const fm = readBookFrontmatter(project, "aaa")!;
		expect(fm.chapters["ch-a1.md"]).toBeUndefined();
		expect(Object.keys(fm.chapters)).toContain("Renamed one.md");
		expect(fm.chapterOrder).not.toContain("Renamed one.md");
		// Recovered first: the recovery file holds exactly what was removed.
		const rec = parseYamlText(rd(root, summary.pruned[0].recoveryPath));
		expect(rec).toMatchObject({ chapter: "ch-a1.md", book: "aaa", "listed-in": ["chapter-order"], "chapter-entry": { "chapter-id": "c-a1k3", "chapter-title": "Chapter #", plot: "Jane reaches the harbour at dawn.", "chapter-color": "#aa3300" } });
		expect(rd(root, summary.pruned[0].recoveryPath).split("\n")[0]).toMatch(/^# Pruned from _story-library\/novel-aaa\.md: ch-a1\.md/);
		// Sidecars are retired, not deleted.
		expect(fs.existsSync(path.join(root, ".trash/_backstage/storyforge/aaa/chapters/ch-a1.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, ".trash/_backstage/storyforge/aaa/story-details/ch-a1.md"))).toBe(true);
	});
});

describe("a Codex note renamed while the app was closed", () => {
	const rename = (r: string) => mv(r, "Codex/Jane.md", "Codex/Janet.md");

	it("with a snapshot: matched, and codex.md and the PoV references follow", async () => {
		const { project, summary } = await whileClosed(rename);
		expect(summary.matched).toEqual([{ kind: "codex", tier: 1, from: "Codex/Jane.md", to: "Codex/Janet.md", referenceFiles: 1 }]);
		const c = readCodexFrontmatter(project);
		expect(c.folders["f-cast"].order).toEqual(["Codex/Janet.md", "Codex/Sam.md"]);
		expect(c.types["Codex/Janet.md"]).toBe("person");
		expect(c.types["Codex/Jane.md"]).toBeUndefined();
		expect(readBookFrontmatter(project, "aaa")!.defaultPovPath).toBe("Codex/Janet.md");
		expect(readBookFrontmatter(project, "aaa")!.chapters["ch-a1.md"].pov.map((r) => r.path)).toEqual(["Codex/Janet.md"]);
		expect(readBookFrontmatter(project, "aaa")!.defaultPovName).toBe("Janet");
	});

	it("without a snapshot: recovered, then pruned", async () => {
		const { root, project, summary } = await whileClosed(rename, { snapshot: false });
		expect(summary.matched).toEqual([]);
		expect(summary.pruned).toHaveLength(1);
		expect(summary.pruned[0]).toMatchObject({ kind: "codex", path: "Codex/Jane.md" });
		const rec = parseYamlText(rd(root, summary.pruned[0].recoveryPath));
		expect(rec).toMatchObject({ "codex-note": "Codex/Jane.md", type: "person", folders: [{ id: "f-cast", name: "Cast" }] });
		expect((rec as { references: unknown[] }).references.length).toBeGreaterThan(0);
		expect(readCodexFrontmatter(project).types["Codex/Jane.md"]).toBeUndefined();
		// A note that could not be matched leaves its references as they are: they show as missing, never dropped.
		expect(readBookFrontmatter(project, "aaa")!.defaultPovPath).toBe("Codex/Jane.md");
	});
});

describe("other moves while closed", () => {
	it("a chapter moved to another book: unplaced there, with its details and sidecars", async () => {
		const { root, project, summary } = await whileClosed((r) => mv(r, `${A}/ch-a1.md`, "_story-library/bbb/ch-a1.md"));
		expect(summary.matched).toEqual([{ kind: "chapter", tier: 1, from: `${A}/ch-a1.md`, to: "_story-library/bbb/ch-a1.md", crossBook: true }]);
		const bbb = readBookFrontmatter(project, "bbb")!;
		expect(bbb.unplaced).toContain("ch-a1.md");
		expect(bbb.chapters["ch-a1.md"]).toMatchObject({ chapterId: "c-a1k3", plot: "Jane reaches the harbour at dawn.", color: "#aa3300" });
		expect(readBookFrontmatter(project, "aaa")!.chapters["ch-a1.md"]).toBeUndefined();
		expect(rd(root, "_backstage/storyforge/bbb/chapters/ch-a1.md")).toContain("chapter: ch-a1.md");
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/bbb/story-details/ch-a1.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/aaa/chapters/ch-a1.md"))).toBe(false);
	});

	it("a book folder renamed: its details, novel file and series entry follow, and nothing is pruned", async () => {
		const { root, project, summary } = await whileClosed((r) => mv(r, A, "_story-library/zzz"));
		expect(summary.matched).toEqual([{ kind: "book", tier: "folder", from: A, to: "_story-library/zzz" }]);
		expect(summary.pruned).toEqual([]);
		expect(summary.added).toEqual([]);
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/zzz/chapters/ch-a1.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, "_story-library/novel-zzz.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, "_story-library/novel-aaa.md"))).toBe(false);
		const series = project.frontmatter("_story-library/series.md")!;
		expect(series.order).toEqual(["zzz", "bbb"]);
		expect(Object.keys(series.books as object).sort()).toEqual(["bbb", "ccc", "zzz"]);
		expect(readBookFrontmatter(project, "zzz")!.chapterOrder).toEqual(["ch-a1.md", "ch-a2.md", "ch-a5.md"]);
	});
});

describe("a renamed book folder whose new novel file already exists", () => {
	it("renames nothing and overwrites nothing: the book is gated and reported", async () => {
		const { root, project, summary } = await whileClosed((r) => {
			fs.renameSync(path.join(r, A), path.join(r, "_story-library/zzz"));
			fs.writeFileSync(path.join(r, "_story-library/novel-zzz.md"), "---\nbook-id-reference: b-zzz\n---\nmine\n");
		});
		expect(summary.matched.filter((m) => m.kind === "book")).toEqual([]);
		// a folder whose novel file already exists is a registered book, not a renamed one: the old book is gated
		expect(summary.gated.some((g) => g.area === "book:aaa" && (g.reason === "novel-exists" || g.reason === "folder-missing"))).toBe(true);
		expect(summary.pruned).toEqual([]);
		// the existing novel file is never replaced (new chapters may get entries, as in any registered book)
		expect(rd(root, "_story-library/novel-zzz.md")).toContain("book-id-reference: b-zzz");
		expect(rd(root, "_story-library/novel-zzz.md").endsWith("---\nmine\n")).toBe(true);
		expect(fs.existsSync(path.join(root, "_story-library/novel-aaa.md"))).toBe(true);
		expect(fs.existsSync(path.join(root, "_backstage/storyforge/aaa/chapters/ch-a1.md"))).toBe(true);
		expect(project.exists("_story-library/zzz")).toBe(true);
	});
});

describe("what can't be matched", () => {
	it("two new empty chapters and two vanished empty chapters: no matches; recovered, pruned, and new unplaced entries", async () => {
		const { project, summary } = await whileClosed(
			(r) => {
				fs.rmSync(path.join(r, "_story-library/bbb/e1.md"));
				fs.rmSync(path.join(r, "_story-library/bbb/e2.md"));
				fs.writeFileSync(path.join(r, "_story-library/bbb/n1.md"), "");
				fs.writeFileSync(path.join(r, "_story-library/bbb/n2.md"), "\n\n");
			},
			{
				prepare: async (_p, r) => {
					fs.writeFileSync(path.join(r, "_story-library/bbb/e1.md"), "");
					fs.writeFileSync(path.join(r, "_story-library/bbb/e2.md"), "\n");
					const p = await open(r);
					const { ensureAllChapterEntries } = await import("../book");
					await ensureAllChapterEntries(p, "bbb");
					await updateChapterFingerprint(p, "bbb", "e1.md", { opening: "", closing: "" });
					await updateChapterFingerprint(p, "bbb", "e2.md", { opening: "", closing: "" });
				},
			},
		);
		expect(summary.matched).toEqual([]);
		expect(summary.pruned.map((p) => p.path).sort()).toEqual(["_story-library/bbb/e1.md", "_story-library/bbb/e2.md"]);
		expect(summary.added.sort()).toEqual(["_story-library/bbb/n1.md", "_story-library/bbb/n2.md"]);
		const bbb = readBookFrontmatter(project, "bbb")!;
		expect(Object.keys(bbb.chapters).sort()).toEqual(["ch-b1.md", "n1.md", "n2.md"]);
		expect(bbb.chapterOrder).toEqual(["ch-b1.md"]);
	});

	it("ambiguous fingerprints: no match, both recovered and pruned", async () => {
		const { project, summary } = await whileClosed(
			(r) => {
				mv(r, `${A}/ch-a2.md`, `${A}/twin-x.md`);
				mv(r, `${A}/ch-a5.md`, `${A}/twin-y.md`);
				fs.writeFileSync(path.join(r, `${A}/twin-x.md`), "Same opening here.\n\nSame closing here.\n");
				fs.writeFileSync(path.join(r, `${A}/twin-y.md`), "Same opening here.\n\nSame closing here.\n");
			},
			{
				snapshot: false,
				prepare: async (p) => {
					await updateChapterFingerprint(p, "aaa", "ch-a2.md", { opening: "Same opening here.", closing: "Same closing here." });
					await updateChapterFingerprint(p, "aaa", "ch-a5.md", { opening: "Same opening here.", closing: "Same closing here." });
				},
			},
		);
		expect(summary.matched).toEqual([]);
		expect(summary.ambiguous.map((a) => a.path).sort()).toEqual([`${A}/ch-a2.md`, `${A}/ch-a5.md`]);
		expect(summary.ambiguous[0].candidates.sort()).toEqual([`${A}/twin-x.md`, `${A}/twin-y.md`]);
		expect(summary.pruned).toHaveLength(2);
		expect(summary.added.sort()).toEqual([`${A}/twin-x.md`, `${A}/twin-y.md`]);
		expect(readBookFrontmatter(project, "aaa")!.chapterOrder).toEqual(["ch-a1.md"]);
	});

	it("the closing fingerprint breaks a tie between candidates that share an opening", async () => {
		const { summary } = await whileClosed(
			(r) => {
				mv(r, `${A}/ch-a2.md`, `${A}/twin-x.md`);
				mv(r, `${A}/ch-a5.md`, `${A}/twin-y.md`);
				fs.writeFileSync(path.join(r, `${A}/twin-x.md`), "Same opening here.\n\nEnding for two.\n");
				fs.writeFileSync(path.join(r, `${A}/twin-y.md`), "Same opening here.\n\nEnding for five.\n");
			},
			{
				snapshot: false,
				prepare: async (p) => {
					await updateChapterFingerprint(p, "aaa", "ch-a2.md", { opening: "Same opening here.", closing: "Ending for two." });
					await updateChapterFingerprint(p, "aaa", "ch-a5.md", { opening: "Same opening here.", closing: "Ending for five." });
				},
			},
		);
		expect(summary.matched.map((m) => [m.from, m.to, m.tier])).toEqual([
			[`${A}/ch-a2.md`, `${A}/twin-x.md`, 2],
			[`${A}/ch-a5.md`, `${A}/twin-y.md`, 2],
		]);
		expect(summary.pruned).toEqual([]);
	});

	it("a failed recovery file means nothing is pruned", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		fs.rmSync(path.join(root, `${A}/ch-a2.md`));
		const reopened = await open(root);
		reopened.fs.createRecovery = async () => {
			throw new Error("disk full");
		};
		const before = dirSnapshot(root);
		const summary = await reconcileAtOpen(reopened, null, "missing");
		expect(summary.pruned).toEqual([]);
		expect(summary.skipped[0].reason).toContain("not pruned");
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		void project;
	});

	it("a vanished file with no recorded details has nothing to prune", async () => {
		const { summary } = await whileClosed((r) => fs.rmSync(path.join(r, `${A}/ch-a3.md`)), { snapshot: true });
		// ch-a3 is listed (unplaced) so it is pruned; a note nobody recorded is skipped
		expect(summary.pruned.map((p) => p.path)).toEqual([`${A}/ch-a3.md`]);
		const none = await whileClosed((r) => fs.rmSync(path.join(r, "Codex/Zoë Åberg — 日本語.md")));
		expect(none.summary.pruned).toEqual([]);
		expect(none.summary.skipped.map((s) => s.reason)).toEqual([expect.stringContaining("nothing was recorded")]);
	});
});

describe("gates", () => {
	it("a book folder that is missing: gated; nothing pruned or added", async () => {
		const root = copyFixture("series");
		const before = dirSnapshot(root);
		fs.rmSync(path.join(root, A), { recursive: true });
		const project = await open(root);
		const summary = await reconcileAtOpen(project, null, "missing");
		expect(summary.gated.map((g) => [g.area, g.reason])).toEqual([["book:aaa", "folder-missing"]]);
		expect(summary.pruned).toEqual([]);
		expect(summary.added).toEqual([]);
		expect(summary.matched).toEqual([]);
		const diff = diffSnapshots(before, dirSnapshot(root));
		expect(diff.added).toEqual([]);
		expect(diff.changed).toEqual([]);
		expect(readBookFrontmatter(project, "aaa")!.chapterOrder).toEqual(["ch-a1.md", "ch-a2.md", "ch-a5.md"]);
	});

	it("a book folder that was emptied: gated", async () => {
		const { summary, project } = await whileClosed((r) => {
			for (const f of fs.readdirSync(path.join(r, A))) fs.rmSync(path.join(r, A, f));
		});
		expect(summary.gated.map((g) => [g.area, g.reason])).toEqual([["book:aaa", "folder-empty"]]);
		expect(summary.pruned).toEqual([]);
		expect(Object.keys(readBookFrontmatter(project, "aaa")!.chapters)).toHaveLength(5);
	});

	it("iCloud placeholders in place of half a book: nothing pruned; the book is reported", async () => {
		const { summary, project, root } = await whileClosed((r) => {
			for (const f of ["ch-a1.md", "ch-a2.md"]) {
				fs.rmSync(path.join(r, A, f));
				fs.writeFileSync(path.join(r, A, `.${f}.icloud`), "stub");
			}
			fs.rmSync(path.join(r, A, "ch-a5.md")); // a real deletion in the same book: still not pruned while the book is incomplete
		});
		expect(summary.gated).toEqual([{ area: "book:aaa", reason: "not-downloaded", detail: expect.stringContaining("2 file(s)") }]);
		expect(summary.pruned).toEqual([]);
		expect(summary.matched).toEqual([]);
		expect(project.isPlaceholder(`${A}/ch-a1.md`)).toBe(true);
		expect(project.exists(`${A}/ch-a1.md`)).toBe(false);
		await expect(project.readText(`${A}/ch-a1.md`)).rejects.toMatchObject({ name: "PlaceholderNotDownloadedError" });
		expect(readBookFrontmatter(project, "aaa")!.chapterOrder).toEqual(["ch-a1.md", "ch-a2.md", "ch-a5.md"]);
		void root;
	});

	it("Codex missing while codex.md lists entries: gated", async () => {
		const { summary } = await whileClosed((r) => fs.rmSync(path.join(r, "Codex"), { recursive: true }));
		expect(summary.gated.map((g) => [g.area, g.reason])).toEqual([["codex", "codex-missing"]]);
		expect(summary.pruned).toEqual([]);
	});

	it("unreadable backstage details gate the book instead of being treated as empty", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, "_story-library/novel-bbb.md"), "---\nanchors: &a [1]\nagain: *a\n---\n");
		fs.rmSync(path.join(root, "_story-library/bbb/ch-b1.md"));
		const project = await open(root);
		const summary = await reconcileAtOpen(project, null, "missing");
		expect(summary.gated.map((g) => [g.area, g.reason])).toEqual([["book:bbb", "unreadable"]]);
		expect(summary.pruned).toEqual([]);
	});

	it("an up-to-date project reconciles to nothing and writes nothing", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const snap = buildSnapshot(project, root);
		const before = dirSnapshot(root);
		const summary = await reconcileAtOpen(project, snap, "used");
		expect(summaryIsEmpty(summary)).toBe(true);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		expect(computeGates(project)).toEqual([]);
	});
});

describe("while the app is running (the watcher's path)", () => {
	it("evidence from the live index matches a rename at tier 1", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const from = `${A}/ch-a2.md`;
		const evidence = evidenceFromIndex(project, [from]);
		mv(root, from, `${A}/Second.md`);
		await project.index.applyChange({ type: "renamed", from, to: `${A}/Second.md` });
		const summary = await reconcileChanges(project, { vanished: [from], appeared: [`${A}/Second.md`], evidence });
		expect(summary.matched).toEqual([{ kind: "chapter", tier: 1, from, to: `${A}/Second.md` }]);
		expect(readBookFrontmatter(project, "aaa")!.chapterOrder).toEqual(["ch-a1.md", "Second.md", "ch-a5.md"]);
	});

	it("ignores paths that are not chapters or Codex notes, and stale input", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const before = dirSnapshot(root);
		const s = await reconcileChanges(project, { vanished: ["notes/idea.md", `${A}/ch-a1.md`, "elsewhere/x.md"], appeared: ["notes/nope.md", `${A}/missing.md`] });
		expect(summaryIsEmpty(s)).toBe(true);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});
});
