/**
 * genre-coverage.mjs — "easy to see what needs expanding" for the two-level genre model.
 *
 * Loads the bundled specs (never a vault copy — this reads `ALL_TITLEFORGE_LEXICONS` directly,
 * the same source `storage.ts` seeds out to the vault) and prints, per generator, one row per
 * declared genre (parents and subgenres alike): its eligible-pattern count, its own-tagged
 * lexeme count, how many more lexemes it can reach by inheritance, a THIN flag when either
 * count looks too small to carry a genre on its own, and the smallest pool a draw actually sees
 * across the slots its patterns use (THIN POOL below `THIN_POOL`).
 *
 * Run with `npx tsx tools/titleforge/genre-coverage.mjs` (or `npm run titleforge:coverage`).
 * Exits non-zero if any declared genre is unreachable (no eligible patterns at all), so it can
 * gate CI the same way a failing test would.
 */
import { fileURLToPath } from "node:url";
import { eligiblePatterns, genreScope, scopedLexicon } from "../../src/titleforge/engine/generate.ts";
import { normaliseLexicon } from "../../src/titleforge/engine/lexicon.ts";
import { ALL_TITLEFORGE_LEXICONS } from "../../src/titleforge/lexicons/index.ts";
import { poolSize, THIN_POOL, usedSlots } from "./vocab-pools.mjs";

/** @typedef {import("../../src/titleforge/engine/types.ts").GeneratorSpec} GeneratorSpec */
/** @typedef {import("../../src/titleforge/engine/types.ts").GenreOption} GenreOption */

/** Below this many own-tagged lexemes, a genre is flagged THIN even if it has eligible patterns
 * — there's a shape to draw from, but not enough of its own vocabulary to feel distinct. */
const THIN_LEXEME_THRESHOLD = 20;

/**
 * @typedef {object} Row
 * @property {string} id
 * @property {string} label
 * @property {string} parent
 * @property {number} eligiblePatterns
 * @property {number} ownLexemes
 * @property {number} inheritedLexemes
 * @property {boolean} thin
 * @property {boolean} inheritsOnly
 * @property {number} minPool Smallest pool a draw under this genre sees, across the slots its
 *   patterns use (additive model: own + ancestors' lexicons + general list)
 * @property {string} minPoolSlot ...and which slot it is.
 */

/**
 * @param {Record<string, { tags?: string[] }[]>} lexemes
 * @param {readonly string[]} ids
 * @returns {number}
 */
function countTagged(lexemes, ids) {
	if (ids.length === 0) return 0;
	let count = 0;
	for (const entries of Object.values(lexemes)) {
		for (const entry of entries) {
			if ((entry.tags ?? []).some((t) => ids.includes(t))) count++;
		}
	}
	return count;
}

/**
 * @param {GeneratorSpec} spec
 * @returns {{ rows: Row[]; unreachable: string[] }}
 */
function reportGenerator(spec) {
	const lexemes = normaliseLexicon(spec.lexicon);
	/** @type {Row[]} */
	const rows = [];
	/** @type {string[]} */
	const unreachable = [];

	// Parents before children, matching declaration order otherwise — same order the view's
	// hierarchicalGenreOptions renders in.
	/** @type {Map<string, GenreOption[]>} */
	const byParent = new Map();
	for (const g of spec.genres) {
		if (g.parent) {
			const siblings = byParent.get(g.parent) ?? [];
			siblings.push(g);
			byParent.set(g.parent, siblings);
		}
	}
	/** @type {GenreOption[]} */
	const ordered = [];
	/** @param {GenreOption} g */
	const visit = (g) => {
		if (ordered.includes(g)) return; // cycle guard
		ordered.push(g);
		for (const child of byParent.get(g.id) ?? []) visit(child); // recursive: up to three levels
	};
	for (const g of spec.genres) {
		if (!g.parent) visit(g);
	}

	for (const genre of ordered) {
		if (genre.id === "all") continue;
		const scope = genreScope(spec, genre.id);
		// `eligiblePatterns` itself falls back to the *whole* pattern list when nothing matches
		// (a deliberate "don't over-narrow" rule — see engine/generate.ts), so its count alone can
		// never be 0 and can't signal unreachability. True reachability is the raw membership
		// test underneath that fallback — the same one `validateSpec` uses.
		const reachable = spec.patterns.some(
			(p) => !p.genres || p.genres.length === 0 || p.genres.some((g) => scope.includes(g)),
		);
		const eligible = eligiblePatterns(spec, { genre: genre.id }).length;
		const ownCount = countTagged(lexemes, [genre.id]);
		const restOfScope = scope.filter((id) => id !== genre.id);
		const inheritedCount = countTagged(lexemes, restOfScope);
		const isSubgenre = genre.parent !== undefined;
		const thin = !reachable || ownCount < THIN_LEXEME_THRESHOLD;
		const inheritsOnly = isSubgenre && ownCount === 0;

		const pools = scopedLexicon(spec, genre.id);
		let minPool = Infinity;
		let minPoolSlot = "—";
		for (const slot of usedSlots(spec, genre.id)) {
			const n = poolSize(pools[slot]);
			if (n < minPool) [minPool, minPoolSlot] = [n, slot];
		}
		if (minPool === Infinity) minPool = 0;

		rows.push({
			minPool,
			minPoolSlot,
			id: genre.id,
			label: genre.label,
			parent: genre.parent ?? "—",
			eligiblePatterns: eligible,
			ownLexemes: ownCount,
			inheritedLexemes: inheritedCount,
			thin,
			inheritsOnly,
		});
		if (!reachable) unreachable.push(`${spec.id}/${genre.id}`);
	}
	return { rows, unreachable };
}

/** @param {string | number} value @param {number} width @returns {string} */
function pad(value, width) {
	return String(value).padEnd(width);
}

function main() {
	let anyUnreachable = false;
	/** @type {string[]} */
	const needsExpanding = [];

	for (const spec of ALL_TITLEFORGE_LEXICONS) {
		const { rows, unreachable } = reportGenerator(spec);
		if (rows.length === 0) continue;

		console.log(`\n=== ${spec.id} (${spec.name}) ===`);
		console.log(
			pad("id", 18) + pad("parent", 14) + pad("patterns", 10) + pad("own", 6) +
				pad("inherited", 11) + pad("min pool", 24) + "flags",
		);
		for (const row of rows) {
			const flags = [
				row.thin ? "THIN" : "",
				row.inheritsOnly ? "inherits only" : "",
				row.minPool < THIN_POOL ? "THIN POOL" : "",
			]
				.filter(Boolean)
				.join(" ");
			console.log(
				pad(row.id, 18) + pad(row.parent, 14) + pad(row.eligiblePatterns, 10) +
					pad(row.ownLexemes, 6) + pad(row.inheritedLexemes, 11) +
					pad(`${row.minPool} (${row.minPoolSlot})`, 24) + flags,
			);
			if (row.thin || row.inheritsOnly) needsExpanding.push(`${spec.id}/${row.id}`);
		}

		if (unreachable.length > 0) {
			anyUnreachable = true;
			console.log(`  UNREACHABLE (no eligible patterns at all): ${unreachable.join(", ")}`);
		}
	}

	console.log(`\n=== needs expanding (THIN or inherits-only) ===`);
	if (needsExpanding.length === 0) {
		console.log("  none");
	} else {
		for (const id of needsExpanding) console.log(`  ${id}`);
	}

	if (anyUnreachable) {
		console.error("\ngenre-coverage: at least one declared genre has zero eligible patterns.");
		process.exit(1);
	}
}

// Only run (and only ever call process.exit) when executed directly — `npx tsx
// genre-coverage.mjs` — not when a test imports the pure helpers below.
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

// Exported for tests — pure, no I/O.
export { countTagged, main, reportGenerator, THIN_LEXEME_THRESHOLD };
