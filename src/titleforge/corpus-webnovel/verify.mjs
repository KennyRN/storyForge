// @ts-nocheck
/**
 * verify.mjs — webnovel v1.2.0 acceptance checks (integration brief, Task 5), run against the
 * live `westernSerialLexicon` through the real engine:
 *   npx tsx src/titleforge/corpus-webnovel/verify.mjs
 *
 *   1. template integrity — validateSpec/checkArticleAgreement clean; every slot of every
 *      template non-empty under every genre its pattern is tagged with (a `{slot:tag}` must find
 *      entries that genuinely carry the tag, not the forgiving fallback)
 *   2. no brackets — nothing references bracketTag; no output contains [ or ]
 *   3. per certified genre, 500 names: pattern shares within ±5 points of normalised weight,
 *      zero corpus collisions, no genre descriptors or "Book N"
 *   4. cultivation rule — under any isekai genre, no dao-of and no cultivation vocabulary
 *   5. hash — webnovel.v1.2.0.json matches webnovel.v1.2.0.sha256, and the bundled collision
 *      list was built from it
 *   6. report — 20 sample names per certified genre, written to v1.2.0/SAMPLES-v1.2.0.md
 *
 * Exits non-zero if any check fails; the report is written either way.
 *
 * (Earlier revisions of this file were a one-off pre-integration check for the v1.0 HANDOFF.md
 * patch; that version is in git history.)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The repo compiles as CommonJS (no "type":"module"), so under tsx the ESM named exports
// surface on `.default`. Drill through it defensively.
import * as genMod from "../engine/generate.ts";
import * as artMod from "../engine/articles.ts";
import * as lexMod from "../engine/lexicon.ts";
import * as tplMod from "../engine/template.ts";
import * as wsMod from "../lexicons/westernSerial.ts";
import * as resMod from "../lexicons/westernSerialReserved.ts";
const gen = genMod.default ?? genMod;
const { validateSpec, generateOne, generateMany, eligiblePatterns, scopedLexicon } = gen;
const { checkArticleAgreement } = artMod.default ?? artMod;
const { withTags } = lexMod.default ?? lexMod;
const { westernSerialLexicon: spec } = wsMod.default ?? wsMod;
const { WESTERN_SERIAL_RESERVED_SOURCE } = resMod.default ?? resMod;

const here = dirname(fileURLToPath(import.meta.url));
const v120 = join(here, "v1.2.0");
const corpusPath = join(v120, "webnovel.v1.2.0.json");
const hashPath = join(v120, "webnovel.v1.2.0.sha256");
const EXPECTED_SHA = "25fef8e28be3d5cccb1030d00214aed9940784f97964b99b12e2b80bc7aadbd6";

const CERTIFIED = [
	"progression", "litrpg", "gamelit", "cultivation", "dungeon", "dungeon-core", "dungeon-crawler",
	"system-apocalypse", "vrmmo", "magic-academy", "crafting-profession", "progression-core",
	"tower-climbing", "isekai", "isekai/reincarnation", "isekai/media-world", "cosy", "villainess",
	"regression",
];
const ISEKAI = CERTIFIED.filter((g) => g === "isekai" || g.startsWith("isekai/"));
const N = 500;
const TOLERANCE = 5; // percentage points
// "Book N" = a volume marker (Book One, Book 2, Book IV) — not "Book of …", which is a name shape.
const FORBIDDEN = /\b(LitRPG|GameLit|Progression Fantasy|Isekai|VRMMO|Xianxia|Stubbed|Book (?:\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|I{1,3}|IV|VI{0,3}|IX|X))\b/i;
const CULTIVATION = /\b(Cultivation|Cultivator|Dao|Qi|Xianxia)\b/i;
const TOKEN_RE = /\{([a-zA-Z_]\w*)(?::([a-zA-Z_][\w-]*))?(?:#\d+)?\^?(?:\|[a-z]+)*\}/g;

const failures = [];
const check = (name, problems) => {
	if (problems.length) failures.push(`${name}:\n  ${problems.slice(0, 25).join("\n  ")}${problems.length > 25 ? `\n  … ${problems.length - 25} more` : ""}`);
	console.log(`  ${problems.length ? "FAIL" : "ok  "}  ${name}${problems.length ? ` (${problems.length})` : ""}`);
};

// Collision set: the corpus itself when present (independent of the bundled list), else the
// bundled list — check 5 fails in that case, so a pass here is never mistaken for the real thing.
let corpusNames;
if (existsSync(corpusPath)) {
	const names = [];
	const walk = (n) => {
		if (Array.isArray(n)) n.forEach(walk);
		else if (n && typeof n === "object") typeof n.name === "string" ? names.push(n.name) : Object.values(n).forEach(walk);
	};
	walk(JSON.parse(readFileSync(corpusPath, "utf8")));
	// Raw names plus their bracket-free forms ("Amber the Cursed Berserker ()"), as build-reserved.mjs does.
	const clean = (s) => s.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
	corpusNames = new Set(names.flatMap((s) => [s.trim(), clean(s)]).filter(Boolean).map((s) => s.toLowerCase()));
} else {
	corpusNames = new Set(spec.reservedTitles.map((s) => s.toLowerCase()));
}

console.log(`webnovel v1.2.0 — ${spec.patterns.length} patterns, ${Object.keys(spec.lexicon).length} slots, ${corpusNames.size} corpus names\n`);

// ── 1. template integrity ──────────────────────────────────────────────────
check("1a validateSpec", validateSpec(spec));
check("1b checkArticleAgreement", checkArticleAgreement(spec));
{
	const problems = [];
	for (const p of spec.patterns) {
		const genres = p.genres?.length ? p.genres : CERTIFIED;
		for (const g of genres) {
			const lex = scopedLexicon(spec, g);
			for (const t of p.templates) {
				for (const [, slot, tag] of t.matchAll(TOKEN_RE)) {
					const pool = lex[slot] ?? [];
					if (pool.length === 0) problems.push(`${p.id} under ${g}: {${slot}} is empty in "${t}"`);
					if (tag && !withTags(pool, [tag]).some((e) => e.tags?.includes(tag))) {
						problems.push(`${p.id} under ${g}: {${slot}:${tag}} has no #${tag} entries`);
					}
				}
			}
		}
	}
	check("1c every slot non-empty under every tagged genre", problems);
}

// ── 2. no brackets ─────────────────────────────────────────────────────────
const wsSource = readFileSync(join(here, "../lexicons/westernSerial.ts"), "utf8");
check("2a nothing references bracketTag", [
	...(spec.lexicon.bracketTag ? ["lexicon still has a bracketTag slot"] : []),
	...(/bracketTag/.test(wsSource) ? ["westernSerial.ts mentions bracketTag"] : []),
	...spec.patterns.filter((p) => p.templates.some((t) => /[[\]]/.test(t))).map((p) => `${p.id} template has a bracket`),
]);

// ── 3 & 4. per-genre runs ──────────────────────────────────────────────────
const bracketHits = [];
const shareProblems = [];
const collisionHits = [];
const forbiddenHits = [];
const cultivationHits = [];
const shareTable = [];
for (const g of CERTIFIED) {
	const eligible = eligiblePatterns(spec, { genre: g });
	const totalW = eligible.reduce((s, p) => s + (p.weight ?? 1), 0);
	const counts = new Map(eligible.map((p) => [p.id, 0]));
	for (let seed = 1; seed <= N; seed++) {
		const r = generateOne(spec, { genre: g, seed: seed * 7919 });
		counts.set(r.patternId, (counts.get(r.patternId) ?? 0) + 1);
		if (/[[\]]/.test(r.title)) bracketHits.push(`${g}: ${r.title}`);
		if (corpusNames.has(r.title.toLowerCase())) collisionHits.push(`${g}: ${r.title}`);
		if (FORBIDDEN.test(r.title)) forbiddenHits.push(`${g}: ${r.title}`);
		if (ISEKAI.includes(g) && (r.patternId === "dao-of" || CULTIVATION.test(r.title))) {
			cultivationHits.push(`${g}: ${r.title} (${r.patternId})`);
		}
	}
	for (const [id, n] of counts) {
		const p = eligible.find((x) => x.id === id);
		const expected = p ? (100 * (p.weight ?? 1)) / totalW : 0;
		const actual = (100 * n) / N;
		shareTable.push({ g, id, expected, actual });
		if (Math.abs(actual - expected) > TOLERANCE) {
			shareProblems.push(`${g}/${id}: ${actual.toFixed(1)}% vs ${expected.toFixed(1)}% expected`);
		}
	}
}
check("2b no output contains [ or ]", bracketHits);
check(`3a pattern shares within ±${TOLERANCE} pts (${N} per genre)`, shareProblems);
check("3b zero corpus collisions", collisionHits);
check("3c no genre descriptors or Book N", forbiddenHits);
check("4  no cultivation under isekai", cultivationHits);

// ── 5. hash ────────────────────────────────────────────────────────────────
{
	const problems = [];
	if (!existsSync(corpusPath)) problems.push("webnovel.v1.2.0.json not found in corpus-webnovel/v1.2.0/");
	else if (!existsSync(hashPath)) problems.push("webnovel.v1.2.0.sha256 not found in corpus-webnovel/v1.2.0/");
	else {
		const actual = createHash("sha256").update(readFileSync(corpusPath)).digest("hex");
		const expected = readFileSync(hashPath, "utf8").trim().split(/\s+/)[0];
		if (actual !== expected) problems.push(`corpus hash ${actual} != .sha256 ${expected}`);
		if (expected !== EXPECTED_SHA) problems.push(`.sha256 ${expected} != brief ${EXPECTED_SHA}`);
		if (!WESTERN_SERIAL_RESERVED_SOURCE.includes(actual)) {
			problems.push(`bundled collision list was built from "${WESTERN_SERIAL_RESERVED_SOURCE}" — rerun v1.2.0/build-reserved.mjs`);
		}
	}
	check("5  corpus hash + collision list provenance", problems);
}

// ── 6. report ──────────────────────────────────────────────────────────────
const label = (id) => spec.genres.find((x) => x.id === id)?.label ?? id;
let md = `# webnovel v1.2.0 — sample names\n\nGenerated by \`corpus-webnovel/verify.mjs\` from the live \`westernSerialLexicon\`: 20 names per certified genre (\`generateMany\`, seed 120). Collision list: ${WESTERN_SERIAL_RESERVED_SOURCE}.\n\n`;
md += `Verification: ${failures.length ? `**${failures.length} check(s) failing**` : "all checks pass"}.\n\n`;
for (const g of CERTIFIED) {
	md += `## ${label(g)} (\`${g}\`)\n\n| # | Name | Pattern |\n|--:|---|---|\n`;
	generateMany(spec, 20, { genre: g, seed: 120 }).forEach((r, i) => {
		md += `| ${i + 1} | ${r.title.replace(/\|/g, "\\|")} | ${r.patternId} |\n`;
	});
	md += "\n";
}
md += `## Pattern shares (${N} draws per genre)\n\n| Genre | Pattern | Expected % | Actual % |\n|---|---|--:|--:|\n`;
for (const r of shareTable) md += `| ${r.g} | ${r.id} | ${r.expected.toFixed(1)} | ${r.actual.toFixed(1)} |\n`;
writeFileSync(join(v120, "SAMPLES-v1.2.0.md"), md);
console.log("\n  report → corpus-webnovel/v1.2.0/SAMPLES-v1.2.0.md");

if (failures.length) {
	console.error("\nFAILURES:\n" + failures.join("\n"));
	process.exit(1);
}
console.log("\nALL CHECKS PASSED");
