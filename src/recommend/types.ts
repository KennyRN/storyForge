/** Status of a fact check against a Codex Facts section. */
export type FactCheckStatus = "ok" | "conflict" | "unknown" | "acknowledged";

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
	/** Prior values from acknowledge/update history (oldest first). */
	was: string[];
}

export interface ParsedFacts {
	/** Display heading used when serializing back (e.g. "Facts"). */
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

export interface DescriptionHit {
	path: string | null;
	/** Display names when ambiguous. */
	names: string[];
	ambiguous: boolean;
	text: string;
	/** Attribute-like extractions near the mention (key/value guesses). */
	attributes: Array<{ key: string; value: string }>;
}

export interface FactCheckRow {
	path: string;
	name: string;
	key: string;
	displayKey: string;
	codexValue: string | null;
	chapterValue: string;
	status: FactCheckStatus;
}

export interface ChapterRecommendReport {
	chapterFilename: string;
	contentHash: string;
	synopsisHeuristic: string;
	matched: MatchedCodexEntry[];
	unknownNames: string[];
	descriptions: DescriptionHit[];
	factChecks: FactCheckRow[];
}

export interface ContinuityStep {
	chapterFilename: string;
	chapterLabel: string;
	value: string;
	status: FactCheckStatus;
}

export interface ContinuityTimeline {
	path: string;
	name: string;
	key: string;
	displayKey: string;
	steps: ContinuityStep[];
	hasConflict: boolean;
}
