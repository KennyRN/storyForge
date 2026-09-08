import { Notice, type App, type Plugin, type TAbstractFile } from "obsidian";
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

	/** Open panels that want to redraw when the user-additions file changes (see `watchUserLexicon`). */
	private readonly reloadListeners = new Set<() => void>();
	private userLexiconReloadTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly plugin: Plugin) {
		this.storage = new TitleForgeStorage(plugin.app);
	}

	/** So the panel/its info modal can reach `app` without threading it through their own
	 * constructors separately — they already hold this controller. */
	get app(): App {
		return this.plugin.app;
	}

	async onload(): Promise<void> {
		await this.reloadGenerators();
		this.settings = await this.storage.loadSettings();
		await this.adviseLegacyLexiconsOnce();
		this.watchUserLexicon();

		this.plugin.addRibbonIcon(ICON_TITLEFORGE, "Open titleForge", () => this.openModal());
		this.plugin.addCommand({
			id: "open-titleforge",
			name: "Open titleForge",
			callback: () => this.openModal(),
		});
	}

	/**
	 * One-time advisory for vaults upgraded from a titleForge that seeded per-lexicon JSON: the
	 * built-in words now live inside the plugin, and `_backstage/titleforge/lexicons/` is dead
	 * weight the user may delete. Deliberately non-destructive — a copy there could have been
	 * hand-edited under the old model (brief §5).
	 */
	private async adviseLegacyLexiconsOnce(): Promise<void> {
		if (this.settings.legacyLexiconsNoticeShown) return;
		this.settings.legacyLexiconsNoticeShown = true;
		await this.saveSettings();
		if (await this.storage.hasLegacyLexicons()) {
			new Notice(
				"titleForge: built-in words now live inside the plugin. The old " +
					`"${this.storage.legacyLexiconsDir()}/" folder is no longer used and can be deleted. ` +
					`To re-add any personal edits, put them in "${this.storage.userLexiconPath()}".`,
			);
		}
	}

	/**
	 * Re-scan the user-additions file when it changes, so "add a word, see it" needs no reload.
	 * Debounced — an editor save can fire several `modify` events in a burst.
	 */
	private watchUserLexicon(): void {
		const targetPath = this.storage.userLexiconPath();
		const onChange = (file: TAbstractFile): void => {
			if (file.path !== targetPath) return;
			clearTimeout(this.userLexiconReloadTimer);
			this.userLexiconReloadTimer = setTimeout(() => {
				void this.reloadGenerators().then(() => {
					for (const listener of this.reloadListeners) listener();
				});
			}, 300);
		};
		const { vault } = this.plugin.app;
		this.plugin.registerEvent(vault.on("modify", onChange));
		this.plugin.registerEvent(vault.on("create", onChange));
		this.plugin.registerEvent(vault.on("delete", onChange));
	}

	/** Subscribe to "generators were re-scanned" — returns an unsubscribe. Used by open panels. */
	onGeneratorsReloaded(listener: () => void): () => void {
		this.reloadListeners.add(listener);
		return () => this.reloadListeners.delete(listener);
	}

	onunload(): void {
		// No view/leaf is registered, and the settings/history writes below are all
		// fire-and-forget already awaited at their call sites — nothing owned here
		// needs explicit teardown.
	}

	/** Re-scans the compiled-in bundle plus the user-additions file and re-registers every generator. */
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
		const unsubscribe = this.onGeneratorsReloaded(() => panel.refresh());
		return () => {
			unsubscribe();
			containerEl.empty();
		};
	}
}
