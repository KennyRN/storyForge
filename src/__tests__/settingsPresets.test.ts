import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import {
	NAMED_SETTINGS_ARCHIVE_ROOT,
	NAMED_SETTINGS_ROOT,
	SETTINGS_PRESETS_ROOT,
	archiveFormattingTheme,
	deleteSettingsPreset,
	listNamedSettings,
	listSettingsPresets,
	namedSettingsPath,
	readSettingsPreset,
	renameSettingsPreset,
	sanitizeSettingsPresetName,
	saveNamedSettings,
	saveSettingsPreset,
	settingsPresetPath,
	withNamedSettingsPrefix,
} from "../settingsPresets";

function makeMemoryApp(): App {
	const files = new Map<string, { file: TFile; content: string }>();
	const folders = new Set<string>();
	const abstractFile = (path: string) =>
		files.get(path)?.file ?? (folders.has(path) ? { path } : null);
	const vault = {
		getAbstractFileByPath: abstractFile,
		async createFolder(path: string) {
			folders.add(path);
		},
		async create(path: string, content: string) {
			if (files.has(path)) throw new Error(`File already exists: ${path}`);
			const file = new TFile();
			file.path = path;
			file.name = path.slice(path.lastIndexOf("/") + 1);
			files.set(path, { file, content });
			return file;
		},
		async modify(file: TFile, content: string) {
			const entry = files.get(file.path);
			if (!entry) throw new Error(`Missing file: ${file.path}`);
			entry.content = content;
		},
		async rename(file: TFile, newPath: string) {
			const entry = files.get(file.path);
			if (!entry) throw new Error(`Missing file: ${file.path}`);
			files.delete(file.path);
			file.path = newPath;
			file.name = newPath.slice(newPath.lastIndexOf("/") + 1);
			files.set(newPath, entry);
		},
		adapter: {
			async exists(path: string) {
				return files.has(path) || folders.has(path);
			},
			async list(folder: string) {
				const prefix = `${folder}/`;
				return {
					files: [...files.keys()].filter(
						(path) =>
							path.startsWith(prefix) &&
							!path.slice(prefix.length).includes("/"),
					),
					folders: [...folders].filter(
						(path) =>
							path.startsWith(prefix) &&
							!path.slice(prefix.length).includes("/"),
					),
				};
			},
			async read(path: string) {
				const entry = files.get(path);
				if (!entry) throw new Error(`Missing file: ${path}`);
				return entry.content;
			},
		},
	};
	return {
		vault,
		fileManager: {
			async trashFile(file: TFile) {
				files.delete(file.path);
			},
		},
	} as unknown as App;
}

describe("settings presets", () => {
	it("keeps friendly names and sanitizes path characters", () => {
		expect(sanitizeSettingsPresetName("Nord")).toBe("Nord");
		expect(sanitizeSettingsPresetName("Today's Theme")).toBe("Today's Theme");
		expect(sanitizeSettingsPresetName(" Book/Series: 1 ")).toBe("Book-Series- 1");
		expect(settingsPresetPath("formatForge", "I Love This")).toBe(
			`${NAMED_SETTINGS_ROOT}/thm-I Love This.json`,
		);
		expect(namedSettingsPath("preferences", "Default")).toBe(
			`${NAMED_SETTINGS_ROOT}/pref-Default.json`,
		);
		expect(namedSettingsPath("types-tags", "Cast")).toBe(
			`${NAMED_SETTINGS_ROOT}/tytg-Cast.json`,
		);
		expect(namedSettingsPath("complete", "Everything")).toBe(
			`${NAMED_SETTINGS_ROOT}/comp-Everything.json`,
		);
		expect(namedSettingsPath("threads", "Strands")).toBe(
			`${NAMED_SETTINGS_ROOT}/thrd-Strands.json`,
		);
		expect(withNamedSettingsPrefix("themes", "themes - Nord")).toBe("thm-Nord");
		expect(withNamedSettingsPrefix("themes", "thm-Nord")).toBe("thm-Nord");
		expect(settingsPresetPath("storyForge", "Book Series 1")).toBe(
			`${SETTINGS_PRESETS_ROOT}/storyForge/Book Series 1.json`,
		);
	});

	it("requires explicit overwrite when a named preset exists", async () => {
		const app = {
			vault: {
				getAbstractFileByPath: () => ({ path: "existing" }),
			},
		} as unknown as App;
		await expect(
			saveSettingsPreset(app, "formatForge", "Nord", "{}", false),
		).rejects.toThrow("already exists");
	});

	it("lists owner-scoped presets and rejects cross-owner reads", async () => {
		const folder = NAMED_SETTINGS_ROOT;
		const app = {
			vault: {
				adapter: {
					exists: async (path: string) => path === folder,
					list: async () => ({
						files: [
							`${folder}/thm-Nord.json`,
							`${folder}/thm-Today's Theme.json`,
							`${folder}/pref-Default.json`,
							`${folder}/tytg-Cast.json`,
							`${folder}/comp-Everything.json`,
							`${folder}/ignore.md`,
						],
						folders: [],
					}),
					read: async (path: string) => `contents:${path}`,
				},
			},
		} as unknown as App;

		expect(await listSettingsPresets(app, "formatForge")).toEqual([
			{ name: "Nord", path: `${folder}/thm-Nord.json` },
			{ name: "Today's Theme", path: `${folder}/thm-Today's Theme.json` },
		]);
		await expect(readSettingsPreset(app, "formatForge", `${folder}/thm-Nord.json`)).resolves.toContain(
			"thm-Nord.json",
		);
		await expect(
			readSettingsPreset(app, "formatForge", `${folder}/pref-Default.json`),
		).rejects.toThrow("settings");
		await expect(
			readSettingsPreset(
				app,
				"formatForge",
				`${SETTINGS_PRESETS_ROOT}/storyForge/Nord.json`,
			),
		).rejects.toThrow("settings");
	});

	it("lists unprefixed settings files and skips other named-settings kinds", async () => {
		const app = makeMemoryApp();
		await saveSettingsPreset(app, "formatForge", "Nord", "nord");
		await app.vault.create(`${NAMED_SETTINGS_ROOT}/Legacy.json`, "legacy");
		await app.vault.create(`${NAMED_SETTINGS_ROOT}/pref-Default.json`, "prefs");
		await app.vault.create(`${NAMED_SETTINGS_ROOT}/tytg-Cast.json`, "cast");
		await app.vault.create(`${NAMED_SETTINGS_ROOT}/complete - Everything.json`, "all");
		await app.vault.createFolder("_backstage/storyforge/themes");
		await app.vault.create("_backstage/storyforge/themes/Old.json", "old");

		expect(await listSettingsPresets(app, "formatForge")).toEqual([
			{ name: "Legacy", path: `${NAMED_SETTINGS_ROOT}/Legacy.json` },
			{ name: "Nord", path: `${NAMED_SETTINGS_ROOT}/thm-Nord.json` },
			{ name: "Old", path: "_backstage/storyforge/themes/Old.json" },
		]);
		expect(await listNamedSettings(app, "types-tags")).toEqual([
			{ name: "Cast", path: `${NAMED_SETTINGS_ROOT}/tytg-Cast.json` },
		]);
		const savedTags = await saveNamedSettings(app, "types-tags", "Cast", "updated", true);
		expect(savedTags.path).toBe(`${NAMED_SETTINGS_ROOT}/tytg-Cast.json`);
	});

	it("guards rename and delete operations to their owner's folder", async () => {
		const app = {} as App;
		await expect(
			renameSettingsPreset(
				app,
				"formatForge",
				`${SETTINGS_PRESETS_ROOT}/storyForge/Nord.json`,
				"New Nord",
			),
		).rejects.toThrow("settings");
		await expect(
			deleteSettingsPreset(
				app,
				"storyForge",
				`${NAMED_SETTINGS_ROOT}/thm-Nord.json`,
			),
		).rejects.toThrow("storyForge");
	});

	it("round-trips large owner-isolated preset libraries", async () => {
		const app = makeMemoryApp();
		await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				saveSettingsPreset(app, "formatForge", `Theme ${i}`, `ff:${i}`),
			),
		);
		await Promise.all(
			Array.from({ length: 75 }, (_, i) =>
				saveSettingsPreset(app, "storyForge", `Series ${i}`, `sf:${i}`),
			),
		);
		const ff = await listSettingsPresets(app, "formatForge");
		const sf = await listSettingsPresets(app, "storyForge");
		expect(ff).toHaveLength(100);
		expect(sf).toHaveLength(75);
		expect(ff.map((file) => file.name)).toEqual(
			[...ff.map((file) => file.name)].sort((a, b) => a.localeCompare(b)),
		);
		for (let i = 0; i < 100; i++) {
			await expect(
				readSettingsPreset(
					app,
					"formatForge",
					settingsPresetPath("formatForge", `Theme ${i}`),
				),
			).resolves.toBe(`ff:${i}`);
		}
	});

	it("serializes same-name creation and overwrite storms", async () => {
		const app = makeMemoryApp();
		const collisions = await Promise.allSettled(
			Array.from({ length: 50 }, (_, i) =>
				saveSettingsPreset(app, "formatForge", "Nord", `create:${i}`),
			),
		);
		expect(collisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(collisions.filter((result) => result.status === "rejected")).toHaveLength(49);

		await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				saveSettingsPreset(app, "formatForge", "Nord", `overwrite:${i}`, true),
			),
		);
		await expect(
			readSettingsPreset(
				app,
				"formatForge",
				settingsPresetPath("formatForge", "Nord"),
			),
		).resolves.toBe("overwrite:99");
	});

	it("renames, replaces, and deletes without crossing owner boundaries", async () => {
		const app = makeMemoryApp();
		const nord = await saveSettingsPreset(app, "formatForge", "Nord", "nord");
		const roman = await saveSettingsPreset(app, "formatForge", "Roman", "roman");

		await expect(
			renameSettingsPreset(app, "formatForge", nord.path, "Roman"),
		).rejects.toThrow("already exists");
		await expect(readSettingsPreset(app, "formatForge", nord.path)).resolves.toBe(
			"nord",
		);
		await expect(readSettingsPreset(app, "formatForge", roman.path)).resolves.toBe(
			"roman",
		);

		const replaced = await renameSettingsPreset(
			app,
			"formatForge",
			nord.path,
			"Roman",
			true,
		);
		expect(replaced.name).toBe("Roman");
		await expect(readSettingsPreset(app, "formatForge", replaced.path)).resolves.toBe(
			"nord",
		);
		await expect(readSettingsPreset(app, "formatForge", nord.path)).rejects.toThrow(
			"Missing file",
		);

		await deleteSettingsPreset(app, "formatForge", replaced.path);
		expect(await listSettingsPresets(app, "formatForge")).toEqual([]);
	});

	it("archives formatForge themes into archived-settings instead of deleting them", async () => {
		const app = makeMemoryApp();
		const first = await saveSettingsPreset(app, "formatForge", "Nord", "nord-1");
		await archiveFormattingTheme(app, first.path);
		expect(await listSettingsPresets(app, "formatForge")).toEqual([]);
		await expect(
			app.vault.adapter.read(`${NAMED_SETTINGS_ARCHIVE_ROOT}/thm-Nord.json`),
		).resolves.toBe("nord-1");

		const second = await saveSettingsPreset(app, "formatForge", "Nord", "nord-2");
		await archiveFormattingTheme(app, second.path);
		expect(await listSettingsPresets(app, "formatForge")).toEqual([]);
		await expect(
			app.vault.adapter.read(`${NAMED_SETTINGS_ARCHIVE_ROOT}/thm-Nord.json`),
		).resolves.toBe("nord-1");
		await expect(
			app.vault.adapter.read(`${NAMED_SETTINGS_ARCHIVE_ROOT}/thm-Nord (2).json`),
		).resolves.toBe("nord-2");
	});

	it("keeps case-only renames without deleting the only file", async () => {
		const app = makeMemoryApp();
		const saved = await saveSettingsPreset(app, "formatForge", "Nord", "case-safe");
		const renamed = await renameSettingsPreset(
			app,
			"formatForge",
			saved.path,
			"nord",
		);
		expect(renamed).toEqual({
			name: "nord",
			path: `${NAMED_SETTINGS_ROOT}/thm-nord.json`,
		});
		await expect(readSettingsPreset(app, "formatForge", renamed.path)).resolves.toBe(
			"case-safe",
		);
		expect(await listSettingsPresets(app, "formatForge")).toEqual([renamed]);
	});

	it("sanitizes hostile names and rejects names with no usable characters", () => {
		for (const name of [
			"../../Codex/secret",
			"NUL:name",
			"Book\\Series|One",
			` ${"A".repeat(150)} `,
		]) {
			const safe = sanitizeSettingsPresetName(name);
			expect(safe).not.toMatch(/[\\/:*?"<>|]/);
			expect(safe.length).toBeLessThanOrEqual(100);
		}
		for (const name of ["", "   ", "...", " . . "]) {
			expect(() => sanitizeSettingsPresetName(name)).toThrow();
		}
	});
});
