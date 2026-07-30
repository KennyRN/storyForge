import type { FactValue, ParsedFacts } from "./types";
import { extractSection, splitFrontmatterAndBody } from "../markdownSections";

const SPELLING_ALIASES: Record<string, string> = {
	color: "colour",
	favor: "favour",
	favorited: "favourited",
	center: "centre",
};

/** Normalizes a fact key for comparison (lowercase, British spelling preference). */
export function normalizeFactKey(raw: string): string {
	const words = raw
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.split(" ");
	return words.map((w) => SPELLING_ALIASES[w] ?? w).join(" ");
}

export function normalizeFactValue(raw: string): string {
	return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

const WAS_SUFFIX = /\s*\(was\)\s*$/i;

/**
 * Parses a Facts-style section from a note body.
 * Lines: `key: value` for current facts; `key (was): old` for history (oldest first by line order).
 */
export function parseFactsFromSection(sectionBody: string, heading: string): ParsedFacts {
	const entries: Record<string, FactValue> = {};
	const displayKeys: Record<string, string> = {};

	for (const line of sectionBody.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
		const colon = trimmed.indexOf(":");
		if (colon <= 0) continue;
		const rawKey = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!rawKey || !value) continue;

		const isWas = WAS_SUFFIX.test(rawKey);
		const keyPart = isWas ? rawKey.replace(WAS_SUFFIX, "").trim() : rawKey;
		const norm = normalizeFactKey(keyPart);
		if (!displayKeys[norm]) displayKeys[norm] = keyPart;

		if (!entries[norm]) entries[norm] = { value: "", was: [] };
		if (isWas) {
			entries[norm].was.push(value);
		} else {
			entries[norm].value = value;
		}
	}

	return { heading, entries, displayKeys };
}

/** Reads Facts from full note content under `## ${heading}`. */
export function parseFactsFromNote(raw: string, heading: string): ParsedFacts {
	const { body } = splitFrontmatterAndBody(raw);
	const header = `## ${heading}`;
	const section = extractSection(body, header);
	return parseFactsFromSection(section, heading);
}

/** Serializes facts back to section body lines. */
export function serializeFactsSection(facts: ParsedFacts): string {
	const lines: string[] = [];
	for (const [norm, entry] of Object.entries(facts.entries)) {
		const display = facts.displayKeys[norm] ?? norm;
		for (const was of entry.was) {
			lines.push(`${display} (was): ${was}`);
		}
		if (entry.value) lines.push(`${display}: ${entry.value}`);
	}
	return lines.join("\n");
}

/** Sets the current value for a key, optionally pushing the previous value into `was`. */
export function setFactValue(facts: ParsedFacts, key: string, newValue: string, pushWas: boolean): ParsedFacts {
	const norm = normalizeFactKey(key);
	const next: ParsedFacts = {
		heading: facts.heading,
		entries: { ...facts.entries },
		displayKeys: { ...facts.displayKeys },
	};
	if (!next.displayKeys[norm]) next.displayKeys[norm] = key.trim();
	const prev = next.entries[norm];
	const was = [...(prev?.was ?? [])];
	if (pushWas && prev?.value && normalizeFactValue(prev.value) !== normalizeFactValue(newValue)) {
		was.push(prev.value);
	}
	next.entries[norm] = { value: newValue.trim(), was };
	return next;
}

export function emptyFacts(heading: string): ParsedFacts {
	return { heading, entries: {}, displayKeys: {} };
}

export function factsFingerprint(facts: ParsedFacts): string {
	const parts: string[] = [facts.heading];
	for (const key of Object.keys(facts.entries).sort()) {
		const e = facts.entries[key];
		parts.push(`${key}=${e.value}|was:${e.was.join(",")}`);
	}
	return parts.join(";");
}
