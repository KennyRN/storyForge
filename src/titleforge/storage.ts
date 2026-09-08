import { Notice, TFile, type App } from "obsidian";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../paths.js";
import { enqueueBackstageWrite, writeBackstageFile } from "../writeGuard.js";
import { parseEntries, serialiseEntries } from "./engine/history.js";
import type { GeneratorSpec, HistoryEntry } from "./engine/types.js";
import { mergeUserLexicon } from "./engine/userLexicon.js";
import { ALL_TITLEFORGE_LEXICONS } from "./lexicons/index.js";
import { USER_LEXICON_TEMPLATE } from "./lexicons/userLexiconTemplate.js";
import { DEFAULT_TITLEFORGE_SETTINGS, type TitleForgeSettings } from "./settings.js";

/**
 * The only file in `titleforge/` that touches `app.vault`. Deliberately kept
 * to one module: pulling this subplugin out into its own Obsidian plugin later
 * means rewriting this file's guts (which vault, which write helper) and
 * nothing else in the folder.
 *
 * The built-in word lists are **compiled in and read-only**: they are never
 * seeded to the vault and never loaded from it, so there is no vault copy to go
 * stale. A user can only *add* words, via one scanned markdown file
 * (`user enhanced lexicon.md`) whose recognised lines are appended to the
 * `title-composer` generator — see `engine/userLexicon.ts`.
 *
 * `TITLEFORGE_BACKSTAGE_ROOT` and `writeGuard.ts` are storyForge's — reused
 * here rather than reinvented, same as the shared ribbon icon in
 * `TitleForgeController.ts`. On extraction, swap `root()` below for the new
 * plugin's own vault root and replace the writeGuard calls with a plain
 * `vault.create`/`modify`.
 */
function root(): string {
	return TITLEFORGE_BACKSTAGE_ROOT;
}
/** The user-additions file — exact path, lowercase, spaces (see the "internal lexicon" brief §2). */
function userLexiconPath(): string {
	return `${root()}/user enhanced lexicon.md`;
}
/** The retired per-lexicon JSON folder — read only to tell the user it can be deleted (see §5). */
function legacyLexiconsDir(): string {
	return `${root()}/lexicons`;
}
function settingsPath(): string {
	return `${root()}/settings.json`;
}
function historyPath(generatorId: string): string {
	return `${root()}/history/${generatorId}.jsonl`;
}

/** The one generator the additions file feeds. `western-serial` / `series` are untouched (brief §1). */
const USER_ADDITIONS_GENERATOR_ID = "title-composer";

/** How many per-line warnings to put in a single Notice before "…and N more". */
const MAX_NOTICE_LINES = 6;

export class TitleForgeStorage {
	constructor(private app: App) {}

	/** Path shown to the user in the settings modal, and opened by its "reveal" button. */
	userLexiconPath(): string {
		return userLexiconPath();
	}

	legacyLexiconsDir(): string {
		return legacyLexiconsDir();
	}

	/** True when a vault still has the retired `_backstage/titleforge/lexicons/` folder from an
	 * older titleForge — used once to advise the user it is now dead weight. */
	async hasLegacyLexicons(): Promise<boolean> {
		return this.app.vault.adapter.exists(legacyLexiconsDir());
	}

	/**
	 * Read the user-additions file, creating it from the bundled template on first run.
	 *
	 * Returns the file's text, or `null` if it genuinely could not be read (a
	 * caller then falls back to the pure bundle). Never throws.
	 */
	async readUserLexicon(): Promise<string | null> {
		const path = userLexiconPath();
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) return await this.app.vault.read(file);
			if (await this.app.vault.adapter.exists(path)) {
				return await this.app.vault.adapter.read(path);
			}
			await enqueueBackstageWrite(path, () =>
				writeBackstageFile(this.app.vault, path, USER_LEXICON_TEMPLATE),
			);
			return USER_LEXICON_TEMPLATE;
		} catch (err) {
			new Notice(
				`titleForge: couldn't read ${path} (${(err as Error).message}) — using the built-in ` +
					`words only.`,
			);
			return null;
		}
	}

	/**
	 * Every generator: the compiled-in bundle, with the user's own words merged
	 * into `title-composer` (invariant I0 — this reads and writes no
	 * `lexicons/*.json`, ever). A malformed additions file degrades to the pure
	 * bundle with a `Notice` (invariant I3).
	 */
	async loadAllGenerators(): Promise<GeneratorSpec[]> {
		const fileText = await this.readUserLexicon();
		if (fileText === null) return [...ALL_TITLEFORGE_LEXICONS];

		return ALL_TITLEFORGE_LEXICONS.map((spec) => {
			if (spec.id !== USER_ADDITIONS_GENERATOR_ID) return spec;
			try {
				const { spec: merged, messages } = mergeUserLexicon(spec, fileText);
				if (messages.length > 0) this.surfaceUserLexiconMessages(messages);
				return merged;
			} catch (err) {
				new Notice(
					`titleForge: your "${userLexiconPath()}" couldn't be applied ` +
						`(${(err as Error).message}) — using the built-in words only.`,
				);
				return spec;
			}
		});
	}

	private surfaceUserLexiconMessages(messages: string[]): void {
		for (const message of messages) console.warn(`titleForge — user words: ${message}`);
		const shown = messages.slice(0, MAX_NOTICE_LINES);
		if (messages.length > MAX_NOTICE_LINES) {
			shown.push(`…and ${messages.length - MAX_NOTICE_LINES} more (see the developer console).`);
		}
		new Notice(`titleForge — notes on your added words:\n• ${shown.join("\n• ")}`);
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
