import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { type Planted, plantLeftovers } from "../../../test/helpers/leftovers";
import { BackendError } from "../backend/types";
import { Project } from "../project";
import { leftoverKey, tidyTemporaryFiles, targetNameOf } from "../tempTidy";

afterEach(cleanupFixtures);

const NOW = new Date(2026, 9, 26, 12, 0, 0);

async function setup() {
	const root = copyFixture("series");
	const planted = plantLeftovers(root, NOW.getTime());
	const project = await Project.open(new NodeFsBackend(root));
	const read = (rel: string) => fs.readFileSync(path.join(root, rel));
	const exists = (rel: string) => fs.existsSync(path.join(root, rel));
	return { root, planted, project, read, exists };
}
const recoveryFiles = (root: string, dir: string): string[] => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).sort() : []);

describe("tidying leftover temporary files", () => {
	it("treats each kind as ruled, and touches no decoy", async () => {
		const { root, planted: p, project, read, exists } = await setup();
		const before = Object.fromEntries(p.decoys.map((d) => [d, read(d).toString("base64")]));
		const wasIdentical = read(p.identical);
		const newest = read(p.newerProse);
		const oldCodex = read(p.olderCodex);
		const structural = read(p.structural);
		const binary = read(p.binary);
		const conflict = read(p.recoveryFile);

		const report = await tidyTemporaryFiles(project, { now: NOW, readOnly: false });

		// a backup's temporary zip, and a copy identical to the file beside it: removed
		expect(exists(p.zip)).toBe(false);
		expect(exists(p.identical)).toBe(false);
		expect(report.removed.map((r) => [r.path, r.why]).sort()).toEqual([[p.identical, "identical"], [p.zip, "partial-zip"]].sort());
		// everything that differs: copied into recovery, byte for byte, then removed
		const stamp = "2026-10-26 120000";
		const copies = {
			chapter: `_sf-backup/recovery/aaa/ch-a1 (leftover ${stamp}).md`,
			codex: `_sf-backup/recovery/_codex/Sam (leftover ${stamp}).md`,
			structural: `_sf-backup/recovery/_temp/wordcount (leftover ${stamp}).md`,
			binary: `_sf-backup/recovery/_temp/cover.png (leftover ${stamp}).md`,
			recovery: `_sf-backup/recovery/aaa/ch-a3 2026-10-23 100000 (leftover ${stamp}).md`,
		};
		expect(read(copies.chapter).equals(newest)).toBe(true);
		expect(read(copies.codex).equals(oldCodex)).toBe(true);
		expect(read(copies.structural).equals(structural)).toBe(true);
		expect(read(copies.binary).equals(binary)).toBe(true);
		expect(read(copies.recovery).equals(conflict)).toBe(true);
		for (const leftover of [p.newerProse, p.olderCodex, p.structural, p.binary, p.recoveryFile]) expect(exists(leftover), leftover).toBe(false);
		expect(report.recovered.map((r) => [r.leftover, r.recoveryPath, r.kind, r.newer]).sort()).toEqual(
			[
				[p.newerProse, copies.chapter, "chapter", true],
				[p.olderCodex, copies.codex, "codex", false],
				[p.structural, copies.structural, "structural", true],
				[p.binary, copies.binary, "binary", true],
				[p.recoveryFile, copies.recovery, "recovery-file", true],
			].sort(),
		);
		// the file beside each was not touched
		expect(read("_story-library/aaa/ch-a2.md").equals(wasIdentical)).toBe(true);
		// unclassifiable: left where it is, reported once and remembered
		expect(exists(p.unclassifiable)).toBe(true);
		expect(report.left).toEqual([{ path: p.unclassifiable, reason: expect.stringContaining("can't be classified"), remembered: true }]);
		expect(report.newlyReported).toHaveLength(1);
		// a matching temp younger than a minute, and every decoy: byte-identical
		expect(exists(p.young)).toBe(true);
		expect(report.young).toBe(1);
		for (const d of p.decoys) expect(read(d).toString("base64"), d).toBe(before[d]);
		void root;
	});

	it("a second open finds nothing to do", async () => {
		const { project, planted: p, root } = await setup();
		const first = await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		const afterFirst = snapshot(root);
		const second = await tidyTemporaryFiles(project, { now: NOW, readOnly: false, seen: new Set(first.newlyReported) });
		expect(second.removed).toEqual([]);
		expect(second.recovered).toEqual([]);
		expect(second.left).toEqual([]);
		expect(second.newlyReported).toEqual([]);
		const diff = diffSnapshots(afterFirst, snapshot(root));
		expect([diff.added, diff.changed, diff.removed]).toEqual([[], [], []]);
		void p;
	});

	it("never overwrites: a recovery file already there is untouched and the copy takes the next name", async () => {
		const { root, project, planted: p, read } = await setup();
		const taken = "_sf-backup/recovery/aaa/ch-a1 (leftover 2026-10-26 120000).md";
		fs.mkdirSync(path.join(root, "_sf-backup/recovery/aaa"), { recursive: true });
		fs.writeFileSync(path.join(root, taken), "an earlier recovery file");
		await project.refresh(taken);
		await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		expect(read(taken).toString()).toBe("an earlier recovery file");
		expect(read("_sf-backup/recovery/aaa/ch-a1 (leftover 2026-10-26 120000) 2.md").equals(Buffer.from("---\nchapter-order: x\n---\nThe newest words, never swapped in.\n"))).toBe(true);
		void p;
	});

	it("a read-only project: found and reported, nothing moved or removed", async () => {
		const { root, project, planted: p } = await setup();
		const before = snapshot(root);
		const report = await tidyTemporaryFiles(project, { now: NOW, readOnly: true });
		const diff = diffSnapshots(before, snapshot(root));
		expect([diff.added, diff.changed, diff.removed]).toEqual([[], [], []]);
		expect(report.foundReadOnly).toContain(p.newerProse);
		expect(report.recovered).toEqual([]);
		expect(report.removed).toEqual([]);
	});

	it("only files at least a minute old are touched", async () => {
		const { project, planted: p, exists } = await setup();
		await tidyTemporaryFiles(project, { now: new Date(NOW.getTime() - 4 * 3600_000), readOnly: false }); // as if opened four hours earlier: nothing is old enough yet
		for (const rel of [p.zip, p.identical, p.newerProse, p.olderCodex, p.structural, p.binary, p.recoveryFile]) expect(exists(rel), rel).toBe(true);
	});
});

describe("the order of the steps: copy, read back, check unchanged, only then remove", () => {
	it("if the copy can't be made, the leftover stays and the summary says so", async () => {
		const { project, planted: p, exists } = await setup();
		const spy = vi.spyOn(project.fs, "createRecovery").mockRejectedValue(new Error("disk full"));
		const report = await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		spy.mockRestore();
		expect(exists(p.newerProse)).toBe(true);
		expect(report.left.find((l) => l.path === p.newerProse)?.reason).toMatch(/could not be copied.*kept/);
		expect(report.recovered).toEqual([]);
	});

	it("if the copy doesn't read back identical, the original is kept", async () => {
		const { project, planted: p, exists } = await setup();
		const real = project.readBinary.bind(project);
		vi.spyOn(project, "readBinary").mockImplementation(async (path: string) => (path.includes("(leftover") ? new Uint8Array([1, 2, 3]) : real(path)));
		const report = await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		expect(exists(p.newerProse)).toBe(true);
		expect(report.left.find((l) => l.path === p.newerProse)?.reason).toMatch(/did not read back identical/);
	});

	it("if the leftover changed after it was listed, it is not removed: the copy is made, the original stays", async () => {
		const { project, root, planted: p, exists } = await setup();
		const realList = project.fs.listTempLeftovers.bind(project.fs);
		project.fs.listTempLeftovers = async () => {
			const listed = await realList();
			fs.appendFileSync(path.join(root, p.newerProse), " and a late write"); // changes its size and time after it was listed
			return listed;
		};
		const report = await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		expect(exists(p.newerProse)).toBe(true);
		expect(report.left.find((l) => l.path === p.newerProse)?.reason).toMatch(/not removed \(it changed after it was listed\)/);
	});

	it("a removal that failed last time leaves a copy; the next open removes the leftover and makes no second copy", async () => {
		const { project, root, planted: p, exists } = await setup();
		const remove = vi.spyOn(project.fs, "removeTemp").mockRejectedValue(new BackendError("EACCES", "no", p.newerProse));
		await tidyTemporaryFiles(project, { now: NOW, readOnly: false });
		remove.mockRestore();
		expect(exists(p.newerProse)).toBe(true);
		expect(recoveryFiles(root, "_sf-backup/recovery/aaa").filter((n) => n.startsWith("ch-a1 (leftover"))).toHaveLength(1);
		const again = await tidyTemporaryFiles(project, { now: new Date(NOW.getTime() + 5000), readOnly: false });
		expect(exists(p.newerProse)).toBe(false);
		expect(again.removed.find((r) => r.path === p.newerProse)?.why).toBe("already-copied");
		expect(recoveryFiles(root, "_sf-backup/recovery/aaa").filter((n) => n.startsWith("ch-a1 (leftover"))).toHaveLength(1);
	});
});

describe("the names", () => {
	it("reads the target out of a temp name", () => {
		expect(targetNameOf(".ch-a1.md.19f2a3b4c5d6e7f8a9b0c1d2.tmp")).toBe("ch-a1.md");
		expect(targetNameOf(".20261023 - p.zip.a1b2c3d4e5f6.tmp")).toBe("20261023 - p.zip");
		expect(leftoverKey("a/b", 3, 1234.6)).toBe("a/b|3|1235");
	});
});

void (null as unknown as Planted);
