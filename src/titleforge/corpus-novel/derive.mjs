/**
 * titleForge NOVEL corpus — Stage 4: DERIVE calibration for the EXISTING shapes
 *
 * Unlike the series lane (which derived a NEW shape family), the novel lane
 * AUDITS the ~74 novel patterns already in ../lexicons/titleComposer.ts. It:
 *   1. parses the live patterns (id, family, genres, weight, exemplar);
 *   2. maps each composer family to a corpus structural signal;
 *   3. from the frozen corpus computes, per mapped family: a suggested weight,
 *      corpus genre-eligibility, and real corpus-verified exemplars;
 *   4. FLAGS shapes whose weight / genres / exemplar look intuition-based or
 *      wrong (e.g. an exemplar that is not a novel).
 *
 * Everything numeric is COMPUTED from corpus.core.frozen.json. Exemplar
 * suggestions are real titles drawn from the corpus. Output: novel-calibration.json
 *
 * Run: `node derive.mjs`
 */

import { readFileSync, writeFileSync } from "node:fs";

const frozen = JSON.parse(readFileSync(new URL("./corpus.core.frozen.json", import.meta.url)));
const core = frozen.records;
const LEX = readFileSync(new URL("../lexicons/titleComposer.ts", import.meta.url), "utf8");

/* --- parse the live patterns (line scan; templates contain literal {..}) - */
const patterns = [];
let cur = null;
for (const line of LEX.split("\n")) {
	const idm = line.match(/"id"\s*:\s*"([^"]+)"/);
	if (idm) { cur = { id: idm[1], family: null, genres: [], weight: null, exemplar: "", _hasTemplates: false }; patterns.push(cur); continue; }
	if (!cur) continue;
	if (/"templates"\s*:/.test(line)) cur._hasTemplates = true;
	const fam = line.match(/"family"\s*:\s*"([^"]+)"/); if (fam) cur.family = fam[1];
	const w = line.match(/"weight"\s*:\s*(\d+)/); if (w) cur.weight = +w[1];
	const gen = line.match(/"genres"\s*:\s*\[([^\]]*)\]/); if (gen) cur.genres = [...gen[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	const ex = line.match(/"exemplar"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (ex) cur.exemplar = ex[1];
}
// keep only real patterns (have templates); drop genre/family/platform option objects that also carry "id"
for (let i = patterns.length - 1; i >= 0; i--) if (!patterns[i]._hasTemplates) patterns.splice(i, 1);
const novel = patterns.filter((p) => p.family !== "series");
const seriesFam = patterns.filter((p) => p.family === "series");

/* --- corpus helpers ------------------------------------------------------ */
const GENRES = ["epic", "sf", "horror", "crime", "lit", "hist", "rom", "short", "ya"];
function recGenres(r) { return [r.primary_genre, ...(r.secondary_genres ?? [])]; }
function corpusMatch(basis) {
	switch (basis) {
		case "SF01": return (r) => r.derived.structural_family === "SF01";
		case "SF02": return (r) => r.derived.structural_family === "SF02";
		case "SF03": return (r) => r.derived.structural_family === "SF03";
		case "SF04": return (r) => r.derived.coordinated;
		case "SF05": return (r) => r.derived.proper_name;
		case "SF10": return (r) => r.derived.colon_subtitle;
		case "OFGEN": return (r) => r.derived.of_genitive;
		case "POSS": return (r) => r.derived.possessive;
		case "QUES": return (r) => r.derived.question;
		case "ONEWORD": return (r) => r.derived.one_word;
		case "SENTENCE": return (r) => r.derived.word_count >= 6;
		default: return null;
	}
}

/* composer family -> corpus structural basis (or null = no direct basis) */
const FAMILY_BASIS = {
	core: "SF01", abstract: "SF01", name: "SF05", of: "OFGEN", prep: "SF03",
	pair: "SF04", poss: "POSS", question: "QUES", clause: "SENTENCE",
	sentence: "SENTENCE", subtitle: "SF10", modifier: "SF02",
	// families with no single structural axis in this corpus:
	rhetoric: null, temporal: null, reference: null, place: null, participle: null,
	number: null, journey: null, guide: null, event: null, tale: null,
	negative: null, list: null, lastfirst: null, verb: null,
};

/* scale corpus basis counts to the composer's 1..5 novel-weight band */
const basisCounts = {};
for (const fam of new Set(novel.map((p) => p.family))) {
	const basis = FAMILY_BASIS[fam];
	const m = basis && corpusMatch(basis);
	basisCounts[fam] = m ? core.filter(m).length : null;
}
const maxCount = Math.max(...Object.values(basisCounts).filter((v) => v != null), 1);
const scaleWeight = (c) => (c == null ? null : Math.max(1, Math.round((c / maxCount) * 5)));

/* corpus genre-eligibility per basis (>=2 attesting records) */
function corpusGenres(basis) {
	const m = corpusMatch(basis);
	if (!m) return null;
	const g = {};
	for (const r of core.filter(m)) for (const x of recGenres(r)) g[x] = (g[x] ?? 0) + 1;
	return GENRES.filter((x) => (g[x] ?? 0) >= 2);
}
/* real corpus exemplars for a basis: prefer C3, span genres, up to 3 */
function corpusExemplars(basis) {
	const m = corpusMatch(basis);
	if (!m) return [];
	const recs = [...core.filter(m)].sort((a, b) => (b.confidence === "C3") - (a.confidence === "C3"));
	const picked = [], seenG = new Set();
	for (const r of recs) { if (picked.length >= 3) break; if (!seenG.has(r.primary_genre) || picked.length < 1) { picked.push(r.title); seenG.add(r.primary_genre); } }
	while (picked.length < Math.min(3, recs.length)) picked.push(recs[picked.length].title);
	return picked;
}

/* --- hand-audited exemplar problems (from the Stage-0 repo audit) -------- */
const NON_NOVEL_EXEMPLARS = new Set(["ivan the terrible"]); // historical epithet / film, not a novel
const corpusTitleSet = new Set(core.map((r) => r.title.toLowerCase()));

/* --- build calibration per novel family ---------------------------------- */
const byFamily = {};
for (const p of novel) (byFamily[p.family] ??= []).push(p);

const calibration = [];
const flags = [];
for (const [fam, pats] of Object.entries(byFamily)) {
	const basis = FAMILY_BASIS[fam];
	const count = basisCounts[fam];
	const suggested = scaleWeight(count);
	const genresElig = basis ? corpusGenres(basis) : null;
	const exemplars = basis ? corpusExemplars(basis) : [];
	const curWeights = [...new Set(pats.map((p) => p.weight))].sort((a, b) => a - b);

	calibration.push({
		family: fam, corpus_basis: basis, corpus_n: count,
		current_weights: curWeights, suggested_weight: suggested,
		corpus_genre_eligibility: genresElig,
		corpus_verified_exemplars: exemplars,
		pattern_ids: pats.map((p) => p.id),
	});

	// FLAG: weight divergence (only where we have a basis)
	if (basis && suggested != null) {
		for (const p of pats) {
			if (p.weight != null && Math.abs(p.weight - suggested) >= 3)
				flags.push(`WEIGHT  ${p.id} (family ${fam}): current ${p.weight} vs corpus-suggested ${suggested} (basis ${basis}, n=${count})`);
		}
	}
	// FLAG: genre mismatch (current genre not attested at all in corpus basis)
	if (basis && genresElig) {
		for (const p of pats) {
			const unattested = p.genres.filter((g) => !genresElig.includes(g));
			if (unattested.length && genresElig.length)
				flags.push(`GENRE   ${p.id} (family ${fam}): declares [${p.genres.join(",")}]; corpus attests [${genresElig.join(",")}] — unattested: ${unattested.join(",")}`);
		}
	}
	// FLAG: exemplar problems
	for (const p of pats) {
		for (const ex of p.exemplar.split(";").map((s) => s.trim()).filter(Boolean)) {
			if (NON_NOVEL_EXEMPLARS.has(ex.toLowerCase()))
				flags.push(`EXEMPLAR ${p.id}: "${ex}" is NOT a novel (hand-audited) — replace with a sourced title, e.g. ${exemplars[0] ?? "(corpus)"}`);
		}
	}
}

/* families with no corpus basis this pass (need dedicated sourcing) */
const noBasis = calibration.filter((c) => c.corpus_basis == null).map((c) => c.family);

writeFileSync(new URL("./novel-calibration.json", import.meta.url),
	JSON.stringify({
		derived_from: `corpus v${frozen.version} (${frozen.frozen}), n=${core.length}`,
		note: "Suggested weights scaled to the composer's 1..5 novel band from corpus basis counts. Genre-eligibility = corpus genres with >=2 attesting records. Exemplars are real corpus titles. Families with corpus_basis=null have no single structural axis in this corpus and are left for judgement / dedicated sourcing.",
		novel_pattern_count: novel.length,
		series_pattern_count: seriesFam.length,
		calibration, flags, families_without_corpus_basis: noBasis,
	}, null, "\t"));

/* --- report -------------------------------------------------------------- */
console.log(`parsed ${patterns.length} patterns: ${novel.length} novel + ${seriesFam.length} series`);
console.log(`\nCALIBRATION (family: current→suggested weight | corpus n | eligible genres):`);
for (const c of calibration.sort((a, b) => (b.corpus_n ?? -1) - (a.corpus_n ?? -1))) {
	const w = c.suggested_weight == null ? "—" : `${c.current_weights.join("/")}→${c.suggested_weight}`;
	console.log(`  ${c.family.padEnd(10)} ${String(w).padEnd(10)} n=${String(c.corpus_n ?? "—").padStart(3)}  ${c.corpus_genre_eligibility ? "["+c.corpus_genre_eligibility.join(",")+"]" : "(no basis)"}`);
}
console.log(`\nFLAGS (${flags.length}):`);
for (const f of flags) console.log(`  ${f}`);
console.log(`\nFamilies w/o corpus basis this pass (need dedicated sourcing): ${noBasis.join(", ")}`);
