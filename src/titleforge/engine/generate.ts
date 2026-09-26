import { normaliseLexicon, withTags } from "./lexicon.js";
import type { Rng } from "./rng.js";
import { createRng, pick, randomSeed, weightedPick } from "./rng.js";
import { renderTemplate, slotsIn, validateTemplate } from "./template.js";
import { countWords, titleCase } from "./titlecase.js";
import type {
	GenerateOptions,
	GeneratorSpec,
	GenreOption,
	Lexeme,
	Pattern,
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

/** The genre option for `id`, or undefined if the spec declares no such id. */
export function genreById(spec: GeneratorSpec, id: string): GenreOption | undefined {
	return spec.genres.find((g) => g.id === id);
}

/** True when some other genre in the spec declares `id` as its `parent`. */
export function isParent(spec: GeneratorSpec, id: string): boolean {
	return spec.genres.some((g) => g.parent === id);
}

/**
 * `id`'s parent chain, immediate parent first — `[]` for a top-level genre, a missing id, or a
 * chain that cycles back on itself. Guarded rather than thrown: a malformed hand-edited lexicon
 * should degrade to "no inheritance" (that's what `validateSpec`'s cycle/orphan checks are for),
 * never hang or crash generation.
 */
export function ancestorIds(spec: GeneratorSpec, id: string): string[] {
	const chain: string[] = [];
	const seen = new Set<string>([id]);
	let current = genreById(spec, id);
	while (current?.parent) {
		if (seen.has(current.parent)) break; // cycle guard
		const parent = genreById(spec, current.parent);
		if (!parent) break; // orphan-parent guard
		chain.push(parent.id);
		seen.add(parent.id);
		current = parent;
	}
	return chain;
}

/** Direct and transitive children of `id`. Two-level in practice (`validateSpec` forbids a
 * subgenre from itself being a parent), but this walks recursively — via a threaded `seen` set,
 * so a cyclic hand-edit terminates rather than recursing forever — so it degrades safely even on
 * a lexicon that violates that depth limit. */
export function descendantIds(
	spec: GeneratorSpec,
	id: string,
	seen: Set<string> = new Set([id]),
): string[] {
	const out: string[] = [];
	for (const g of spec.genres) {
		if (g.parent !== id || seen.has(g.id)) continue;
		seen.add(g.id);
		out.push(g.id, ...descendantIds(spec, g.id, seen));
	}
	return out;
}

/**
 * The full scope of genre ids a selection of `id` reaches, most-specific first.
 *
 * `"all"` is the sentinel for no genre narrowing at all (unchanged from before subgenres
 * existed) and always yields `[]`. Selecting a parent reaches itself plus everything under it —
 * a `#western`-only pattern becomes eligible under *Historical*. Selecting a leaf (a subgenre, or
 * an ordinary flat genre with no parent/children) reaches itself plus its ancestors — a `#hist`
 * pattern is eligible under *Western*, and a flat genre with neither reduces to `[id]`, identical
 * to today's behaviour.
 */
export function genreScope(spec: GeneratorSpec, id: string): string[] {
	if (id === "all") return [];
	return isParent(spec, id)
		? [id, ...descendantIds(spec, id)]
		: [id, ...ancestorIds(spec, id)];
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
		const scope = genreScope(spec, genre);
		const byGenre = candidates.filter(
			(p) => !p.genres || p.genres.length === 0 || p.genres.some((g) => scope.includes(g)),
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
		const forcedIndex = forced.templateIndex ?? options.templateIndex;
		// Pick by index (not `pick`) so the choice can be recorded on the result — one rng.int
		// call, exactly as `pick` would have spent, so seeded replays are unaffected.
		const templateIndex =
			forcedIndex !== undefined
				? forcedIndex % pattern.templates.length
				: rng.int(pattern.templates.length);
		const template = pattern.templates[templateIndex];
		if (!template) break;

		// Vocabulary is scoped after the pattern is chosen, not before. Under "any
		// genre" the pattern's own genre supplies the scope, which is what stops a
		// Russian pattern being filled with Arabic nouns.
		const genreId = resolveGenreId(rng, options, pattern);
		const lexemes = scopeLexicon(baseLexemes, resolveGenreNarrowing(spec, genreId), options.tags ?? []);

		const title = titleCase(renderTemplate(rng, template, lexemes, forced.bound));
		if (title === "") continue;

		// Recorded genre is the pattern's own specific tag this draw actually came from, not
		// just the (possibly much broader) request that reached it — see
		// resolveDisplayGenreId's own doc comment for why these two deliberately differ.
		const displayGenreId = resolveDisplayGenreId(rng, spec, options, pattern);

		const result: TitleResult = {
			generatorId: spec.id,
			title,
			patternId: pattern.id,
			patternLabel: pattern.label,
			templateIndex,
			...(displayGenreId ? { genre: displayGenreId } : {}),
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
		templateIndex: 0,
		wordCount: 0,
		seed,
		constraintRelaxed: true,
	};
}

/** Which genre id (if any) a draw should scope its vocabulary to, and whether that id is a
 * parent or a leaf — resolved once here so a pattern's own genre supplies the scope when none
 * was explicitly selected, which is what stops a Russian pattern being filled with Arabic nouns. */
function resolveGenreId(
	rng: Rng,
	options: GenerateOptions,
	pattern: Pattern,
): string | undefined {
	if (options.genre && options.genre !== "all") return options.genre;
	return pattern.genres?.length ? pick(rng, pattern.genres) : undefined;
}

/** Which specific genre/subgenre this particular draw's pattern actually came from — recorded on
 * the result (`draw()`, below) and, via `toEntry`, on the history entry, so "about this title"
 * can always say precisely where the shape originated: a "the-noun" draw really was a
 * science-fiction > space-opera one, or a thriller > legal-thriller one, even when the request
 * itself was broader than that ("any genre" outright, or a top genre picked with "any" subgenre)
 * — a pattern is typically eligible under many genres at once (`pattern.genres`), and the request
 * alone doesn't say which one actually applies to *this* draw.
 *
 * Deliberately separate from `resolveGenreId` (word-scoping, above): that one stays at whatever
 * level was actually requested on purpose — a broader net across every subgenre under a top pick,
 * so vocabulary still gets the full width of the requested branch — while this always resolves to
 * the pattern's own most specific tag, since knowing precisely which subgenre a shape came from is
 * the whole point here. Picking among several equally-specific candidates spends its own `rng`
 * draw, same as any other pattern-shaped choice — deterministic and replay-safe for any entry
 * generated from here on (older entries without a stored `patternId` already replay best-effort,
 * see TitleShapeInfoModal's own doc comment). */
function resolveDisplayGenreId(
	rng: Rng,
	spec: GeneratorSpec,
	options: GenerateOptions,
	pattern: Pattern,
): string | undefined {
	const tags = (pattern.genres ?? []).filter((g) => g !== "all");
	const requested = options.genre && options.genre !== "all" ? options.genre : undefined;
	if (tags.length === 0) return requested;

	// Tags consistent with whatever was actually requested (its own genreScope reachability chain
	// — itself plus ancestors/descendants) when something was; every one of the pattern's own tags
	// when the request was fully unconstrained ("any genre").
	const reachable = requested ? new Set(genreScope(spec, requested)) : undefined;
	const inScope = reachable ? tags.filter((g) => reachable.has(g)) : tags;
	const pool = inScope.length > 0 ? inScope : tags;

	// Prefer the pool's own leaf-level tags over top-level ones — a pattern's `genres` typically
	// lists a top genre alongside its own subgenres redundantly ("fantasy" and "epic" together),
	// so this loses nothing and answers with "epic fantasy" rather than the less useful "fantasy".
	const leaves = pool.filter((g) => !!genreById(spec, g)?.parent);
	return pick(rng, leaves.length > 0 ? leaves : pool);
}

/** How a selected genre id narrows lexicon slots: `"none"` (no genre selected and the pattern
 * declared none either — nothing to narrow on), `"leaf"` (an ordinary flat genre or a subgenre —
 * most-specific-tag-present wins, walking up `chain` toward the root), or `"parent"` (a genre
 * with subgenres of its own — union of every tag in `chain`). `chain` is `genreScope`'s output:
 * `[id, ...ancestors]` for a leaf, `[id, ...descendants]` for a parent. */
export interface GenreNarrowing {
	kind: "leaf" | "parent" | "none";
	chain: string[];
}

export function resolveGenreNarrowing(spec: GeneratorSpec, id: string | undefined): GenreNarrowing {
	if (!id) return { kind: "none", chain: [] };
	return { kind: isParent(spec, id) ? "parent" : "leaf", chain: genreScope(spec, id) };
}

/** Leaf/flat selection: the first tag in `chain` (most specific first) that actually matches
 * something in this slot wins outright; if none match, the slot is genre-neutral (pass
 * through). This is what makes a new subgenre cheap to grow — add one `#western` place-name and
 * the `place` slot becomes western-only, while a slot with no `#western` entries still falls
 * back to the parent's `#hist` pool, and a slot with neither falls back to everything. */
export function narrowLeaf(entries: Lexeme[], chain: readonly string[]): Lexeme[] {
	for (const tag of chain) {
		const hits = entries.filter((e) => (e.tags ?? []).includes(tag));
		if (hits.length > 0) return hits;
	}
	return entries;
}

/** Parent selection: the broad mix — every entry tagged with the parent itself or any of its
 * descendants — forgiving the same way `withTags` is if nothing in the slot matches any of them. */
export function narrowParent(entries: Lexeme[], chain: readonly string[]): Lexeme[] {
	const hits = entries.filter((e) => chain.some((tag) => (e.tags ?? []).includes(tag)));
	return hits.length > 0 ? hits : entries;
}

/**
 * Narrow each slot to the vocabulary tagged for the requested genre (honouring subgenre
 * inheritance — see `GenreNarrowing`), then layer `extraTags` (mood etc.) on top exactly as
 * before: one tag at a time, each forgiving on its own, so a slot tagged by genre but not by
 * mood still narrows on genre rather than falling back to everything.
 *
 * Per-slot and forgiving throughout — a slot where nothing carries a given tag is genre-neutral
 * for that tag and passes through untouched. That is what lets one flat lexicon serve every
 * genre (and now every subgenre), where the originals kept a separate word bank per genre and
 * duplicated hundreds of shared words between them.
 */
function scopeLexicon(
	lexemes: Record<string, Lexeme[]>,
	genre: GenreNarrowing,
	extraTags: readonly string[],
): Record<string, Lexeme[]> {
	if (genre.kind === "none" && extraTags.length === 0) return lexemes;
	const scoped: Record<string, Lexeme[]> = {};
	for (const [slot, entries] of Object.entries(lexemes)) {
		let pool = entries;
		if (genre.kind === "leaf") pool = narrowLeaf(pool, genre.chain);
		else if (genre.kind === "parent") pool = narrowParent(pool, genre.chain);
		for (const tag of extraTags) pool = withTags(pool, [tag]);
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

	// Genre hierarchy: orphan/self/cyclic parents, and the depth-2 limit (a genre with a `parent`
	// may not itself be a parent — kept at 2 to match the UI, a single indented dropdown, and the
	// feature request; a deeper taxonomy would need a different picker).
	for (const genre of spec.genres) {
		if (!genre.parent) continue;
		if (genre.parent === genre.id) {
			problems.push(`${spec.id}: genre "${genre.id}" is its own parent`);
			continue;
		}
		if (!genreIds.has(genre.parent)) {
			problems.push(`${spec.id}: genre "${genre.id}" has unknown parent "${genre.parent}"`);
			continue;
		}
		if (isParent(spec, genre.id)) {
			problems.push(`${spec.id}: genre "${genre.id}" is both a subgenre and a parent (max depth is 2)`);
		}
		const visited = new Set<string>([genre.id]);
		let cursor: GenreOption | undefined = genre;
		while (cursor?.parent) {
			if (visited.has(cursor.parent)) {
				problems.push(`${spec.id}: genre "${genre.id}" has a cyclic parent chain`);
				break;
			}
			visited.add(cursor.parent);
			cursor = genreById(spec, cursor.parent);
		}
	}

	// Reachability via subtree: a leaf (subgenre or flat genre) counts as reachable if it or any
	// ancestor has eligible patterns; a parent counts as reachable if it or any descendant does. A
	// brand-new subgenre with zero own patterns/lexemes is therefore not reported unreachable
	// purely for having no *own* material — inheritance covers it.
	for (const genre of spec.genres) {
		if (genre.id === "all") continue;
		const scope = genreScope(spec, genre.id);
		const reachable = spec.patterns.some(
			(p) => !p.genres || p.genres.length === 0 || p.genres.some((g) => scope.includes(g)),
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
	while ((match = re.exec(template)) !== null) found.add(match[1]);
	return [...found];
}
