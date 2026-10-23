import * as fs from "node:fs";
import * as path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import {
	BackupService, formatBackupFilename, formatFullBackupFilename, icloudPlaceholderTarget, inBackupScope, isBackupDue, isPreCompressed,
} from "../backup";
import { ForbiddenWriteError } from "../backend/guard";
import { Project } from "../project";

afterEach(cleanupFixtures);

const NOW = new Date(2026, 9, 23, 10, 11, 12);

async function setup(opts: { now?: () => Date } = {}) {
	const root = copyFixture("series");
	const project = await Project.open(new NodeFsBackend(root));
	const svc = new BackupService(project, { projectName: "My: Project", now: opts.now ?? (() => NOW) });
	const zip = (rel: string) => unzipSync(new Uint8Array(fs.readFileSync(path.join(root, rel))));
	return { root, project, svc, zip };
}

describe("names, scope, due", () => {
	it("keeps 0.17.1's file names", () => {
		expect(formatBackupFilename("P", NOW, false)).toBe("20261023 - P.zip");
		expect(formatBackupFilename("P", NOW, true)).toBe("20261023-101112 - P.zip");
		expect(formatFullBackupFilename("a/b", NOW)).toBe("20261023-101112 - a-b - full.zip");
	});
	it("stores pre-compressed formats", () => {
		expect(["a.PNG", "b.jpg", "c.zip", "d.mp3"].every(isPreCompressed)).toBe(true);
		expect(["a.md", "b.json", "c"].some(isPreCompressed)).toBe(false);
	});
	it("scope is the library, Codex, notes and backstage, without hidden folders", () => {
		expect(inBackupScope("_story-library/aaa/a.md")).toBe(true);
		expect(inBackupScope("_backstage/storyforge/aaa/cover.png")).toBe(true);
		expect(inBackupScope("notes/.hidden/x.md")).toBe(false);
		expect(inBackupScope("elsewhere/readme.md")).toBe(false);
		expect(inBackupScope(".obsidian/app.json")).toBe(false);
		expect(inBackupScope("_export/x.json")).toBe(false);
	});
	it("recognises iCloud placeholders", () => {
		expect(icloudPlaceholderTarget("_story-library/aaa/.Chapter 1.md.icloud")).toBe("_story-library/aaa/Chapter 1.md");
		expect(icloudPlaceholderTarget(".x.icloud")).toBe("x");
		expect(icloudPlaceholderTarget("_story-library/aaa/Chapter.md")).toBeNull();
		expect(icloudPlaceholderTarget("_story-library/.icloud")).toBeNull();
	});
	it("is-due follows the 0.17.1 rule", () => {
		const base = { now: 10 * 86_400_000 };
		expect(isBackupDue({ ...base, frequency: "every-open", lastBackupAt: base.now, trigger: "open" })).toEqual({ due: true, includeTime: true });
		expect(isBackupDue({ ...base, frequency: "every-open", lastBackupAt: 0, trigger: "interval" }).due).toBe(false);
		expect(isBackupDue({ ...base, frequency: "daily", lastBackupAt: 0, trigger: "interval" })).toEqual({ due: true, includeTime: false });
		expect(isBackupDue({ ...base, frequency: "daily", lastBackupAt: base.now - 86_400_000 + 1, trigger: "open" }).due).toBe(false);
		expect(isBackupDue({ ...base, frequency: "daily", lastBackupAt: base.now - 86_400_000, trigger: "open" }).due).toBe(true);
		expect(isBackupDue({ ...base, frequency: "weekly", lastBackupAt: base.now - 6 * 86_400_000, trigger: "open" }).due).toBe(false);
		expect(isBackupDue({ ...base, frequency: "weekly", lastBackupAt: base.now - 7 * 86_400_000, trigger: "open" }).due).toBe(true);
	});
});

describe("BackupService", () => {
	it("a session backup holds the backup scope, writes only the zip, and never touches the project", async () => {
		const { root, svc, zip } = await setup();
		const before = snapshot(root);
		const r = await svc.runScoped("session");
		expect(r.path).toBe("_sf-backup/20261023-101112 - My- Project.zip");
		const names = Object.keys(zip(r.path));
		expect(r.fileCount).toBe(names.length);
		expect(names).toContain("_story-library/aaa/ch-a1.md");
		expect(names).toContain("Codex/Jane.md");
		expect(names).toContain("_backstage/storyforge/aaa/cover.png");
		expect(names).toContain("notes/idea.md");
		expect(names.some((n) => n.startsWith(".obsidian") || n.startsWith("elsewhere") || n.startsWith("_export") || n.startsWith("_sf-backup"))).toBe(false);
		expect(new TextDecoder().decode(zip(r.path)["_story-library/aaa/ch-a2.md"])).toBe(fs.readFileSync(path.join(root, "_story-library/aaa/ch-a2.md"), "utf8"));
		const diff = diffSnapshots(before, snapshot(root));
		expect(diff.changed).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.added.filter((p) => !p.startsWith("_sf-backup"))).toEqual([]);
	});

	it("a full backup includes hidden folders but not .trash/ or _sf-backup/", async () => {
		const { root, svc, zip } = await setup();
		fs.mkdirSync(path.join(root, ".trash"));
		fs.writeFileSync(path.join(root, ".trash/old.md"), "x");
		await svc.runScoped("session");
		const r = await svc.runFull();
		expect(r.path).toBe("_sf-backup/20261023-101112 - My- Project - full.zip");
		const names = Object.keys(zip(r.path));
		expect(names).toContain(".obsidian/app.json");
		expect(names).toContain("elsewhere/readme.md");
		expect(names.some((n) => n.startsWith(".trash") || n.startsWith("_sf-backup"))).toBe(false);
	});

	it("never overwrites: a taken name gets a number", async () => {
		const { svc } = await setup();
		const a = await svc.runScoped("automatic", { includeTime: false });
		const b = await svc.runScoped("automatic", { includeTime: false, since: Number.POSITIVE_INFINITY });
		const c = await svc.runScoped("automatic", { includeTime: false, since: Number.POSITIVE_INFINITY });
		expect([a.path, b.path, c.path]).toEqual(["_sf-backup/20261023 - My- Project.zip", "_sf-backup/20261023 - My- Project 2.zip", "_sf-backup/20261023 - My- Project 3.zip"]);
	});

	it("lists iCloud placeholders as not included and never reads them", async () => {
		const { root, svc, zip, project } = await setup();
		fs.writeFileSync(path.join(root, "_story-library/aaa/.ch-a9.md.icloud"), "stub");
		fs.writeFileSync(path.join(root, "Codex/.Ghost.md.icloud"), "stub");
		let reads = 0;
		const orig = project.fs.readBinary.bind(project.fs);
		project.fs.readBinary = (p: string) => (reads++, p.endsWith(".icloud") ? Promise.reject(new Error("read a placeholder")) : orig(p));
		const r = await svc.runScoped("session");
		expect(r.notIncluded).toEqual(["Codex/Ghost.md", "_story-library/aaa/ch-a9.md"]);
		expect(Object.keys(zip(r.path)).some((n) => n.includes("icloud"))).toBe(false);
		expect(reads).toBeGreaterThan(0);
	});

	it("pre-rewrite holds exactly the named files and fails if one is missing", async () => {
		const { svc, zip } = await setup();
		const r = await svc.runPreRewrite(["Codex/Jane.md", "_story-library/aaa/ch-a1.md"]);
		expect(r.path).toBe("_sf-backup/20261023-101112 - My- Project - pre-rewrite.zip");
		expect(Object.keys(zip(r.path)).sort()).toEqual(["Codex/Jane.md", "_story-library/aaa/ch-a1.md"]);
		await expect(svc.runPreRewrite(["Codex/Nobody.md"])).rejects.toThrow(/missing/);
	});

	it("never runs two backups at once, and reuses a running one only when it covers the request", async () => {
		let t = 0;
		const { svc, project } = await setup({ now: () => new Date(2026, 9, 23, 10, 0, t++) });
		let active = 0;
		let overlap = 0;
		const origCreate = project.fs.createBackup.bind(project.fs);
		project.fs.createBackup = async (p: string, d: Uint8Array) => {
			active++;
			overlap = Math.max(overlap, active);
			await new Promise((r) => setTimeout(r, 10));
			try {
				return await origCreate(p, d);
			} finally {
				active--;
			}
		};
		const s1 = svc.runScoped("session");
		const s2 = svc.runScoped("session");
		expect(s2).toBe(s1); // same kind, started late enough
		const auto = svc.runScoped("automatic"); // different kind: its own, after
		expect(auto).not.toBe(s1);
		const full = svc.runFull(); // waits for the scoped ones, then runs
		const s3 = svc.runScoped("session"); // a queued full covers a session request
		expect(s3).toBe(full);
		const pre = svc.runPreRewrite(["Codex/Jane.md"]);
		const results = await Promise.all([s1, auto, full, pre]);
		expect(results.map((r) => r.kind)).toEqual(["session", "automatic", "full", "pre-rewrite"]);
		expect(overlap).toBe(1);
		expect(new Set(results.map((r) => r.path)).size).toBe(4);
	});

	it("a request needing a later start than the running backup waits for its own", async () => {
		const { svc } = await setup();
		const a = svc.runScoped("session");
		await new Promise((r) => setTimeout(r, 0)); // let it start
		const b = svc.runScoped("session", { since: NOW.getTime() + 1 });
		expect(b).not.toBe(a);
		await Promise.all([a, b]);
	});

	it("the guard allows only _sf-backup/*.zip creations: backups can't be overwritten, renamed or retired", async () => {
		const { svc, project } = await setup();
		const r = await svc.runScoped("session");
		await expect(project.fs.createBackup(r.path, new Uint8Array())).rejects.toMatchObject({ code: "EEXIST" });
		await expect(project.writeBinary(r.path, new Uint8Array())).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.rename(r.path, "_sf-backup/other.zip")).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(project.retire(r.path)).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
