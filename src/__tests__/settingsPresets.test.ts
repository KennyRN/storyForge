import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import {
	SETTINGS_PRESETS_ROOT,
	deleteSettingsPreset,
	listSettingsPresets,
	readSettingsPreset,
	renameSettingsPreset,
	sanitizeSettingsPresetName,
	saveSettingsPreset,
	settingsPresetPath,
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
			`${SETTINGS_PRESETS_ROOT}/formatForge/I Love This.json`,
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
		const folder = `${SETTINGS_PRESETS_ROOT}/formatForge`;
		const app = {
			vault: {
				adapter: {
					exists: async () => true,
					list: async () => ({
						files: [`${folder}/Nord.json`, `${folder}/Today's Theme.json`, `${folder}/ignore.md`],
						folders: [],
					}),
					read: async (path: string) => `contents:${path}`,
				},
			},
		} as unknown as App;

		expect(await listSettingsPresets(app, "formatForge")).toEqual([
			{ name: "Nord", path: `${folder}/Nord.json` },
			{ name: "Today's Theme", path: `${folder}/Today's Theme.json` },
		]);
		await expect(readSettingsPreset(app, "formatForge", `${folder}/Nord.json`)).resolves.toContain("Nord.json");
		await expect(
			readSettingsPreset(
				app,
				"formatForge",
				`${SETTINGS_PRESETS_ROOT}/storyForge/Nord.json`,
			),
		).rejects.toThrow("formatForge");
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
		).rejects.toThrow("formatForge");
		await expect(
			deleteSettingsPreset(
				app,
				"storyForge",
				`${SETTINGS_PRESETS_ROOT}/formatForge/Nord.json`,
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
			path: `${SETTINGS_PRESETS_ROOT}/formatForge/nord.json`,
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
