// @ts-nocheck
/**
 * freeze.mjs — apply gates to the classified corpus and emit a versioned,
 * frozen artifact. Re-runnable; a family only earns a generator pattern if it
 * clears every gate. This is where the "materiality test" bites: a frame the
 * brief predicted (e.g. bracketed genre tags) is HELD, not promoted, when the
 * anglophone corpus doesn't actually support it yet.
 *
 * Gates (a family must clear all to be PROMOTED):
 *   G1 count       >= MIN_COUNT        (enough instances)
 *   G2 blocs       >= MIN_BLOCS        (not an artefact of one over-sampled bloc)
 *   G3 formulas    >= MIN_FORMULAS     (a real template family, not one repeated string)
 *
 * `existingCoverage` marks families already served by a shipped western-serial
 * pattern; those are promoted-but-not-new (no derivation needed). Only
 * promoted-AND-gap families become new patterns downstream.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.1.0";
const MIN_COUNT = 3;
const MIN_BLOCS = 2;
const MIN_FORMULAS = 2;

// Families already covered by a shipped western-serial pattern (id in parens).
const EXISTING_COVERAGE = {
	"class-role": "rank-role",
	"warning-label": "warning-title",
	"numeric-grind": "numeric-grind",
	"genre-subtitle": "genre-subtitle",
	"system-litrpg": "system-calamity",
	"full-sentence": "situation-complaint",
	"first-person-declarative": "situation-complaint (partial)",
};

function main() {
	const { rows, summary } = JSON.parse(readFileSync(join(here, "classified.json"), "utf8"));
	const full = summary.selected;          // promote based on the quality-filtered pool
	const cut = summary.topQuartile;         // top-25% context
	const n = full.n;

	const families = Object.keys(full.famCount).map((family) => {
		const count = full.famCount[family];
		const blocs = full.distinctSources[family] ?? 0;
		const formulas = full.distinctFormulas[family] ?? 0;
		const g1 = count >= MIN_COUNT, g2 = blocs >= MIN_BLOCS, g3 = formulas >= MIN_FORMULAS;
		const promoted = g1 && g2 && g3;
		const existingCoverage = EXISTING_COVERAGE[family] ?? null;
		let reason;
		if (!promoted) {
			const failed = [!g1 && `count ${count}<${MIN_COUNT}`, !g2 && `blocs ${blocs}<${MIN_BLOCS}`,
				!g3 && `formulas ${formulas}<${MIN_FORMULAS}`].filter(Boolean).join(", ");
			reason = `HELD — ${failed}`;
		} else if (existingCoverage) {
			reason = `promoted, already covered by "${existingCoverage}"`;
		} else {
			reason = "promoted — NEW pattern (gap in shipped generator)";
		}
		return {
			family, count,
			share: +(count / n).toFixed(3),
			topQuartileCount: cut.famCount[family] ?? 0,
			distinctBlocs: blocs, distinctFormulas: formulas,
			gates: { g1_count: g1, g2_blocs: g2, g3_formulas: g3 },
			promoted, existingCoverage, isGap: promoted && !existingCoverage, reason,
		};
	}).sort((a, b) => b.count - a.count);

	const frozen = {
		version: VERSION,
		generatedAt: new Date().toISOString().slice(0, 10),
		corpus: {
			total: rows.length,
			englishOriginal: summary.full.n,
			selected: n,
			topQuartile: cut.n,
			referenceExcluded: rows.filter((r) => r.scope !== "english-original").length,
			blocs: [...new Set(rows.map((r) => r.bloc))],
			selectionRule: "rated titles with >= median ratings count are selected; top quartile = >= p75; unrated frame-coverage titles retained for frames the rated pool underrepresents",
			note: "Anchor-sourced; ratings counts from Goodreads shelves. Translated titles held out (scope=reference-translated), subtractable.",
		},
		gates: { MIN_COUNT, MIN_BLOCS, MIN_FORMULAS },
		lengthModes: full.lengths,
		registers: full.registers,
		families,
		promotedGaps: families.filter((f) => f.isGap).map((f) => f.family),
		heldFamilies: families.filter((f) => !f.promoted).map((f) => ({ family: f.family, reason: f.reason })),
	};

	writeFileSync(join(here, "frozen", `webnovel.v${VERSION}.json`), JSON.stringify(frozen, null, 2));

	console.log(`FROZEN webnovel.v${VERSION}  (${n} english-original of ${rows.length})`);
	console.log(`gates: count>=${MIN_COUNT}, blocs>=${MIN_BLOCS}, formulas>=${MIN_FORMULAS}\n`);
	for (const f of families) {
		const flag = f.isGap ? "NEW " : f.promoted ? "cov " : "HOLD";
		console.log(`  [${flag}] ${f.family.padEnd(26)} n=${String(f.count).padStart(2)} blocs=${f.distinctBlocs} formulas=${String(f.distinctFormulas).padStart(2)}  ${f.reason}`);
	}
	console.log("\nregisters:", full.registers);
	console.log("length modes:", full.lengths);
	console.log("\n=> NEW patterns to derive:", frozen.promotedGaps.join(", ") || "(none)");
}

main();
