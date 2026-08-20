import type { Lexeme, LexemeInput, RawLexicon } from "./types.js";

/**
 * Compact string entry format: `gloss`, then `#tag` and `*weight` in any order,
 * then `^stem` last (the stem runs to the end of the string). See NOTES.md.
 *
 * Examples: `"Crown"`, `"Reckoning #fantasy *3"`, `"I Was Banished ^Being Banished"`.
 *
 * The object form (`{ gloss, tags?, weight?, stem? }`) is the escape hatch for a
 * word that genuinely needs a literal `#`, `*` or `^` in it.
 */
function parseCompactEntry(raw: string): Lexeme {
	let rest = raw;

	// `^stem` is last and runs to the end of the string, so peel it off first.
	let stem: string | undefined;
	const caretIndex = rest.indexOf("^");
	if (caretIndex !== -1) {
		stem = rest.slice(caretIndex + 1).trim();
		rest = rest.slice(0, caretIndex);
	}

	const tags: string[] = [];
	rest = rest.replace(/#([^\s#*^]+)/g, (_match, tag: string) => {
		tags.push(tag);
		return " ";
	});

	let weight: number | undefined;
	rest = rest.replace(/\*(\d+(?:\.\d+)?)/g, (_match, value: string) => {
		weight = Number(value);
		return " ";
	});

	const gloss = rest.replace(/\s+/g, " ").trim();

	const lexeme: Lexeme = { gloss };
	if (tags.length > 0) lexeme.tags = tags;
	if (weight !== undefined) lexeme.weight = weight;
	if (stem !== undefined && stem.length > 0) lexeme.stem = stem;
	return lexeme;
}

function normaliseEntry(entry: LexemeInput): Lexeme {
	return typeof entry === "string" ? parseCompactEntry(entry) : { ...entry };
}

/** Normalise every slot of a raw lexicon (mixed string/object entries) into plain `Lexeme[]`. */
export function normaliseLexicon(raw: RawLexicon): Record<string, Lexeme[]> {
	const out: Record<string, Lexeme[]> = {};
	for (const [slot, entries] of Object.entries(raw)) {
		out[slot] = entries.map(normaliseEntry);
	}
	return out;
}

/**
 * Narrow a slot's entries to the ones carrying every tag in `tags`.
 *
 * Forgiving by design: if nothing in `entries` carries the tag, the slot is
 * genre-neutral for that tag and passes through unfiltered. But once *any*
 * entry matches, the slot narrows to just the matching entries — an untagged
 * word in an otherwise-tagged slot becomes unreachable under that filter. See
 * the "tag comprehensively or not at all" invariant in `INTEGRATION-PROMPT.md`.
 */
export function withTags(entries: Lexeme[], tags: readonly string[]): Lexeme[] {
	if (tags.length === 0) return entries;
	const matching = entries.filter((entry) =>
		tags.every((tag) => (entry.tags ?? []).includes(tag)),
	);
	return matching.length > 0 ? matching : entries;
}
