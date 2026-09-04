/**
 * titleForge — Stage 4: derive the series generator from the FROZEN corpus.
 *
 * Reads corpus.core.frozen.json and produces a corpus-grounded SERIES shape set
 * for the `title-composer` generator: real Pattern[] objects whose weight,
 * genre-eligibility, and exemplars are all COMPUTED from the frozen corpus (not
 * asserted), reusing the composer's real lexicon slots (seriesWord, countWord,
 * name, noun, …) and its template syntax.
 *
 * Fork resolution: reading the live lexicon showed the series markers
 * (seriesWord/countWord/storyWord) and a "Subtitle & series" family already
 * exist, and the corpus confirms series LABELS use the same grammatical
 * families as novels. So the answer is calibration + a coherent, selectable
 * series shape set (family "series"), NOT a parallel generator and NOT novel
 * divergence. The genre-conditioning the cross-tab demanded is carried by
 * per-shape genre-eligibility (and, for finer control later, the emitted
 * genre×family matrix).
 *
 * Run: `node derive.mjs`. Emits: series-shapes.json, series-weights.json
 */

import { readFileSync, writeFileSync } from "node:fs";

const frozen = JSON.parse(readFileSync(new URL("./corpus.core.frozen.json", import.meta.url)));
const core = frozen.records;

/* -- corpus genre (G01..G11) + audience → composer genre ids -------------- */
const GENRE_MAP = {
	G01: "epic", G02: "sf", G03: "crime", G04: "crime", G05: "rom",
	G06: "horror", G07: "hist", G08: "lit", G09: "epic", G10: "hist", G11: "lit",
};
const COMPOSER_GENRES = ["epic", "sf", "horror", "crime", "lit", "hist", "rom", "short", "ya"];

function composerGenres(rec) {
	const gs = new Set();
	gs.add(GENRE_MAP[rec.primary_genre]);
	for (const g of rec.secondary_genres ?? []) if (GENRE_MAP[g]) gs.add(GENRE_MAP[g]);
	if (rec.object_form === "OF06") gs.add("short"); // anthology brands
	if (["YA", "MG", "CHILD"].includes(rec.audience)) gs.add("ya");
	return [...gs];
}

/* -- series-marker predicate (trailing designation / class marker) -------- */
const MARKERS = new Set([
	"chronicles", "chronicle", "saga", "cycle", "sequence", "archive", "annals",
	"quartet", "quintet", "trilogy", "duology", "papers", "dossier", "files",
	"stories", "tales", "cases", "diaries", "mysteries", "universe", "tapestry",
]);
function isMarker(rec) {
	const last = rec.canonical_series_name.replace(/[^\w\s'&:-]/g, "").trim().split(/\s+/).slice(-1)[0]?.toLowerCase();
	return last ? MARKERS.has(last) : false;
}

/* -- the SERIES shape set (linguistic design by hand; numbers by corpus) --
 * `basis` selects the corpus records that ground a shape's weight/exemplars:
 * either a structural_family code, or "MARKER". `genreLock` optionally caps
 * eligibility. Templates use only confirmed composer slots + syntax.        */
const SHAPES = [
	{
		id: "series-simple", family: "series", label: "The [Noun]", basis: "SF01",
		templates: ["The {noun}", "The {abstract}", "The {group}", "The {kingdom}"],
		note: "The barest umbrella — one weighty noun. Reads as \"the one that matters\"; leans literary/SF. Nearly always takes \"The\".",
	},
	{
		id: "series-compound", family: "series", label: "[Adjective] [Noun] / The [Adjective] [Noun]", basis: "SF02",
		templates: ["The {adj} {noun}", "{adj} {noun}", "The {colour} {noun}", "{noun} {noun#2}", "The {noun} {noun#2}"],
		note: "The workhorse series shape (~half the corpus). Articled and bare forms are near-even in real series, so both are offered; pick the adjective for sound.",
	},
	{
		id: "series-of", family: "series", label: "The [Noun] of [Noun]", basis: "SF03",
		templates: ["The {noun} of {noun#2}", "{noun|a} of {noun#2}", "{noun} of {place}", "{title} of {place}", "The {taleWord} of {name}", "{group} of {place}"],
		note: "The of-genitive is iconic but a MINORITY in real series (~15%) — do not overweight it. The bare and \"A …\" forms matter (A Song of Ice and Fire).",
	},
	{
		id: "series-pair", family: "series", label: "[Noun] and [Noun]", basis: "SF04",
		templates: ["{noun} and {noun#2}", "The {noun} and the {noun#2}", "{name} and {name#2}", "{adj} and {adj#2}"],
		note: "Coordination — a pairing or a duo. Uncommon but distinctive; also the natural home for the ampersand pairing (Bryant & May).",
	},
	{
		id: "series-name", family: "series", label: "[Character Name]", basis: "SF05",
		templates: ["{name} {name#2}", "{honorific} {name}", "{name}"],
		note: "A recurring protagonist as the umbrella. In real series this is overwhelmingly crime/thriller (and comic) — hence its genre-eligibility, not a global default.",
	},
	{
		id: "series-marker", family: "series", label: "The [Noun] [Saga/Cycle/Chronicles/Files]", basis: "MARKER",
		templates: ["The {adj} {seriesWord}", "The {noun} {seriesWord}", "{name} {seriesWord}", "The {name} {countWord}", "The {storyWord} of {place}"],
		note: "The one genuinely series-specific shape: a trailing multi-work marker (Saga, Cycle, Chronicles, Files, Trilogy). A minority tail in the corpus — signals scope without being the norm.",
	},
	{
		id: "series-colon", family: "series", label: "[Name]: [Noun]", basis: "SF10",
		templates: ["{name}: {noun}", "{noun}: {abstract}"],
		note: "Bipartite, colon-split — franchise/property register (Mission: Impossible). Rare in prose series; low weight.",
	},
	{
		id: "series-verb", family: "series", label: "[Verb] [Object]", basis: "SF09",
		templates: ["{strikeVerb} Me", "{verb} the {noun}"],
		note: "Imperative/verbal — urgent, voice-forward (Shatter Me). Very rare as a series umbrella; low weight, YA-leaning.",
	},
	{
		id: "series-clause", family: "series", label: "How to [Verb] [Noun]", basis: "SF08",
		templates: ["How to {verb} Your {noun}"],
		note: "A clause/how-to umbrella (How to Train Your Dragon). Very rare; children's/comic register; low weight.",
	},
];

/* -- compute weight, genres, exemplars per shape from the corpus ---------- */
function matches(rec, basis) {
	return basis === "MARKER" ? isMarker(rec) : rec.structural_family === basis;
}
function scaleWeight(n) { return Math.max(1, Math.round(n / 10)); }

const GENRE_THRESHOLD = 2; // a shape is eligible in a composer genre if ≥2 records attest it

const patterns = [];
const matrixRows = [];
for (const shape of SHAPES) {
	const recs = core.filter((r) => matches(r, shape.basis));
	// genre eligibility
	const gCount = {};
	for (const r of recs) for (const g of composerGenres(r)) gCount[g] = (gCount[g] ?? 0) + 1;
	let genres = COMPOSER_GENRES.filter((g) => (gCount[g] ?? 0) >= GENRE_THRESHOLD);
	if (shape.genreLock) genres = genres.filter((g) => shape.genreLock.includes(g));
	if (genres.length === 0) genres = COMPOSER_GENRES.filter((g) => gCount[g]); // fallback: any attested
	// exemplars: prefer C3 + non-bloc + recognisable, span genres, up to 3
	const ranked = [...recs].sort((a, b) =>
		(b.confidence === "C3") - (a.confidence === "C3") ||
		(!!a.bloc_bias) - (!!b.bloc_bias));
	const picked = [];
	const seenG = new Set();
	for (const r of ranked) {
		const g = r.primary_genre;
		if (picked.length < 3 && (!seenG.has(g) || picked.length < 1)) { picked.push(r); seenG.add(g); }
		if (picked.length >= 3) break;
	}
	while (picked.length < Math.min(3, ranked.length)) picked.push(ranked[picked.length]);
	const exemplar = picked.map((r) => r.canonical_series_name).join("; ") || "—";

	patterns.push({
		id: shape.id,
		family: shape.family,
		label: shape.label,
		templates: shape.templates,
		genres,
		weight: scaleWeight(recs.length),
		exemplar,
		note: shape.note,
	});
	matrixRows.push({ shape: shape.id, basis: shape.basis, n: recs.length, weight: scaleWeight(recs.length), genres, byGenre: gCount });
}

/* -- genre × structural-family matrix (for transparency / future tuning) -- */
const famByGenre = {};
for (const r of core) {
	for (const g of composerGenres(r)) {
		famByGenre[g] ??= {};
		famByGenre[g][r.structural_family] = (famByGenre[g][r.structural_family] ?? 0) + 1;
	}
}

/* -- article + designation policy checks (verification) ------------------- */
const artThe = core.filter((r) => r.article_type === "THE").length;
const artNone = core.filter((r) => r.article_type === "NO_INITIAL_ARTICLE").length;
const markerN = core.filter(isMarker).length;

/* -- lint self-check: indexed repeats, note+exemplar, article filter ------ */
const lint = [];
for (const p of patterns) {
	if (!p.note) lint.push(`${p.id}: missing note`);
	if (!p.exemplar || p.exemplar === "—") lint.push(`${p.id}: no exemplar found in corpus`);
	for (const t of p.templates) {
		const bare = (t.match(/\{([a-zA-Z]+)\}/g) ?? []).map((s) => s.slice(1, -1));
		const dup = bare.filter((s, i) => bare.indexOf(s) !== i);
		if (dup.length) lint.push(`${p.id}: template "${t}" repeats slot ${dup} without #index`);
		if (/\b(A|An)\s+\{/.test(t)) lint.push(`${p.id}: template "${t}" hard-codes A/An — use {slot|a}`);
	}
}

writeFileSync(new URL("./series-shapes.json", import.meta.url), JSON.stringify(patterns, null, "\t"));
writeFileSync(
	new URL("./series-weights.json", import.meta.url),
	JSON.stringify({
		derived_from: `corpus v${frozen.version} (${frozen.frozen}), n=${core.length}`,
		genre_map: GENRE_MAP,
		article: { THE: artThe, NONE: artNone, the_pct: +(artThe / core.length * 100).toFixed(1) },
		marker_records: markerN,
		shape_weights: matrixRows,
		family_by_genre: famByGenre,
	}, null, "\t"),
);

/* -- report --------------------------------------------------------------- */
console.log(`derived ${patterns.length} series shapes from corpus v${frozen.version} (n=${core.length})`);
for (const p of patterns) console.log(`  ${p.id.padEnd(16)} w=${String(p.weight).padStart(2)}  genres=[${p.genres.join(",")}]  ex="${p.exemplar.slice(0, 60)}"`);
console.log(`article THE=${artThe} NONE=${artNone} (The ${(artThe / core.length * 100).toFixed(1)}%) · marker records=${markerN}`);
console.log(lint.length ? `LINT ISSUES:\n  ${lint.join("\n  ")}` : "lint: clean (indexed repeats, note+exemplar, article filter)");
