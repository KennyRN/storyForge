import { validateSpec } from "./generate.js";
import { parseCompactEntry } from "./lexicon.js";
import type { GeneratorSpec, Lexeme, RawLexicon } from "./types.js";

/**
 * The user-additions layer: one scanned markdown file whose recognised lines are
 * *appended* to a single bundled generator's lexicon. The built-in word lists are
 * compiled into the plugin and never written to or read from the vault — a user
 * can only add their own words, never change or remove a shipped one (see
 * `src/titleforge/storage.ts` and the "internal lexicon" brief).
 *
 * Obsidian-free by design, like the rest of `engine/`: it is handed the file's
 * text and the bundled spec, and returns a merged spec plus a flat list of
 * human-readable messages for the caller to surface. It never throws — a
 * malformed line is skipped and reported, and one bad line never loses the rest
 * of the file (matches `engine/history.ts`'s forgiving stance).
 */

/** One recognised word: the compact-entry string (leading `- ` already stripped) and its slot. */
interface ScannedEntry {
	slot: string;
	/** The raw compact string, e.g. `Neon Quay #cyberpunk *2`. */
	raw: string;
}

export interface ScanResult {
	entries: ScannedEntry[];
	/** `## heading` sections whose name looks like a slot id (single token) but matches none. */
	unknownSlots: string[];
}

/**
 * Pull `- ` list items out of the additions file, keyed by the `## slot` heading
 * above them.
 *
 * Recognises a word **only** when it is a `- ` item directly under a level-2
 * heading whose text exactly matches one of `knownSlots`. Everything else —
 * prose, `**bold pseudo-headings**`, tables, and anything inside a fenced code
 * block (```` ``` ```` or `~~~`) — is ignored, which is what keeps the shipped
 * instruction template's worked examples inert (invariant I4).
 *
 * An unknown `## heading` is only flagged when it is a single token (no spaces) —
 * a real slot id always is (`placeBare`, `warmAdj`, …), whereas the template's
 * own prose headings ("How to add a word") never are, so this catches `## nouns`
 * without drowning the user in false positives.
 */
export function scanUserLexicon(text: string, knownSlots: ReadonlySet<string>): ScanResult {
	const entries: ScannedEntry[] = [];
	const unknownSlots: string[] = [];
	let currentSlot: string | null = null;
	let inFence = false;
	let fenceMarker = "";

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
		if (fenceMatch) {
			if (!inFence) {
				inFence = true;
				fenceMarker = fenceMatch[1][0];
			} else if (fenceMatch[1][0] === fenceMarker) {
				inFence = false;
			}
			continue;
		}
		if (inFence) continue;

		const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
		if (headingMatch) {
			if (headingMatch[1].length === 2) {
				const name = headingMatch[2].trim();
				if (knownSlots.has(name)) {
					currentSlot = name;
				} else {
					currentSlot = null;
					if (name.length > 0 && !/\s/.test(name) && !unknownSlots.includes(name)) {
						unknownSlots.push(name);
					}
				}
			} else {
				// Any other heading level ends the current slot section.
				currentSlot = null;
			}
			continue;
		}

		if (currentSlot === null) continue;
		const itemMatch = /^\s*-\s+(.*\S)\s*$/.exec(line);
		if (itemMatch) {
			entries.push({ slot: currentSlot, raw: itemMatch[1] });
		}
	}

	return { entries, unknownSlots };
}

export interface MergeResult {
	/** A deep copy of `bundled` with the user's words appended. Never the same object. */
	spec: GeneratorSpec;
	/** Everything worth telling the user, one line each — the caller shows a single consolidated Notice. */
	messages: string[];
}

/** The raw partial lexicon a scan produced, before it is folded onto the bundle. */
export function scannedToRawLexicon(entries: readonly ScannedEntry[]): RawLexicon {
	const raw: RawLexicon = {};
	for (const entry of entries) {
		(raw[entry.slot] ??= []).push(entry.raw);
	}
	return raw;
}

function deepCloneSpec(spec: GeneratorSpec): GeneratorSpec {
	// A spec is plain JSON data (no functions, dates, or cycles), so a
	// round-trip is a sufficient — and dependency-free — deep copy.
	return JSON.parse(JSON.stringify(spec)) as GeneratorSpec;
}

/**
 * Fold the additions file onto a bundled generator.
 *
 * Additive only (invariant I1): every user word is *appended* to the matching
 * slot of a deep copy; bundled entries are never removed, reordered, or mutated,
 * and an empty/absent file yields a spec that deep-equals the bundle. Parsing
 * reuses `parseCompactEntry` — the one and only entry parser (invariant I2).
 */
export function mergeUserLexicon(bundled: GeneratorSpec, fileText: string): MergeResult {
	const messages: string[] = [];
	const knownSlots = new Set(Object.keys(bundled.lexicon));
	const knownGenres = new Set(bundled.genres.map((g) => g.id));

	const { entries, unknownSlots } = scanUserLexicon(fileText, knownSlots);
	for (const slot of unknownSlots) {
		messages.push(`"## ${slot}" is not a known slot — its words were skipped.`);
	}

	const merged = deepCloneSpec(bundled);
	for (const { slot, raw } of entries) {
		// `parseCompactEntry` is pure string/regex work and never throws; the only "malformed"
		// case it can produce is an empty gloss (a line that was nothing but tags/weight).
		const lexeme: Lexeme = parseCompactEntry(raw);
		if (lexeme.gloss.length === 0) {
			messages.push(`Skipped a line with no word under "## ${slot}": ${raw}`);
			continue;
		}

		const tags = lexeme.tags ?? [];
		if (tags.length === 0) {
			messages.push(
				`"${lexeme.gloss}" (## ${slot}) has no genre tag — it will only appear under "Any genre".`,
			);
		} else {
			const unknown = tags.filter((tag) => !knownGenres.has(tag));
			if (unknown.length > 0) {
				messages.push(
					`"${lexeme.gloss}" (## ${slot}) is tagged ${unknown
						.map((t) => `#${t}`)
						.join(" ")}, which ${
						unknown.length === 1 ? "is not a known genre" : "are not known genres"
					} — it will only appear under "Any genre".`,
				);
			}
		}

		(merged.lexicon[slot] ??= []).push(lexeme);
	}

	for (const problem of validateSpec(merged)) {
		messages.push(`Lexicon check: ${problem}`);
	}

	return { spec: merged, messages };
}
