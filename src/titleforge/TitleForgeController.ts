import type { Plugin } from "obsidian";
import { ICON_NOTEBOOK } from "../icons.js";
import { getGenerator, register, unregister } from "./engine/registry.js";
import type { GeneratorSpec } from "./engine/types.js";
import { DEFAULT_TITLEFORGE_SETTINGS, type TitleForgeSettings } from "./settings.js";
import { TitleForgeStorage } from "./storage.js";
import { TITLEFORGE_VIEW_TYPE, TitleForgeView } from "./view/TitleForgeView.js";

/**
 * titleForge's whole bootstrap — the module a standalone titleForge plugin's
 * own `main.ts` would be. storyForge's `main.ts` only ever does three things
 * with an instance of this: construct it, `await onload()`, and call
 * `onunload()`. Everything else — view/command/ribbon registration, settings,
 * storage, the live generator list — is self-contained here, which is what
 * keeps main.ts's touch point to three lines.
 *
 * Reuses one storyForge resource directly, by the user's own instruction: the
 * ribbon icon (`ICON_NOTEBOOK`, from `../icons.js`). Everything else — engine,
 * lexicons, storage, view — is titleForge's own, prefixed accordingly. On
 * extraction, swap the icon import for an owned one; nothing else changes.
 */
export class TitleForgeController {
	readonly storage: TitleForgeStorage;
	settings: TitleForgeSettings = { ...DEFAULT_TITLEFORGE_SETTINGS };
	generators: GeneratorSpec[] = [];

	constructor(private readonly plugin: Plugin) {
		this.storage = new TitleForgeStorage(plugin.app);
	}

	async onload(): Promise<void> {
		await this.storage.ensureLexiconsSeeded();
		await this.reloadGenerators();
		this.settings = await this.storage.loadSettings();

		this.plugin.registerView(TITLEFORGE_VIEW_TYPE, (leaf) => new TitleForgeView(leaf, this));
		this.plugin.addRibbonIcon(ICON_NOTEBOOK, "Open titleForge", () => void this.activateView());
		this.plugin.addCommand({
			id: "open-titleforge",
			name: "Open titleForge",
			callback: () => void this.activateView(),
		});
	}

	onunload(): void {
		// Leaves detach themselves when the plugin unloads; nothing owned here
		// needs explicit teardown.
	}

	/** Re-reads every generator from the vault (preferring hand-edited copies) and re-registers them. */
	async reloadGenerators(): Promise<void> {
		this.generators = await this.storage.loadAllGenerators();
		for (const spec of this.generators) {
			unregister(spec.id);
			register(spec);
		}
	}

	getGeneratorById(id: string): GeneratorSpec | undefined {
		return this.generators.find((g) => g.id === id) ?? getGenerator(id);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.plugin.app;
		const existing = workspace.getLeavesOfType(TITLEFORGE_VIEW_TYPE);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: TITLEFORGE_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	async saveSettings(): Promise<void> {
		await this.storage.saveSettings(this.settings);
	}
}
