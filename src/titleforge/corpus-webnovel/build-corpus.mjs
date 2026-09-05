// @ts-nocheck
/**
 * build-corpus.mjs — assemble corpus.jsonl (v1.1.0) from:
 *   1. harvest.tsv        — Goodreads-rated titles (shelf<TAB>ratings<TAB>title)
 *   2. corpus.v1.jsonl    — the v1.0.0 corpus, for frame-coverage titles that
 *      Goodreads shelves underrepresent (Wattpad romance, interrogative,
 *      villainess) and the held-out translated references.
 *
 * Selection (the quality filter requested):
 *   - Over the RATED pool, compute the MEDIAN ratings count. A title with
 *     fewer than the median ratings is NOT selected ("not those with less than
 *     the median number of ratings").
 *   - Also flag the TOP QUARTILE (>= 75th percentile) — the derivation focuses
 *     here ("top 25% of ratings/readers/subscribers").
 *   - Frame-coverage titles (unrated: Royal Road / Wattpad / WebNovel /
 *     ScribbleHub) are retained and marked frameCoverage:true, selected:true,
 *     but rated:false — they inform frames the rated pool misses and are
 *     explicitly excluded from the "top 25%" statistic.
 *   - Translated references stay scope=reference-translated, selected:false.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const norm = (t) => t.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const SHELF_GENRE = { "progression-fantasy": "progression", "dungeon-core": "dungeon", "litrpg-gamelit": "litrpg" };

// 1a. Goodreads-rated titles (metric = ratings count)
const rated = readFileSync(join(here, "harvest.tsv"), "utf8").trim().split("\n").map((line) => {
	const [shelf, ratings, title] = line.split("\t");
	return {
		title, platform: "kindle", genre: SHELF_GENRE[shelf] ?? "litrpg", bloc: `gr-${shelf}`,
		scope: "english-original", source: `goodreads:${shelf}`,
		ratings: Number(ratings), metric: Number(ratings), metricType: "ratings", rated: true,
	};
});

// 1b. Royal Road Rising Stars slice (metric = followers / subscribers)
const rrPath = join(here, "harvest-rr.tsv");
const ratedRR = existsSync(rrPath)
	? readFileSync(rrPath, "utf8").trim().split("\n").map((line) => {
		const [followers, title] = line.split("\t");
		return {
			title, platform: "royalroad", genre: "litrpg", bloc: "rr-rising-stars",
			scope: "english-original", source: "rst.doomlabs.net (RR Rising Stars)",
			followers: Number(followers), metric: Number(followers), metricType: "followers", rated: true,
		};
	})
	: [];

// 2. frame-coverage + references from the v1.0.0 corpus
const v1path = join(here, "corpus.v1.jsonl");
let frame = [], refs = [];
if (existsSync(v1path)) {
	for (const line of readFileSync(v1path, "utf8").trim().split("\n")) {
		const e = JSON.parse(line);
		if (e.scope === "reference-translated") { refs.push({ ...e, rated: false, selected: false }); continue; }
		// keep only non-Goodreads platforms as frame coverage; drop old kindle rows (superseded by rated harvest)
		if (["royalroad", "scribblehub", "wattpad", "webnovel", "dreame", "goodnovel", "novelcat", "alphanovel"].includes(e.platform)) {
			frame.push({ ...e, rated: false, frameCoverage: true });
		}
	}
}

// dedup by normalised title; rated beats frame beats ref
// 2b. publisher catalogues (Aethon, Shadow Alley, and a Goodreads prog/litrpg
// shelf) — RR serials published as novels. Frame-coverage (publisher-vetted; no
// per-title metric harvested), tagged with provenance.
const PUB_LABEL = { aethon: "Aethon Books", shadowalley: "Shadow Alley Press", "gr-prog-litrpg": "Goodreads prog/litrpg shelf" };
const pubPath = join(here, "harvest-pub.tsv");
if (existsSync(pubPath)) {
	for (const line of readFileSync(pubPath, "utf8").trim().split("\n")) {
		const [pub, title] = line.split("\t");
		frame.push({
			title, platform: "kindle", genre: "litrpg", bloc: `pub-${pub}`,
			scope: "english-original", source: PUB_LABEL[pub] ?? pub,
			publisher: PUB_LABEL[pub] ?? pub, rated: false, frameCoverage: true,
		});
	}
}

const byTitle = new Map();
for (const e of [...rated, ...ratedRR, ...frame, ...refs]) {
	const k = norm(e.title);
	const prev = byTitle.get(k);
	if (!prev) { byTitle.set(k, e); continue; }
	const rank = (x) => (x.rated ? 2 : x.frameCoverage ? 1 : 0);
	if (rank(e) > rank(prev)) byTitle.set(k, e);
}
const all = [...byTitle.values()];

// selection over the rated pool — PER METRIC AXIS (ratings and followers are
// different scales, so each gets its own median floor and top-quartile cut).
const quantile = (arr, q) => {
	if (!arr.length) return 0;
	const s = arr.slice().sort((a, b) => a - b);
	const pos = (s.length - 1) * q, base = Math.floor(pos), rest = pos - base;
	return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
};
const axes = {};
for (const mt of [...new Set(all.filter((e) => e.rated).map((e) => e.metricType))]) {
	const vals = all.filter((e) => e.rated && e.metricType === mt).map((e) => e.metric);
	axes[mt] = { median: quantile(vals, 0.5), p75: quantile(vals, 0.75), n: vals.length };
}

for (const e of all) {
	if (e.rated) {
		const ax = axes[e.metricType];
		e.aboveMedian = e.metric >= ax.median;
		e.topQuartile = e.metric >= ax.p75;
		e.selected = e.aboveMedian;
	} else if (e.frameCoverage) {
		e.selected = true; e.topQuartile = false;
	} else { e.selected = false; }
}

// stable order: rated desc by metric, then frame, then refs
all.sort((a, b) => (b.rated ? b.metric : -1) - (a.rated ? a.metric : -1));
writeFileSync(join(here, "corpus.jsonl"), all.map((e) => JSON.stringify(e)).join("\n") + "\n");

const nAbove = all.filter((e) => e.rated && e.aboveMedian).length;
const nTop = all.filter((e) => e.rated && e.topQuartile).length;
console.log(`corpus v1.1.0 written: ${all.length} scanned titles`);
console.log(`  rated:                    ${all.filter((e) => e.rated).length}`);
for (const [mt, ax] of Object.entries(axes)) {
	console.log(`    ${mt.padEnd(9)} n=${ax.n}  median=${Math.round(ax.median)}  p75=${Math.round(ax.p75)}`);
}
console.log(`  frame-coverage (unrated): ${all.filter((e) => e.frameCoverage).length}`);
console.log(`  references (excluded):    ${all.filter((e) => e.scope === "reference-translated").length}`);
console.log(`  above median (selected):  ${nAbove}`);
console.log(`  top quartile:             ${nTop}`);
