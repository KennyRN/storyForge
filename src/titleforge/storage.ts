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
 * here rather than reinvented, same as the shared ribbon icon in
 * `TitleForgeController.ts`. `TITLEFORGE_BACKSTAGE_ROOT` (`_backstage/titleforge`)
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

function seedManifestPath(): string {
	return `${root()}/lexicons/.seed-manifest.json`;
}

/**
 * `id -> { bundledHash, fileHash }` as of the moment this id was last seeded/reset — the tracking
 * that lets `ensureLexiconsSeeded` tell "the bundle moved on and this file was never touched"
 * (safe to re-seed) apart from "the bundle moved on but someone hand-edited this file" (must not
 * be clobbered), without an author-maintained version field on every lexicon.
 */
interface SeedManifestEntry {
	/** Hash of the bundled spec's serialised bytes at the moment this id was last seeded/reset. */
	bundledHash: string;
	/** Hash of the bytes actually written to the vault at that same moment. */
	fileHash: string;
}
type SeedManifest = Record<string, SeedManifestEntry>;

/**
 * SHA-256 over the exact serialised bytes, hex-encoded — the project's existing hashing
 * convention (the corpus freeze certificates under `corpus/`) via the runtime's own Web Crypto,
 * so this needs no extra dependency.
 */
async function sha256Hex(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export class TitleForgeStorage {
	constructor(private app: App) {}

	/** Path shown to the user in the settings modal — where the hand-editable lexicons live. */
	lexiconsFolderPath(): string {
		return `${root()}/lexicons`;
	}

	/**
	 * Seed every bundled lexicon out to the vault as real JSON so it's hand-editable from day one —
	 * this is how "edit a word, no rebuild" (see `NOTES.md`) survives inside a bundled Obsidian
	 * plugin — and, on every later load, propagate a rebuilt bundle onto any vault copy that was
	 * never hand-edited, via the hash manifest (see `SeedManifestEntry`). A copy the manifest can't
	 * yet vouch for (no entry — an install from before this manifest existed) is never overwritten;
	 * its provenance is simply unknown. This is what makes "genres/vocabulary look out of date"
	 * something a rebuild fixes on its own, without ever silently discarding a hand-edit.
	 */
	async ensureLexiconsSeeded(): Promise<void> {
		const manifest = await this.readSeedManifest();
		let manifestChanged = false;
		let advisedMissingManifest = false;

		for (const spec of ALL_TITLEFORGE_LEXICONS) {
			const path = lexiconPath(spec.id);
			const bundledText = JSON.stringify(spec, null, "\t");
			const bundledHash = await sha256Hex(bundledText);

			// Cold start: the in-memory vault index can lag behind disk, so a file that already
			// exists would make writeBackstageFile's create() throw — check both.
			const onDisk =
				this.app.vault.getAbstractFileByPath(path) !== null ||
				(await this.app.vault.adapter.exists(path));

			if (!onDisk) {
				await enqueueBackstageWrite(path, () => writeBackstageFile(this.app.vault, path, bundledText));
				manifest[spec.id] = { bundledHash, fileHash: bundledHash };
				manifestChanged = true;
				continue;
			}

			const entry = manifest[spec.id];
			if (!entry) {
				// A vault copy from before this manifest existed — provenance unknown, so it is
				// left exactly as it is. Only recorded, so future passes can tell a real
				// hand-edit apart from this one-time "we don't actually know" case.
				const currentFileHash = await this.readFileHashOr(path, bundledHash);
				manifest[spec.id] = { bundledHash, fileHash: currentFileHash };
				manifestChanged = true;
				if (!advisedMissingManifest) {
					advisedMissingManifest = true;
					new Notice(
						"titleForge found existing lexicon copies from a previous version. If genres or " +
							"vocabulary look out of date, use Settings → Reset lexicon to bundled default.",
					);
				}
				continue;
			}

			const currentFileHash = await this.readFileHashOr(path, entry.fileHash);
			const userEdited = currentFileHash !== entry.fileHash;
			const bundleChanged = bundledHash !== entry.bundledHash;

			if (bundleChanged && !userEdited) {
				// The propagation fix: an untouched seed file tracks the bundle forward.
				await enqueueBackstageWrite(path, () => writeBackstageFile(this.app.vault, path, bundledText));
				manifest[spec.id] = { bundledHash, fileHash: bundledHash };
				manifestChanged = true;
			} else if (bundleChanged && userEdited) {
				new Notice(
					`titleForge: the bundled "${spec.name}" lexicon changed, but your edited copy was ` +
						`kept. Use Settings → Reset lexicon to bundled default to adopt the new version.`,
				);
			}
			// Neither changed: no-op.
		}

		if (manifestChanged) await this.writeSeedManifest(manifest);
	}

	/** Reads a vault file's current hash, falling back to `fallback` if the read/parse fails —
	 * treated as "unchanged" rather than guessed at, matching `loadGenerator`'s own never-throw
	 * stance on a file it can't make sense of. */
	private async readFileHashOr(path: string, fallback: string): Promise<string> {
		try {
			return await sha256Hex(await this.app.vault.adapter.read(path));
		} catch {
			return fallback;
		}
	}

	private async readSeedManifest(): Promise<SeedManifest> {
		const path = seedManifestPath();
		if (!(await this.app.vault.adapter.exists(path))) return {};
		try {
			const text = await this.app.vault.adapter.read(path);
			const parsed: unknown = JSON.parse(text);
			return typeof parsed === "object" && parsed !== null ? (parsed as SeedManifest) : {};
		} catch {
			return {};
		}
	}

	private async writeSeedManifest(manifest: SeedManifest): Promise<void> {
		const path = seedManifestPath();
		await enqueueBackstageWrite(path, () =>
			writeBackstageFile(this.app.vault, path, JSON.stringify(manifest, null, "\t")),
		);
	}

	/** Records that the vault copy for `id` now matches the bundled bytes exactly — called after a
	 * fresh seed or an explicit reset, both of which write the bundled bytes verbatim. */
	private async recordSeedHashes(id: string, serialisedBundled: string): Promise<void> {
		const hash = await sha256Hex(serialisedBundled);
		const manifest = await this.readSeedManifest();
		manifest[id] = { bundledHash: hash, fileHash: hash };
		await this.writeSeedManifest(manifest);
	}

	/**
	 * Overwrite the vault copy with the true bundled default — the settings modal's "reset" action.
	 *
	 * Re-resolves the bundled spec by id internally rather than trusting whatever spec the caller
	 * passes: `TitleForgeController.generators` (what callers like `TitleForgeSettingsModal` read
	 * from) is itself vault-preferred, so a spec sourced from there can *be* the stale vault copy —
	 * "reset" would then write the stale copy back over itself, a no-op in exactly the case where
	 * it's needed. Accepting a bare id keeps that mistake structurally impossible.
	 */
	async resetLexiconToBundled(specOrId: GeneratorSpec | string): Promise<void> {
		const id = typeof specOrId === "string" ? specOrId : specOrId.id;
		const bundled = ALL_TITLEFORGE_LEXICONS.find((s) => s.id === id);
		if (!bundled) throw new Error(`No bundled lexicon for "${id}"`);
		const path = lexiconPath(id);
		const serialised = JSON.stringify(bundled, null, "\t");
		await enqueueBackstageWrite(path, () => writeBackstageFile(this.app.vault, path, serialised));
		await this.recordSeedHashes(id, serialised);
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
