import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { NodeFsSnapshotStore } from "../../backends/node-fs/snapshotStore";
import { cleanupFixtures, copyFixture, snapshot as dirSnapshot, diffSnapshots } from "../../../test/helpers/fixtures";
import { ManualScheduler, settle } from "../../../test/helpers/scheduler";
import { Project } from "../project";
import { SnapshotKeeper, buildSnapshot, validateSnapshot } from "../snapshot";
import { parseSidecarFingerprint, readChapterFingerprint } from "../chapterSidecar";

const dirs: string[] = [];
afterEach(() => {
	cleanupFixtures();
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "sf-snap-"));
	dirs.push(d);
	return d;
};

async function open() {
	const root = copyFixture("series");
	return { root, project: await Project.open(new NodeFsBackend(root)) };
}

describe("the index's evidence", () => {
	it("holds a body hash (frontmatter excluded) and a fingerprint for chapters, and no hash for an empty body", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, "_story-library/aaa/ch-a3.md"), "---\nk: v\n---\nSame words.\n");
		fs.writeFileSync(path.join(root, "_story-library/aaa/ch-a2.md"), "---\nother: 1\n---\nSame words.\n");
		fs.writeFileSync(path.join(root, "_story-library/aaa/ch-a1.md"), "---\nk: v\n---\n   \n\n");
		const project = await Project.open(new NodeFsBackend(root));
		const a3 = project.entry("_story-library/aaa/ch-a3.md")!;
		expect(a3.bodyHash).toBe(project.entry("_story-library/aaa/ch-a2.md")!.bodyHash);
		expect(a3.hash).not.toBe(project.entry("_story-library/aaa/ch-a2.md")!.hash);
		expect(a3.fingerprint).toEqual({ opening: "Same words.", closing: "Same words." });
		const empty = project.entry("_story-library/aaa/ch-a1.md")!;
		expect(empty.bodyHash).toBeUndefined();
		expect(empty.fingerprint).toEqual({ opening: "", closing: "" });
		expect(project.entry("Codex/Jane.md")!.bodyHash).toBeTruthy();
		expect(project.entry("_story-library/novel-aaa.md")!.bodyHash).toBeUndefined();
	});

	it("reads a fingerprint back out of a sidecar", async () => {
		const { project } = await open();
		expect(await readChapterFingerprint(project, "aaa", "ch-a1.md")).toEqual({
			opening: "Synthetic sentence number 1 walks across the page without meaning anything.",
			closing: "Synthetic sentence number 2 walks across the page without meaning anything.",
		});
		expect(await readChapterFingerprint(project, "aaa", "ch-a5.md")).toBeNull();
		expect(parseSidecarFingerprint("no sections")).toBeNull();
	});
});

describe("snapshot", () => {
	it("records chapters, Codex notes and notes with hashes and fingerprints, sorted", async () => {
		const { root, project } = await open();
		const snap = buildSnapshot(project, root, new Date(2026, 0, 1));
		expect(snap.version).toBe(1);
		expect(snap.root).toBe(root);
		const byPath = Object.fromEntries(snap.files.map((f) => [f.path, f]));
		expect(byPath["_story-library/aaa/ch-a1.md"]).toMatchObject({ kind: "chapter", opening: expect.stringContaining("sentence number 1") });
		expect(byPath["Codex/Jane.md"].kind).toBe("codex");
		expect(byPath["notes/idea.md"].kind).toBe("note");
		expect(byPath["_story-library/novel-aaa.md"]).toBeUndefined();
		expect(snap.files.map((f) => f.path)).toEqual([...snap.files.map((f) => f.path)].sort());
	});

	it("round-trips through the node-fs store, keyed by the project folder", async () => {
		const { root, project } = await open();
		const store = new NodeFsSnapshotStore(path.join(tmp(), "nested", "data"));
		expect(await store.load(root)).toEqual({ status: "missing" });
		const snap = buildSnapshot(project, root);
		await store.save(root, snap);
		expect(await store.load(root)).toEqual({ status: "ok", snapshot: snap });
		expect(await store.load(root + "-other")).toEqual({ status: "missing" });
	});

	it("is unreadable when corrupt, from another version, or for another folder, and never throws", async () => {
		const { root, project } = await open();
		const folder = tmp();
		const store = new NodeFsSnapshotStore(folder);
		await store.save(root, buildSnapshot(project, root));
		const file = path.join(folder, fs.readdirSync(folder)[0]);
		fs.writeFileSync(file, "{ not json");
		expect(await store.load(root)).toMatchObject({ status: "unreadable" });
		const good = buildSnapshot(project, root);
		fs.writeFileSync(file, JSON.stringify({ ...good, version: 2 }));
		expect(await store.load(root)).toMatchObject({ status: "unreadable" });
		fs.writeFileSync(file, JSON.stringify({ ...good, root: "/elsewhere" }));
		expect(await store.load(root)).toMatchObject({ status: "unreadable", reason: expect.stringContaining("different folder") });
		expect(validateSnapshot({ ...good, files: [{ path: 1 }] }, root).ok).toBe(false);
		expect(validateSnapshot(null, root).ok).toBe(false);
	});

	it("saves atomically (no temp files left) and never writes inside the project", async () => {
		const { root, project } = await open();
		const before = dirSnapshot(root);
		const folder = tmp();
		const store = new NodeFsSnapshotStore(folder);
		await store.save(root, buildSnapshot(project, root));
		await store.save(root, buildSnapshot(project, root));
		expect(fs.readdirSync(folder).filter((f) => f.endsWith(".tmp"))).toEqual([]);
		expect(diffSnapshots(before, dirSnapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("the keeper debounces touches, saves on demand and at close, and reports failure without throwing", async () => {
		const { root, project } = await open();
		const scheduler = new ManualScheduler();
		const saves: number[] = [];
		let fail = false;
		const store = {
			load: async () => ({ status: "missing" as const }),
			save: async () => {
				if (fail) throw new Error("disk full");
				saves.push(scheduler.now);
			},
		};
		const keeper = new SnapshotKeeper(project, store, root, { scheduler, delayMs: 5000 });
		keeper.touch();
		scheduler.advance(3000);
		keeper.touch();
		scheduler.advance(3000);
		expect(saves).toEqual([]);
		scheduler.advance(2000);
		await settle();
		expect(saves).toHaveLength(1);
		fail = true;
		expect(await keeper.close()).toMatchObject({ ok: false });
		fail = false;
		expect(await keeper.close()).toEqual({ ok: true });
		expect(saves).toHaveLength(2);
	});
});
