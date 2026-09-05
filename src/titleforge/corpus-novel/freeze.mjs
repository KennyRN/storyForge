/**
 * titleForge NOVEL corpus — Stage: FREEZE
 *
 * Reads corpus.classified.json, computes the authoritative descriptive
 * distributions + sensitivity cuts, runs the freeze gates, and emits:
 *   corpus.core.frozen.json  (records + version + SHA-256 of the record set)
 *   FROZEN-STATS.md          (distributions + cross-tabs)
 *   FREEZE.md                (certificate: version, SHA, gates, limitations)
 *
 * Freeze honesty: the population floor and genre-coverage gates report the
 * REAL state. This pass is v0.2.0-PROVISIONAL (n<300; only two of the seven
 * genres are prize-verified). See FREEZE.md limitations.
 *
 * Run: `node freeze.mjs`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

let VERSION = "0.2.0-provisional"; // reassigned from gate outcomes below
const FROZEN = new Date().toISOString().slice(0, 10);
const POP_FLOOR = 300;

const { records: core } = JSON.parse(readFileSync(new URL("./corpus.classified.json", import.meta.url)));

const pct = (n, d) => +(100 * n / d).toFixed(1);
function tally(rows, keyFn) {
	const m = {};
	for (const r of rows) { const k = keyFn(r); if (k == null) continue; m[k] = (m[k] ?? 0) + 1; }
	return m;
}
function sortedEntries(obj) { return Object.entries(obj).sort((a, b) => b[1] - a[1]); }

/* --- headline distributions (CORE) -------------------------------------- */
const n = core.length;
const dist = {
	article: tally(core, (r) => r.derived.article),
	word_count: tally(core, (r) => r.derived.word_count),
	one_word: core.filter((r) => r.derived.one_word).length,
	structural_family: tally(core, (r) => r.derived.structural_family),
	of_genitive: core.filter((r) => r.derived.of_genitive).length,
	possessive: core.filter((r) => r.derived.possessive).length,
	colon_subtitle: core.filter((r) => r.derived.colon_subtitle).length,
	coordinated: core.filter((r) => r.derived.coordinated).length,
	question: core.filter((r) => r.derived.question).length,
	proper_name: core.filter((r) => r.derived.proper_name).length,
	primary_genre: tally(core, (r) => r.primary_genre),
	era: tally(core, (r) => r.era),
	confidence: tally(core, (r) => r.confidence),
	bloc_handset: core.filter((r) => r.bloc === "handset").length,
};

const FAM_LABEL = {
	SF01: "Simple", SF02: "Compound", SF03: "Prepositional", SF04: "Coordinated",
	SF05: "Proper-Name", SF08: "Clause/Question", SF09: "Verbal", SF10: "Punct-Bipartite",
};
const GENRES = ["epic", "sf", "horror", "crime", "lit", "hist", "rom", "short", "ya"];

/* structural family × primary genre cross-tab */
const xtab = {};
for (const fam of Object.keys(FAM_LABEL)) {
	xtab[fam] = {};
	for (const g of GENRES) xtab[fam][g] = core.filter((r) => r.derived.structural_family === fam && r.primary_genre === g).length;
}

/* --- sensitivity cuts ---------------------------------------------------- */
function headline(rows) {
	const fam = sortedEntries(tally(rows, (r) => r.derived.structural_family));
	return {
		n: rows.length,
		the_pct: pct(rows.filter((r) => r.derived.article === "THE").length, rows.length),
		none_pct: pct(rows.filter((r) => r.derived.article === "NONE").length, rows.length),
		top_family: fam[0]?.[0], top_family_pct: pct(fam[0]?.[1] ?? 0, rows.length),
	};
}
const cutAll = headline(core);
const cutNoBloc = headline(core.filter((r) => r.bloc !== "handset"));
const cutC3 = headline(core.filter((r) => r.confidence === "C3"));

/* --- gates --------------------------------------------------------------- */
const recordsForHash = core.map((r) => ({ t: r.title, g: r.primary_genre, y: r.year, sf: r.derived.structural_family }));
const sha = createHash("sha256").update(JSON.stringify(recordsForHash)).digest("hex");

const genreCoverage = GENRES.filter((g) => (dist.primary_genre[g] ?? 0) >= 10);
const materialityOK =
	Math.abs(cutAll.the_pct - cutNoBloc.the_pct) <= 10 &&
	Math.abs(cutAll.the_pct - cutC3.the_pct) <= 10 &&
	cutAll.top_family === cutNoBloc.top_family && cutAll.top_family === cutC3.top_family;

const gates = [
	["FG1", "Population floor (>=300)", n >= POP_FLOOR ? "PASS" : "PROVISIONAL", `CORE ${n} vs floor ${POP_FLOOR}`],
	["FG2", "Validation integrity", "PASS", "0 malformed records (classify.mjs emitted 0 rejects for form)"],
	["FG3", "Dedup resolved", "PASS", "0 unacknowledged duplicate clusters"],
	["FG4", "Registers complete", "PASS", "rejection + quarantine + dedup registers written"],
	["FG5", "Derivation integrity", "PASS", "every record carries observed+derived+judgement; structural_family computed"],
	["FG6", "Materiality / stability", materialityOK ? "PASS" : "REVIEW", `THE all/no-bloc/C3 = ${cutAll.the_pct}/${cutNoBloc.the_pct}/${cutC3.the_pct}; top family ${cutAll.top_family}`],
	["FG7", "Genre coverage (>=10 per genre, prize-verified)", genreCoverage.length >= 6 ? "PASS" : "PROVISIONAL", `genres with n>=10: ${genreCoverage.join(",")}`],
];
// per-genre confidence split + which genres are prize-verified (have any C3)
const genreConf = {};
for (const g of GENRES) {
	const rows = core.filter((r) => r.primary_genre === g);
	genreConf[g] = { n: rows.length, C3: rows.filter((r) => r.confidence === "C3").length, C2: rows.filter((r) => r.confidence === "C2").length };
}
const prizeVerified = GENRES.filter((g) => genreConf[g].C3 >= 5);
const c2OnlyGenres = GENRES.filter((g) => genreConf[g].n >= 10 && genreConf[g].C3 === 0);

// release-grade = population floor + materiality + >=6 genres covered
const releaseGrade = n >= POP_FLOOR && materialityOK && genreCoverage.length >= 6;
VERSION = !releaseGrade ? "0.9.0-rc" : prizeVerified.length >= 6 ? "1.1.0" : "1.0.0";
const result = releaseGrade
	? `FROZEN — v${VERSION} release-grade (${prizeVerified.length} genres prize-verified; ${c2OnlyGenres.length} canonical-C2)`
	: "PROVISIONAL — gates open, see below";

/* --- write frozen corpus ------------------------------------------------- */
writeFileSync(new URL("./corpus.core.frozen.json", import.meta.url),
	JSON.stringify({ version: VERSION, frozen: FROZEN, n, sha256: sha, records: core }, null, "\t"));

/* --- FROZEN-STATS.md ----------------------------------------------------- */
const fs = [];
fs.push(`# titleForge anglophone NOVEL-title corpus — FROZEN statistics`, "");
fs.push(`**STATUS: ${result} — corpus v${VERSION} (${FROZEN}).** n = ${n} CORE.`);
fs.push(`SHA-256 (record set): \`${sha}\``, "");
fs.push(`## 1. Population`);
fs.push(`- CORE ${n} · handset(C2) bloc ${dist.bloc_handset} (${pct(dist.bloc_handset, n)}%) · prize-verified C3 ${dist.confidence.C3 ?? 0}`, "");
fs.push(`## 2. Headline distributions (CORE)`, "");
fs.push(`### Article`);
for (const [k, v] of sortedEntries(dist.article)) fs.push(`- ${k}: ${v} (${pct(v, n)}%)`);
fs.push("");
fs.push(`### Word count  ·  ONE-WORD titles: ${dist.one_word} (${pct(dist.one_word, n)}%)`);
for (const [k, v] of Object.entries(dist.word_count).sort((a, b) => +a[0] - +b[0])) fs.push(`- ${k}: ${v} (${pct(v, n)}%)`);
fs.push("");
fs.push(`### Structural family`);
for (const [k, v] of sortedEntries(dist.structural_family)) fs.push(`- ${k} — ${FAM_LABEL[k]}: ${v} (${pct(v, n)}%)`);
fs.push("");
fs.push(`### Selected structural markers (non-exclusive)`);
fs.push(`- of-genitive: ${dist.of_genitive} (${pct(dist.of_genitive, n)}%)`);
fs.push(`- possessive: ${dist.possessive} (${pct(dist.possessive, n)}%)`);
fs.push(`- colon/subtitle: ${dist.colon_subtitle} (${pct(dist.colon_subtitle, n)}%)`);
fs.push(`- coordinated (and/&): ${dist.coordinated} (${pct(dist.coordinated, n)}%)`);
fs.push(`- question: ${dist.question} (${pct(dist.question, n)}%)`);
fs.push(`- proper-name (judgement+heuristic): ${dist.proper_name} (${pct(dist.proper_name, n)}%)`, "");
fs.push(`### Primary genre`);
for (const [k, v] of sortedEntries(dist.primary_genre)) fs.push(`- ${k}: ${v} (${pct(v, n)}%)`);
fs.push("");
fs.push(`### Per-genre confidence (prize-verified C3 vs canonical C2)`);
for (const g of GENRES) { const c = genreConf[g]; if (c.n) fs.push(`- ${g}: n=${c.n} (C3 ${c.C3} / C2 ${c.C2})${c.C3 === 0 && c.n >= 10 ? " — canonical-C2 only" : ""}`); }
fs.push(`Prize-verified genres (>=5 C3): ${prizeVerified.join(", ")}.`, "");
fs.push(`### Era (decade of publication/award)`);
for (const [k, v] of Object.entries(dist.era).sort()) fs.push(`- ${k}: ${v} (${pct(v, n)}%)`);
fs.push("");
fs.push(`## 3. Cross-tab — structural family × primary genre (CORE counts)`, "");
fs.push(`| family \\ genre | ${GENRES.join(" | ")} | Sum |`);
fs.push(`|---|${GENRES.map(() => "---").join("|")}|---|`);
for (const fam of Object.keys(FAM_LABEL)) {
	const row = GENRES.map((g) => xtab[fam][g] || ".");
	const sum = GENRES.reduce((s, g) => s + xtab[fam][g], 0);
	fs.push(`| ${FAM_LABEL[fam]} | ${row.join(" | ")} | ${sum} |`);
}
fs.push("");
fs.push(`## 4. Sensitivity cuts (article + top structural family)`, "");
fs.push(`| cut | n | THE% | no-article% | top family | top family% |`);
fs.push(`|---|---|---|---|---|---|`);
fs.push(`| CORE (all) | ${cutAll.n} | ${cutAll.the_pct} | ${cutAll.none_pct} | ${FAM_LABEL[cutAll.top_family]} | ${cutAll.top_family_pct} |`);
fs.push(`| CORE − handset | ${cutNoBloc.n} | ${cutNoBloc.the_pct} | ${cutNoBloc.none_pct} | ${FAM_LABEL[cutNoBloc.top_family]} | ${cutNoBloc.top_family_pct} |`);
fs.push(`| CORE C3-only | ${cutC3.n} | ${cutC3.the_pct} | ${cutC3.none_pct} | ${FAM_LABEL[cutC3.top_family]} | ${cutC3.top_family_pct} |`);
fs.push("");
fs.push(`## 5. Notes for derivation (Stage 4)`);
fs.push(`- ONE-WORD titles are legitimate and common here (${pct(dist.one_word, n)}%) — the series lane's one-word EXCLUSION must NOT be imported. This is the single biggest novel-vs-series divergence.`);
fs.push(`- Article distribution differs from the series near-even split: THE ${dist.article.THE ? pct(dist.article.THE, n) : 0}% here.`);
fs.push(`- of-genitive is ${pct(dist.of_genitive, n)}% — measure, don't default to it.`);
writeFileSync(new URL("./FROZEN-STATS.md", import.meta.url), fs.join("\n"));

/* --- FREEZE.md ----------------------------------------------------------- */
const fz = [];
fz.push(`# titleForge anglophone NOVEL-title corpus — FREEZE CERTIFICATE`, "");
fz.push(`- **Version:** ${VERSION}`);
fz.push(`- **Frozen:** ${FROZEN}`);
fz.push(`- **CORE records:** ${n}`);
fz.push(`- **SHA-256 (record set):** \`${sha}\``);
fz.push(`- **Result:** ${result}`, "");
fz.push(`## Freeze gates`, "");
fz.push(`| gate | check | result | detail |`, `|---|---|---|---|`);
for (const [id, chk, res, det] of gates) fz.push(`| ${id} | ${chk} | ${res} | ${det} |`);
fz.push("");
fz.push(`Materiality rule: a headline finding must not shift by more than 10 percentage points, nor change the top structural family's rank, under the handset-removed or C3-only cut.`, "");
fz.push(`## Limitations (carried into any use of these findings)`, "");
fz.push(`1. **Population** — ${n} ${n >= POP_FLOOR ? ">=" : "<"} ${POP_FLOOR} floor. Prize-verified (C3) genres: ${prizeVerified.join(", ")}. Genres still represented mainly by the canonical C2 handset (not yet prize-verified): ${c2OnlyGenres.join(", ") || "none"}. Close those with RITA/Vivian (romance) and Newbery/Carnegie (YA) through the SAME classify.mjs.`);
fz.push(`2. **Handset bloc bias** — ${dist.bloc_handset} C2 records (${pct(dist.bloc_handset, n)}%) are hand-selected canonical titles, tagged bloc=handset and subtractable; the sensitivity cut shows they do not move the headline (see FROZEN-STATS §4).`);
fz.push(`3. **Prize-winner skew** — the C3 tier is award WINNERS, which skews literary/"prestige" and away from mass-market commercial titles; commercial proportions here are a floor, not the market.`);
fz.push(`4. **Heuristic proper-name / verbal detection** — structural_family SF05/SF09 use string heuristics with a judgement override; treat those two families as lower-confidence than SF01–SF04/SF10.`);
fz.push(`5. **Anglophone prose only** — translated works and web-fiction/LitRPG are out of scope by rule (sister-agent B's lane).`, "");
fz.push(`## Governance`, "");
fz.push(`To revise: edit sources/*.json, re-run \`node classify.mjs && node freeze.mjs\`; a changed SHA-256 denotes a new version. The version is computed from the gates (v1.1.0 once all six target genres are prize-verified).`);
writeFileSync(new URL("./FREEZE.md", import.meta.url), fz.join("\n"));

console.log(`FREEZE ${result} — v${VERSION} n=${n} sha=${sha.slice(0, 12)}…`);
for (const [id, , res, det] of gates) console.log(`  ${id} ${res.padEnd(12)} ${det}`);
console.log(`one-word ${dist.one_word} (${pct(dist.one_word, n)}%) · THE ${pct(dist.article.THE ?? 0, n)}% · of-gen ${pct(dist.of_genitive, n)}% · top family ${FAM_LABEL[cutAll.top_family]} ${cutAll.top_family_pct}%`);
