import { generateOne } from "./generate.js";
import type { GeneratorSpec, HistoryEntry, TitleResult } from "./types.js";

/**
 * JSONL history: one `HistoryEntry` per line. Storage (which file, which
 * vault path) is entirely `storage.ts`'s concern — this module only knows how
 * to turn text into entries and back, which is what keeps it Obsidian-free.
 */

export interface ParseEntriesResult {
	entries: HistoryEntry[];
	/** One message per line that failed to parse, so a corrupt line doesn't lose the whole file. */
	errors: string[];
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.generatorId === "string" &&
		typeof v.seed === "number" &&
		typeof v.title === "string" &&
		typeof v.at === "string"
	);
}

/** Parse a JSONL history file's text. Blank lines are skipped; malformed lines are reported, not thrown. */
export function parseEntries(text: string): ParseEntriesResult {
	const entries: HistoryEntry[] = [];
	const errors: string[] = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (line === "") continue;
		try {
			const parsed: unknown = JSON.parse(line);
			if (isHistoryEntry(parsed)) entries.push(parsed);
			else errors.push(`line ${i + 1}: not a history entry`);
		} catch (err) {
			errors.push(`line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return { entries, errors };
}

/** Serialise entries back to JSONL text, one object per line, trailing newline. */
export function serialiseEntries(entries: HistoryEntry[]): string {
	if (entries.length === 0) return "";
	return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

/** Build a history entry from a fresh `TitleResult`. */
export function toEntry(result: TitleResult, extra: { kept?: boolean } = {}): HistoryEntry {
	const entry: HistoryEntry = {
		generatorId: result.generatorId,
		seed: result.seed,
		title: result.title,
		at: new Date().toISOString(),
	};
	if (result.genre) entry.genre = result.genre;
	if (extra.kept !== undefined) entry.kept = extra.kept;
	return entry;
}

/** Just the titles, lower-cased comparison being the caller's job — feeds `GenerateOptions.exclude`. */
export function titlesFrom(entries: readonly HistoryEntry[]): string[] {
	return entries.map((entry) => entry.title);
}

/**
 * Regenerate the title a history entry recorded, from its seed.
 *
 * Exact only while the lexicon is unchanged — adding a word shifts the draws
 * for every seed after it. The entry's stored `title` is the record of what
 * was actually shown; this is for "which shape produced this" provenance and
 * for rolling a variation from the same neighbourhood, not a guarantee.
 */
export function replay(spec: GeneratorSpec, entry: HistoryEntry): TitleResult {
	return generateOne(spec, {
		seed: entry.seed,
		...(entry.genre ? { genre: entry.genre } : {}),
	});
}

/** Whether replaying `entry` against `spec` right now reproduces its stored title. */
export function replayMatches(spec: GeneratorSpec, entry: HistoryEntry): boolean {
	return replay(spec, entry).title === entry.title;
}
