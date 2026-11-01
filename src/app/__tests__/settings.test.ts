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
		fs.writeFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), JSON.stringify({ autoFocus: false, layout: "seriesBrowse" }));
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const dataBefore = fs.readFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), "utf8");
		await setSetting(project, s, "hideSeriesPane", true);
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toBe("---\nformat-version: 1\nauto-focus: false\nlayout: seriesBrowse\nhide-series-pane: true\n---\n");
		expect(fs.readFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), "utf8")).toBe(dataBefore);
		const again = await loadSettings(await open(root), reader(root));
		expect(again.formatVersion).toBe(1);
		expect(again.values).toMatchObject({ autoFocus: false, layout: "seriesBrowse", hideSeriesPane: true });
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

	it("an old layout value (hybrid, codexFocus, anything unknown) reads as no choice: the default applies, nothing is an error and nothing is rewritten", async () => {
		for (const value of ["hybrid", "codexFocus", "somethingElse"]) {
			const root = copyFixture("series");
			withProjectMd(root, `---\nformat-version: 1\nlayout: ${value}\n---\n`);
			fs.writeFileSync(path.join(root, ".obsidian/plugins/storyforge/data.json"), JSON.stringify({ layout: value }));
			const project = await open(root);
			const before = snapshot(root);
			const s = await loadSettings(project, reader(root));
			expect(s.values.layout).toBe("novelBrowse");
			expect(s.sources.layout).toBe("default");
			expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
			// a change to another setting keeps the old text in the file as it was
			await setSetting(project, s, "highlightActiveChapter", false);
			expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).toContain(`layout: ${value}`);
		}
	});

	it("a newer format-version opens read-only, and every change is refused", async () => {
		const root = copyFixture("series");
		withProjectMd(root, "---\nformat-version: 2\nlayout: seriesBrowse\n---\n");
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
		["format 1", (root: string) => fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), "---\nformat-version: 1\nlayout: seriesBrowse\n---\n")],
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

describe("the sessions settings (docs/sessions.md §9)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};

	it("default to 3 minutes, 5 minutes shown, editing off and the readout off", async () => {
		const root = copyFixture("series");
		const s = await loadSettings(await open(root), reader(root));
		expect(s.values).toMatchObject({ sessionIdleMinutes: 3, sessionMinShownMinutes: 5, sessionEditingWpm: null, showSessionReadout: false });
		expect(s.sources.sessionIdleMinutes).toBe("default");
	});

	it("are read from project.md; a value out of range or of the wrong kind falls back to its default", async () => {
		const root = copyFixture("series");
		put(root, "session-idle-minutes: 10\nsession-min-shown-minutes: 0\nsession-editing-wpm: 7\nshow-session-readout: true\n");
		const ok = await loadSettings(await open(root), reader(root));
		expect(ok.values).toMatchObject({ sessionIdleMinutes: 10, sessionMinShownMinutes: 0, sessionEditingWpm: 7, showSessionReadout: true });
		expect(ok.sources.sessionIdleMinutes).toBe("project.md");
		put(root, 'session-idle-minutes: 0\nsession-min-shown-minutes: 61\nsession-editing-wpm: 2.5\nshow-session-readout: "yes"\n');
		const bad = await loadSettings(await open(root), reader(root));
		expect(bad.values).toMatchObject({ sessionIdleMinutes: 3, sessionMinShownMinutes: 5, sessionEditingWpm: null, showSessionReadout: false });
		put(root, "session-idle-minutes: 31\n");
		expect((await loadSettings(await open(root), reader(root))).values.sessionIdleMinutes).toBe(3);
		put(root, "session-idle-minutes: 30\n");
		expect((await loadSettings(await open(root), reader(root))).values.sessionIdleMinutes).toBe(30);
	});

	it("a change rewrites only that key; turning the editing threshold off removes its key", async () => {
		const root = copyFixture("series");
		put(root, "hide-series-pane: true # kept\nsession-editing-wpm: 7\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		await setSetting(project, s, "sessionIdleMinutes", 8);
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toContain("hide-series-pane: true # kept");
		expect(text).toContain("session-idle-minutes: 8");
		expect(text).toContain("session-editing-wpm: 7");
		await setSetting(project, s, "sessionEditingWpm", null);
		const off = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(off).not.toContain("session-editing-wpm");
		expect(off).toContain("hide-series-pane: true # kept");
		await expect(setSetting(project, s, "sessionIdleMinutes", 99)).rejects.toThrow(/not a valid value/);
	});
});

describe("card sizes in machine state", () => {
	it("round-trips and drops anything that isn't bar or collapsed", async () => {
		const mem = new Map<string, string>();
		const store = { get: async (n: string) => mem.get(n) ?? null, set: async (n: string, t: string) => void mem.set(n, t) };
		await saveMachineProjectState(store, "k", { selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [], cardTiers: { "a/b.md": "bar", "a/c.md": "collapsed" } });
		expect((await loadMachineProjectState(store, "k")).cardTiers).toEqual({ "a/b.md": "bar", "a/c.md": "collapsed" });
		mem.set("project-ui/k", JSON.stringify({ cardTiers: { x: "extended", y: "bar", z: 3 } }));
		expect((await loadMachineProjectState(store, "k")).cardTiers).toEqual({ y: "bar" });
	});
});

describe("the stats count in machine state", () => {
	it("is stored only when it isn't day, and an unknown value reads as day", async () => {
		const mem = new Map<string, string>();
		const store = { get: async (n: string) => mem.get(n) ?? null, set: async (n: string, t: string) => void mem.set(n, t) };
		const base = { selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [] };
		await saveMachineProjectState(store, "k", { ...base, statsCount: "session" });
		expect((await loadMachineProjectState(store, "k")).statsCount).toBe("session");
		for (const bad of ["daily", "", 3, null]) {
			mem.set("project-ui/k", JSON.stringify({ statsCount: bad }));
			expect((await loadMachineProjectState(store, "k")).statsCount).toBeUndefined();
		}
		mem.set("project-ui/k", JSON.stringify({ statsCount: "day" }));
		expect((await loadMachineProjectState(store, "k")).statsCount).toBeUndefined();
	});
});

describe("the panel widths in machine state (Fix 5)", () => {
	it("keeps the unit, the switch and the library side's width, and ignores bad values", async () => {
		const mem = new Map<string, string>();
		const store = { get: async (n: string) => mem.get(n) ?? null, set: async (n: string, t: string) => void mem.set(n, t) };
		const base = { selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [] };
		await saveMachineProjectState(store, "k", { ...base, leftWidth: 20, libraryWidth: 25.5, loreWidth: 30, widthUnit: "percent", widthsLinked: false });
		expect(await loadMachineProjectState(store, "k")).toMatchObject({ leftWidth: 20, libraryWidth: 25.5, loreWidth: 30, widthUnit: "percent", widthsLinked: false });
		mem.set("project-ui/k", JSON.stringify({ widthUnit: "em", widthsLinked: "yes", libraryWidth: "wide" }));
		const bad = await loadMachineProjectState(store, "k");
		expect(bad.widthUnit).toBeUndefined();
		expect(bad.widthsLinked).toBeUndefined();
		expect(bad.libraryWidth).toBeUndefined();
	});
});

describe("the typing settings (docs/typing-aids.md §8)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};

	it("default to every aid on, the starting lists and nothing else", async () => {
		const root = copyFixture("series");
		const s = await loadSettings(await open(root), reader(root));
		expect(s.values).toMatchObject({
			typingSmartPunctuation: true,
			typingNameAutocorrect: true,
			typingShortcodes: true,
			typingShortcodeNames: true,
			typingSpecialCharactersButton: true,
			typingElisions: ["tis", "twas", "twere", "twill", "twould", "em", "til", "cause"],
			typingNameOptOuts: [],
			typingWordList: [],
			typingShortcodeList: {},
			typingSpecialCharacters: ["æ", "Æ", "œ", "Œ"],
		});
		expect(s.sources.typingElisions).toBe("default");
	});

	it("are read from project.md; a value of the wrong kind or an untidy list falls back to its default", async () => {
		const root = copyFixture("series");
		put(root, 'typing-smart-punctuation: false\ntyping-elisions: [tis, ere]\ntyping-name-opt-outs: ["Red Blossom"]\ntyping-shortcodes-list:\n  th: the Right Honourable\ntyping-special-characters: ["ð", "þ"]\n');
		const ok = await loadSettings(await open(root), reader(root));
		expect(ok.values).toMatchObject({ typingSmartPunctuation: false, typingElisions: ["tis", "ere"], typingNameOptOuts: ["Red Blossom"], typingShortcodeList: { th: "the Right Honourable" }, typingSpecialCharacters: ["ð", "þ"] });
		expect(ok.sources.typingElisions).toBe("project.md");
		put(root, 'typing-smart-punctuation: "yes"\ntyping-elisions: [Tis, tis]\ntyping-shortcodes-list:\n  "~th": x\ntyping-special-characters: ["ae"]\n');
		const bad = await loadSettings(await open(root), reader(root));
		expect(bad.values).toMatchObject({ typingSmartPunctuation: true, typingElisions: DEFAULT_PROJECT_SETTINGS.typingElisions, typingShortcodeList: {}, typingSpecialCharacters: ["æ", "Æ", "œ", "Œ"] });
		expect(bad.sources.typingElisions).toBe("default");
	});

	it("a change touches only project.md, and only that key, and keeps unknown keys", async () => {
		const root = copyFixture("series");
		put(root, "x-future-key: kept # a comment\ntyping-name-autocorrect: false\n");
		const before = snapshot(root);
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		await setSetting(project, s, "typingShortcodeList", { th: "the Right Honourable" });
		await setSetting(project, s, "typingSpecialCharacters", ["æ", "ð"]);
		const diff = diffSnapshots(before, snapshot(root));
		expect(diff.changed).toEqual([PROJECT_SETTINGS_PATH]);
		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toContain("x-future-key: kept # a comment");
		expect(text).toContain("typing-name-autocorrect: false");
		expect(text).toContain("th: the Right Honourable");
		await expect(setSetting(project, s, "typingElisions", ["Not Tidy"])).rejects.toThrow(/not a valid value/);
		await expect(setSetting(project, s, "typingShortcodeList", { "th": "a", "TH": "b" })).rejects.toThrow(/not a valid value/);
	});

	it("setting a list to what is already in effect writes nothing, and opening writes nothing", async () => {
		const root = copyFixture("series");
		const before = snapshot(root);
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		await setSetting(project, s, "typingElisions", [...DEFAULT_PROJECT_SETTINGS.typingElisions]);
		await setSetting(project, s, "typingSmartPunctuation", true);
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], changed: [], removed: [] });
		expect(fs.existsSync(path.join(root, PROJECT_SETTINGS_PATH))).toBe(false);
	});
});

describe("the Codex colour (decision 62)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};
	it("defaults to the text colour; a known choice is read from project.md; an unknown or wrong-kind value falls back and is never rewritten", async () => {
		const root = copyFixture("series");
		expect((await loadSettings(await open(root), reader(root))).values.codexColour).toBe("text");
		put(root, "codex-colour: purple\n");
		const ok = await loadSettings(await open(root), reader(root));
		expect(ok.values.codexColour).toBe("purple");
		expect(ok.sources.codexColour).toBe("project.md");
		for (const text of ["codex-colour: red\n", "codex-colour: 4\n", "codex-colour: [aqua]\n"]) {
			put(root, text);
			const before = snapshot(root);
			const bad = await loadSettings(await open(root), reader(root));
			expect(bad.values.codexColour).toBe("text");
			expect(bad.sources.codexColour).toBe("default");
			expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		}
	});

	it("setting the default on a project with no project.md writes nothing; a change writes only project.md and only its key", async () => {
		const plain = copyFixture("series");
		const plainProject = await open(plain);
		const plainSettings = await loadSettings(plainProject, reader(plain));
		const plainBefore = snapshot(plain);
		await setSetting(plainProject, plainSettings, "codexColour", "text");
		expect(diffSnapshots(plainBefore, snapshot(plain)).changed).toEqual([]);
		expect(diffSnapshots(plainBefore, snapshot(plain)).added).toEqual([]);

		const root = copyFixture("series");
		put(root, "x-future-key: kept\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const before = snapshot(root);
		await setSetting(project, s, "codexColour", "aqua");
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toContain("codex-colour: aqua");
		expect(text).toContain("x-future-key: kept");
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([PROJECT_SETTINGS_PATH]);
	});
});

describe("the Appearance settings (decisions 79 to 83) and story-kind (decision 81)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};
	it("every part starts as its current look: no font, its own weight and size, Softness 0, Wonk off", async () => {
		const root = copyFixture("series");
		const v = (await loadSettings(await open(root), reader(root))).values;
		expect([v.appearanceCodexFont, v.appearanceNovelFont, v.appearanceSeriesFont, v.appearanceChapterFont]).toEqual([null, null, null, null]);
		expect([v.appearanceCodexWeight, v.appearanceCodexSize, v.appearanceNovelWeight, v.appearanceSeriesWeight]).toEqual([400, 1, 600, 500]);
		expect([v.appearanceCodexSoft, v.appearanceCodexWonk]).toEqual([0, false]);
		expect(v.storyKind).toBe("series");
	});
	it("valid values are read; an unknown font, an out-of-range size or weight, Softness out of range, or a wrong kind falls back and is never rewritten", async () => {
		const root = copyFixture("series");
		put(root, "appearance-codex-font: Fraunces\nappearance-codex-weight: 300\nappearance-codex-size: 1.25\nappearance-codex-soft: 50\nappearance-codex-wonk: true\nappearance-novel-size: 2\nstory-kind: standalone\n");
		const ok = (await loadSettings(await open(root), reader(root))).values;
		expect([ok.appearanceCodexFont, ok.appearanceCodexWeight, ok.appearanceCodexSize, ok.appearanceCodexSoft, ok.appearanceCodexWonk, ok.appearanceNovelSize, ok.storyKind]).toEqual(["Fraunces", 300, 1.25, 50, true, 2, "standalone"]);
		put(root, "appearance-codex-font: Comic Sans\nappearance-codex-weight: 450\nappearance-codex-size: 3\nappearance-codex-soft: 101\nappearance-codex-wonk: yes\nappearance-novel-size: 2.5\nstory-kind: both\n");
		const before = snapshot(root);
		const bad = (await loadSettings(await open(root), reader(root))).values;
		expect([bad.appearanceCodexFont, bad.appearanceCodexWeight, bad.appearanceCodexSize, bad.appearanceCodexSoft, bad.appearanceCodexWonk, bad.appearanceNovelSize, bad.storyKind]).toEqual([null, 400, 1, 0, false, 0.8125, "series"]);
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		// the ranges are per part: the Codex list and the selected chapter stop at 1.75, the titles at 2
		put(root, "appearance-chapter-size: 1.8\nappearance-series-size: 1.8\n");
		const ranges = (await loadSettings(await open(root), reader(root))).values;
		expect([ranges.appearanceChapterSize, ranges.appearanceSeriesSize]).toEqual([0.8125, 1.8]);
	});
	it("choosing a font writes only its key; choosing 'current look' again removes it; opening and reading write nothing", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const untouched = snapshot(root);
		await setSetting(project, s, "appearanceCodexFont", null);
		expect(diffSnapshots(untouched, snapshot(root)).changed).toEqual([]);
		await setSetting(project, s, "appearanceCodexFont", "Inter");
		expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).toContain("appearance-codex-font: Inter");
		await setSetting(project, s, "appearanceCodexFont", null);
		expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).not.toContain("appearance-codex-font");
	});
});
