import { describe, expect, it } from "vitest";
import { memoryProject } from "../../../test/helpers/memoryProject";
import { sha256Text } from "../hash";
import { NotACodexNoteError, UnlinkableNameError, planCodexRename } from "../linkRewriter";

const CH = "_story-library/aaa/ch1.md";

async function plan(files: Record<string, string | null>, newName = "Janet", note = "Codex/Jane.md") {
	const m = await memoryProject({ "Codex/Jane.md": "---\naliases: [J]\n---\nJane's page.\n", ...files });
	return { ...m, plan: await planCodexRename(m.project, note, newName) };
}
const spansOf = (p: Awaited<ReturnType<typeof plan>>["plan"], file: string) => p.files.find((f) => f.path === file)?.spans ?? [];

describe("planCodexRename: the link forms", () => {
	it("recognises every form in the brief and keeps display text, headings, block references and embed markers", async () => {
		const body = [
			"[[Jane]] [[Jane|Her]] [[Jane#Early life]] [[Jane#^abc123]] [[Jane#Early life|Her]] [[Jane#^abc|Blk]]",
			"![[Jane]] ![[Jane|200]] ![[Jane#Early life]] ![[Jane#^abc]]",
			"[[Codex/Jane]] [[Codex/Jane.md]] [[Codex/Jane.md|x]] [[Codex/Jane#h|y]] ![[Codex/Jane]]",
			"[a](Codex/Jane.md) [b](Codex/Jane.md#Early%20life) [c](<Codex/Jane.md>) [d](Codex/Jane.md \"T\") ![e](Codex/Jane.md)",
		].join("\n");
		const { plan: p } = await plan({ [CH]: body });
		expect(p.unchanged).toBe(false);
		expect(p.newPath).toBe("Codex/Janet.md");
		const spans = spansOf(p, CH);
		expect(spans).toHaveLength(6 + 4 + 5 + 5);
		// every span replaces just the name: apply them and look at the result
		let out = body;
		for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.new + out.slice(s.end);
		expect(out).toBe(
			[
				"[[Janet]] [[Janet|Her]] [[Janet#Early life]] [[Janet#^abc123]] [[Janet#Early life|Her]] [[Janet#^abc|Blk]]",
				"![[Janet]] ![[Janet|200]] ![[Janet#Early life]] ![[Janet#^abc]]",
				"[[Codex/Janet]] [[Codex/Janet.md]] [[Codex/Janet.md|x]] [[Codex/Janet#h|y]] ![[Codex/Janet]]",
				"[a](Codex/Janet.md) [b](Codex/Janet.md#Early%20life) [c](<Codex/Janet.md>) [d](Codex/Janet.md \"T\") ![e](Codex/Janet.md)",
			].join("\n"),
		);
		expect(p.files[0].hash).toBe(sha256Text(body));
		expect(p.totalLinks).toBe(20);
	});

	it("encodes spaces in markdown links and keeps them literal inside angle brackets", async () => {
		const body = "[a](Codex/Jane.md) [b](<Codex/Jane.md>) [c](Codex/Jane)";
		const { plan: p } = await plan({ [CH]: body }, "Janet Smith (II)");
		const out = apply(body, spansOf(p, CH));
		expect(out).toBe("[a](Codex/Janet%20Smith%20%28II%29.md) [b](<Codex/Janet Smith (II).md>) [c](Codex/Janet%20Smith%20%28II%29)");
	});

	it("matches the old name written with encoded spaces, relative paths, other capitalisation and Unicode forms", async () => {
		const m = await memoryProject({ "Codex/Jane Doe.md": "x", "notes/n.md": "[a](Codex/Jane%20Doe.md) [b](../Codex/Jane%20Doe.md) [[jane doe]] [[CODEX/jane doe.MD]] [c](./nothing.md)" });
		const p = await planCodexRename(m.project, "Codex/Jane Doe.md", "Janet");
		expect(spansOf(p, "notes/n.md")).toHaveLength(4);
		const cafe = await memoryProject({ "Codex/Café.md": "x", "notes/n.md": "[[Café]] [[Café]]" });
		const p2 = await planCodexRename(cafe.project, "Codex/Café.md", "Bar");
		expect(spansOf(p2, "notes/n.md")).toHaveLength(2);
	});

	it("rewrites links inside frontmatter values, planned as frontmatter spans with their key path", async () => {
		const { plan: p } = await plan({ "notes/n.md": '---\nrelated: "[[Jane]]"\nlinks:\n  - "[[Codex/Jane.md|J]]"\n  - plain\nnested:\n  who: "see [[Jane]] and [[Sam]]"\n---\nBody [[Jane]]\n' });
		const spans = spansOf(p, "notes/n.md");
		expect(spans.map((s) => [s.region, s.keyPath])).toEqual([
			["frontmatter", ["related"]], ["frontmatter", ["links", 0]], ["frontmatter", ["nested", "who"]], ["body", undefined],
		]);
		expect(spans[2]).toMatchObject({ old: "Jane", new: "Janet", start: 6, end: 10 });
	});

	it("includes the note's own file, chapters (archived too), notes and novel files", async () => {
		const { plan: p } = await plan({
			"Codex/Jane.md": "Self: [[Jane]]",
			[CH]: "[[Jane]]",
			"_story-library/novel-aaa.md": "---\nx: 1\n---\nSynopsis [[Jane]]",
			"notes/archive/old.md": "[[Jane]]",
			"Codex/Sam.md": "[[Jane]] [[Sam]]",
		});
		expect(p.files.map((f) => f.path)).toEqual(["Codex/Jane.md", "Codex/Sam.md", "_story-library/aaa/ch1.md", "_story-library/novel-aaa.md", "notes/archive/old.md"].sort());
	});
});

describe("planCodexRename: which links count", () => {
	it("a bare link with two same-named notes in the project is ambiguous: left, and listed", async () => {
		const { plan: p } = await plan({ "notes/Jane.md": "x", [CH]: "A [[Jane]] and a [[Codex/Jane]] and [a](Codex/Jane.md)" });
		expect(spansOf(p, CH).map((s) => s.form)).toEqual(["wikilink", "markdown"]);
		expect(p.ambiguous).toEqual([{ path: CH, text: "[[Jane]]", region: "body", start: 2, end: 10, otherFiles: ["notes/Jane.md"] }]);
	});

	it("a same-named file in another folder or with other capitalisation also makes a bare link ambiguous", async () => {
		const { plan: p } = await plan({ "elsewhere/JANE.md": "x", [CH]: "[[Jane]]" });
		expect(p.files).toEqual([]);
		expect(p.ambiguous).toHaveLength(1);
		expect(p.ambiguous[0].otherFiles).toEqual(["elsewhere/JANE.md"]);
	});

	it("an iCloud placeholder with the same name also makes a bare link ambiguous", async () => {
		const { plan: p } = await plan({ "notes/.Jane.md.icloud": "stub", [CH]: "[[Jane]]" });
		expect(p.ambiguous).toHaveLength(1);
		expect(p.notDownloaded).toEqual(["notes/Jane.md"]);
	});

	it("links in code blocks, inline code and comments are untouched", async () => {
		const body = "```\n[[Jane]]\n```\n`[[Jane]]` %% [[Jane]] %%\n~~~\n[[Codex/Jane]]\n~~~\nreal [[Jane]]";
		const { plan: p } = await plan({ [CH]: body });
		expect(spansOf(p, CH)).toHaveLength(1);
		expect(body.slice(spansOf(p, CH)[0].start - 2, spansOf(p, CH)[0].end + 2)).toBe("[[Jane]]");
		expect(spansOf(p, CH)[0].start).toBe(body.lastIndexOf("[[Jane]]") + 2);
	});

	it("links to other notes, external URLs and headings-only are ignored", async () => {
		const { plan: p } = await plan({ [CH]: "[[Sam]] [[#Heading]] [x](https://example.com/Codex/Jane.md) [y](Codex/Sam.md) [[Janet]] [[Jane2]]" });
		expect(p.files).toEqual([]);
		expect(p.totalLinks).toBe(0);
	});

	it("counts links in other markdown files outside storyForge's folders, read-only", async () => {
		const { plan: p } = await plan({ "elsewhere/readme.md": "[[Codex/Jane]] [[Codex/Jane.md]]", "other/x.md": "[a](Codex/Jane.md)", "_backstage/storyforge/x.md": "[[Codex/Jane]]", [CH]: "[[Jane]]" });
		expect(p.outside).toEqual({ linkCount: 3, files: [{ path: "elsewhere/readme.md", count: 2 }, { path: "other/x.md", count: 1 }] });
		expect(p.files.map((f) => f.path)).toEqual([CH]);
	});

	it("reports files it couldn't read and placeholders in storyForge's folders", async () => {
		const m = await memoryProject({ "Codex/Jane.md": "x", [CH]: "[[Jane]]", "_story-library/aaa/.ch2.md.icloud": "stub" });
		const orig = m.backend.readText.bind(m.backend);
		m.backend.readText = async (p: string) => {
			if (p === CH) throw new Error("EIO");
			return orig(p);
		};
		const p = await planCodexRename(m.project, "Codex/Jane.md", "Janet");
		expect(p.unreadable).toEqual([{ path: CH, reason: "EIO" }]);
		expect(p.notDownloaded).toEqual(["_story-library/aaa/ch2.md"]);
	});

	it("lists unquoted [[X]] frontmatter values that name the note, without rewriting them", async () => {
		const { plan: p } = await plan({ "notes/n.md": "---\nrelated: [[Jane]]\nother: [[Sam]]\nquoted: \"[[Jane]]\"\nlist:\n  - [[Codex/Jane]]\n---\nBody\n" });
		expect(p.unquotedFrontmatter).toEqual([
			{ path: "notes/n.md", keyPath: ["related"], text: "[[Jane]]" },
			{ path: "notes/n.md", keyPath: ["list", 0], text: "[[Codex/Jane]]" },
		]);
		expect(spansOf(p, "notes/n.md").map((s) => s.keyPath)).toEqual([["quoted"]]);
	});

	it("flags a file whose frontmatter can't be read but holds links", async () => {
		const { plan: p } = await plan({ "notes/n.md": "---\nrel: &a [[Jane]]\nagain: *a\n---\nBody [[Jane]]" });
		expect(p.frontmatterSkipped).toEqual(["notes/n.md"]);
		expect(spansOf(p, "notes/n.md").map((s) => s.region)).toEqual(["body"]);
	});
});

describe("planCodexRename: the name", () => {
	it("goes through the existing sanitising and uniqueness rules", async () => {
		const { plan: p } = await plan({ "Codex/Janet.md": "x" }, "  Jan/et?  ");
		expect(p.newPath).toBe("Codex/Janet 2.md");
		expect(p.newName).toBe("Janet 2");
	});
	it("a blank, unchanged or self-resolving name is a no-op plan", async () => {
		for (const name of ["", "  ", "Jane", "Jane.md", "Jane?"]) expect((await plan({}, name)).plan.unchanged, name).toBe(true);
	});
	it("a case-only rename is a real rename", async () => {
		const { plan: p } = await plan({ [CH]: "[[Jane]]" }, "JANE");
		expect(p.unchanged).toBe(false);
		expect(p.newPath).toBe("Codex/JANE.md");
	});
	it("refuses a name links can't carry, and names that aren't Codex notes", async () => {
		const m = await memoryProject({ "Codex/Jane.md": "x", "notes/n.md": "x" });
		await expect(planCodexRename(m.project, "Codex/Jane.md", "Janet #2")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "Codex/Jane.md", "A [[B]]")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "Codex/Jane.md", "Jane | Doe")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "Codex/Jane.md", "Jane ^1")).rejects.toBeInstanceOf(UnlinkableNameError);
		await expect(planCodexRename(m.project, "notes/n.md", "X")).rejects.toBeInstanceOf(NotACodexNoteError);
		await expect(planCodexRename(m.project, "Codex/Nobody.md", "X")).rejects.toBeInstanceOf(NotACodexNoteError);
	});
	it("reads only: planning writes nothing", async () => {
		const { backend } = await plan({ [CH]: "[[Jane]]" });
		expect(backend.writes).toEqual([]);
	});
});

function apply(text: string, spans: { start: number; end: number; new: string }[]): string {
	let out = text;
	for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.new + out.slice(s.end);
	return out;
}

// =====================================================================================================
// applying
import * as fs from "node:fs";
import * as path from "node:path";
import { unzipSync } from "fflate";
import { afterEach } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot as dirSnapshot } from "../../../test/helpers/fixtures";
import { BackupService } from "../backup";
import { readBookFrontmatter } from "../book";
import { readCodexFrontmatter } from "../codex";
import { Project } from "../project";
import { ProseWriter } from "../proseWriter";
import { applyCodexRename, renameCodexNote, rewriteFileText } from "../linkRewriter";

afterEach(cleanupFixtures);

const NOW = () => new Date(2026, 9, 23, 10, 0, 0);
const CH1 = "_story-library/aaa/ch-a1.md";

/** The series fixture with links to Codex/Jane.md written into it. */
async function linked(extra: Record<string, string> = {}) {
	const root = copyFixture("series");
	const put = (rel: string, text: string) => fs.writeFileSync(path.join(root, rel), text);
	put(CH1, "Jane walked. See [[Jane]] and [[Jane|her]] and ![[Jane#Early life]].\n`[[Jane]]` stays.\n");
	put("_story-library/aaa/ch-a2.md", "Plain chapter with [a](Codex/Jane.md#Intro) and [[Codex/Jane.md]] and [[Sam]].\r\nCRLF kept.\r\n");
	put("notes/idea.md", '---\n# a comment that must survive\nrelated: "[[Jane]]"   # trailing comment\nkeep: [1,   2]\n---\n\nIdea about [[Jane]].\n');
	put("Codex/Sam.md", "---\naliases: []\n---\nSam knows [[Jane]] well.\n");
	put("Codex/Jane.md", "---\naliases: [J]\n---\nJane's own page links to [[Jane]] itself.\n");
	put("elsewhere/readme.md", "Outside: [[Codex/Jane]]\n");
	for (const [rel, text] of Object.entries(extra)) put(rel, text);
	const project = await Project.open(new NodeFsBackend(root));
	const backups = new BackupService(project, { projectName: "fixture", now: NOW });
	const writer = new ProseWriter(project, { now: NOW, sessionBackup: undefined, builtinSubscribers: false });
	const rd = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
	return { root, project, backups, writer, rd, put };
}

describe("applyCodexRename: end to end", () => {
	it("reports progress as each stage and each file finishes (the close watchdog counts from the last)", async () => {
		const { project, backups, writer } = await linked();
		let calls = 0;
		const result = await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups, writer, onProgress: () => calls++ });
		expect(result.status).toBe("done");
		// after the backup, once before each of five files, and after the files and the rewrite: no timer involved.
		expect(calls).toBeGreaterThanOrEqual(result.filesUpdated.length + 3);
	});

	it("backs up, renames, rewrites exactly the planned links, re-keys, and reports", async () => {
		const { root, project, backups, writer, rd } = await linked();
		const before = dirSnapshot(root);
		const result = await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups, writer });
		expect(result.status).toBe("done");
		expect(result.backupPath).toBe("_sf-backup/20261023-100000 - fixture - pre-rewrite.zip");
		expect(result.skippedChanged).toEqual([]);
		expect(result.skippedUnsafe).toEqual([]);
		expect(result.ambiguousLeft).toEqual([]);
		expect(result.outsideLinks).toBe(1);
		expect(result.filesUpdated.sort()).toEqual([CH1, "_story-library/aaa/ch-a2.md", "Codex/Janet.md", "Codex/Sam.md", "notes/idea.md"].sort());
		expect(result.linksUpdated).toBe(9); // 3 + 2 + 2 + 1 + 1

		expect(rd(CH1)).toBe("Jane walked. See [[Janet]] and [[Janet|her]] and ![[Janet#Early life]].\n`[[Jane]]` stays.\n");
		expect(rd("_story-library/aaa/ch-a2.md")).toBe("Plain chapter with [a](Codex/Janet.md#Intro) and [[Codex/Janet.md]] and [[Sam]].\r\nCRLF kept.\r\n");
		expect(rd("notes/idea.md")).toBe('---\n# a comment that must survive\nrelated: "[[Janet]]"   # trailing comment\nkeep: [1,   2]\n---\n\nIdea about [[Janet]].\n');
		expect(rd("Codex/Sam.md")).toBe("---\naliases: []\n---\nSam knows [[Janet]] well.\n");
		expect(rd("Codex/Janet.md")).toBe("---\naliases: [J]\n---\nJane's own page links to [[Janet]] itself.\n");
		expect(rd("elsewhere/readme.md")).toBe("Outside: [[Codex/Jane]]\n");
		expect(fs.existsSync(path.join(root, "Codex/Jane.md"))).toBe(false);

		// backstage re-keyed
		const c = readCodexFrontmatter(project);
		expect(c.folders["f-cast"].order).toEqual(["Codex/Janet.md", "Codex/Sam.md"]);
		expect(c.types["Codex/Janet.md"]).toBe("person");
		expect(readBookFrontmatter(project, "aaa")!.defaultPovPath).toBe("Codex/Janet.md");

		// the backup holds exactly the files that were to change, plus the note, as they were
		const zip = unzipSync(new Uint8Array(fs.readFileSync(path.join(root, result.backupPath as string))));
		expect(Object.keys(zip).sort()).toEqual(["Codex/Jane.md", "Codex/Sam.md", CH1, "_story-library/aaa/ch-a2.md", "notes/idea.md"].sort());
		expect(new TextDecoder().decode(zip[CH1])).toContain("[[Jane]] and [[Jane|her]]");

		// nothing else on disk moved
		const diff = diffSnapshots(before, dirSnapshot(root));
		expect(diff.removed).toEqual(["Codex/Jane.md"]);
		expect(diff.added.sort()).toEqual(["Codex/Janet.md", "_sf-backup/", "_sf-backup/20261023-100000 - fixture - pre-rewrite.zip"].sort());
		expect(diff.changed.sort()).toEqual([CH1, "_story-library/aaa/ch-a2.md", "Codex/Sam.md", "notes/idea.md", "_story-library/novel-aaa.md", "_backstage/storyforge/codex.md"].sort());
		// the index matches the disk
		expect(project.exists("Codex/Janet.md")).toBe(true);
		expect(project.exists("Codex/Jane.md")).toBe(false);
		expect(project.index.get("Codex/Sam.md")?.hash).toBeTruthy();
	});

	it("flushes open editors first, reloads the ones it rewrote, and closes the renamed note's editor", async () => {
		const { project, backups, writer, rd } = await linked();
		const ch = await writer.open(CH1);
		const note = await writer.open("Codex/Jane.md");
		const events: string[] = [];
		ch.onReload((e) => events.push(e.body));
		ch.setBody("Unsaved: now also [[Jane]] again.");
		note.setBody("Unsaved note text");
		const result = await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups, writer });
		expect(result.flushed.map((r) => r.kind).sort()).toEqual(["saved", "saved"]);
		expect(rd(CH1)).toBe("Unsaved: now also [[Janet]] again.\n"); // the plan was made after the flush
		expect(events).toEqual(["Unsaved: now also [[Janet]] again."]);
		expect(ch.dirty).toBe(false);
		expect(writer.session("Codex/Jane.md")).toBeUndefined();
		expect(rd("Codex/Janet.md")).toContain("Unsaved note text");
	});

	it("a file changed between plan and apply is skipped and listed, and left untouched", async () => {
		const { project, backups, rd, put, root } = await linked();
		const plan = await planCodexRename(project, "Codex/Jane.md", "Janet");
		put("Codex/Sam.md", "---\naliases: []\n---\nSam, edited since the plan, still knows [[Jane]].\n");
		const result = await applyCodexRename(project, plan, { backups });
		expect(result.status).toBe("done");
		expect(result.skippedChanged).toEqual(["Codex/Sam.md"]);
		expect(rd("Codex/Sam.md")).toBe("---\naliases: []\n---\nSam, edited since the plan, still knows [[Jane]].\n");
		expect(rd(CH1)).toContain("[[Janet]]");
		expect(readCodexFrontmatter(project).types["Codex/Janet.md"]).toBe("person"); // re-keyed anyway
		void root;
	});

	it("a compare-then-write conflict at the last moment is skipped too", async () => {
		const { project, backups, rd, put } = await linked();
		const plan = await planCodexRename(project, "Codex/Jane.md", "Janet");
		const realLink = project.fs.linkRewrite.bind(project.fs);
		project.fs.linkRewrite = async (p: string, expected: string, text: string) => {
			if (p === "Codex/Sam.md") put(p, "changed in the last microseconds\n");
			return realLink(p, expected, text);
		};
		const result = await applyCodexRename(project, plan, { backups });
		expect(result.skippedChanged).toEqual(["Codex/Sam.md"]);
		expect(rd("Codex/Sam.md")).toBe("changed in the last microseconds\n");
	});

	it("if the pre-rewrite backup fails, nothing changes", async () => {
		const { root, project, backups } = await linked();
		const before = dirSnapshot(root);
		backups.runPreRewrite = async () => {
			throw new Error("no space left");
		};
		const result = await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups });
		expect(result).toMatchObject({ status: "stopped", stoppedAt: "backup" });
		expect(result.error?.message).toBe("no space left");
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		expect(project.exists("Codex/Jane.md")).toBe(true);
	});

	it("if the rename fails, nothing but the backup is added", async () => {
		const { root, project, backups } = await linked();
		const before = dirSnapshot(root);
		const plan = await planCodexRename(project, "Codex/Jane.md", "Janet");
		fs.writeFileSync(path.join(root, "Codex/Janet.md"), "arrived after the plan");
		before.set("Codex/Janet.md", "x");
		const result = await applyCodexRename(project, plan, { backups });
		expect(result).toMatchObject({ status: "stopped", stoppedAt: "rename" });
		expect(fs.readFileSync(path.join(root, "Codex/Jane.md"), "utf8")).toContain("Jane's own page");
		expect(fs.readFileSync(path.join(root, CH1), "utf8")).toContain("[[Jane]]");
		expect(fs.readFileSync(path.join(root, "Codex/Janet.md"), "utf8")).toBe("arrived after the plan");
	});

	it("stops, with nothing changed, if unsaved text can neither be saved nor recovered", async () => {
		const { root, project, backups, writer } = await linked();
		const s = await writer.open(CH1);
		s.setBody("precious");
		project.fs.proseWrite = async () => {
			throw new Error("EIO");
		};
		project.fs.createRecovery = async () => {
			throw new Error("EIO");
		};
		const before = dirSnapshot(root);
		const plan = await planCodexRename(project, "Codex/Jane.md", "Janet");
		const result = await applyCodexRename(project, plan, { backups, writer });
		expect(result).toMatchObject({ status: "stopped", stoppedAt: "flush" });
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		expect(s.body).toBe("precious");
	});

	it("ambiguous bare links are left and reported", async () => {
		const { project, backups, rd } = await linked({ "notes/Jane.md": "another Jane\n", "notes/mention.md": "bare [[Jane]] and path [[Codex/Jane]]\n" });
		const result = await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups });
		expect(rd("notes/mention.md")).toBe("bare [[Jane]] and path [[Codex/Janet]]\n");
		expect(result.ambiguousLeft.map((a) => a.path)).toContain("notes/mention.md");
		expect(result.ambiguousLeft.every((a) => a.otherFiles.includes("notes/Jane.md"))).toBe(true);
	});

	it("a case-only rename works end to end", async () => {
		const { project, backups, rd, root } = await linked();
		const result = await renameCodexNote(project, "Codex/Jane.md", "JANE", { backups });
		expect(result.status).toBe("done");
		expect(fs.readdirSync(path.join(root, "Codex"))).toContain("JANE.md");
		expect(rd(CH1)).toContain("[[JANE]]");
		expect(project.index.get("Codex/JANE.md")?.path).toBe("Codex/JANE.md");
	});

	it("an unchanged name does nothing, and an unlinkable name is refused before anything is touched", async () => {
		const { root, project, backups } = await linked();
		const before = dirSnapshot(root);
		expect((await renameCodexNote(project, "Codex/Jane.md", "Jane", { backups })).status).toBe("unchanged");
		await expect(renameCodexNote(project, "Codex/Jane.md", "Jane [2]", { backups })).rejects.toBeInstanceOf(UnlinkableNameError);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("never deletes anything: the old file is gone only because it was renamed", async () => {
		const { root, project, backups } = await linked();
		const before = dirSnapshot(root);
		await renameCodexNote(project, "Codex/Jane.md", "Janet", { backups });
		const after = dirSnapshot(root);
		expect(diffSnapshots(before, after).removed).toEqual(["Codex/Jane.md"]);
		expect(after.has("Codex/Janet.md")).toBe(true);
		expect(fs.existsSync(path.join(root, ".trash"))).toBe(false);
	});
});

describe("rewriteFileText: the proof of minimality", () => {
	const span = (over: Partial<import("../linkRewriter").LinkSpan>) => ({ region: "body" as const, start: 0, end: 0, old: "", new: "", form: "wikilink" as const, ...over });

	it("replaces exactly the planned spans", () => {
		const text = "a [[Jane]] b [[Jane]] c";
		expect(rewriteFileText("x.md", text, [span({ start: 4, end: 8, old: "Jane", new: "Janet" }), span({ start: 15, end: 19, old: "Jane", new: "Janet" })])).toBe("a [[Janet]] b [[Janet]] c");
	});
	it("refuses a span whose text is no longer what was planned", () => {
		expect(() => rewriteFileText("x.md", "a [[Sam]] b", [span({ start: 4, end: 8, old: "Jane", new: "Janet" })])).toThrow(/no longer/);
	});
	it("refuses a body span that falls inside the frontmatter", () => {
		expect(() => rewriteFileText("x.md", "---\nk: Jane\n---\nbody", [span({ start: 7, end: 11, old: "Jane", new: "Janet" })])).toThrow();
	});
	it("a frontmatter rewrite that would reshape other lines is refused, not accepted", () => {
		const text = "---\nlinks:\n  - 'plain'\n  - \"[[Jane]]\"\n---\nbody\n";
		const fmSpan = span({ region: "frontmatter", keyPath: ["links", 1], start: 2, end: 6, old: "Jane", new: "Janet" });
		let result: string | null = null;
		try {
			result = rewriteFileText("x.md", text, [fmSpan]);
		} catch (err) {
			expect((err as Error).message).toMatch(/would change/);
		}
		if (result !== null) {
			// if the editor kept every other line as it was, the result is exactly the planned change
			expect(result).toBe(text.replace("[[Jane]]", "[[Janet]]"));
		}
	});
	it("rewrites a scalar frontmatter value and nothing else, keeping comments", () => {
		const text = '---\n# note\nrelated: "[[Jane]]"  # why\nother: 1\n---\nBody [[Jane]]\n';
		const out = rewriteFileText("x.md", text, [
			span({ region: "frontmatter", keyPath: ["related"], start: 2, end: 6, old: "Jane", new: "Janet" }),
			span({ start: text.lastIndexOf("Jane"), end: text.lastIndexOf("Jane") + 4, old: "Jane", new: "Janet" }),
		]);
		expect(out).toBe('---\n# note\nrelated: "[[Janet]]"  # why\nother: 1\n---\nBody [[Janet]]\n');
	});
});
