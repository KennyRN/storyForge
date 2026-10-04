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
	/** Set on an `@id` entry: instead of rendering its gloss, the draw invents a name with
	 * `GeneratorSpec.nameGenerators[id]`. Genre tags and weights work as for any other entry. */
	generator?: string;
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

/**
 * A genre option; a subgenre points at its parent genre's id via `parent`.
 *
 * At most three levels deep (`MAX_GENRE_DEPTH`, enforced by `validateSpec`) — e.g. webnovel's
 * progression > dungeon > dungeon-core — so this stays a flat picker with indentation rather than
 * a dependent parent->child UI. Absent `parent` = a top-level (or ordinary, flat) genre; a spec
 * with no `parent` links anywhere behaves identically to the old flat `LabelledOption[]` shape.
 */
export interface GenreOption extends LabelledOption {
	/** Parent genre id. Absent = a top-level genre. */
	parent?: string;
	/** True = draws under this genre (and anything beneath it) skip the general list, e.g. a
	 * romance register that generic fantasy roles would break. */
	isolated?: boolean;
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
	genres: GenreOption[];
	platforms?: LabelledOption[];
	families?: LabelledOption[];
	patterns: Pattern[];
	lexicon: RawLexicon;
	/**
	 * How a genre-scoped draw splits between the genre's own words, its ancestors' lexicons and
	 * the general list (see `engine/generate.ts` `blendSlot`). Any field left out takes
	 * `DEFAULT_VOCABULARY_BLEND`'s value; empty tiers are renormalised away. `fullTier` is the word
	 * count a tier needs before it earns its full share (thinner tiers get a proportional cut).
	 */
	vocabularyBlend?: { own?: number; inherited?: number; generic?: number; fullTier?: number };
	/** Slots that keep the older exclusive narrowing: once any entry carries the genre's tag, only
	 * tagged entries are drawn. For slots where blending in other genres' words reads wrong. */
	exclusiveSlots?: string[];
	/** Name registers that `@id` lexicon entries invent names from — see `engine/names.ts`. */
	nameGenerators?: Record<string, NameGenerator>;
	/** Tags barred while a genre in some subtree is selected — see `GenreExclusion`. */
	genreExclusions?: GenreExclusion[];
	/**
	 * Real titles (matched case-insensitively) a draw must never reproduce. Slot fillers that come
	 * straight from real titles can recombine into one exactly ("Somnia" + "Online"); a matching
	 * draw is rejected and resampled, and a pattern that keeps colliding is dropped for that draw
	 * (`RESERVED_RETRIES` in `generate.ts`).
	 */
	reservedTitles?: readonly string[];
}

/**
 * While the selected genre is `when` or anything under it, patterns and lexemes tagged with any
 * of `exclude` are never drawn — unless they also carry a tag, not itself excluded, that the
 * selection reaches (`genreScope`). Applied before the forgiving slot narrowing, so a slot with
 * nothing tagged for the selection can't fall back to the excluded entries either.
 */
/** A name register: source names whose style invented names follow (`engine/names.ts`). */
export interface NameGenerator {
	/** Shown in titleForge settings, where the writer can swap in their own nameForge pack. */
	label: string;
	/** Style sources. Never reproduced: output within `novelty` edits of any of them is rejected. */
	sources: readonly string[];
	/** nameForge's tuning: 1–3, how closely output hugs the sources (default 2). */
	faithfulness?: number;
	/** nameForge's tuning: 1–5, how fussy acceptance is (default 3). */
	strictness?: number;
	/** Minimum edit distance from every source, minus one (default 1: one-letter variants rejected). */
	novelty?: number;
}

export interface GenreExclusion {
	when: string;
	exclude: string[];
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
	/** Index of the specific template within `pattern.templates` that produced this title. */
	templateIndex: number;
	genre?: string;
	platform?: string;
	wordCount: number;
	seed: number;
	/** True when the word-count or exclusion constraint could not be satisfied within budget. */
	constraintRelaxed?: boolean;
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
	/** The shape this title was drawn through — recorded so "about this title" doesn't have to
	 * re-derive it by replaying the seed (which drifts once the lexicon changes). Absent on
	 * entries written before this field existed; the info modal falls back to `replay` for those. */
	patternId?: string;
	/** Index of the specific template within that pattern — pairs with `patternId`. */
	templateIndex?: number;
}
