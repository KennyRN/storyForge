import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { createHostApi } from "../hostApi";
import type StoryForgePlugin from "../main";

function makeMemoryApp(): App {
	const files = new Map<string, { file: TFile; content: string }>();
	const folders = new Set<string>();
	const vault = {
		getAbstractFileByPath(path: string) {
			return files.get(path)?.file ?? (folders.has(path) ? { path } : null);
		},
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
			entry.file.path = newPath;
			entry.file.name = newPath.slice(newPath.lastIndexOf("/") + 1);
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

function makePlugin(app: App): StoryForgePlugin {
	let companion: unknown = null;
	const settings: Record<string, unknown> = {
		colorPaletteName: "Custom",
		colorPaletteVariant: "",
		customPaletteColors: [],
	};
	return {
		app,
		getSettings: () => settings,
		async updateSetting(key: string, value: unknown) {
			settings[key] = value;
		},
		async updateSettings(partial: Record<string, unknown>) {
			Object.assign(settings, partial);
		},
		applyLinkedFormattingStyles() {},
		applyHostStyleVars() {},
		getStyleDocuments: () => [],
		getFormatCompanion: () => companion,
		registerFormatCompanion(reg: unknown) {
			companion = reg;
			return () => {
				if (companion === reg) companion = null;
			};
		},
		registerViewContribution() {
			return () => undefined;
		},
		addActiveBookListener() {
			return () => undefined;
		},
		registerHostedRightRailView() {},
	} as unknown as StoryForgePlugin;
}

describe("formatForge theme storage through storyForge API stress", () => {
	it("survives save/list/read/rename/delete storms through API v7", async () => {
		const api = createHostApi(makePlugin(makeMemoryApp())).formatting;
		for (let round = 0; round < 10; round++) {
			await Promise.all(
				Array.from({ length: 50 }, (_, i) =>
					api.saveFormattingPreset(
						`Theme ${round}-${i}`,
						JSON.stringify({ round, i }),
					),
				),
			);
		}
		expect(await api.listFormattingPresets()).toHaveLength(500);

		const originals = (await api.listFormattingPresets()).slice(0, 100);
		const renamed = await Promise.all(
			originals.map((file, i) =>
				api.renameFormattingPreset(file.path, `Renamed ${i}`),
			),
		);
		expect(new Set(renamed.map((file) => file.path)).size).toBe(100);
		for (const file of renamed) {
			expect(JSON.parse(await api.readFormattingPreset(file.path))).toMatchObject({
				round: expect.any(Number),
				i: expect.any(Number),
			});
		}
		await Promise.all(
			renamed.map((file) => api.deleteFormattingPreset(file.path)),
		);
		expect(await api.listFormattingPresets()).toHaveLength(400);
	});

	it("enforces explicit overwrite under concurrent formatForge calls", async () => {
		const api = createHostApi(makePlugin(makeMemoryApp())).formatting;
		const results = await Promise.allSettled(
			Array.from({ length: 100 }, (_, i) =>
				api.saveFormattingPreset("Nord", `attempt:${i}`),
			),
		);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(99);

		await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				api.saveFormattingPreset("Nord", `overwrite:${i}`, true),
			),
		);
		const [nord] = await api.listFormattingPresets();
		expect(await api.readFormattingPreset(nord.path)).toBe("overwrite:99");
	});

	it("keeps rapid dated archive copies unique and readable", async () => {
		const api = createHostApi(makePlugin(makeMemoryApp())).formatting;
		const paths = await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				api.saveFormattingExport(JSON.stringify({ archive: i })),
			),
		);
		expect(new Set(paths).size).toBe(100);
		expect(await api.listSettingsExports()).toHaveLength(100);
		for (let i = 0; i < paths.length; i++) {
			await expect(api.readSettingsExport(paths[i])).resolves.toBe(
				JSON.stringify({ archive: i }),
			);
		}
	});

	it("keeps themes durable across companion disconnect/reconnect thrash", async () => {
		const plugin = makePlugin(makeMemoryApp());
		const api = createHostApi(plugin).formatting;
		const saved = await api.saveFormattingPreset("Durable", "{\"ok\":true}");

		for (let i = 0; i < 200; i++) {
			const unregister = api.registerCompanion({
				pluginId: "formatforge",
				version: 1,
			});
			expect(api.isCompanionActive()).toBe(true);
			expect(await api.readFormattingPreset(saved.path)).toBe("{\"ok\":true}");
			unregister();
			expect(api.isCompanionActive()).toBe(false);
		}
		expect(await api.listFormattingPresets()).toEqual([saved]);
	});

	it("rejects formatForge attempts to read another owner's preset", async () => {
		const app = makeMemoryApp();
		const plugin = makePlugin(app);
		const api = createHostApi(plugin).formatting;
		await expect(
			api.readFormattingPreset(
				"_sf-backstage/settings-presets/storyForge/Private.json",
			),
		).rejects.toThrow("formatForge");
	});
});
