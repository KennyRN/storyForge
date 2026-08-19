/**
 * titleForge engine — shared types.
 *
 * This whole `engine/` folder is intentionally Obsidian-agnostic (no imports of
 * `obsidian`, no imports of storyForge's own `src/*.ts`). It is the part of
 * titleForge that would become a standalone npm dependency if this subplugin is
 * ever pulled out into its own Obsidian plugin — see `src/titleforge/README.md`.
 */

/** One entry in a lexicon slot, after normalisation. */
export interface Lexeme {
	/** The word or phrase itself, as it renders in a title. */
	gloss: string;
	/** Genre/region/platform tags this entry is scoped to. Absent = genre-neutral. */
	tags?: string[];
	/** Relative draw weight. Absent means 1. */
	weight?: number;
	/** A combining form used by the `{slot^}` token, e.g. "Got Reincarnated" for "Reincarnated". */
	stem?: string;
}

/**
 * A lexicon entry as authored in a lexicon file, before normalisation.
 *
 * Either the compact string form (`"gloss #tag *weight ^stem"`) or the full
 * object form — see `NOTES.md` / `lexicon.ts`.
 */
export type LexemeInput = string | Lexeme;

/** Raw `lexicon` block of a `GeneratorSpec`, as authored. */
export type RawLexicon = Record<string, LexemeInput[]>;

/** A labelled option shown in a picker (genre, platform, family). */
export interface LabelledOption {
	id: string;
	label: string;
}

/** One title shape: a family of interchangeable templates plus the metadata that explains it. */
export interface Pattern {
	id: string;
	/** Optional grouping key, matched against `GeneratorSpec.families`. */
	family?: string;
	label: string;
	templates: string[];
	/** Genres this pattern is eligible under. Absent/empty = eligible under every genre. */
	genres?: string[];
	/** Platforms this pattern is a stylistic fit for. Absent/empty = fits every platform. */
	platforms?: string[];
	/** Relative draw weight among eligible patterns. Absent means 1. */
	weight?: number;
	/** A real title in its original script/language, shown under "Why this shape". */
	exemplar: string;
	/** What the shape signals to a reader, and what it costs. Shown under "Why this shape". */
	note: string;
}

/** A full generator: one tradition's shape taxonomy plus its word lists. */
export interface GeneratorSpec {
	id: string;
	name: string;
	blurb: string;
	tradition: string;
	notes?: string[];
	genres: LabelledOption[];
	platforms?: LabelledOption[];
	families?: LabelledOption[];
	patterns: Pattern[];
	lexicon: RawLexicon;
}

/** A word-count constraint: an exact count, or an inclusive min/max range. */
export type WordCountConstraint = number | { min?: number; max?: number };

export interface GenerateOptions {
	genre?: string;
	platform?: string;
	family?: string;
	/** Force one specific pattern id, bypassing genre/platform/family filtering. */
	pattern?: string;
	seed?: number;
	wordCount?: WordCountConstraint;
	/** Titles (case-insensitive) to never return. Also fed by `titlesFrom(history)`. */
	exclude?: Iterable<string>;
	/** Extra tags layered on top of the genre scope when narrowing the lexicon. */
	tags?: string[];
	/** Force one specific template index within the chosen pattern. */
	templateIndex?: number;
}

export interface TitleResult {
	generatorId: string;
	title: string;
	patternId: string;
	patternLabel: string;
	genre?: string;
	platform?: string;
	wordCount: number;
	seed: number;
	/** True when the word-count or exclusion constraint could not be satisfied within budget. */
	constraintRelaxed?: boolean;
}

export type SeriesStrategy = "echo" | "anchor" | "free";

export interface SeriesOptions extends GenerateOptions {
	volumes?: number;
	strategy?: SeriesStrategy;
	/** Force the shape the volumes are drawn from. */
	volumePattern?: string;
	/** Force the shape the series title itself is drawn from (defaults per-strategy). */
	seriesPattern?: string;
	/** Force which slot 'anchor' holds constant, instead of choosing automatically. */
	anchorSlot?: string;
}

export interface SeriesResult {
	generatorId: string;
	strategy: SeriesStrategy;
	series: TitleResult;
	volumes: TitleResult[];
	anchorSlot?: string;
	anchorWord?: string;
	seed: number;
}

/** One recorded generation. Stores the seed (provenance) and the title text (survives lexicon drift). */
export interface HistoryEntry {
	generatorId: string;
	seed: number;
	genre?: string;
	title: string;
	/** ISO 8601 timestamp. */
	at: string;
	/** Whether the writer marked this one as a keeper. */
	kept?: boolean;
}
