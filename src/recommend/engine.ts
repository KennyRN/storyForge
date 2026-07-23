import { stripForCounting } from "../wordCount";
import {
	factsFingerprint,
	normalizeFactKey,
	normalizeFactValue,
} from "./facts";
import type {
	ChapterRecommendReport,
	CodexEntryInput,
	DescriptionHit,
	FactCheckRow,
	FactCheckStatus,
	MatchedCodexEntry,
} from "./types";

const MAX_SYNOPSIS_WORDS = 120;
const MAX_SYNOPSIS_SENTENCES = 3;
const DESC_WINDOW = 90;

const COMMON_DENY = new Set(
	[
		"the",
		"a",
		"an",
		"and",
		"but",
		"or",
		"so",
		"then",
		"when",
		"where",
		"what",
		"who",
		"how",
		"why",
		"this",
		"that",
		"these",
		"those",
		"he",
		"she",
		"they",
		"it",
		"we",
		"you",
		"i",
		"my",
		"his",
		"her",
		"their",
		"our",
		"your",
		"in",
		"on",
		"at",
		"to",
		"for",
		"of",
		"with",
		"from",
		"by",
		"as",
		"if",
		"into",
		"after",
		"before",
		"while",
		"during",
		"chapter",
		"plot",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
		"sunday",
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	].map((w) => w.toLowerCase()),
);

const ATTR_PATTERNS: Array<{ key: string; re: RegExp }> = [
	{
		key: "eye colour",
		re: /\b(?:eyes?|eye\s+colou?r)\s+(?:were\s+|was\s+|are\s+|is\s+|of\s+)?([a-z]+(?:-[a-z]+)?)/i,
	},
	{
		key: "hair",
		re: /\bhair\s+(?:was\s+|were\s+|is\s+|are\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
	},
	{ key: "height", re: /\b(?:tall|short|height)\b[^.!?]{0,40}/i },
];

export interface AnalyzeOptions {
	chapterFilename: string;
	/** Existing chapter plot notes from novel.md; preferred for synopsis when non-empty. */
	existingPlot: string;
	includeUnknownNames: boolean;
}

/** Simple stable hash for staleness checks. */
export function contentHash(parts: string[]): string {
	const s = parts.join("\n");
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(16);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryPattern(name: string): RegExp {
	// Allow possessive/genitive forms (Jane's) after the name.
	return new RegExp(`(?<![A-Za-z0-9'])${escapeRegExp(name)}(?:'s)?(?![A-Za-z0-9'])`, "gi");
}

interface MatchKey {
	surface: string;
	paths: string[];
}

function buildMatchKeys(entries: CodexEntryInput[]): MatchKey[] {
	const bySurface = new Map<string, Set<string>>();
	for (const entry of entries) {
		const surfaces = [entry.name, ...entry.aliases].map((s) => s.trim()).filter(Boolean);
		for (const surface of surfaces) {
			const key = surface.toLowerCase();
			let set = bySurface.get(key);
			if (!set) {
				set = new Set();
				bySurface.set(key, set);
			}
			set.add(entry.path);
		}
	}
	const keys: MatchKey[] = [];
	for (const [lower, paths] of bySurface) {
		// Recover original casing from first matching entry name/alias
		let surface = lower;
		for (const entry of entries) {
			const found = [entry.name, ...entry.aliases].find((s) => s.trim().toLowerCase() === lower);
			if (found) {
				surface = found.trim();
				break;
			}
		}
		keys.push({ surface, paths: Array.from(paths) });
	}
	// Longer names first so "Mary Ann" wins over "Mary"
	keys.sort((a, b) => b.surface.length - a.surface.length);
	return keys;
}

function findMatches(prose: string, entries: CodexEntryInput[]): MatchedCodexEntry[] {
	const keys = buildMatchKeys(entries);
	const byPath = new Map<string, CodexEntryInput>();
	for (const e of entries) byPath.set(e.path, e);

	const claimed = new Set<string>(); // "start-end" spans claimed by longer matches
	const matchedSurfaces = new Map<string, { surfaces: Set<string>; ambiguous: Set<string> }>();

	for (const key of keys) {
		const re = wordBoundaryPattern(key.surface);
		let m: RegExpExecArray | null;
		while ((m = re.exec(prose)) !== null) {
			const start = m.index;
			const end = start + m[0].length;
			const spanKey = `${start}-${end}`;
			let overlaps = false;
			for (let i = start; i < end; i++) {
				if (claimed.has(`c${i}`)) {
					overlaps = true;
					break;
				}
			}
			if (overlaps) continue;
			for (let i = start; i < end; i++) claimed.add(`c${i}`);
			void spanKey;

			for (const path of key.paths) {
				let bucket = matchedSurfaces.get(path);
				if (!bucket) {
					bucket = { surfaces: new Set(), ambiguous: new Set() };
					matchedSurfaces.set(path, bucket);
				}
				bucket.surfaces.add(key.surface);
				if (key.paths.length > 1) {
					for (const other of key.paths) {
						if (other !== path) bucket.ambiguous.add(other);
					}
				}
			}
		}
	}

	const result: MatchedCodexEntry[] = [];
	for (const [path, bucket] of matchedSurfaces) {
		const entry = byPath.get(path);
		if (!entry) continue;
		result.push({
			path,
			name: entry.name,
			type: entry.type,
			matchedAs: Array.from(bucket.surfaces),
			ambiguousWith: Array.from(bucket.ambiguous)
				.map((p) => byPath.get(p)?.name ?? p)
				.filter(Boolean),
		});
	}
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

function extractSynopsis(prose: string, existingPlot: string): string {
	if (existingPlot.trim()) return existingPlot.trim();
	const cleaned = prose.replace(/\s+/g, " ").trim();
	if (!cleaned) return "";
	const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
	const picked: string[] = [];
	let words = 0;
	for (const s of sentences) {
		const t = s.trim();
		if (!t) continue;
		picked.push(t);
		words += t.split(/\s+/).filter(Boolean).length;
		if (picked.length >= MAX_SYNOPSIS_SENTENCES || words >= MAX_SYNOPSIS_WORDS) break;
	}
	return picked.join(" ").trim();
}

function windowAround(prose: string, index: number, length: number): string {
	const start = Math.max(0, index - DESC_WINDOW);
	const end = Math.min(prose.length, index + length + DESC_WINDOW);
	return prose.slice(start, end).replace(/\s+/g, " ").trim();
}

function extractAttributes(window: string): Array<{ key: string; value: string }> {
	const attrs: Array<{ key: string; value: string }> = [];
	for (const { key, re } of ATTR_PATTERNS) {
		const m = window.match(re);
		if (!m) continue;
		const value = (m[1] ?? m[0]).trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
		if (value && value.length < 40) attrs.push({ key, value });
	}
	// Generic "X was/had ADJ" near start of window after name
	const wasHad = window.match(
		/\b(?:was|were|is|are|had|has)\s+((?:a|an|the)\s+)?([a-z][a-z\s-]{1,30}?)(?:[,.]|\s+and\b|\s+with\b|$)/i,
	);
	if (wasHad) {
		const value = (wasHad[2] ?? "").trim();
		if (value && !attrs.some((a) => normalizeFactValue(a.value) === normalizeFactValue(value))) {
			attrs.push({ key: "description", value });
		}
	}
	return attrs;
}

function collectDescriptions(prose: string, matched: MatchedCodexEntry[], entries: CodexEntryInput[]): DescriptionHit[] {
	const byPath = new Map(entries.map((e) => [e.path, e]));
	const hits: DescriptionHit[] = [];
	const seen = new Set<string>();

	for (const m of matched) {
		for (const surface of m.matchedAs) {
			const re = wordBoundaryPattern(surface);
			let match: RegExpExecArray | null;
			while ((match = re.exec(prose)) !== null) {
				const win = windowAround(prose, match.index, match[0].length);
				const key = `${m.path}:${win}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const ambiguous = m.ambiguousWith.length > 0;
				const names = ambiguous ? [m.name, ...m.ambiguousWith] : [m.name];
				hits.push({
					path: ambiguous ? null : m.path,
					names,
					ambiguous,
					text: win,
					attributes: extractAttributes(win),
				});
			}
		}
		void byPath;
	}
	return hits;
}

function findUnknownNames(prose: string, matchedSurfaces: Set<string>): string[] {
	const found = new Set<string>();
	// Capitalized word sequences (2+ letters), optionally multi-word Proper Names
	const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(prose)) !== null) {
		const name = m[1];
		const lower = name.toLowerCase();
		if (COMMON_DENY.has(lower)) continue;
		const first = name.split(/\s+/)[0]?.toLowerCase() ?? "";
		if (COMMON_DENY.has(first) && !name.includes(" ")) continue;
		let known = false;
		for (const surface of matchedSurfaces) {
			if (surface.toLowerCase() === lower) {
				known = true;
				break;
			}
			if (lower.includes(surface.toLowerCase()) || surface.toLowerCase().includes(lower)) {
				// substring of a known match — skip singles that are parts of matched longer names
				if (surface.toLowerCase().includes(lower)) known = true;
			}
		}
		if (known) continue;
		found.add(name);
	}
	return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function checkFacts(
	matched: MatchedCodexEntry[],
	descriptions: DescriptionHit[],
	entries: CodexEntryInput[],
): FactCheckRow[] {
	const byPath = new Map(entries.map((e) => [e.path, e]));
	const chapterAttrs = new Map<string, Map<string, string>>(); // path -> key -> value

	for (const desc of descriptions) {
		const paths = desc.path
			? [desc.path]
			: entries.filter((e) => desc.names.includes(e.name)).map((e) => e.path);
		for (const path of paths) {
			let map = chapterAttrs.get(path);
			if (!map) {
				map = new Map();
				chapterAttrs.set(path, map);
			}
			for (const attr of desc.attributes) {
				map.set(normalizeFactKey(attr.key), attr.value);
			}
		}
	}

	const rows: FactCheckRow[] = [];
	for (const m of matched) {
		const entry = byPath.get(m.path);
		if (!entry) continue;
		const chapterMap = chapterAttrs.get(m.path);
		if (!chapterMap) continue;
		for (const [normKey, chapterValue] of chapterMap) {
			const fact = entry.facts.entries[normKey];
			const displayKey = entry.facts.displayKeys[normKey] ?? normKey;
			let status: FactCheckStatus = "unknown";
			let codexValue: string | null = null;
			if (fact?.value) {
				codexValue = fact.value;
				if (normalizeFactValue(fact.value) === normalizeFactValue(chapterValue)) {
					status = "ok";
				} else if (fact.was.some((w) => normalizeFactValue(w) === normalizeFactValue(chapterValue))) {
					status = "acknowledged";
				} else {
					status = "conflict";
				}
			} else {
				status = "unknown";
			}
			rows.push({
				path: m.path,
				name: m.name,
				key: normKey,
				displayKey,
				codexValue,
				chapterValue,
				status,
			});
		}
	}
	return rows;
}

/**
 * Pure chapter analysis against a Codex inventory. `prose` should already be
 * manuscript text (frontmatter stripped). Plot notes are passed separately via
 * `options.existingPlot` (from novel.md).
 */
export function analyzeChapter(
	rawChapter: string,
	entries: CodexEntryInput[],
	options: AnalyzeOptions,
): ChapterRecommendReport {
	const prose = stripForCounting(rawChapter).trim();
	const matched = findMatches(prose, entries);
	const matchedSurfaces = new Set(matched.flatMap((m) => m.matchedAs));
	const descriptions = collectDescriptions(prose, matched, entries);
	const unknownNames = options.includeUnknownNames ? findUnknownNames(prose, matchedSurfaces) : [];
	const factChecks = checkFacts(matched, descriptions, entries);
	const synopsisHeuristic = extractSynopsis(prose, options.existingPlot);
	const factsFp = entries.map((e) => `${e.path}:${factsFingerprint(e.facts)}`).join("|");

	return {
		chapterFilename: options.chapterFilename,
		contentHash: contentHash([prose, factsFp, synopsisHeuristic]),
		synopsisHeuristic,
		matched,
		unknownNames,
		descriptions,
		factChecks,
	};
}

export function entryFactsFingerprint(entries: CodexEntryInput[]): string {
	return entries.map((e) => `${e.path}:${factsFingerprint(e.facts)}`).join("|");
}
