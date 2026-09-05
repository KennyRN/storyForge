import type { App, Plugin } from "obsidian";
import { ICON_TITLEFORGE } from "../icons.js";
import { getGenerator, register, unregister } from "./engine/registry.js";
import type { GeneratorSpec } from "./engine/types.js";
import { DEFAULT_TITLEFORGE_SETTINGS, type TitleForgeOpenOptions, type TitleForgeSettings } from "./settings.js";
import { TitleForgeStorage } from "./storage.js";
import { TitleForgeModal } from "./view/TitleForgeModal.js";
import { TitleForgePanel } from "./view/TitleForgePanel.js";

/** Companion-panel id for the Story Context Forge-family row — always first. */
export const TITLEFORGE_COMPANION_ID = "titleforge";

/**
 * titleForge's whole bootstrap — the module a standalone titleForge plugin's
 * own `main.ts` would be. storyForge's `main.ts` constructs it during plugin
 * `onload()`, then `await onload()` on layout-ready (vault I/O is not safe
 * during a cold-start `onload()`), and calls `onunload()` on disable.
 * Everything else — command/ribbon registration, settings, storage, the live
 * generator list — is self-contained here.
 *
 * There is no main-area workspace view: the ribbon, command, settings button, and rename-modal
 * dice still open a modal (`openModal()`, `TitleForgeModal.ts`). Story Context's Forge-family
 * row also embeds this panel (`mountEmbeddedPanel`) as the leading companion icon — that is a
 * right-rail host, not a workspace tab.
 *
 * Reuses one storyForge resource directly: the identity glyph (`ICON_TITLEFORGE`,
 * from `../icons.js`). Everything else — engine, lexicons, storage, view — is
 * titleForge's own, prefixed accordingly. On extraction, swap the icon import
 * for an owned one; nothing else changes.
 */
export class TitleForgeController {
	readonly storage: TitleForgeStorage;
	settings: TitleForgeSettings = { ...DEFAULT_TITLEFORGE_SETTINGS };
	generators: GeneratorSpec[] = [];

	constructor(private readonly plugin: Plugin) {
		this.storage = new TitleForgeStorage(plugin.app);
	}

	/** So the panel/its info modal can reach `app` without threading it through their own
	 * constructors separately — they already hold this controller. */
	get app(): App {
		return this.plugin.app;
	}

	async onload(): Promise<void> {
		await this.storage.ensureLexiconsSeeded();
		await this.reloadGenerators();
		this.settings = await this.storage.loadSettings();

		this.plugin.addRibbonIcon(ICON_TITLEFORGE, "Open titleForge", () => this.openModal());
		this.plugin.addCommand({
			id: "open-titleforge",
			name: "Open titleForge",
			callback: () => this.openModal(),
		});
	}

	onunload(): void {
		// No view/leaf is registered, and the settings/history writes below are all
		// fire-and-forget already awaited at their call sites — nothing owned here
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

	async saveSettings(): Promise<void> {
		await this.storage.saveSettings(this.settings);
	}

	/** titleForge's one entry point — a modal window, never a workspace tab (see the class doc
	 * above). Used by the ribbon icon, the command, and TitleForgeSettingsModal's "Open titleForge"
	 * button, all with no `options` (titleForge behaves exactly as it always has: every tab, every
	 * tradition, no "use this title" action) — and by a rename modal's dice icon (NovelTitleModal.ts,
	 * SeriesTitleModal.ts), which each pass their own `scope` and `onUse`. See TitleForgeOpenOptions. */
	openModal(options: TitleForgeOpenOptions = {}): void {
		new TitleForgeModal(this.plugin.app, this, options).open();
	}

	/** Embed titleForge in Story Context's Forge-family panel (ICON_TITLEFORGE — the title-header glyph). */
	mountEmbeddedPanel(containerEl: HTMLElement): () => void {
		const panel = new TitleForgePanel(containerEl, this, { scope: "all" });
		void panel.load();
		return () => containerEl.empty();
	}
}
