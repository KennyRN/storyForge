import { Notice, TFile, type App } from "obsidian";
import { TITLEFORGE_BACKSTAGE_ROOT } from "../paths.js";
import { enqueueBackstageWrite, writeBackstageFile } from "../writeGuard.js";
import { parseEntries, serialiseEntries } from "./engine/history.js";
import type { GeneratorSpec, HistoryEntry } from "./engine/types.js";
import { mergeUserLexicon } from "./engine/userLexicon.js";
import { extractNamesFromMarkdown } from "./engine/markov.js";
import { MIN_NAME_SOURCES, withNameSources } from "./engine/names.js";
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
/** nameForge's default packs folder (`nameForge/src/paths.ts` `DEFAULT_NAMES_FOLDER`). */
export const NAMEFORGE_PACKS_FOLDER = "_backstage/nameforge";

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
	async loadAllGenerators(namePacks: Record<string, string> = {}): Promise<GeneratorSpec[]> {
		const specs = await this.loadWithUserWords();
		return Promise.all(specs.map((spec) => this.applyNamePacks(spec, namePacks)));
	}

	/**
	 * Swap in the writer's own nameForge packs for `spec`'s name registers (`settings.namePacks`).
	 * A pack that's missing, unreadable, a nameForge *mix* pack (its names live in other files) or
	 * too small keeps the built-in sources, with a `Notice` saying why.
	 */
	private async applyNamePacks(spec: GeneratorSpec, namePacks: Record<string, string>): Promise<GeneratorSpec> {
		if (!spec.nameGenerators) return spec;
		const overrides: Record<string, string[]> = {};
		for (const registerId of Object.keys(spec.nameGenerators)) {
			const path = namePacks[`${spec.id}/${registerId}`];
			if (!path) continue;
			const label = spec.nameGenerators[registerId].label;
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				new Notice(`titleForge: name pack "${path}" for ${label} names wasn't found — using built-in names.`);
				continue;
			}
			try {
				if (this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "mix") {
					new Notice(`titleForge: "${file.basename}" is a nameForge mix pack, which titleForge can't read — pick one of the packs it mixes.`);
					continue;
				}
				const names = extractNamesFromMarkdown(await this.app.vault.cachedRead(file));
				if (names.length < MIN_NAME_SOURCES) {
					new Notice(
						`titleForge: "${file.basename}" has ${names.length} names; ${label} names need at least ` +
							`${MIN_NAME_SOURCES} — using built-in names.`,
					);
					continue;
				}
				overrides[registerId] = names;
			} catch (err) {
				new Notice(`titleForge: couldn't read name pack "${path}" (${(err as Error).message}) — using built-in names.`);
			}
		}
		return withNameSources(spec, overrides);
	}

	/** nameForge packs the settings modal can offer: markdown files under nameForge's default
	 * folder whose frontmatter `type` is one titleForge can read (not `mix`). */
	listNamePacks(): TFile[] {
		const prefix = `${NAMEFORGE_PACKS_FOLDER}/`;
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(prefix))
			.filter((f) => {
				const type: unknown = this.app.metadataCache.getFileCache(f)?.frontmatter?.type;
				return typeof type === "string" && type !== "mix";
			})
			.sort((a, b) => a.basename.localeCompare(b.basename));
	}

	/** The compiled-in bundle with the user's own words merged into `title-composer`. */
	private async loadWithUserWords(): Promise<GeneratorSpec[]> {
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
		// `namePacks` is copied, never shared: a shallow spread would hand every settings object the
		// default's own map, and choosing a pack would then mutate the defaults.
		if (!(await this.app.vault.adapter.exists(path))) {
			return { ...DEFAULT_TITLEFORGE_SETTINGS, namePacks: {} };
		}
		try {
			const text = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(text) as Partial<TitleForgeSettings>;
			return { ...DEFAULT_TITLEFORGE_SETTINGS, ...parsed, namePacks: { ...(parsed.namePacks ?? {}) } };
		} catch {
			return { ...DEFAULT_TITLEFORGE_SETTINGS, namePacks: {} };
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
