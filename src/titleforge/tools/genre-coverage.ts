/**
 * genre-coverage.ts — "easy to see what needs expanding" for the two-level genre model.
 *
 * Loads the bundled specs (never a vault copy — this reads `ALL_TITLEFORGE_LEXICONS` directly,
 * the same source `storage.ts` seeds out to the vault) and prints, per generator, one row per
 * declared genre (parents and subgenres alike): its eligible-pattern count, its own-tagged
 * lexeme count, how many more lexemes it can reach by inheritance, and a THIN flag when either
 * count looks too small to carry a genre on its own.
 *
 * Run with `npx tsx src/titleforge/tools/genre-coverage.ts` (or `npm run titleforge:coverage`).
 * Exits non-zero if any declared genre is unreachable (no eligible patterns at all), so it can
 * gate CI the same way a failing test would.
 */
import { fileURLToPath } from "node:url";
import { eligiblePatterns, genreScope } from "../engine/generate.js";
import { normaliseLexicon } from "../engine/lexicon.js";
import type { GeneratorSpec, GenreOption } from "../engine/types.js";
import { ALL_TITLEFORGE_LEXICONS } from "../lexicons/index.js";

/** Below this many own-tagged lexemes, a genre is flagged THIN even if it has eligible patterns
 * — there's a shape to draw from, but not enough of its own vocabulary to feel distinct. */
const THIN_LEXEME_THRESHOLD = 20;

interface Row {
	id: string;
	label: string;
	parent: string;
	eligiblePatterns: number;
	ownLexemes: number;
	inheritedLexemes: number;
	thin: boolean;
	inheritsOnly: boolean;
}

function countTagged(lexemes: Record<string, { tags?: string[] }[]>, ids: readonly string[]): number {
	if (ids.length === 0) return 0;
	let count = 0;
	for (const entries of Object.values(lexemes)) {
		for (const entry of entries) {
			if ((entry.tags ?? []).some((t) => ids.includes(t))) count++;
		}
	}
	return count;
}

function reportGenerator(spec: GeneratorSpec): { rows: Row[]; unreachable: string[] } {
	const lexemes = normaliseLexicon(spec.lexicon);
	const rows: Row[] = [];
	const unreachable: string[] = [];

	// Parents before children, matching declaration order otherwise — same order the view's
	// hierarchicalGenreOptions renders in.
	const byParent = new Map<string, GenreOption[]>();
	for (const g of spec.genres) {
		if (g.parent) (byParent.get(g.parent) ?? byParent.set(g.parent, []).get(g.parent)!).push(g);
	}
	const ordered: GenreOption[] = [];
	for (const g of spec.genres) {
		if (g.parent) continue;
		ordered.push(g);
		ordered.push(...(byParent.get(g.id) ?? []));
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

		rows.push({
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

function pad(value: string | number, width: number): string {
	return String(value).padEnd(width);
}

function main(): void {
	let anyUnreachable = false;
	const needsExpanding: string[] = [];

	for (const spec of ALL_TITLEFORGE_LEXICONS) {
		const { rows, unreachable } = reportGenerator(spec);
		if (rows.length === 0) continue;

		console.log(`\n=== ${spec.id} (${spec.name}) ===`);
		console.log(
			pad("id", 18) + pad("parent", 14) + pad("patterns", 10) + pad("own", 6) +
				pad("inherited", 11) + "flags",
		);
		for (const row of rows) {
			const flags = [row.thin ? "THIN" : "", row.inheritsOnly ? "inherits only" : ""]
				.filter(Boolean)
				.join(" ");
			console.log(
				pad(row.id, 18) + pad(row.parent, 14) + pad(row.eligiblePatterns, 10) +
					pad(row.ownLexemes, 6) + pad(row.inheritedLexemes, 11) + flags,
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
// genre-coverage.ts` — not when a test imports the pure helpers below.
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

// Exported for tests — pure, no I/O.
export { countTagged, main, reportGenerator, THIN_LEXEME_THRESHOLD };
