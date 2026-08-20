import { Notice, TFile, type App } from "obsidian";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../paths.js";
import { enqueueBackstageWrite, writeBackstageFile } from "../writeGuard.js";
import { parseEntries, serialiseEntries } from "./engine/history.js";
import type { GeneratorSpec, HistoryEntry } from "./engine/types.js";
import { ALL_TITLEFORGE_LEXICONS } from "./lexicons/index.js";
import { DEFAULT_TITLEFORGE_SETTINGS, type TitleForgeSettings } from "./settings.js";

/**
 * The only file in `titleforge/` that touches `app.vault`. Deliberately kept
 * to one module: pulling this subplugin out into its own Obsidian plugin later
 * means rewriting this file's guts (which vault, which write helper) and
 * nothing else in the folder.
 *
 * `TITLEFORGE_BACKSTAGE_ROOT` and `writeGuard.ts` are storyForge's — reused
 * here rather than reinvented, same as the shared icon in
 * `view/TitleForgeView.ts`. `TITLEFORGE_BACKSTAGE_ROOT` (`_backstage/titleforge`)
 * is already titleForge's own sibling region under the shared `_backstage/`
 * parent, not nested under storyForge's own `_backstage/storyforge/`. On
 * extraction, swap `root()` below for the new plugin's own vault root and
 * replace the two writeGuard calls with a plain `vault.create`/`modify`
 * (writeGuard's only job is confining writes to storyForge's/titleForge's
 * shared `_backstage/` regions, which a standalone plugin wouldn't need).
 */
function root(): string {
	return TITLEFORGE_BACKSTAGE_ROOT;
}
function lexiconPath(id: string): string {
	return `${root()}/lexicons/${id}.json`;
}
function settingsPath(): string {
	return `${root()}/settings.json`;
}
function historyPath(generatorId: string): string {
	return `${root()}/history/${generatorId}.jsonl`;
}

function isGeneratorSpec(value: unknown): value is GeneratorSpec {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === "string" && Array.isArray(v.patterns) && typeof v.lexicon === "object";
}

export class TitleForgeStorage {
	constructor(private app: App) {}

	/** Path shown to the user in the settings modal — where the hand-editable lexicons live. */
	lexiconsFolderPath(): string {
		return `${root()}/lexicons`;
	}

	/**
	 * Seed every bundled lexicon out to the vault as real JSON, once, so it's
	 * hand-editable from day one — this is how "edit a word, no rebuild" (see
	 * `NOTES.md`) survives inside a bundled Obsidian plugin. Idempotent: only
	 * writes the ones that aren't already there.
	 */
	async ensureLexiconsSeeded(): Promise<void> {
		for (const spec of ALL_TITLEFORGE_LEXICONS) {
			const path = lexiconPath(spec.id);
			if (this.app.vault.getAbstractFileByPath(path)) continue;
			await this.resetLexiconToBundled(spec);
		}
	}

	/** Overwrite the vault copy with the bundled default — the settings modal's "reset" action. */
	async resetLexiconToBundled(spec: GeneratorSpec): Promise<void> {
		const path = lexiconPath(spec.id);
		await enqueueBackstageWrite(path, () =>
			writeBackstageFile(this.app.vault, path, JSON.stringify(spec, null, "\t")),
		);
	}

	/**
	 * Load one generator, preferring the vault's hand-editable copy over the
	 * bundled default. Falls back (with a `Notice`, never a silent swallow) if
	 * the vault copy is missing or fails to parse as a generator spec.
	 */
	async loadGenerator(bundled: GeneratorSpec): Promise<GeneratorSpec> {
		const path = lexiconPath(bundled.id);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return bundled;
		try {
			const text = await this.app.vault.adapter.read(path);
			const parsed: unknown = JSON.parse(text);
			if (!isGeneratorSpec(parsed)) throw new Error("not a generator spec");
			return parsed;
		} catch (err) {
			new Notice(
				`titleForge: couldn't read ${path} (${(err as Error).message}) — using the bundled ` +
					`"${bundled.name}" lexicon instead.`,
			);
			return bundled;
		}
	}

	async loadAllGenerators(): Promise<GeneratorSpec[]> {
		return Promise.all(ALL_TITLEFORGE_LEXICONS.map((spec) => this.loadGenerator(spec)));
	}

	async loadSettings(): Promise<TitleForgeSettings> {
		const path = settingsPath();
		if (!(await this.app.vault.adapter.exists(path))) {
			return { ...DEFAULT_TITLEFORGE_SETTINGS };
		}
		try {
			const text = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(text) as Partial<TitleForgeSettings>;
			return { ...DEFAULT_TITLEFORGE_SETTINGS, ...parsed };
		} catch {
			return { ...DEFAULT_TITLEFORGE_SETTINGS };
		}
	}

	async saveSettings(settings: TitleForgeSettings): Promise<void> {
		const path = settingsPath();
		await enqueueBackstageWrite(path, () =>
			writeBackstageFile(this.app.vault, path, JSON.stringify(settings, null, "\t")),
		);
	}

	async loadHistory(generatorId: string): Promise<HistoryEntry[]> {
		const path = historyPath(generatorId);
		if (!(await this.app.vault.adapter.exists(path))) return [];
		const text = await this.app.vault.adapter.read(path);
		return parseEntries(text).entries;
	}

	/** Append one entry without reading the whole file back first. */
	async appendHistory(entry: HistoryEntry): Promise<void> {
		const path = historyPath(entry.generatorId);
		await enqueueBackstageWrite(path, async () => {
			const existing = (await this.app.vault.adapter.exists(path))
				? await this.app.vault.adapter.read(path)
				: "";
			await writeBackstageFile(this.app.vault, path, existing + serialiseEntries([entry]));
		});
	}

	/** Rewrite one generator's whole history — used when toggling "kept" or clearing history. */
	async saveHistory(generatorId: string, entries: HistoryEntry[]): Promise<void> {
		const path = historyPath(generatorId);
		await enqueueBackstageWrite(path, () =>
			writeBackstageFile(this.app.vault, path, serialiseEntries(entries)),
		);
	}
}
