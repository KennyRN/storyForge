import type { Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { makeTFile } from "../../__tests__/obsidianStub.js";
import { TitleForgeController } from "../TitleForgeController.js";
import { TitleForgePanel } from "../view/TitleForgePanel.js";

/** A minimal fake Plugin whose vault is just an in-memory file map — same shape
 * controllerLiveRefresh.test.ts uses, trimmed to what TitleForgeStorage actually calls here. */
function makeFakePlugin(): { plugin: Plugin } {
	const files = new Map<string, string>();
	const vault = {
		on: () => ({}),
		getAbstractFileByPath: (path: string) => (files.has(path) ? makeTFile(path) : null),
		read: async (file: { path: string }) => files.get(file.path)!,
		create: async (path: string, content: string) => {
			files.set(path, content);
			return makeTFile(path);
		},
		modify: async (file: { path: string }, content: string) => {
			files.set(file.path, content);
		},
		createFolder: async () => undefined,
		adapter: {
			exists: async (path: string) => files.has(path),
			read: async (path: string) => files.get(path)!,
			write: async (path: string, content: string) => {
				files.set(path, content);
			},
			mkdir: async () => undefined,
		},
	};
	const app = { vault };
	const plugin = {
		app,
		addRibbonIcon: () => ({}),
		addCommand: () => ({}),
		registerEvent: () => undefined,
	} as unknown as Plugin;
	return { plugin };
}

/** Builds a panel already sitting on the "novels" section (skipping the placeholder/switcher
 * dance — not what these tests are about) with `render()` stubbed out, since there is no DOM
 * under vitest's node environment (see obsidianStub.ts's own doc comment) — the point here is the
 * batch-tracking *state*, not the markup it produces. */
async function makeActivePanel(): Promise<{ controller: TitleForgeController; panel: TitleForgePanel }> {
	const { plugin } = makeFakePlugin();
	const controller = new TitleForgeController(plugin);
	await controller.onload();

	const panel = new TitleForgePanel({} as unknown as HTMLElement, controller, { scope: "all", panel: true });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const p = panel as any;
	p.render = () => {};
	p.activeTab = "novels";
	p.generatorId = "title-composer";
	p.history = [];

	return { controller, panel };
}

describe("TitleForgePanel — current-batch box (B2/B3)", () => {
	it("is empty until the first generate, then holds exactly that batch", async () => {
		const { panel } = await makeActivePanel();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = panel as any;

		expect(p.currentBatch).toEqual([]);

		await p.handleGenerate();

		expect(p.currentBatch).toHaveLength(5); // DEFAULT_TITLEFORGE_SETTINGS.lastQuantity
		expect(p.currentBatch.every((e: { generatorId: string }) => e.generatorId === "title-composer")).toBe(true);
	});

	it("replaces the batch (not accumulates) on the next generate, while history keeps growing", async () => {
		const { controller, panel } = await makeActivePanel();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = panel as any;

		await p.handleGenerate();
		const firstBatchTitles = p.currentBatch.map((e: { title: string }) => e.title);
		expect(await controller.storage.loadHistory("title-composer")).toHaveLength(5);

		await p.handleGenerate();
		expect(p.currentBatch).toHaveLength(5);
		const secondBatchTitles = p.currentBatch.map((e: { title: string }) => e.title);

		// The exclude-set spans the whole run, so the second click can't reproduce the first click's
		// titles — confirms currentBatch was actually replaced with fresh entries, not re-shown.
		expect(secondBatchTitles.some((t: string) => firstBatchTitles.includes(t))).toBe(false);

		// The full run is still on disk in full, even though the inline box only shows the latest.
		expect(await controller.storage.loadHistory("title-composer")).toHaveLength(10);
	});

	it("clears the batch on a section switch", async () => {
		const { panel } = await makeActivePanel();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = panel as any;

		await p.handleGenerate();
		expect(p.currentBatch).toHaveLength(5);

		// currentBatch is cleared synchronously, before switchToSection's own async history
		// reload/render tail — no need to await that tail for this assertion.
		p.switchToSection("novels");
		expect(p.currentBatch).toEqual([]);
	});

	it("keeps a starred current-batch entry's kept flag in sync with what gets persisted", async () => {
		const { controller, panel } = await makeActivePanel();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = panel as any;

		await p.handleGenerate();
		const entry = p.currentBatch[0];
		expect(entry.kept).toBeFalsy();

		await p.toggleKeptEntry(entry.generatorId, entry);

		expect(p.currentBatch[0].kept).toBe(true);
		const persisted = await controller.storage.loadHistory("title-composer");
		expect(persisted.find((e: { title: string }) => e.title === entry.title)?.kept).toBe(true);
	});
});
