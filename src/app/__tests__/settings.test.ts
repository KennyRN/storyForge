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
import { variationFor } from "../../ui/appearance";
import { MachineSnapshotStore } from "../machineSnapshots";
import { buildSnapshot } from "../../core/snapshot";
import { APPEARANCE_BASE_PX, DEFAULT_PROJECT_SETTINGS, PROJECT_SETTINGS_PATH, type MachineStore, loadMachineProjectState, loadSettings, refreshSettings, saveMachineProjectState, setSetting } from "../settings";

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
			await setSetting(project, s, "hideSeriesPane", true);
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

describe("card sizes in machine state (retired in 1.7.0, carried through untouched)", () => {
	const setup = () => {
		const mem = new Map<string, string>();
		const store = { get: async (n: string) => mem.get(n) ?? null, set: async (n: string, t: string) => void mem.set(n, t) };
		return { mem, store };
	};
	it("comes back exactly as stored, whatever it holds, through a load and a save", async () => {
		for (const stored of [{ "a/b.md": "bar", "a/c.md": "collapsed" }, { x: "extended", y: "bar", z: 3 }, {}, [], "text", 7, null]) {
			const { mem, store } = setup();
			mem.set("project-ui/k", JSON.stringify({ selectedNovel: "n", cardTiers: stored }));
			const loaded = await loadMachineProjectState(store, "k");
			expect(loaded.cardTiers).toEqual(stored);
			await saveMachineProjectState(store, "k", { ...loaded, selectedObject: "ch.md" }); // a save for another reason
			expect(JSON.parse(mem.get("project-ui/k")!).cardTiers).toEqual(stored);
			expect((await loadMachineProjectState(store, "k")).cardTiers).toEqual(stored);
		}
	});
	it("is not added when it was never stored", async () => {
		const { mem, store } = setup();
		mem.set("project-ui/k", JSON.stringify({ selectedNovel: "n" }));
		const loaded = await loadMachineProjectState(store, "k");
		expect("cardTiers" in loaded).toBe(false);
		await saveMachineProjectState(store, "k", loaded);
		expect("cardTiers" in JSON.parse(mem.get("project-ui/k")!)).toBe(false);
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

describe("the Appearance settings (decisions 79 to 84) and story-kind (decision 81)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};
	it("every part starts as the author's defaults; Fraunces' Softness is 0", async () => {
		const root = copyFixture("series");
		const v = (await loadSettings(await open(root), reader(root))).values;
		expect([v.appearanceCodexFont, v.appearanceCodexWeight, v.appearanceCodexSize]).toEqual(["Atkinson Hyperlegible Next", 400, 1]);
		expect([v.appearanceNovelFont, v.appearanceNovelWeight, v.appearanceNovelSize]).toEqual(["Sofia Sans", 900, 1]);
		expect([v.appearanceSeriesFont, v.appearanceSeriesWeight, v.appearanceSeriesSize]).toEqual(["Sofia Sans", 600, 0.75]);
		expect([v.appearanceChapterFont, v.appearanceChapterWeight, v.appearanceChapterSize]).toEqual(["SN Pro", 300, 1.375]);
		expect(v.appearanceCodexSoft).toBe(0);
		expect(v.storyKind).toBe("series");
	});
	it("valid values are read; a font that no longer exists (or 'current look'), an out-of-range size or weight, Softness out of range, or a wrong kind falls back and is never rewritten", async () => {
		const root = copyFixture("series");
		put(root, "appearance-codex-font: Fraunces\nappearance-codex-weight: 300\nappearance-codex-size: 1.25\nappearance-codex-soft: 50\nappearance-codex-wonk: true\nappearance-novel-size: 2\nstory-kind: standalone\n");
		const ok = (await loadSettings(await open(root), reader(root))).values;
		expect([ok.appearanceCodexFont, ok.appearanceCodexWeight, ok.appearanceCodexSize, ok.appearanceCodexSoft, ok.appearanceNovelSize, ok.storyKind]).toEqual(["Fraunces", 300, 1.25, 50, 2, "standalone"]);
		put(root, "appearance-codex-font: Comic Sans\nappearance-novel-font: null\nappearance-codex-weight: 450\nappearance-codex-size: 3\nappearance-codex-soft: 101\nappearance-codex-wonk: yes\nappearance-novel-size: 2.5\nstory-kind: both\n");
		const before = snapshot(root);
		const bad = (await loadSettings(await open(root), reader(root))).values;
		expect([bad.appearanceCodexFont, bad.appearanceNovelFont, bad.appearanceCodexWeight, bad.appearanceCodexSize, bad.appearanceCodexSoft, bad.appearanceNovelSize, bad.storyKind]).toEqual(["Atkinson Hyperlegible Next", "Sofia Sans", 400, 1, 0, 1, "series"]);
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		// the ranges are per part: the Codex list and the selected chapter stop at 1.75, the titles at 2
		put(root, "appearance-chapter-size: 1.8\nappearance-series-size: 1.8\n");
		const ranges = (await loadSettings(await open(root), reader(root))).values;
		expect([ranges.appearanceChapterSize, ranges.appearanceSeriesSize]).toEqual([1.375, 1.8]);
	});
	it("choosing a font writes only its key; choosing the default again writes nothing new on a project with no file; reading writes nothing", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const untouched = snapshot(root);
		await setSetting(project, s, "appearanceCodexFont", "Atkinson Hyperlegible Next");
		expect(diffSnapshots(untouched, snapshot(root)).changed).toEqual([]);
		expect(fs.existsSync(path.join(root, PROJECT_SETTINGS_PATH))).toBe(false);
		await setSetting(project, s, "appearanceCodexFont", "Sofia Sans Condensed");
		expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).toContain("appearance-codex-font: Sofia Sans Condensed");
	});
	it("the pixel base is one named constant", () => {
		expect(APPEARANCE_BASE_PX).toBe(16);
	});
});

describe("refreshSettings: an outside change to project.md (decision 96)", () => {
	const PROJECT_MD = (root: string) => path.join(root, PROJECT_SETTINGS_PATH);

	it("applies only the keys that differ, in place, keeps unchanged lists by identity, and writes nothing", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		await setSetting(project, await loadSettings(project, reader(root)), "typingNameOptOuts", ["x"]);
		const p2 = await open(root);
		const current = await loadSettings(p2, reader(root));
		const list = current.values.typingNameOptOuts;
		fs.writeFileSync(PROJECT_MD(root), fs.readFileSync(PROJECT_MD(root), "utf8").replace(/\n---\n$/, "\nstory-kind: standalone\n---\n"));
		await p2.refresh(PROJECT_SETTINGS_PATH);
		const settingsBefore = snapshot(root);
		const out = await refreshSettings(p2, current, reader(root));
		expect(out.state).toBe("ok");
		expect(out.changed).toEqual(["storyKind"]);
		expect(current.values.storyKind).toBe("standalone");
		expect(current.values.typingNameOptOuts).toBe(list);
		expect(diffSnapshots(settingsBefore, snapshot(root))).toEqual({ added: [], changed: [], removed: [] });
	});

	it("keeps the last values when the file is deleted or can't be read", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		await setSetting(project, current, "storyKind", "standalone");
		fs.writeFileSync(PROJECT_MD(root), "---\nstory-kind: [unclosed\n---\n");
		await project.refresh(PROJECT_SETTINGS_PATH);
		expect((await refreshSettings(project, current, reader(root))).state).toBe("unreadable");
		expect(current.values.storyKind).toBe("standalone");
		fs.rmSync(PROJECT_MD(root));
		await project.refresh(PROJECT_SETTINGS_PATH);
		expect((await refreshSettings(project, current, reader(root))).state).toBe("absent");
		expect(current.values.storyKind).toBe("standalone");
	});

	it("reports a newer format without applying it", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		await setSetting(project, current, "storyKind", "standalone");
		fs.writeFileSync(PROJECT_MD(root), "---\nformat-version: 9\nstory-kind: series\n---\n");
		await project.refresh(PROJECT_SETTINGS_PATH);
		const out = await refreshSettings(project, current, reader(root));
		expect(out).toMatchObject({ state: "newer", formatVersion: 9, changed: [] });
		expect(current.values.storyKind).toBe("standalone");
	});
});

describe("setSetting: checked against the file (decision 96)", () => {
	const PROJECT_MD = (root: string) => path.join(root, PROJECT_SETTINGS_PATH);

	it("the author's value wins, the replaced value is returned, and another key changed elsewhere is kept", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		await setSetting(project, current, "codexColour", "green");
		fs.writeFileSync(PROJECT_MD(root), fs.readFileSync(PROJECT_MD(root), "utf8").replace("green", "blue").replace(/\n---\n$/, "\nstory-kind: standalone\n---\n"));
		await project.refresh(PROJECT_SETTINGS_PATH);
		const out = await setSetting(project, current, "codexColour", "yellow");
		expect(out).toEqual({ key: "codexColour", replaced: "blue" });
		const text = fs.readFileSync(PROJECT_MD(root), "utf8");
		expect(text).toContain("codex-colour: yellow");
		expect(text).toContain("story-kind: standalone");
	});

	it("says nothing when the file already holds what the window read, or what the author chose", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		expect(await setSetting(project, current, "storyKind", "standalone")).toBeNull();
		fs.writeFileSync(PROJECT_MD(root), fs.readFileSync(PROJECT_MD(root), "utf8").replace("standalone", "series"));
		await project.refresh(PROJECT_SETTINGS_PATH);
		expect(await setSetting(project, current, "storyKind", "series")).toBeNull();
	});

	it("after the file was deleted, a change creates it with the marker and that key only", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		await setSetting(project, current, "storyKind", "standalone");
		await setSetting(project, current, "codexColour", "green");
		fs.rmSync(PROJECT_MD(root));
		await project.refresh(PROJECT_SETTINGS_PATH);
		await refreshSettings(project, current, reader(root));
		await setSetting(project, current, "showSessionReadout", true);
		const text = fs.readFileSync(PROJECT_MD(root), "utf8");
		expect(text).toContain("format-version: 1");
		expect(text).toContain("show-session-readout: true");
		expect(text).not.toContain("story-kind");
		expect(text).not.toContain("codex-colour");
	});
});

describe("refreshSettings: a file that can't be used mid-session (decision 99)", () => {
	const PROJECT_MD = (root: string) => path.join(root, PROJECT_SETTINGS_PATH);

	it("unreadable: settings writes are refused until it reads again, then the values apply and writes work", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		await setSetting(project, current, "storyKind", "standalone");
		const good = fs.readFileSync(PROJECT_MD(root), "utf8");
		fs.writeFileSync(PROJECT_MD(root), "---\nstory-kind: [unclosed\n---\n");
		await project.refresh(PROJECT_SETTINGS_PATH);
		await refreshSettings(project, current, reader(root));
		expect(current.frozen).toBe("unreadable");
		await expect(setSetting(project, current, "codexColour", "green")).rejects.toBeInstanceOf(ReadOnlyProjectError);
		fs.writeFileSync(PROJECT_MD(root), good.replace("standalone", "series"));
		await project.refresh(PROJECT_SETTINGS_PATH);
		expect((await refreshSettings(project, current, reader(root))).changed).toEqual(["storyKind"]);
		expect(current.frozen).toBeUndefined();
		expect(current.readOnly).toBe(false);
		await setSetting(project, current, "codexColour", "green");
	});

	it("newer: settings writes are refused from the moment it is seen", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		fs.writeFileSync(PROJECT_MD(root), "---\nformat-version: 9\n---\n");
		await project.refresh(PROJECT_SETTINGS_PATH);
		await refreshSettings(project, current, reader(root));
		expect(current.frozen).toBe("newer");
		await expect(setSetting(project, current, "storyKind", "standalone")).rejects.toBeInstanceOf(ReadOnlyProjectError);
		expect(fs.readFileSync(PROJECT_MD(root), "utf8")).toBe("---\nformat-version: 9\n---\n");
	});
});

describe("Fraunces' Softness reaches the drawing and Wonk is always off (decision 103)", () => {
	const KEYS = "appearance-codex-font: Fraunces\nappearance-codex-weight: 400\nappearance-codex-size: 1.75\nappearance-codex-soft: 40\nappearance-codex-wonk: true\n";
	const write = (root: string, extra: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${extra}---\n`);
	};

	it("a project whose project.md has Wonk on still draws Fraunces with Wonk off, and the key is not a setting", async () => {
		const root = copyFixture("series");
		write(root, KEYS);
		const before = snapshot(root);
		const s = await loadSettings(await open(root), reader(root));
		expect([s.values.appearanceCodexFont, s.values.appearanceCodexSoft]).toEqual(["Fraunces", 40]);
		expect(Object.keys(s.values).some((k) => /wonk/i.test(k))).toBe(false);
		expect(variationFor(s.values.appearanceCodexFont, s.values.appearanceCodexSoft)).toBe('"SOFT" 40, "WONK" 0');
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], changed: [], removed: [] });
	});

	it("Softness applies through the re-read and through opening the whole project; a Wonk key arriving or changing is never applied or rewritten", async () => {
		const root = copyFixture("series");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		write(root, KEYS);
		await project.refresh(PROJECT_SETTINGS_PATH);
		const out = await refreshSettings(project, current, reader(root));
		expect(out.changed.sort()).toEqual(["appearanceCodexFont", "appearanceCodexSize", "appearanceCodexSoft"]);
		write(root, KEYS.replace("wonk: true", "wonk: false"));
		await project.refresh(PROJECT_SETTINGS_PATH);
		expect((await refreshSettings(project, current, reader(root))).changed).toEqual([]);
		await setSetting(project, current, "appearanceCodexSoft", 75);
		expect(fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8")).toContain("appearance-codex-wonk: false");
		const opened = await openProject(root, { backend: new NodeFsBackend(root), snapshotStore: new MachineSnapshotStore(new MemoryMachine()), projectName: "p" });
		const s = await loadSettings(opened.project, reader(root));
		expect(s.values.appearanceCodexSoft).toBe(75);
	});
});

describe("the data colour (Brief 15)", () => {
	const PROJECT_MD = (root: string) => path.join(root, PROJECT_SETTINGS_PATH);
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(PROJECT_MD(root), `---\nformat-version: 1\n${body}---\n`);
	};
	it("is blue with no key; opening such a project leaves the folder byte-identical", async () => {
		const root = copyFixture("series");
		const before = snapshot(root);
		const s = await loadSettings(await open(root), reader(root));
		expect(s.values.dataColour).toBe("blue");
		expect(s.sources.dataColour).toBe("default");
		expect(diffSnapshots(before, snapshot(root))).toMatchObject({ changed: [], added: [] });
	});

	it("reads the five role names; red, green, hex values and other kinds draw blue and are never rewritten", async () => {
		const root = copyFixture("series");
		for (const c of ["yellow", "aqua", "blue", "orange", "purple"]) {
			put(root, `data-colour: ${c}\n`);
			expect((await loadSettings(await open(root), reader(root))).values.dataColour).toBe(c);
		}
		for (const text of ["data-colour: red\n", "data-colour: green\n", "data-colour: '#e67e80'\n", "data-colour: 4\n", "data-colour: [aqua]\n"]) {
			put(root, text);
			const before = snapshot(root);
			const bad = await loadSettings(await open(root), reader(root));
			expect(bad.values.dataColour).toBe("blue");
			expect(bad.sources.dataColour).toBe("default");
			expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		}
	});

	it("is written only on a change, as the role name, and nothing else changes", async () => {
		const plain = copyFixture("series");
		const plainProject = await open(plain);
		const plainSettings = await loadSettings(plainProject, reader(plain));
		const plainBefore = snapshot(plain);
		await setSetting(plainProject, plainSettings, "dataColour", "blue");
		expect(diffSnapshots(plainBefore, snapshot(plain))).toMatchObject({ changed: [], added: [] });

		const root = copyFixture("series");
		put(root, "x-future-key: kept\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		const before = snapshot(root);
		await setSetting(project, s, "dataColour", "purple");
		const text = fs.readFileSync(PROJECT_MD(root), "utf8");
		expect(text).toContain("data-colour: purple");
		expect(text).not.toMatch(/#[0-9a-f]{6}/i);
		expect(text).toContain("x-future-key: kept");
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([PROJECT_SETTINGS_PATH]);
	});

	it("an unrelated settings write leaves an unknown or excluded data-colour value untouched (as an older build's writer does)", async () => {
		const root = copyFixture("series");
		put(root, "data-colour: red\nx-future-key: kept\n");
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		await setSetting(project, s, "storyKind", "standalone");
		const text = fs.readFileSync(PROJECT_MD(root), "utf8");
		expect(text).toContain("data-colour: red\nx-future-key: kept\n");
		expect(text).toContain("story-kind: standalone");
	});

	it("an outside change applies live, through the re-read", async () => {
		const root = copyFixture("series");
		put(root, "data-colour: aqua\n");
		const project = await open(root);
		const current = await loadSettings(project, reader(root));
		expect(current.values.dataColour).toBe("aqua");
		put(root, "data-colour: orange\n");
		await project.refresh(PROJECT_SETTINGS_PATH);
		const out = await refreshSettings(project, current, reader(root));
		expect(out.changed).toEqual(["dataColour"]);
		expect(current.values.dataColour).toBe("orange");
	});
});

describe("the text colours (Brief 17): selection, highlight, bold, italic and bold italic", () => {
	const PROJECT_MD = (root: string) => path.join(root, PROJECT_SETTINGS_PATH);
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(PROJECT_MD(root), `---\nformat-version: 1\n${body}---\n`);
	};
	// The key, the setting, its default, what it accepts, and what it must not (excluded or unknown: draws the default, never rewritten).
	const CASES = [
		{ file: "selection-colour", key: "selectionColour", def: "blue", ok: ["plum", "blue", "green", "yellow", "grey"], bad: ["red", "aqua", "orange", "purple", "text", "'#5c3f4f'", "4", "[blue]"] },
		{ file: "highlight-colour", key: "highlightColour", def: "yellow", ok: ["yellow", "aqua", "blue", "orange", "purple"], bad: ["red", "green", "grey", "plum", "text", "'#dbbc7f'", "4"] },
		{ file: "bold-colour", key: "boldColour", def: "orange", ok: ["text", "yellow", "aqua", "blue", "orange", "purple"], bad: ["red", "green", "grey", "'#dbbc7f'", "4"] },
		{ file: "italic-colour", key: "italicColour", def: "orange", ok: ["text", "yellow", "aqua", "blue", "orange", "purple"], bad: ["red", "green", "grey", "'#dbbc7f'", "4"] },
		{ file: "bold-italic-colour", key: "boldItalicColour", def: "orange", ok: ["text", "yellow", "aqua", "blue", "orange", "purple"], bad: ["red", "green", "grey", "'#dbbc7f'", "4"] },
	] as const;

	it("every key has its default with no key at all; opening such a project leaves the folder byte-identical", async () => {
		const root = copyFixture("series");
		const before = snapshot(root);
		const s = await loadSettings(await open(root), reader(root));
		for (const c of CASES) {
			expect(s.values[c.key]).toBe(c.def);
			expect(s.sources[c.key]).toBe("default");
		}
		expect(diffSnapshots(before, snapshot(root))).toMatchObject({ changed: [], added: [] });
	});

	for (const c of CASES) {
		it(`${c.file}: reads its role names; an unknown or excluded value draws the default and is never rewritten`, async () => {
			const root = copyFixture("series");
			for (const ok of c.ok) {
				put(root, `${c.file}: ${ok}\n`);
				expect((await loadSettings(await open(root), reader(root))).values[c.key]).toBe(ok);
			}
			for (const bad of c.bad) {
				put(root, `${c.file}: ${bad}\n`);
				const before = snapshot(root);
				const s = await loadSettings(await open(root), reader(root));
				expect(s.values[c.key]).toBe(c.def);
				expect(s.sources[c.key]).toBe("default");
				expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
			}
		});

		it(`${c.file}: written only on a change, as the role name; an unrelated write leaves a bad value alone; an outside change applies live`, async () => {
			const root = copyFixture("series");
			const project = await open(root);
			const s = await loadSettings(project, reader(root));
			const before = snapshot(root);
			await setSetting(project, s, c.key, c.def as never); // the same value: nothing is written
			expect(diffSnapshots(before, snapshot(root))).toMatchObject({ changed: [], added: [] });
			const other = c.ok.find((v) => v !== c.def)!;
			await setSetting(project, s, c.key, other as never);
			expect(fs.readFileSync(PROJECT_MD(root), "utf8")).toContain(`${c.file}: ${other}`);
			// an excluded value in the file survives an unrelated write
			const root2 = copyFixture("series");
			put(root2, `${c.file}: red\nx-future-key: kept\n`);
			const p2 = await open(root2);
			const s2 = await loadSettings(p2, reader(root2));
			await setSetting(p2, s2, "storyKind", "standalone");
			expect(fs.readFileSync(PROJECT_MD(root2), "utf8")).toContain(`${c.file}: red\nx-future-key: kept\n`);
			// an outside change applies through the re-read
			const root3 = copyFixture("series");
			put(root3, `${c.file}: ${c.ok[1]}\n`);
			const p3 = await open(root3);
			const s3 = await loadSettings(p3, reader(root3));
			put(root3, `${c.file}: ${c.ok[2]}\n`);
			await p3.refresh(PROJECT_SETTINGS_PATH);
			const out = await refreshSettings(p3, s3, reader(root3));
			expect(out.changed).toEqual([c.key]);
			expect(s3.values[c.key]).toBe(c.ok[2]);
		});
	}
});

describe("Inter is gone and Sofia Sans takes its place (Brief 18)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};
	it("a stored Inter draws that part's default and the key is never rewritten", async () => {
		const root = copyFixture("series");
		put(root, "appearance-novel-font: Inter\nappearance-series-font: Inter\nappearance-codex-font: Inter\nx-future-key: kept\n");
		const before = snapshot(root);
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		expect([s.values.appearanceNovelFont, s.values.appearanceSeriesFont, s.values.appearanceCodexFont]).toEqual(["Sofia Sans", "Sofia Sans", "Atkinson Hyperlegible Next"]);
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		// an unrelated write leaves the old value alone too
		await setSetting(project, s, "storyKind", "standalone");
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toContain("appearance-novel-font: Inter");
		expect(text).toContain("appearance-codex-font: Inter\nx-future-key: kept");
	});
	it("the three Sofia Sans widths are each their own family, with the whole weight range", async () => {
		const { FONT_FAMILIES, FAMILY_INFO } = await import("../../core/fontFamilies");
		for (const f of ["Sofia Sans", "Sofia Sans Semi Condensed", "Sofia Sans Condensed"] as const) {
			expect(FONT_FAMILIES).toContain(f);
			expect(FAMILY_INFO[f].weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
			expect(FAMILY_INFO[f].css.startsWith(`"${f}",`)).toBe(true);
		}
		expect(FONT_FAMILIES as readonly string[]).not.toContain("Inter");
	});
});

describe("the type styles' settings (Brief 18)", () => {
	const put = (root: string, body: string) => {
		fs.mkdirSync(path.join(root, "_backstage/storyforge"), { recursive: true });
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), `---\nformat-version: 1\n${body}---\n`);
	};
	it("the defaults are the table's, both base fonts SN Pro, every style following its base", () => {
		const v = DEFAULT_PROJECT_SETTINGS;
		expect([v.typeInterfaceFont, v.typeWritingFont]).toEqual(["SN Pro", "SN Pro"]);
		expect([v.typeBodyFont, v.typeBodyWeight, v.typeBodySize]).toEqual(["base", 400, 13]);
		expect([v.typeBodyBoldWeight, v.typeBodyBoldSize]).toEqual([600, 13]);
		expect([v.typeFieldsSize, v.typeProseSize, v.typeReadingSize]).toEqual([14, 20, 15]);
		expect([v.typeDisplaySize, v.typeTitleSize, v.typeHeadingSize, v.typeSmallHeadingSize, v.typeHintSize, v.typeBarNameSize]).toEqual([28, 20, 15, 12, 12, 19]);
	});
	it("valid values are read from their `appearance-…` keys; unknown or out-of-range ones draw the default and are never rewritten", async () => {
		const root = copyFixture("series");
		put(root, "appearance-interface-font: Aleo\nappearance-body-size: 14\nappearance-hint-size: 30\nappearance-display-font: Inter\nappearance-body-bold-font: Fraunces\nappearance-small-heading-weight: 500\nx-future-key: kept\n");
		const before = snapshot(root);
		const project = await open(root);
		const s = await loadSettings(project, reader(root));
		expect([s.values.typeInterfaceFont, s.values.typeBodySize, s.values.typeHintSize, s.values.typeDisplayFont, s.values.typeBodyBoldFont, s.values.typeSmallHeadingWeight]).toEqual(["Aleo", 14, 12, "base", "Fraunces", 500]);
		expect(diffSnapshots(before, snapshot(root)).changed).toEqual([]);
		await setSetting(project, s, "typeWritingFont", "Aleo");
		const text = fs.readFileSync(path.join(root, PROJECT_SETTINGS_PATH), "utf8");
		expect(text).toContain("appearance-writing-font: Aleo");
		expect(text).toContain("appearance-hint-size: 30");
		expect(text).toContain("x-future-key: kept");
	});
	it("a Navigator part can follow the Interface font, and a stored Inter still draws its default", async () => {
		const root = copyFixture("series");
		put(root, "appearance-codex-font: base\nappearance-novel-font: Inter\n");
		const s = await loadSettings(await open(root), reader(root));
		expect([s.values.appearanceCodexFont, s.values.appearanceNovelFont]).toEqual(["base", "Sofia Sans"]);
	});
});
