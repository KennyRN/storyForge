// @ts-nocheck
/**
 * verify.mjs — prove the derived patterns satisfy the SAME contracts the repo
 * enforces in src/titleforge/__tests__/lexicons.structural.test.ts, by importing
 * the real engine (via tsx) and running it over the merged spec. Run with:
 *   npx tsx verify.mjs
 *
 * Merges derived-patterns.json into a clone of westernSerialLexicon (never
 * mutating the shipped object), then asserts: validateSpec clean,
 * checkArticleAgreement clean, per-genre non-empty generation, generateMany(8)
 * unique, all three series strategies non-empty, and — the corpus-specific
 * invariant — every new exemplar is a verified English-original corpus title.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// The repo compiles as CommonJS (no "type":"module"), so under tsx the ESM
// named exports surface on `.default`. Drill through it defensively.
import * as genMod from "../engine/generate.ts";
import * as artMod from "../engine/articles.ts";
import * as wsMod from "../lexicons/westernSerial.ts";
const gen = genMod.default ?? genMod;
const art = artMod.default ?? artMod;
const { validateSpec, generateOne, generateMany, generateSeries } = gen;
const { checkArticleAgreement } = art;
const { westernSerialLexicon } = wsMod.default ?? wsMod;

const here = dirname(fileURLToPath(import.meta.url));
const derived = JSON.parse(readFileSync(join(here, "derived-patterns.json"), "utf8"));
const corpus = readFileSync(join(here, "corpus.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const verifiedTitles = new Set(corpus.filter((r) => r.scope === "english-original").map((r) => r.title));

// deep clone + additive merge
const spec = structuredClone(westernSerialLexicon);
const existingIds = new Set(spec.patterns.map((p) => p.id));
for (const p of derived.patterns) {
	if (existingIds.has(p.id)) throw new Error(`derived pattern "${p.id}" collides with a shipped id`);
	spec.patterns.push(p);
}
for (const [slot, glosses] of Object.entries(derived.newSlots)) {
	if (spec.lexicon[slot]) throw new Error(`derived slot "${slot}" collides with a shipped slot`);
	spec.lexicon[slot] = glosses;
}
spec.platforms = spec.platforms ?? [];
const platformIds = new Set(spec.platforms.map((p) => p.id));
for (const p of derived.newPlatforms ?? []) if (!platformIds.has(p.id)) spec.platforms.push(p);

const fail = [];
const check = (name, problems) => {
	if (problems.length) fail.push(`${name}:\n  ${problems.join("\n  ")}`);
	console.log(`  ${problems.length ? "FAIL" : "ok  "}  ${name}`);
};

console.log("merged spec:", spec.patterns.length, "patterns,", Object.keys(spec.lexicon).length, "slots\n");

check("validateSpec", validateSpec(spec));
check("checkArticleAgreement", checkArticleAgreement(spec));

const genreProblems = [];
for (const g of spec.genres) {
	const r = generateOne(spec, { genre: g.id, seed: 1 });
	if (!r.title) genreProblems.push(`genre "${g.id}" produced empty`);
}
check("every genre generates non-empty", genreProblems);

const many = generateMany(spec, 8, { seed: 1 });
check("generateMany(8) unique", new Set(many.map((r) => r.title.toLowerCase())).size === 8 ? [] : ["duplicates found"]);

const seriesProblems = [];
for (const strategy of ["echo", "anchor", "free"]) {
	const s = generateSeries(spec, { strategy, volumes: 3, seed: 1 });
	if (!s.series.title) seriesProblems.push(`${strategy} empty`);
}
check("generateSeries all strategies", seriesProblems);

const exemplarProblems = derived.patterns
	.filter((p) => !verifiedTitles.has(p.exemplar))
	.map((p) => `${p.id}: exemplar "${p.exemplar}" is not a verified corpus title`);
check("every new exemplar is corpus-verified", exemplarProblems);

// show a sample of what each new pattern generates
console.log("\nsample output from new patterns (seed-swept):");
for (const p of derived.patterns) {
	const seen = new Set();
	for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
		const r = generateOne(spec, { pattern: p.id, seed });
		if (r.title) seen.add(r.title);
	}
	console.log(`  ${p.id}:`);
	for (const t of seen) console.log(`      ${t}`);
}

if (fail.length) { console.error("\nFAILURES:\n" + fail.join("\n")); process.exit(1); }
console.log("\nALL CHECKS PASSED — derived patterns conform to the live engine contracts.");
