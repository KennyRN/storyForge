import type { DialogueQuoteStyle } from "./quoteSpans";

/** Coreference confidence for a located sentence. */
export type CorefTier = "solid" | "grey" | "ambiguous";

/** Built-in lens ids, or any custom id registered later. */
export type LensId =
	| "description"
	| "whereabouts"
	| "relationships"
	| "dialogue"
	| "emotion"
	| (string & {});

export interface CodexEntryInput {
	path: string;
	name: string;
	aliases: string[];
	type: string;
	/** Parsed Facts for this note (current values + optional was-history). */
	facts: ParsedFacts;
}

export interface FactValue {
	value: string;
	/** Prior values from user-authored (was) history (oldest first). */
	was: string[];
}

export interface ParsedFacts {
	/** Display heading used when serializing (e.g. "Facts"). */
	heading: string;
	/** Normalized key → value. */
	entries: Record<string, FactValue>;
	/** Original key spellings for round-trip display. */
	displayKeys: Record<string, string>;
}

export interface MatchedCodexEntry {
	path: string;
	name: string;
	type: string;
	/** Surface forms that matched in the chapter. */
	matchedAs: string[];
	ambiguousWith: string[];
}

/**
 * Display payload shaped for a future LLM interpreter:
 * `{ span, entity, trait/lens, currentCodexFact }`.
 */
export interface LocateShowPayload {
	span: string;
	entity: { path: string; name: string } | null;
	lens: LensId;
	trait: string | null;
	currentCodexFact: { key: string; value: string } | null;
	negated: boolean;
}

export interface DetailHit {
	/** Stable key: entityPath + normalised sentence (via hashId). */
	id: string;
	sentence: string;
	chapterFilename: string;
	/** 0-based start offset in the raw (unstripped) file. */
	rawOffset: number;
	/** 0-based end offset in the raw file. */
	rawEnd: number;
	/** 1-based line in the raw file. */
	line: number;
	tier: CorefTier;
	entityPath: string | null;
	entityName: string;
	/** Competing cast names when tier is ambiguous. */
	competingNames: string[];
	lens: LensId;
	trait: string | null;
	negated: boolean;
	currentCodexFact: { key: string; value: string } | null;
	/** Chapter-tab only: detail has been handled (done or ignore). */
	resolved: boolean;
	/** Attribution decision for grey/ambiguous hits. */
	attribution: "confirmed" | "rejected" | null;
}

export interface UnknownNameHint {
	name: string;
	/** Opportunistic NER type when the model fires; never required. */
	nerType?: string;
}

export interface ChapterRecommendReport {
	chapterFilename: string;
	contentHash: string;
	synopsisHeuristic: string;
	matched: MatchedCodexEntry[];
	unknownNames: string[];
	unknownNameHints: UnknownNameHint[];
	hits: DetailHit[];
	/** Normalised sentences present in the scan (for orphan sweep). */
	sentenceKeys: string[];
}

/** Attribution: is this pronoun sentence really this entity? Shared across tabs. */
export type AttributionAction = "confirmed" | "rejected";

export interface AttributionDecision {
	entityPath: string;
	sentence: string;
	action: AttributionAction;
	/** Optional reroute target when rejecting. */
	reroutePath?: string;
}

/** Cast member supplied to the scanner (from Codex inventory). */
export interface CastMember {
	path: string;
	name: string;
	aliases: string[];
	type: string;
	facts: ParsedFacts;
}

export interface ScanContext {
	cast: CastMember[];
	chapterFilename: string;
	/** Attribution decisions already known (applied during scan). */
	attributions?: AttributionDecision[];
	/**
	 * Resolved chapter narrator (PoV person). When set, first-person forms in
	 * narration spans bind to this entity at solid tier.
	 */
	narrator?: { path: string; name: string } | null;
	/** Declared book dialogue quote style for span scoping. */
	dialogueQuotes?: DialogueQuoteStyle;
}

