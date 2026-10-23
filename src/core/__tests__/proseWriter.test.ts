import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { ManualScheduler, settle } from "../../../test/helpers/scheduler";
import { archiveChapter } from "../book";
import { archiveCodexItem } from "../codex";
import { Project } from "../project";
import { type ChapterChange, ProseRefused, ProseWriter, type ProseWriterOptions } from "../proseWriter";
import { decideDiskChange, minimalReplacement, parseProseFile, serialiseProseFile, splitFrontmatter } from "../proseFile";

afterEach(cleanupFixtures);

async function setup(options: ProseWriterOptions = {}, prepare?: (root: string) => void) {
	const root = copyFixture("series");
	prepare?.(root);
	const backend = new NodeFsBackend(root);
	const project = await Project.open(backend);
	const scheduler = new ManualScheduler();
	const writer = new ProseWriter(project, { scheduler, now: () => new Date(2026, 9, 23, 10, 0, 0), ...options });
	const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
	const write = (rel: string, text: string) => fs.writeFileSync(path.join(root, rel), text);
	return { root, project, writer, scheduler, read, write, backend };
}
const CH = "_story-library/aaa/ch-a1.md";

describe("proseFile (ported pure helpers)", () => {
	it("splits, rebuilds and round-trips byte for byte", () => {
		for (const raw of [
			"", "plain\n", "plain", "---\na: 1\n---\nbody\n", "---\r\na: 1\r\n---\r\nbody\r\nmore\r\n", "---\na: 1\n---", "---\nnever closed\nbody", "﻿bom\n", "a\n\nb\n\n", "---\n---\n\n\ntext",
		]) {
			const { shape, body } = parseProseFile(raw);
			expect(serialiseProseFile(shape, body), JSON.stringify(raw)).toBe(raw);
			const { frontmatter, rest } = splitFrontmatter(raw);
			expect(frontmatter + rest).toBe(raw);
		}
	});
	it("keeps CRLF when the body changes", () => {
		const { shape } = parseProseFile("---\nk: v\n---\r\nold\r\n");
		expect(serialiseProseFile(shape, "new\nlines")).toBe("---\nk: v\n---\r\nnew\r\nlines\r\n");
	});
	it("decideDiskChange is the 0.17.1 decision", () => {
		const base = { disk: "b", knownDisk: "a", inFlight: null, dirty: false };
		expect(decideDiskChange({ ...base, disk: "a" })).toBe("ignore");
		expect(decideDiskChange({ ...base, inFlight: "b" })).toBe("ignore");
		expect(decideDiskChange(base)).toBe("reload");
		expect(decideDiskChange({ ...base, dirty: true })).toBe("recover-then-reload");
	});
	it("minimalReplacement keeps the common prefix and suffix", () => {
		expect(minimalReplacement("abcdef", "abcdef")).toBeNull();
		expect(minimalReplacement("abcdef", "abXYef")).toEqual({ from: 2, to: 4, insert: "XY" });
		expect(minimalReplacement("", "x")).toEqual({ from: 0, to: 0, insert: "x" });
		expect(minimalReplacement("abc", "")).toEqual({ from: 0, to: 3, insert: "" });
	});
});

describe("sessions", () => {
	it("one file, one session (also under concurrent opens and case variants of the name)", async () => {
		const { writer } = await setup();
		const [a, b] = await Promise.all([writer.open(CH), writer.open(CH)]);
		expect(a).toBe(b);
		expect(await writer.open("_story-library/AAA/CH-A1.md")).toBe(a);
		expect(writer.openSessions()).toHaveLength(1);
		expect(a.body).toBe("Synthetic sentence number 1 walks across the page without meaning anything.\nSynthetic sentence number 2 walks across the page without meaning anything.");
	});

	it("refuses archived chapters, archived Codex notes, notes/, backstage files and missing files", async () => {
		const { writer } = await setup();
		for (const p of ["_story-library/aaa/ch-a4.md", "Codex/Retired.md", "notes/idea.md", "_story-library/novel-aaa.md", "_backstage/storyforge/codex.md", "_story-library/aaa/missing.md", "elsewhere/readme.md"]) {
			await expect(writer.open(p), p).rejects.toBeInstanceOf(ProseRefused);
		}
		expect(writer.openSessions()).toHaveLength(0);
	});

	it("opens placed and unplaced chapters and Codex notes", async () => {
		const { writer } = await setup();
		for (const p of [CH, "_story-library/aaa/ch-a3.md", "Codex/Jane.md"]) await writer.open(p);
		expect(writer.openSessions()).toHaveLength(3);
	});

	it("refuses a note inside an archived Codex folder", async () => {
		const { writer, project } = await setup();
		await archiveCodexItem(project, "f-cast");
		await expect(writer.open("Codex/Jane.md")).rejects.toBeInstanceOf(ProseRefused);
	});
});

describe("saving", () => {
	it("saves 2 s after the last change, writes only the body, and keeps everything else byte-identical", async () => {
		const { writer, scheduler, read, root } = await setup();
		const before = snapshot(root);
		const s = await writer.open(CH);
		s.setBody("Brand new text.");
		scheduler.advance(1500);
		s.setBody("Brand new text, longer.");
		scheduler.advance(1500);
		await settle();
		expect(read(CH)).toContain("Synthetic sentence number 1");
		scheduler.advance(600);
		await settle();
		expect(read(CH)).toBe("Brand new text, longer.\n");
		expect(s.dirty).toBe(false);
		const diff = diffSnapshots(before, snapshot(root));
		const prose = [...diff.changed, ...diff.added, ...diff.removed].filter((p) => /^(_story-library\/[^/]+\/|Codex\/|notes\/)/.test(p));
		expect(prose).toEqual([CH]);
		expect(diff.removed).toEqual([]);
	});

	it("carries a chapter's frontmatter and CRLF line endings through a save, byte for byte", async () => {
		const raw = "---\r\nstatus: draft   # keep this\r\nx-unknown:\r\n  - a\r\n---\r\nOld first.\r\nOld second.\r\n";
		const { writer, read } = await setup({}, (root) => fs.writeFileSync(path.join(root, CH), raw));
		const s = await writer.open(CH);
		expect(s.body).toBe("Old first.\nOld second.");
		s.setBody("New first.\nNew second.\nThird.");
		expect((await s.save()).kind).toBe("saved");
		expect(read(CH)).toBe("---\r\nstatus: draft   # keep this\r\nx-unknown:\r\n  - a\r\n---\r\nNew first.\r\nNew second.\r\nThird.\r\n");
	});

	it("a save with nothing changed writes nothing", async () => {
		const { writer, backend } = await setup();
		const s = await writer.open(CH);
		s.setBody(s.body);
		expect((await s.save()).kind).toBe("unchanged");
		void backend;
	});

	it("save, then echo: the writer's own write arriving as an outside change is ignored", async () => {
		const { writer, read } = await setup();
		const s = await writer.open(CH);
		const events: unknown[] = [];
		s.onReload((e) => events.push(e));
		s.setBody("Saved text.");
		await s.save();
		expect(await writer.onDiskChanged(CH, read(CH))).toEqual({ kind: "ignored" });
		expect(events).toEqual([]);
		expect(s.body).toBe("Saved text.");
	});

	it("an outside change with no unsaved text reloads, with the minimal edit", async () => {
		const { writer, write } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		const events: { body: string; edit: unknown; cause: string }[] = [];
		s.onReload((e) => events.push(e));
		write("_story-library/aaa/ch-a3.md", "Synthetic sentence number 1 walks across the page WITH CHANGES anything.\n");
		const r = await writer.onDiskChanged("_story-library/aaa/ch-a3.md", "Synthetic sentence number 1 walks across the page WITH CHANGES anything.\n");
		expect(r.kind).toBe("reloaded");
		expect(s.body).toBe("Synthetic sentence number 1 walks across the page WITH CHANGES anything.");
		expect(events).toHaveLength(1);
		expect(events[0].cause).toBe("outside-change");
		expect(events[0].edit).toMatchObject({ insert: expect.stringContaining("WITH CHANGES") });
		expect(s.dirty).toBe(false);
	});

	it("an outside change with unsaved text: recovery first, holding exactly the author's text, then reload", async () => {
		const { writer, write, read, root } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("The author's unsaved words.");
		write("_story-library/aaa/ch-a3.md", "Changed elsewhere.\n");
		const r = await writer.onDiskChanged("_story-library/aaa/ch-a3.md", "Changed elsewhere.\n");
		expect(r.kind).toBe("recovered-and-reloaded");
		const rp = (r as { recoveryPath: string }).recoveryPath;
		expect(rp).toBe("_sf-backup/recovery/aaa/ch-a3 2026-10-23 100000.md");
		expect(fs.readFileSync(path.join(root, rp), "utf8")).toBe("The author's unsaved words.");
		expect(s.body).toBe("Changed elsewhere.");
		expect(read("_story-library/aaa/ch-a3.md")).toBe("Changed elsewhere.\n");
	});

	it("if recovery fails, nothing is reloaded and the author's text stays in the session", async () => {
		const { writer, write, project } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("Precious.");
		write("_story-library/aaa/ch-a3.md", "Changed elsewhere.\n");
		project.fs.createRecovery = async () => {
			throw new Error("disk full");
		};
		const r = await writer.onDiskChanged("_story-library/aaa/ch-a3.md", "Changed elsewhere.\n");
		expect(r.kind).toBe("recovery-failed");
		expect(s.body).toBe("Precious.");
		expect(s.dirty).toBe(true);
	});

	it("a conflict at save time: the disk is untouched, the text goes to recovery, the path is returned, the session reloads", async () => {
		const { writer, write, read, root } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("Mine.");
		write("_story-library/aaa/ch-a3.md", "Theirs.\n");
		const r = await s.save();
		expect(r.kind).toBe("conflict");
		expect(read("_story-library/aaa/ch-a3.md")).toBe("Theirs.\n");
		const rp = (r as { recoveryPath: string }).recoveryPath;
		expect(fs.readFileSync(path.join(root, rp), "utf8")).toBe("Mine.");
		expect(s.body).toBe("Theirs.");
		expect(s.dirty).toBe(false);
	});

	it("a save to a chapter that has just been archived is refused, then recovered", async () => {
		const { writer, project, read, root } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a5.md");
		const original = read("_story-library/aaa/ch-a5.md");
		s.setBody("Typed after archiving.");
		await archiveChapter(project, "aaa", "ch-a5.md");
		const r = await s.save();
		expect(r.kind).toBe("refused");
		expect(read("_story-library/aaa/ch-a5.md")).toBe(original);
		expect(fs.readFileSync(path.join(root, (r as { recoveryPath: string }).recoveryPath), "utf8")).toBe("Typed after archiving.");
		// A second flush does not write a second recovery file for the same text.
		const again = await writer.flushAll();
		expect(again[0]).toMatchObject({ kind: "refused", recoveryPath: (r as { recoveryPath: string }).recoveryPath });
	});

	it("the pre-save backup fails: the save still happens and the failure is reported once", async () => {
		const { writer, read } = await setup({ sessionBackup: async () => ({ ok: false, error: new Error("no space") }) });
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("One.");
		const r1 = await s.save();
		expect(read("_story-library/aaa/ch-a3.md")).toBe("One.\n");
		expect(r1).toMatchObject({ kind: "saved", backup: { ok: false } });
		s.setBody("Two.");
		const r2 = await s.save();
		expect((r2 as { backup?: unknown }).backup).toBeUndefined();
	});

	it("the session backup is attempted once, before the first save", async () => {
		const order: string[] = [];
		const { writer, backend } = await setup({ sessionBackup: async () => (order.push("backup"), { ok: true as const, path: "x.zip" }) });
		const orig = backend.writeTextIfUnchanged.bind(backend);
		backend.writeTextIfUnchanged = async (...a) => (order.push("write"), orig(...a));
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("1");
		await s.save();
		s.setBody("2");
		await s.save();
		expect(order).toEqual(["backup", "write", "write"]);
	});

	it("a flush with several dirty sessions: all saved or recovered, none lost", async () => {
		const { writer, write, read, root } = await setup();
		const a = await writer.open("_story-library/aaa/ch-a1.md");
		const b = await writer.open("_story-library/aaa/ch-a3.md");
		const c = await writer.open("Codex/Jane.md");
		const d = await writer.open("Codex/Sam.md");
		for (const [s, t] of [[a, "A"], [b, "B"], [c, "C"], [d, "D"]] as const) s.setBody(t);
		write("_story-library/aaa/ch-a3.md", "outside\n");
		write("Codex/Sam.md", "---\naliases: []\n---\noutside sam\n");
		const results = await writer.flushAll();
		const kinds = Object.fromEntries(results.map((r) => [r.path, r.kind]));
		expect(kinds).toEqual({
			"_story-library/aaa/ch-a1.md": "saved",
			"_story-library/aaa/ch-a3.md": "conflict",
			"Codex/Jane.md": "saved",
			"Codex/Sam.md": "conflict",
		});
		expect(read("_story-library/aaa/ch-a1.md")).toBe("A\n");
		expect(read("Codex/Jane.md").endsWith("\nC\n") || read("Codex/Jane.md").endsWith("C")).toBe(true);
		const recovered = results.filter((r) => r.kind === "conflict").map((r) => fs.readFileSync(path.join(root, (r as { recoveryPath: string }).recoveryPath), "utf8"));
		expect(recovered.sort()).toEqual(["B", "D"]);
	});

	it("a disk error on a timed save is reported and retried on the next save; on a flush it is recovered", async () => {
		const { writer, backend, root } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		backend.writeTextIfUnchanged = async () => {
			throw new Error("EIO");
		};
		s.setBody("Text.");
		const first = await s.save();
		expect(first).toMatchObject({ kind: "error" });
		expect((first as { recoveryPath?: string }).recoveryPath).toBeUndefined();
		expect(s.dirty).toBe(true);
		const flush = await writer.flushAll();
		expect(flush[0]).toMatchObject({ kind: "error" });
		expect(fs.readFileSync(path.join(root, (flush[0] as { recoveryPath: string }).recoveryPath), "utf8")).toBe("Text.");
	});

	it("typing while a save is in flight keeps the session dirty and schedules another save", async () => {
		const { writer, scheduler, backend } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		const orig = backend.writeTextIfUnchanged.bind(backend);
		backend.writeTextIfUnchanged = async (...a) => {
			s.setBody("Typed during the save.");
			return orig(...a);
		};
		s.setBody("First.");
		await s.save();
		expect(s.dirty).toBe(true);
		expect(scheduler.pending).toBe(1);
	});

	it("saves a Codex note's body and keeps its frontmatter, with no fingerprint or history", async () => {
		const { writer, root, read } = await setup();
		const before = snapshot(root);
		const s = await writer.open("Codex/Jane.md");
		const raw = read("Codex/Jane.md");
		const fm = raw.slice(0, raw.indexOf("\n---", 3) + 5);
		s.setBody("A new description of Jane.");
		expect((await s.save()).kind).toBe("saved");
		expect(read("Codex/Jane.md")).toBe(`${fm}A new description of Jane.\n`);
		const diff = diffSnapshots(before, snapshot(root));
		expect(diff.changed).toEqual(["Codex/Jane.md"]);
		expect(diff.added).toEqual([]);
	});

	it("closing a session flushes it and frees the file for a new session", async () => {
		const { writer, read } = await setup();
		const s = await writer.open("_story-library/aaa/ch-a3.md");
		s.setBody("Closed with text.");
		expect((await s.close()).kind).toBe("saved");
		expect(read("_story-library/aaa/ch-a3.md")).toBe("Closed with text.\n");
		expect(writer.session("_story-library/aaa/ch-a3.md")).toBeUndefined();
		expect(() => s.setBody("x")).toThrow(ProseRefused);
		expect(await writer.open("_story-library/aaa/ch-a3.md")).not.toBe(s);
	});
});

describe("the after-save hook", () => {
	it("updates the fingerprint sidecar and word-count history after a chapter save", async () => {
		const { writer, read } = await setup();
		const s = await writer.open(CH);
		s.setBody("A fresh opening line that is new.\n\nAnd a fresh closing line that ends it.");
		const r = await s.save();
		expect(r).toMatchObject({ kind: "saved" });
		expect((r as { hookErrors?: unknown }).hookErrors).toBeUndefined();
		const sidecar = read("_backstage/storyforge/aaa/chapters/ch-a1.md");
		expect(sidecar).toContain("x-sidecar-unknown: keep");
		expect(sidecar).toContain("## opening\nA fresh opening line that is new.");
		expect(sidecar).toContain("## closing\nAnd a fresh closing line that ends it.");
		expect(read("_backstage/storyforge/aaa/wordcount.md")).toMatch(/ch-a1\.md:\n    words: 15\n/);
	});

	it("also runs for an outside change to a chapter, with or without an open session", async () => {
		const { writer, write, read } = await setup();
		const text = "Opening by Obsidian.\n\nClosing by Obsidian.\n";
		write("_story-library/aaa/ch-a2.md", text);
		const r = await writer.onDiskChanged("_story-library/aaa/ch-a2.md", text);
		expect(r).toEqual({ kind: "no-session", changed: true });
		expect(read("_backstage/storyforge/aaa/chapters/ch-a2.md")).toContain("## opening\nOpening by Obsidian.");
		// Same text again: nothing changed, nothing runs.
		expect(await writer.onDiskChanged("_story-library/aaa/ch-a2.md", text)).toEqual({ kind: "no-session", changed: false });
	});

	it("runs subscribers in order, isolates a failing one, and supports adding and removing", async () => {
		const { writer } = await setup({ builtinSubscribers: false });
		const seen: string[] = [];
		writer.onChapterChanged((c: ChapterChange) => void seen.push(`a:${c.filename}:${c.cause}`));
		writer.onChapterChanged(() => {
			throw new Error("boom");
		});
		const off = writer.onChapterChanged(() => void seen.push("c"));
		writer.onChapterChanged((c) => void seen.push(`d:${c.bookFolderName}`));
		const s = await writer.open(CH);
		s.setBody("x");
		const r = await s.save();
		expect(seen).toEqual(["a:ch-a1.md:save", "c", "d:aaa"]);
		expect((r as { hookErrors: Error[] }).hookErrors.map((e) => e.message)).toEqual(["boom"]);
		off();
		s.setBody("y");
		await s.save();
		expect(seen.filter((x) => x === "c")).toHaveLength(1);
	});

	it("does not run for a Codex note", async () => {
		const { writer } = await setup({ builtinSubscribers: false });
		let ran = 0;
		writer.onChapterChanged(() => void ran++);
		const s = await writer.open("Codex/Jane.md");
		s.setBody("x");
		await s.save();
		expect(ran).toBe(0);
	});
});
