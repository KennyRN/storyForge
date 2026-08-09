/**
 * Dossier engine — sentence scan → lens match → coreference tiering.
 * Locate-and-show: surfaces author sentences, never extracted values.
 */

import { isCommonEnglishWord } from "./commonEnglishWords";
import { factsFingerprint, normalizeFactKey } from "./facts";
import { applyLenses, buildLensRegistry, type LensDef, type TokenInfo } from "./lenses";
import { defaultLexicons } from "./lexicons";
import { ensureNlp, getIts, type WinkNlp } from "./nlp";
import { hasFirstPersonInNarration, type DialogueQuoteStyle } from "./quoteSpans";
import type {
	AttributionDecision,
	CastMember,
	ChapterRecommendReport,
	CorefTier,
	DetailHit,
	MatchedCodexEntry,
	ScanContext,
	UnknownNameHint,
} from "./types";
import type { ItemEntity, ItemSentence, ItemToken } from "wink-nlp";

export const COREF_WINDOW = 3;
const MAX_SYNOPSIS_WORDS = 120;
const MAX_SYNOPSIS_SENTENCES = 3;

/** Third-person forms only — drives COREF_WINDOW grey/ambiguous look-back. */
const PRONOUNS = new Set([
	"he",
	"she",
	"they",
	"him",
	"her",
	"them",
	"his",
	"hers",
	"their",
	"theirs",
	"himself",
	"herself",
	"themselves",
]);

/**
 * First-person narration forms. Kept separate from PRONOUNS: binding is solid
 * to the chapter narrator with no window look-back (we / us / our deferred).
 */
const FIRST_PERSON = new Set(["i", "me", "my", "mine", "myself"]);

export interface AnalyzeOptions {
	chapterFilename: string;
	existingPlot: string;
	includeUnknownNames: boolean;
	attributions?: AttributionDecision[];
	resolvedIds?: string[];
	lexicons?: ReturnType<typeof defaultLexicons>;
	/** Resolved chapter narrator (PoV). Null/omitted → first-person binding inert. */
	narrator?: { path: string; name: string } | null;
	/** Declared book dialogue quote style (default double). */
	dialogueQuotes?: DialogueQuoteStyle;
}

interface MappedSentence {
	text: string;
	/** Normalised (collapsed whitespace) form used for keys. */
	normalised: string;
	rawOffset: number;
	rawEnd: number;
	line: number;
}

interface StripResult {
	text: string;
	/** Maps stripped offset → raw offset. */
	toRaw: (strippedOffset: number) => number;
}

/** Stable FNV-1a style hash for cache keys. */
export function contentHash(parts: string[]): string {
	const s = parts.join("\n");
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(16);
}

/** Decision / hit id: entity path + normalised sentence. */
export function hashId(entityKey: string, normalisedSentence: string): string {
	return contentHash([entityKey, normalisedSentence]);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryPattern(name: string): RegExp {
	return new RegExp(`(?<![A-Za-z0-9'])${escapeRegExp(name)}(?:'s)?(?![A-Za-z0-9'])`, "gi");
}

/**
 * Strip frontmatter and fenced code while building a strip→raw offset map,
 * so jump-to-source line numbers stay correct against the raw file.
 */
export function stripMarkdownMapped(raw: string): StripResult {
	const rawOffsets: number[] = [];
	let i = 0;
	const out: string[] = [];

	const pushSlice = (start: number, end: number) => {
		for (let p = start; p < end; p++) {
			out.push(raw[p]);
			rawOffsets.push(p);
		}
	};

	// Frontmatter
	if (raw.startsWith("---")) {
		const end = raw.indexOf("\n---", 3);
		if (end !== -1) {
			let fenceEnd = end + 4;
			if (raw[fenceEnd] === "\n") fenceEnd += 1;
			i = fenceEnd;
		}
	}

	while (i < raw.length) {
		// Fenced code block
		if (raw.startsWith("```", i) || raw.startsWith("~~~", i)) {
			const fence = raw.slice(i, i + 3);
			const close = raw.indexOf("\n" + fence, i + 3);
			if (close === -1) {
				i = raw.length;
				break;
			}
			i = close + 1 + fence.length;
			if (raw[i] === "\n") i += 1;
			continue;
		}
		pushSlice(i, i + 1);
		i += 1;
	}

	const text = out.join("");
	return {
		text,
		toRaw: (strippedOffset: number) => {
			if (rawOffsets.length === 0) return strippedOffset;
			const clamped = Math.max(0, Math.min(strippedOffset, rawOffsets.length - 1));
			return rawOffsets[clamped];
		},
	};
}

function lineOf(raw: string, offset: number): number {
	let line = 1;
	const end = Math.min(offset, raw.length);
	for (let i = 0; i < end; i++) {
		if (raw[i] === "\n") line++;
	}
	return line;
}

function splitSentences(
	raw: string,
	stripped: StripResult,
	nlp: WinkNlp,
): MappedSentence[] {
	const doc = nlp.readDoc(stripped.text);
	const sentences: MappedSentence[] = [];
	// its.span is token indices, not char offsets — locate via sequential search.
	let cursor = 0;
	doc.sentences().each((s: ItemSentence) => {
		const original = s.out();
		const normalised = original.replace(/\s+/g, " ").trim();
		if (!normalised) return;
		let stripStart = stripped.text.indexOf(original, cursor);
		if (stripStart < 0) {
			// Fallback: search normalised form if wink collapsed whitespace oddly
			stripStart = stripped.text.indexOf(normalised, cursor);
		}
		if (stripStart < 0) stripStart = cursor;
		const stripEnd = stripStart + (stripStart >= 0 ? original.length : normalised.length);
		cursor = Math.max(cursor, stripEnd);
		const rawOffset = stripped.toRaw(stripStart);
		const rawEnd = stripped.toRaw(Math.max(stripStart, stripEnd - 1)) + 1;
		sentences.push({
			text: normalised,
			normalised,
			rawOffset,
			rawEnd,
			line: lineOf(raw, rawOffset),
		});
	});
	return sentences;
}

function tokensForSentence(nlp: WinkNlp, sentence: string): TokenInfo[] {
	const its = getIts(nlp);
	const doc = nlp.readDoc(sentence);
	const tokens: TokenInfo[] = [];
	let index = 0;
	doc.tokens().each((t: ItemToken) => {
		const text = t.out();
		tokens.push({
			text,
			lower: text.toLowerCase(),
			pos: String(t.out(its.pos)),
			negated: Boolean(t.out(its.negationFlag)),
			index: index++,
		});
	});
	return tokens;
}

interface MatchKey {
	surface: string;
	paths: string[];
}

function buildMatchKeys(cast: CastMember[]): MatchKey[] {
	const bySurface = new Map<string, Set<string>>();
	for (const entry of cast) {
		for (const surface of [entry.name, ...entry.aliases].map((s) => s.trim()).filter(Boolean)) {
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
		let surface = lower;
		for (const entry of cast) {
			const found = [entry.name, ...entry.aliases].find((s) => s.trim().toLowerCase() === lower);
			if (found) {
				surface = found.trim();
				break;
			}
		}
		keys.push({ surface, paths: Array.from(paths) });
	}
	keys.sort((a, b) => b.surface.length - a.surface.length);
	return keys;
}

function namesInSentence(sentence: string, keys: MatchKey[]): MatchKey[] {
	const found: MatchKey[] = [];
	const claimed = new Set<number>();
	for (const key of keys) {
		const re = wordBoundaryPattern(key.surface);
		let m: RegExpExecArray | null;
		while ((m = re.exec(sentence)) !== null) {
			const start = m.index;
			const end = start + m[0].length;
			let overlap = false;
			for (let i = start; i < end; i++) {
				if (claimed.has(i)) {
					overlap = true;
					break;
				}
			}
			if (overlap) continue;
			for (let i = start; i < end; i++) claimed.add(i);
			found.push(key);
		}
	}
	return found;
}

function hasPronoun(tokens: TokenInfo[]): boolean {
	return tokens.some((t) => t.pos === "PRON" && PRONOUNS.has(t.lower));
}

function hasFirstPersonToken(tokens: TokenInfo[]): boolean {
	return tokens.some((t) => FIRST_PERSON.has(t.lower));
}

function lookupCodexFact(
	entry: CastMember | undefined,
	trait: string | null,
): { key: string; value: string } | null {
	if (!entry || !trait) return null;
	const norm = normalizeFactKey(trait);
	const direct = entry.facts.entries[norm];
	if (direct?.value) {
		return { key: entry.facts.displayKeys[norm] ?? norm, value: direct.value };
	}
	// Soft match: trait noun contained in a fact key (eyes → eye colour)
	for (const [key, fact] of Object.entries(entry.facts.entries)) {
		if (!fact.value) continue;
		if (key.includes(norm) || norm.includes(key.split(" ")[0] ?? "")) {
			return { key: entry.facts.displayKeys[key] ?? key, value: fact.value };
		}
	}
	return null;
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

function collectMatched(
	sentences: MappedSentence[],
	cast: CastMember[],
	keys: MatchKey[],
): MatchedCodexEntry[] {
	const byPath = new Map(cast.map((e) => [e.path, e]));
	const matchedSurfaces = new Map<string, { surfaces: Set<string>; ambiguous: Set<string> }>();

	for (const s of sentences) {
		for (const key of namesInSentence(s.text, keys)) {
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

/** Ensure the chapter PoV appears in Characters even when only referred to as "I". */
function ensureNarratorMatched(
	matched: MatchedCodexEntry[],
	narrator: { path: string; name: string } | null,
	cast: CastMember[],
): MatchedCodexEntry[] {
	if (!narrator) return matched;
	if (matched.some((m) => m.path === narrator.path)) return matched;
	const entry = cast.find((c) => c.path === narrator.path);
	const next = [
		...matched,
		{
			path: narrator.path,
			name: entry?.name ?? narrator.name,
			type: entry?.type ?? "person",
			matchedAs: ["PoV"],
			ambiguousWith: [],
		},
	];
	next.sort((a, b) => a.name.localeCompare(b.name));
	return next;
}

const HYPHEN_RE = /^[-–—]$/;
/** Particles allowed between PROPN runs: Cult of the Snake / Ludwig van Beethoven. */
const NAME_BRIDGE_RE = /^(of|the|de|von|van)$/i;
/** Closed-class left sides of English contractions (not honorifics like O'Brien). */
const CONTRACTION_LEFT = new Set([
	"i",
	"you",
	"he",
	"she",
	"we",
	"they",
	"it",
	"who",
	"what",
	"that",
	"there",
	"here",
	"let",
	"do",
	"does",
	"did",
	"is",
	"are",
	"was",
	"were",
	"have",
	"has",
	"had",
	"would",
	"could",
	"should",
	"can",
	"will",
	"shall",
	"must",
	"might",
	"need",
	"dare",
	"ought",
	"don",
	"isn",
	"aren",
	"wasn",
	"weren",
	"haven",
	"hasn",
	"hadn",
	"wouldn",
	"couldn",
	"shouldn",
	"won",
	"can",
	"mustn",
	"needn",
	"daren",
	"mightn",
	"oughtn",
]);

function normalizeApostrophes(text: string): string {
	return text.replace(/[\u2019\u2018]/g, "'");
}

/** Pronoun/aux contractions like I'm / Don't — not O'Brien / D'Artagnan. */
function isContractionJunk(text: string): boolean {
	const m = normalizeApostrophes(text).match(/^([A-Za-z]+)'([A-Za-z]+)$/);
	if (!m) return false;
	return CONTRACTION_LEFT.has(m[1].toLowerCase());
}

function nameHasContractionPart(name: string): boolean {
	return name.split(/\s+/).some((part) => isContractionJunk(part));
}

function isHyphenToken(text: string): boolean {
	return HYPHEN_RE.test(text);
}

function isNameBridge(text: string): boolean {
	return NAME_BRIDGE_RE.test(text);
}

/** Join PROPN parts, keeping hyphens tight (Demi-Human) and spaces elsewhere. */
function joinNameParts(parts: string[]): string {
	let out = "";
	for (const p of parts) {
		if (!out) {
			out = p;
		} else if (isHyphenToken(p) || isHyphenToken(out.charAt(out.length - 1))) {
			out += p;
		} else {
			out += ` ${p}`;
		}
	}
	return out;
}

/**
 * A capitalised common noun immediately after a proper-noun run is usually the
 * run's generic tail (Winster River, Baker Street) — wink's tagger often
 * under-weighs capitalisation for frequent lexicon words like "river"/"street",
 * tagging them NOUN even mid-run. Never starts a run by itself (`parts.length`
 * gate in the caller) — only extends one already anchored by a PROPN token.
 */
function isCapitalizedNounTail(token: { text: string; pos: string }): boolean {
	return token.pos === "NOUN" && /^[A-Z]/.test(token.text);
}

/**
 * A capitalised number directly before a proper-noun run is usually a name's
 * numeral qualifier (Three Bridge, Four Oaks) rather than an actual count —
 * spelled-out numbers tag NUM regardless of case, so the run-starting scan
 * (which only seeds on PROPN) would otherwise skip straight past it.
 */
function isCapitalizedNumberPrefix(token: { text: string; pos: string } | undefined): boolean {
	return !!token && token.pos === "NUM" && /^[A-Z]/.test(token.text);
}

/** Consume a PROPN run (incl. contraction tokens), bridging internal hyphens. Advances past the run. */
function consumePropnRun(
	tokens: Array<{ text: string; pos: string }>,
	start: number,
	parts: string[],
): number {
	let i = start;
	while (i < tokens.length) {
		if (tokens[i].pos === "PROPN" || (parts.length > 0 && isCapitalizedNounTail(tokens[i]))) {
			parts.push(tokens[i].text);
			i++;
			continue;
		}
		if (
			isHyphenToken(tokens[i].text) &&
			i + 1 < tokens.length &&
			tokens[i + 1].pos === "PROPN"
		) {
			parts.push(tokens[i].text);
			parts.push(tokens[i + 1].text);
			i += 2;
			continue;
		}
		break;
	}
	return i;
}

/**
 * True when a candidate is noise rather than a name. Only a single common
 * English lemma standing alone is dropped (Anger, Rescue, Worse) — capitalised
 * emphasis on an ordinary word reads as noise on its own. A multi-word run
 * (Sudden Anger, Three Bridge) stands as a candidate even when every word is
 * common: English place names are routinely built from ordinary words
 * (Three Bridges, Long Eaton), and there is no cheap way to tell those apart
 * from emphatic multi-word capitalisation — so both surface, and the writer
 * dismisses the ones that aren't names. Bridged titles (Cult of the Snake)
 * are exempt regardless — callers pass `usedBridge`.
 */
function isCommonEnglishNameNoise(contentParts: string[], usedBridge: boolean): boolean {
	if (contentParts.length === 0) return true;
	if (contentParts.length > 1) return false;
	if (!contentParts.every((p) => isCommonEnglishWord(p))) return false;
	return !usedBridge;
}

/** Merge adjacent PROPN tokens into multi-word names ("Cult of the Snake" is harder; take adjacent runs). */
function extractProperNames(nlp: WinkNlp, prose: string): Array<{ name: string; nerType?: string }> {
	const its = getIts(nlp);
	const doc = nlp.readDoc(prose);
	const names: Array<{ name: string; nerType?: string }> = [];
	const seen = new Set<string>();

	const tokens: Array<{ text: string; pos: string }> = [];
	doc.tokens().each((t: ItemToken) => {
		tokens.push({ text: t.out(), pos: String(t.out(its.pos)) });
	});

	let i = 0;
	while (i < tokens.length) {
		if (tokens[i].pos !== "PROPN") {
			i++;
			continue;
		}
		const parts: string[] = [];
		let usedBridge = false;
		if (isCapitalizedNumberPrefix(tokens[i - 1])) {
			parts.push(tokens[i - 1].text);
		}
		i = consumePropnRun(tokens, i, parts);
		// Allow of/the/de/von/van bridges (incl. "of the"): Cult of the Snake
		while (i < tokens.length) {
			let j = i;
			const bridges: string[] = [];
			while (j < tokens.length && isNameBridge(tokens[j].text)) {
				bridges.push(tokens[j].text);
				j++;
			}
			if (bridges.length === 0 || j >= tokens.length || tokens[j].pos !== "PROPN") {
				break;
			}
			usedBridge = true;
			parts.push(...bridges);
			i = consumePropnRun(tokens, j, parts);
		}
		const name = joinNameParts(parts);
		if (name.length < 2) continue;
		// Drop I'm / Don't / "I'm Safe" (contraction glued to following PROPN)
		if (nameHasContractionPart(name)) continue;

		const contentParts = parts.filter((p) => !isHyphenToken(p) && !isNameBridge(p));
		if (isCommonEnglishNameNoise(contentParts, usedBridge)) continue;

		const key = name.toLowerCase();
		if (!seen.has(key)) {
			seen.add(key);
			names.push({ name });
		}
	}

	doc.entities().each((e: ItemEntity) => {
		const text = e.out();
		const nerType = String(e.out(its.type) ?? "");
		const key = text.toLowerCase();
		const existing = names.find((n) => n.name.toLowerCase() === key);
		if (existing && nerType) existing.nerType = nerType;
	});

	return names;
}

function attributionFor(
	entityPath: string,
	sentence: string,
	decisions: AttributionDecision[],
): AttributionDecision | undefined {
	return decisions.find(
		(d) => d.entityPath === entityPath && d.sentence === sentence,
	);
}

/**
 * Scan raw manuscript text against a cast. Requires winkNLP (call ensureNlp first).
 */
export function scanFile(
	raw: string,
	ctx: ScanContext,
	nlp: WinkNlp,
	lenses: LensDef[] = buildLensRegistry(),
): DetailHit[] {
	const stripped = stripMarkdownMapped(raw);
	const sentences = splitSentences(raw, stripped, nlp);
	const keys = buildMatchKeys(ctx.cast);
	const byPath = new Map(ctx.cast.map((c) => [c.path, c]));
	const attributions = ctx.attributions ?? [];
	const hits: DetailHit[] = [];
	const seen = new Set<string>();

	// Preceding-name index for coref: for each sentence index, names found
	const namesBySentence = sentences.map((s) => namesInSentence(s.text, keys));

	for (let si = 0; si < sentences.length; si++) {
		const s = sentences[si];
		const tokens = tokensForSentence(nlp, s.text);
		const lensHits = applyLenses(s.text, tokens, lenses);
		if (lensHits.length === 0) continue;

		const named = namesBySentence[si];
		const namedPaths = new Map<string, string>(); // path → display name
		for (const nk of named) {
			for (const path of nk.paths) {
				const entry = byPath.get(path);
				if (entry) namedPaths.set(path, entry.name);
			}
		}

		type Candidate = {
			path: string | null;
			name: string;
			tier: CorefTier;
			competing: string[];
		};
		const candidates: Candidate[] = [];

		if (namedPaths.size > 0) {
			for (const [path, name] of namedPaths) {
				candidates.push({ path, name, tier: "solid", competing: [] });
			}
		} else if (
			ctx.narrator &&
			hasFirstPersonToken(tokens) &&
			hasFirstPersonInNarration(s.text, ctx.dialogueQuotes ?? "double")
		) {
			// First-person narration → solid bind to chapter narrator (no window).
			candidates.push({
				path: ctx.narrator.path,
				name: ctx.narrator.name,
				tier: "solid",
				competing: [],
			});
		} else if (hasPronoun(tokens)) {
			// Look back COREF_WINDOW for nearest preceding names
			const windowNames = new Map<string, string>();
			for (let back = si - 1; back >= 0 && back >= si - COREF_WINDOW; back--) {
				for (const nk of namesBySentence[back]) {
					for (const path of nk.paths) {
						const entry = byPath.get(path);
						if (entry && !windowNames.has(path)) windowNames.set(path, entry.name);
					}
				}
			}
			if (windowNames.size === 1) {
				const [path, name] = [...windowNames.entries()][0];
				candidates.push({ path, name, tier: "grey", competing: [] });
			} else if (windowNames.size > 1) {
				const entries = [...windowNames.entries()];
				const [path, name] = entries[0];
				candidates.push({
					path,
					name,
					tier: "ambiguous",
					competing: entries.map(([, n]) => n),
				});
			}
		}

		if (candidates.length === 0) continue;

		for (const lens of lensHits) {
			for (const cand of candidates) {
				let path = cand.path;
				let name = cand.name;
				let tier = cand.tier;
				let competing = cand.competing;

				if (path) {
					const decision = attributionFor(path, s.normalised, attributions);
					if (decision?.action === "rejected") {
						if (decision.reroutePath) {
							const reroute = byPath.get(decision.reroutePath);
							path = decision.reroutePath;
							name = reroute?.name ?? name;
							tier = "solid";
							competing = [];
						} else {
							continue;
						}
					} else if (decision?.action === "confirmed") {
						tier = "solid";
					}
				}

				const id = hashId(path ?? name, s.normalised);
				const dedupe = `${id}:${lens.lens}`;
				if (seen.has(dedupe)) continue;
				seen.add(dedupe);

				const entry = path ? byPath.get(path) : undefined;
				hits.push({
					id,
					sentence: s.text,
					chapterFilename: ctx.chapterFilename,
					rawOffset: s.rawOffset,
					rawEnd: s.rawEnd,
					line: s.line,
					tier,
					entityPath: path,
					entityName: name,
					competingNames: competing,
					lens: lens.lens,
					trait: lens.trait,
					negated: lens.negated,
					currentCodexFact: lookupCodexFact(entry, lens.trait),
					resolved: false,
					attribution: path
						? attributionFor(path, s.normalised, attributions)?.action ?? null
						: null,
				});
			}
		}
	}

	return hits;
}

function findUnknownNames(
	nlp: WinkNlp,
	prose: string,
	cast: CastMember[],
): UnknownNameHint[] {
	const gazetteer = new Set<string>();
	for (const c of cast) {
		gazetteer.add(c.name.toLowerCase());
		for (const a of c.aliases) gazetteer.add(a.toLowerCase());
	}
	const propns = extractProperNames(nlp, prose);
	const out: UnknownNameHint[] = [];
	for (const p of propns) {
		if (gazetteer.has(p.name.toLowerCase())) continue;
		// Skip if name is a subset of a known longer cast name
		let knownPart = false;
		for (const g of gazetteer) {
			if (g.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(g)) {
				if (g === p.name.toLowerCase()) knownPart = true;
				else if (g.includes(p.name.toLowerCase()) && p.name.split(" ").length === 1) {
					// single token that is part of a multi-word cast name — still unknown as standalone? keep
				}
			}
		}
		if (gazetteer.has(p.name.toLowerCase()) || knownPart) continue;
		out.push(p);
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Full chapter analysis. Call only after `ensureNlp()` — winkNLP must be ready.
 */
export async function analyzeChapter(
	rawChapter: string,
	entries: CastMember[],
	options: AnalyzeOptions,
): Promise<ChapterRecommendReport> {
	const nlp = await ensureNlp();
	const lexicons = options.lexicons ?? defaultLexicons();
	const lenses = buildLensRegistry(lexicons);
	const stripped = stripMarkdownMapped(rawChapter);
	const prose = stripped.text.trim();
	const sentences = splitSentences(rawChapter, stripped, nlp);
	const keys = buildMatchKeys(entries);

	const matched = ensureNarratorMatched(
		collectMatched(sentences, entries, keys),
		options.narrator ?? null,
		entries,
	);
	const hits = scanFile(
		rawChapter,
		{
			cast: entries,
			chapterFilename: options.chapterFilename,
			attributions: options.attributions,
			narrator: options.narrator ?? null,
			dialogueQuotes: options.dialogueQuotes ?? "double",
		},
		nlp,
		lenses,
	);

	const resolvedSet = new Set(options.resolvedIds ?? []);
	for (const hit of hits) {
		if (resolvedSet.has(hit.id)) hit.resolved = true;
	}

	const unknownHints = options.includeUnknownNames
		? findUnknownNames(nlp, prose, entries)
		: [];
	const synopsisHeuristic = extractSynopsis(prose, options.existingPlot);
	const inventoryFp = entryFactsFingerprint(entries);
	const narratorKey = options.narrator?.path ?? "";
	const quotesKey = options.dialogueQuotes ?? "double";

	return {
		chapterFilename: options.chapterFilename,
		contentHash: contentHash([prose, inventoryFp, synopsisHeuristic, narratorKey, quotesKey]),
		synopsisHeuristic,
		matched,
		unknownNames: unknownHints.map((u) => u.name),
		unknownNameHints: unknownHints,
		hits,
		sentenceKeys: sentences.map((s) => s.normalised),
	};
}

/** Inventory fingerprint — path, type, name, aliases, and facts (type changes must invalidate cache). */
export function entryFactsFingerprint(entries: CastMember[]): string {
	return entries
		.map((e) => {
			const aliases = [...(e.aliases ?? [])].sort().join(",");
			return `${e.path}:${e.type}:${e.name}:${aliases}:${factsFingerprint(e.facts)}`;
		})
		.join("|");
}

/**
 * Dossier pull: scan one entity across many chapter files (caller supplies
 * ordered chapters). Returns hits already filtered to that entity.
 */
export async function scanEntityAcrossChapters(
	chapters: Array<{ filename: string; raw: string }>,
	entity: CastMember,
	cast: CastMember[],
	attributions?: AttributionDecision[],
	opts?: {
		narratorByChapter?: Record<string, { path: string; name: string } | null>;
		dialogueQuotes?: DialogueQuoteStyle;
	},
): Promise<DetailHit[]> {
	const nlp = await ensureNlp();
	const lenses = buildLensRegistry();
	const all: DetailHit[] = [];
	const dialogueQuotes = opts?.dialogueQuotes ?? "double";
	for (const ch of chapters) {
		const hits = scanFile(
			ch.raw,
			{
				cast,
				chapterFilename: ch.filename,
				attributions,
				narrator: opts?.narratorByChapter?.[ch.filename] ?? null,
				dialogueQuotes,
			},
			nlp,
			lenses,
		);
		for (const hit of hits) {
			if (hit.entityPath === entity.path || hit.entityName === entity.name) {
				all.push(hit);
			}
		}
	}
	return all;
}
