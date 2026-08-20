import { normaliseLexicon, withTags } from "./lexicon.js";
import type { Rng } from "./rng.js";
import { createRng, pick, randomSeed, weightedPick } from "./rng.js";
import { renderTemplate, slotsIn, validateTemplate } from "./template.js";
import { countWords, titleCase } from "./titlecase.js";
import type {
	GenerateOptions,
	GeneratorSpec,
	Lexeme,
	Pattern,
	SeriesOptions,
	SeriesResult,
	SeriesStrategy,
	TitleResult,
} from "./types.js";

/**
 * Draws to spend satisfying a word-count or exclusion constraint before giving
 * up and returning the closest attempt.
 *
 * The HTML originals enforced word counts by re-entering the generator
 * recursively with no cap, so an impossible request recursed until the stack
 * overflowed. A fixed budget plus an honest `constraintRelaxed` flag is safer
 * and more useful: the writer learns the request was impossible instead of
 * watching the tab freeze.
 */
const ATTEMPT_BUDGET = 60;

interface WordCountRange {
	min?: number;
	max?: number;
}

function toRange(constraint: GenerateOptions["wordCount"]): WordCountRange | undefined {
	if (constraint === undefined) return undefined;
	if (typeof constraint === "number") return { min: constraint, max: constraint };
	return constraint;
}

function inRange(count: number, range: WordCountRange | undefined): boolean {
	if (!range) return true;
	if (range.min !== undefined && count < range.min) return false;
	if (range.max !== undefined && count > range.max) return false;
	return true;
}

/** Patterns available under the selected genre, platform and pattern id. */
export function eligiblePatterns(
	spec: GeneratorSpec,
	options: GenerateOptions = {},
): Pattern[] {
	const { genre, platform, pattern, family } = options;
	let candidates = spec.patterns;
	if (pattern) {
		const exact = candidates.filter((p) => p.id === pattern);
		if (exact.length > 0) return exact;
	}
	if (family && family !== "all") {
		const byFamily = candidates.filter((p) => p.family === family);
		if (byFamily.length > 0) candidates = byFamily;
	}
	if (genre && genre !== "all") {
		const byGenre = candidates.filter(
			(p) => !p.genres || p.genres.length === 0 || p.genres.includes(genre),
		);
		if (byGenre.length > 0) candidates = byGenre;
	}
	if (platform && platform !== "all") {
		const byPlatform = candidates.filter(
			(p) => !p.platforms || p.platforms.length === 0 || p.platforms.includes(platform),
		);
		// Platform is a stylistic hint, not a grammatical rule, so an empty result
		// is treated as a soft preference rather than a hard filter.
		if (byPlatform.length > 0) candidates = byPlatform;
	}
	return candidates;
}

/** Generate one title. Deterministic for a given seed. */
export function generateOne(
	spec: GeneratorSpec,
	options: GenerateOptions = {},
): TitleResult {
	const seed = options.seed ?? randomSeed();
	return draw(spec, options, createRng(seed), seed);
}

/**
 * Generate `count` titles with no repeats inside the batch.
 *
 * Seeds derive from the batch seed, so the whole batch replays from one number
 * while each title still carries its own usable seed.
 */
export function generateMany(
	spec: GeneratorSpec,
	count: number,
	options: GenerateOptions = {},
): TitleResult[] {
	const batchRng = createRng(options.seed ?? randomSeed());
	const seen = new Set(
		[...(options.exclude ?? [])].map((value) => value.toLowerCase()),
	);
	const results: TitleResult[] = [];
	for (let i = 0; i < count; i++) {
		let result: TitleResult | undefined;
		for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
			const seed = batchRng.int(0xffffffff);
			result = draw(spec, { ...options, exclude: seen }, createRng(seed), seed);
			if (!seen.has(result.title.toLowerCase())) break;
		}
		if (!result) continue;
		seen.add(result.title.toLowerCase());
		results.push(result);
	}
	return results;
}

interface Forced {
	pattern?: Pattern;
	templateIndex?: number;
	bound?: Record<string, Lexeme>;
}

function draw(
	spec: GeneratorSpec,
	options: GenerateOptions,
	rng: Rng,
	seed: number,
	forced: Forced = {},
): TitleResult {
	const baseLexemes = normaliseLexicon(spec.lexicon);
	const patterns = eligiblePatterns(spec, options);
	const range = toRange(options.wordCount);
	const excluded = new Set(
		[...(options.exclude ?? [])].map((value) => value.toLowerCase()),
	);

	let fallback: TitleResult | undefined;
	for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
		const pattern =
			forced.pattern ??
			weightedPick(rng, patterns, (p) => p.weight ?? 1) ??
			patterns[0];
		if (!pattern) break;
		const index = forced.templateIndex ?? options.templateIndex;
		const template =
			index !== undefined
				? pattern.templates[index % pattern.templates.length]
				: pick(rng, pattern.templates);
		if (!template) break;

		// Vocabulary is scoped after the pattern is chosen, not before. Under "any
		// genre" the pattern's own genre supplies the scope, which is what stops a
		// Russian pattern being filled with Arabic nouns.
		const scopeTags =
			options.genre && options.genre !== "all"
				? [options.genre]
				: pattern.genres?.length
					? [pick(rng, pattern.genres)!]
					: [];
		const lexemes = scopeLexicon(baseLexemes, [
			...scopeTags,
			...(options.tags ?? []),
		]);

		const title = titleCase(renderTemplate(rng, template, lexemes, forced.bound));
		if (title === "") continue;

		const result: TitleResult = {
			generatorId: spec.id,
			title,
			patternId: pattern.id,
			patternLabel: pattern.label,
			...(options.genre ? { genre: options.genre } : {}),
			...(options.platform ? { platform: options.platform } : {}),
			wordCount: countWords(title),
			seed,
		};

		if (inRange(result.wordCount, range) && !excluded.has(title.toLowerCase())) {
			return result;
		}
		fallback ??= result;
	}

	if (fallback) return { ...fallback, constraintRelaxed: true };

	return {
		generatorId: spec.id,
		title: "",
		patternId: "none",
		patternLabel: "no eligible pattern",
		wordCount: 0,
		seed,
		constraintRelaxed: true,
	};
}

/**
 * Generate a series title and its volumes as a coherent set.
 *
 * A series title is grammatically the same kind of object as a novel title —
 * *The Lord of the Rings* could be a standalone book — so this reuses the same
 * shapes rather than a separate vocabulary. What differs is the relationship
 * between the titles, and there are three real strategies for that. See
 * `SeriesStrategy`.
 *
 * Tolkien is the instructive partial case: *The Fellowship of the Ring* and
 * *The Return of the King* echo one shape, but *The Two Towers* breaks it. He
 * considered it one novel and the three-volume split was the publisher's, which
 * is roughly what an imperfect echo looks like in the wild.
 */
export function generateSeries(
	spec: GeneratorSpec,
	options: SeriesOptions = {},
): SeriesResult {
	const seed = options.seed ?? randomSeed();
	const rng = createRng(seed);
	const volumes = Math.max(1, options.volumes ?? 3);
	const strategy: SeriesStrategy = options.strategy ?? "echo";
	const lexemes = normaliseLexicon(spec.lexicon);

	const taken = new Set<string>(
		[...(options.exclude ?? [])].map((v) => v.toLowerCase()),
	);
	const nextSeed = () => rng.int(0xffffffff);

	// A set built on a one-slot shape cannot show a family resemblance — every
	// volume is just "The [Noun]" — and under 'anchor' it is worse than that,
	// because fixing the only slot fixes the whole title and returns the same
	// one three times. Both strategies therefore want a shape with room to vary.
	const minSlots = strategy === "free" ? 1 : 2;
	// Under 'anchor' the shape must also contain something worth anchoring — a
	// person, a place, a house. Anchoring an adjective gives a set that reads as
	// accidentally repetitive ("Kindly Autopsy, Kindly Quarantine") rather than
	// deliberately linked, so shapes without a nameable element are skipped and
	// only fallen back to if nothing else qualifies.
	const choice =
		(strategy === "anchor"
			? chooseSeriesShape(spec, options, rng, minSlots, options.volumePattern, true)
			: undefined) ??
		chooseSeriesShape(spec, options, rng, minSlots, options.volumePattern) ??
		chooseSeriesShape(spec, options, rng, 1, options.volumePattern);
	const volumePattern = choice?.pattern;
	if (!volumePattern || !choice) {
		return {
			generatorId: spec.id,
			strategy,
			series: generateOne(spec, options),
			volumes: [],
			seed,
		};
	}

	// Under 'echo' and 'anchor' the whole set is held to one realisation of one
	// shape; that fixed template is what makes the titles read as a family.
	const templateIndex = choice.templateIndex;
	const template = volumePattern.templates[templateIndex]!;

	let bound: Record<string, Lexeme> | undefined;
	let anchorSlot: string | undefined;
	let anchorWord: string | undefined;

	if (strategy === "anchor") {
		anchorSlot = options.anchorSlot ?? chooseAnchorSlot(template, lexemes);
		if (anchorSlot) {
			const scoped = scopeLexicon(lexemes, tagsFor(rng, options, volumePattern));
			const chosen = weightedPick(rng, scoped[anchorSlot] ?? [], (l) => l.weight ?? 1);
			if (chosen) {
				bound = { [anchorSlot]: chosen };
				anchorWord = chosen.gloss;
			}
		}
	}

	const forced: Forced =
		strategy === "free"
			? {}
			: { pattern: volumePattern, templateIndex, ...(bound ? { bound } : {}) };

	const volumeResults: TitleResult[] = [];
	for (let i = 0; i < volumes; i++) {
		let result: TitleResult | undefined;
		for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
			const s = nextSeed();
			result = draw(spec, { ...options, exclude: taken }, createRng(s), s, forced);
			if (!taken.has(result.title.toLowerCase())) break;
		}
		if (!result || result.title === "") continue;
		taken.add(result.title.toLowerCase());
		volumeResults.push(result);
	}

	const series = drawSeriesTitle(
		spec,
		options,
		rng,
		strategy,
		volumePattern,
		templateIndex,
		bound,
		taken,
	);

	return {
		generatorId: spec.id,
		strategy,
		series,
		volumes: volumeResults,
		...(anchorSlot ? { anchorSlot } : {}),
		...(anchorWord ? { anchorWord } : {}),
		seed,
	};
}

function drawSeriesTitle(
	spec: GeneratorSpec,
	options: SeriesOptions,
	rng: Rng,
	strategy: SeriesStrategy,
	volumePattern: Pattern,
	templateIndex: number,
	bound: Record<string, Lexeme> | undefined,
	taken: Set<string>,
): TitleResult {
	const explicit = options.seriesPattern
		? spec.patterns.find((p) => p.id === options.seriesPattern)
		: undefined;

	// 'free' wants a label — a shape built on a collective noun (Chronicles,
	// Files, Saga). 'echo' wants the same shape as the volumes, so the set reads
	// as one family. 'anchor' wants a shape that still contains the anchor.
	const pattern =
		explicit ??
		(strategy === "free"
			? findCollectivePattern(spec, options, volumePattern, rng) ?? volumePattern
			: volumePattern);

	const forced: Forced =
		pattern === volumePattern && strategy !== "free"
			? {
					pattern,
					templateIndex: seriesTemplateIndex(pattern, templateIndex, bound),
					...(bound ? { bound } : {}),
				}
			: { pattern, ...(bound ? { bound } : {}) };

	for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
		const s = rng.int(0xffffffff);
		const result = draw(spec, { ...options, exclude: taken }, createRng(s), s, forced);
		if (result.title !== "" && !taken.has(result.title.toLowerCase())) return result;
	}

	// The forced shape is exhausted — a narrow template with a fixed anchor can
	// have fewer distinct fillings than the set has volumes. Drop the constraint
	// rather than returning a title the set already contains.
	for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
		const s = rng.int(0xffffffff);
		const result = draw(spec, { ...options, exclude: taken }, createRng(s), s);
		if (result.title !== "" && !taken.has(result.title.toLowerCase())) return result;
	}
	const s = rng.int(0xffffffff);
	return { ...draw(spec, options, createRng(s), s), constraintRelaxed: true };
}

/**
 * Which realisation of the shape the series title should use.
 *
 * Normally a different template from the volumes, so the series title is not
 * simply a fourth volume. Under 'anchor' that is overridden: the anchor has to
 * survive into the series title — "Harry Potter and the Philosopher's Stone"
 * belongs to "Harry Potter", not to something else — so a template that drops
 * the anchored slot is no use, and repeating the volumes' template is better.
 */
function seriesTemplateIndex(
	pattern: Pattern,
	volumeIndex: number,
	bound: Record<string, Lexeme> | undefined,
): number {
	if (pattern.templates.length <= 1) return volumeIndex;
	const anchor = bound ? Object.keys(bound)[0] : undefined;

	for (let step = 1; step < pattern.templates.length; step++) {
		const index = (volumeIndex + step) % pattern.templates.length;
		const template = pattern.templates[index]!;
		if (!anchor || slotsIn(template).includes(anchor)) return index;
	}
	return volumeIndex;
}

/**
 * Pick a shape and one of its templates, requiring at least `minSlots` slots so
 * the set has something to vary. Returns undefined if nothing qualifies, which
 * lets the caller retry with a lower bar rather than silently degrading.
 */
function chooseSeriesShape(
	spec: GeneratorSpec,
	options: GenerateOptions,
	rng: Rng,
	minSlots: number,
	forcedId?: string,
	requireAnchorable = false,
): { pattern: Pattern; templateIndex: number } | undefined {
	const patterns = forcedId
		? spec.patterns.filter((p) => p.id === forcedId)
		: eligiblePatterns(spec, options);

	const candidates: { pattern: Pattern; templateIndex: number; weight: number }[] = [];
	for (const pattern of patterns) {
		pattern.templates.forEach((template, templateIndex) => {
			const slots = slotsIn(template);
			if (slots.length < minSlots) return;
			if (requireAnchorable && !slots.some((slot) => ANCHORABLE.includes(slot))) return;
			candidates.push({ pattern, templateIndex, weight: pattern.weight ?? 1 });
		});
	}
	const picked = weightedPick(rng, candidates, (c) => c.weight);
	return picked
		? { pattern: picked.pattern, templateIndex: picked.templateIndex }
		: undefined;
}

/**
 * A shape whose templates use a collective noun — Chronicles, Saga, Files.
 *
 * Failing that, any shape other than the one the volumes use, so a 'free'
 * series title at least reads as a different kind of object from its volumes.
 * Some generators have no collective vocabulary at all, and there the series
 * title is simply another title, which is what 'free' means anyway.
 */
function findCollectivePattern(
	spec: GeneratorSpec,
	options: GenerateOptions,
	avoid: Pattern | undefined,
	rng: Rng,
): Pattern | undefined {
	const COLLECTIVE = ["seriesWord", "countWord", "storyWord"];
	const eligible = eligiblePatterns(spec, options);
	const collective = eligible.find((p) =>
		p.templates.some((t) => slotsIn(t).some((slot) => COLLECTIVE.includes(slot))),
	);
	if (collective) return collective;
	const others = eligible.filter((p) => p !== avoid);
	return weightedPick(rng, others, (p) => p.weight ?? 1);
}

/**
 * Pick the slot to hold constant.
 *
 * Prefers the slot most likely to read as a recurring element — a person, a
 * place, a house — because anchoring an adjective produces a set that looks
 * accidentally repetitive rather than deliberately linked.
 */
/**
 * Slots worth holding constant: things a reader recognises as *the same thing*
 * recurring. Harry Potter anchors on a person; a house or a realm works the
 * same way. Adjectives and abstractions do not.
 */
const ANCHORABLE = [
	"name", "role", "title", "person", "place", "placeBare", "kingdom",
	"group", "planet", "epithet", "kin", "honorific", "relation", "villainRole",
	"profession", "modernRole", "world", "domain", "setting", "hvNoun",
];

/** Slots that make a poor anchor even when nothing better is present. */
const UNANCHORABLE = [
	"adj", "colour", "quality", "qualifier", "modifier", "warmAdj", "adjective",
	"quantAll", "quantNo", "possessive", "ordinal", "manner", "predicate", "rank",
];

function chooseAnchorSlot(
	template: string,
	lexemes: Record<string, Lexeme[]>,
): string | undefined {
	const present = slotsIn(template).filter((slot) => (lexemes[slot]?.length ?? 0) > 0);
	// Never anchor the only slot: that fixes the entire title rather than one
	// element of it, and the set comes back as the same title repeated.
	if (present.length < 2) return undefined;
	return (
		present.find((slot) => ANCHORABLE.includes(slot)) ??
		present.find((slot) => !UNANCHORABLE.includes(slot))
	);
}

function tagsFor(rng: Rng, options: GenerateOptions, pattern: Pattern): string[] {
	const base =
		options.genre && options.genre !== "all"
			? [options.genre]
			: pattern.genres?.length
				? [pick(rng, pattern.genres)!]
				: [];
	return [...base, ...(options.tags ?? [])];
}

/**
 * Narrow each slot to the vocabulary tagged for the requested genre.
 *
 * Per-slot and forgiving: a slot where nothing carries the tag is genre-neutral
 * and passes through untouched. That is what lets one flat lexicon serve every
 * genre, where the originals kept a separate word bank per genre and duplicated
 * hundreds of shared words between them.
 */
function scopeLexicon(
	lexemes: Record<string, Lexeme[]>,
	tags: readonly string[],
): Record<string, Lexeme[]> {
	if (tags.length === 0) return lexemes;
	const scoped: Record<string, Lexeme[]> = {};
	for (const [slot, entries] of Object.entries(lexemes)) {
		let pool = entries;
		// One tag at a time, so a slot tagged by genre but not by mood still
		// narrows on genre rather than falling back to everything.
		for (const tag of tags) pool = withTags(pool, [tag]);
		scoped[slot] = pool;
	}
	return scoped;
}

/**
 * Structural check on a spec. Run it on any lexicon loaded from disk: a typo in
 * a slot name would otherwise render silently as a title with a word missing.
 */
export function validateSpec(spec: GeneratorSpec): string[] {
	const problems: string[] = [];
	const slots = new Set(Object.keys(spec.lexicon));
	const genreIds = new Set(spec.genres.map((g) => g.id));
	const platformIds = new Set((spec.platforms ?? []).map((p) => p.id));
	const familyIds = new Set((spec.families ?? []).map((f) => f.id));
	const seen = new Set<string>();

	if (spec.patterns.length === 0) problems.push(`${spec.id}: no patterns defined`);

	for (const pattern of spec.patterns) {
		const where = `${spec.id}/${pattern.id}`;
		if (seen.has(pattern.id)) problems.push(`${where}: duplicate pattern id`);
		seen.add(pattern.id);

		for (const genre of pattern.genres ?? []) {
			if (!genreIds.has(genre)) problems.push(`${where}: unknown genre "${genre}"`);
		}
		for (const platform of pattern.platforms ?? []) {
			if (!platformIds.has(platform)) {
				problems.push(`${where}: unknown platform "${platform}"`);
			}
		}
		if (pattern.family && familyIds.size > 0 && !familyIds.has(pattern.family)) {
			problems.push(`${where}: unknown family "${pattern.family}"`);
		}
		if (pattern.templates.length === 0) problems.push(`${where}: no templates`);

		for (const template of pattern.templates) {
			for (const problem of validateTemplate(template)) {
				problems.push(`${where}: ${problem}`);
			}
			for (const slot of referencedSlots(template)) {
				if (!slots.has(slot)) problems.push(`${where}: unknown slot "{${slot}}"`);
			}
		}
	}

	for (const genre of spec.genres) {
		if (genre.id === "all") continue;
		const reachable = spec.patterns.some(
			(p) => !p.genres || p.genres.length === 0 || p.genres.includes(genre.id),
		);
		if (!reachable) problems.push(`${spec.id}: genre "${genre.id}" has no patterns`);
	}
	for (const family of spec.families ?? []) {
		if (family.id === "all") continue;
		if (!spec.patterns.some((p) => p.family === family.id)) {
			problems.push(`${spec.id}: family "${family.id}" has no patterns`);
		}
	}
	return problems;
}

function referencedSlots(template: string): string[] {
	const found = new Set<string>();
	const re = /\{([a-zA-Z_][\w]*)(?::[a-zA-Z_][\w-]*)?(?:#\d+)?\^?(?:\|[a-z]+)*\}/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(template)) !== null) found.add(match[1]!);
	return [...found];
}
