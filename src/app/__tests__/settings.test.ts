import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { ReadOnlyProjectError } from "../../backends/tauri";
import { RustBridge, available } from "../../../test/helpers/rustBridge";
import { TauriBackend } from "../../backends/tauri";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { openProject } from "../../core/openProject";
import { Project } from "../../core/project";
import { sha256Text } from "../../core/hash";
import { MachineSnapshotStore } from "../machineSnapshots";
import { buildSnapshot } from "../../core/snapshot";
import { DEFAULT_PROJECT_SETTINGS, PROJECT_SETTINGS_PATH, type MachineStore, loadMachineProjectState, loadSettings, saveMachineProjectState, setSetting } from "../settings";

afterEach(cleanupFixtures);

const reader = (root: string) => async (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
async function open(root: string) {
	return Project.open(new NodeFsBackend(root));
}
class MemoryMachine implements MachineStore {
	map = new Map<string, string>();
	async get(name: string) {
		return this.map.get(name) ?? null;
	}
	async set(name: string, text: string) {
		this.map.set(name, text);
	}
}

describe("format 0: no project.md", () => {
	it("uses the plugin's data.json where it has a value, and defaults elsewhere, and says which", async () => {
		const root = copyFixture("series"); // data.json: {"autoFocus":true,"layout":"novelBrowse"}
		const s = await loadSettings(await open(root), reader(root));
		expect(s.formatVersion).toBe(0);
		expect(s.readOnly).toBe(false);
		expect(s.sources.autoFocus).toBe("data.json");
		expect(s.sources.layout).toBe("data.json");
		expect(s.sources.hideSeriesPane).toBe("default");
		expect(s.values).toEqual(DEFAULT_PROJECT_SETTINGS);
	});

	it("reads richer plugin data, ignores invalid values, and takes the old position fields as a starting point", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(
			path.join(root, ".obsidian/plugins/storyforge/data.json"),
			JSON.stringify({ hideSeriesPane: true, layout: "nonsense", seriesNumberingStyle: "roman-upper", automaticBackupEnabled: true, automaticBackupFrequency: "weekly", selectedNovel: "aaa", collapsedCodexFolderIds: ["f-cast", 3], lastAutomaticBackupAt: 5 }),
		);
		const s = await loadSettings(await open(root), reader(root));
		expect(s.values).toMatchObject({ hideSeriesPane: true, layout: "novelBrowse", seriesNumberingStyle: "roman-upper", automaticBackup: true, automaticBackupFrequency: "weekly" });
		expect(s.sources.layout).toBe("default");
		expect(s.pluginPosition).toEqual({ selectedNovel: "aaa", collapsedCodexFolderIds: ["f-cast"] });
	});

	it("works with no data.json at all, and with one that isn't JSON", async () => {
		const root = copyFixture("series");
		fs.rmSync(path.join(root, ".obsidian"), { recursive: true });
		expect((await loadSettings(await open(root), reader(root))).values).toEqual(DEFAULT_PROJECT_SETTINGS);
		fs.mkdirSync(path.join(root, ".obsidian/plugins/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), "{ not json");
		expect((await loadSettings(await open(root), reader(root))).values).toEqual(DEFAULT_PROJECT_SETTINGS);
	});

	it("never writes to the plugin's data.json, and loading writes nothing", async () => {
		const root = copyFixture("series");
		const before = snapshot(root);
		await loadSettings(await open(root), reader(root));
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("the first change creates project.md carrying over the values in effect, and leaves data.json alone", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), JSON.stringify({ autoFocus: false, layout: "hybrid" }));
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const dataBefore = fs.readFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), "utf8");
		await setSetting(project, s, "hideSeriesPane", true);
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toBe("---\nformat-version: 1\nauto-focus: false\nlayout: hybrid\nhide-series-pane: true\n---\n");
		expect(fs.readFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), "utf8")).toBe(dataBefore);
		const again = await loadSettings(await open(root), reader(root));
		expect(again.formatVersion).toBe(1);
		expect(again.values).toMatchObject({ autoFocus: false, layout: "hybrid", hideSeriesPane: true });
		expect(again.sources).toMatchObject({ autoFocus: "project.md", layout: "project.md", hideSeriesPane: "project.md", automaticBackup: "default" });
	});

	it("setting a value to what is already in effect writes nothing", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const before = snapshot(root);
		await setSetting(project, s, "hideSeriesPane", false);
		await setSetting(project, s, "layout", "novelBrowse");
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		expect(fs.existsSync(path.join(root, PROJECT_SETTINGS_PATH))).toBe(false);
	});
});

describe("format 1: project.md", () => {
	const withProjectMd = (root: string, text: string) => fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), text);

	it("wins over data.json, keeps unknown keys and comments on a change, and writes only that key", async () => {
		const root = copyFixture("series");
		withProjectMd(root, "---\n# my settings\nformat-version: 1\nlayout: codex   # because\nx-future-key:\n  nested: [1, 2]\nauto-focus: false\n---\nnotes below\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		expect(s.values).toMatchObject({ layout: "codex", autoFocus: false });
		expect(s.sources).toMatchObject({ layout: "project.md", autoFocus: "project.md" });
		await setSetting(project, s, "chapterNumberingStyle", "roman-lower");
		expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).toBe("---\n# my settings\nformat-version: 1\nlayout: codex   # because\nx-future-key:\n  nested: [1, 2]\nauto-focus: false\nchapter-numbering-style: roman-lower\n---\nnotes below\n");
	});

	it("a newer format-version opens read-only, and every change is refused", async () => {
		const root = copyFixture("series");
		withProjectMd(root, "---\nformat-version: 2\nlayout: hybrid\n---\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		expect(s.readOnly).toBe(true);
		expect(s.readOnlyReason).toMatch(/newer storyForge/);
		const before = snapshot(root);
		await expect(setSetting(project, s, "layout", "codex")).rejects.toBeInstanceOf(ReadOnlyProjectError);
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("a project.md that can't be read safely is treated as unavailable: read-only, not empty", async () => {
		const root = copyFixture("series");
		withProjectMd(root, "---\nformat-version: &v 1\nagain: *v\n---\n");
		const s = await loadSettings(await open(root), reader(root));
		expect(s.readOnly).toBe(true);
	});

	it("ignores invalid values in project.md", async () => {
		const root = copyFixture("series");
		withProjectMd(root, "---\nformat-version: 1\nlayout: bogus\nhide-series-pane: yes please\nautomatic-backup-frequency: weekly\n---\n");
		const s = await loadSettings(await open(root), reader(root));
		expect(s.values.layout).toBe("novelBrowse");
		expect(s.sources.layout).toBe("data.json");
		expect(s.values.automaticBackupFrequency).toBe("weekly");
	});
});

describe("opening a project twice is byte-identical, in both formats", () => {
	for (const [name, prepare] of [
		["format 0 with a plugin data.json", (_root: string) => undefined],
		["format 1", (root: string) => fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), "---\nformat-version: 1\nlayout: hybrid\n---\n")],
	] as const) {
		it(name, async () => {
			const root = copyFixture("series");
			prepare(root);
			const machine = new MemoryMachine();
			const run = async () => {
				const o = await openProject(root, { backend: new NodeFsBackend(root), snapshotStore: new MachineSnapshotStore(machine), projectName: "p" });
				const s = await loadSettings(o.project, reader(root));
				await o.close();
				return s;
			};
			await run();
			const settled = snapshot(root);
			const second = await run();
			await run();
			expect(diffSnapshots(settled, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
			expect(second.formatVersion).toBe(name === "format 1" ? 1 : 0);
			expect(fs.existsSync(path.join(root, PROJECT_SETTINGS_PATH))).toBe(name === "format 1");
		});
	}
});

describe("machine settings", () => {
	it("keep where you were per project, outside the project, starting from the plugin's position", async () => {
		const store = new MemoryMachine();
		const key = sha256Text("/some/project");
		expect(await loadMachineProjectState(store, key, { selectedNovel: "aaa" })).toEqual({ selectedNovel: "aaa", selectedObject: null, collapsedCodexFolderIds: [] });
		await saveMachineProjectState(store, key, { selectedNovel: "bbb", selectedObject: "ch-b1.md", collapsedCodexFolderIds: ["f-cast"] });
		expect(await loadMachineProjectState(store, key, { selectedNovel: "aaa" })).toEqual({ selectedNovel: "bbb", selectedObject: "ch-b1.md", collapsedCodexFolderIds: ["f-cast"] });
		store.map.set(`project-ui/${key}`, "{ broken");
		expect((await loadMachineProjectState(store, key)).selectedNovel).toBeNull();
	});

	it("the snapshot round-trips through machine settings, keyed by the project path", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const store = new MachineSnapshotStore(new MemoryMachine());
		expect(await store.load(root)).toEqual({ status: "missing" });
		const snap = buildSnapshot(project, root);
		await store.save(root, snap);
		expect(await store.load(root)).toEqual({ status: "ok", snapshot: snap });
		expect((await store.load("/elsewhere")).status).toBe("missing");
	});
});

(available() ? describe : describe.skip)("over the Rust backend", () => {
	it("a newer format is read-only in Rust too: no save, no project.md, no recovery file, no backup", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), "---\nformat-version: 9\n---\n");
		const bridge = await RustBridge.open(root, true); // Rust opens a newer project read-only (Project::open_checked)
		try {
			const backend = new TauriBackend(bridge.invoke);
			const machine = new MemoryMachine();
			const before = snapshot(root);
			const project = await Project.open(backend);
			const s = await loadSettings(project, (p) => backend.readOutside(p));
			expect(s.readOnly).toBe(true);
			// the snapshot lives outside the project, so it may still be written
			await new MachineSnapshotStore(machine).save(root, buildSnapshot(project, root));
			expect(machine.map.size).toBe(1);
			await expect(project.writeText(PROJECT_SETTINGS_PATH, "x")).rejects.toBeInstanceOf(ReadOnlyProjectError);
			await expect(backend.createFile("_sf-backup/recovery/a/b.md", "x", { op: "recovery-create" })).rejects.toBeInstanceOf(ReadOnlyProjectError);
			await expect(backend.createFile("_sf-backup/x.zip", new Uint8Array([1]), { op: "backup-create" })).rejects.toBeInstanceOf(ReadOnlyProjectError);
			expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		} finally {
			bridge.close();
		}
	});

	it("reads the plugin's data.json through read_outside, and refuses _backstage through it", async () => {
		const root = copyFixture("series");
		const bridge = await RustBridge.open(root);
		try {
			const backend = new TauriBackend(bridge.invoke);
			const s = await loadSettings(await Project.open(backend), (p) => backend.readOutside(p));
			expect(s.sources.layout).toBe("data.json");
			await expect(backend.readOutside("_backstage/storyforge/codex.md")).rejects.toBeInstanceOf(Error);
		} finally {
			bridge.close();
		}
	});
});
