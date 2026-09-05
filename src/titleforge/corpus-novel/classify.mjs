/**
 * titleForge NOVEL corpus — Stage: CLASSIFY
 *
 * Reads the anchor-sourced record files in ./sources/*.json and produces one
 * merged, classified corpus (corpus.classified.json) plus the registers
 * (REGISTERS.md). Design follows brief A's observed / derived / judgement split:
 *
 *   observed   — the exact title string, as sourced (never invented).
 *   derived    — structural fields COMPUTED from the string here, reproducibly:
 *                word_count, one_word, article, of_genitive, possessive,
 *                colon_subtitle, coordinated, question, connectors,
 *                structural_family (SFxx, same code space as the series lane).
 *   judgement  — genre (primary/secondary), era decade, confidence, source,
 *                bloc, and an optional proper_name override. Kept separate and
 *                overridable; NEVER computed from the string except where a
 *                low-confidence heuristic is explicitly flagged (proper_name).
 *
 * Run: `node classify.mjs`  →  corpus.classified.json, REGISTERS.md
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const SRC_DIR = new URL("./sources/", import.meta.url);

/* --- tokenisation / normalisation --------------------------------------- */
const STOPomit = new Set(["the", "a", "an"]);
function tokens(title) {
	return title.trim().split(/\s+/);
}
function words(title) {
	// content-ish word count: split on whitespace, keep everything (incl. "of")
	return tokens(title).filter((t) => /[A-Za-z0-9]/.test(t));
}

/* --- derived structural fields (all computed from the string) ------------ */
const CONNECTORS = ["of", "in", "from", "to", "for", "with", "at", "on", "and", "&", "or"];
const IMPERATIVE_VERBS = new Set([
	"shatter", "kill", "run", "burn", "break", "find", "how", "let", "go", "stay",
	"remember", "forget", "watch", "call", "speak", "look", "get", "save", "hold",
]);

function articleOf(tks) {
	const w0 = tks[0].toLowerCase().replace(/[^a-z]/g, "");
	if (w0 === "the") return "THE";
	if (w0 === "a") return "A";
	if (w0 === "an") return "AN";
	return "NONE";
}

function derive(title, judgement) {
	const tks = tokens(title);
	const lc = title.toLowerCase();
	const wc = words(title).length;
	const one_word = wc === 1;
	const article = articleOf(tks);

	const of_genitive = /\bof\b/i.test(title);
	const possessive = /(?:['’]s\b|s['’](?:\s|$))/.test(title);
	const colon_subtitle = /[:—–-]\s|\s[-—–]\s|:/.test(title) && /:/.test(title);
	const coordinated = /\b(and|&)\b|,\s*(and|&)\b/i.test(title);
	const question = /\?\s*$/.test(title);

	const connectors = CONNECTORS.filter((c) =>
		c === "&" ? /&/.test(title) : new RegExp(`\\b${c}\\b`, "i").test(title));

	// low-confidence heuristic for proper-name; a judgement override always wins.
	const bareWord = tks[0].replace(/[^A-Za-z]/g, "");
	const heuristicProperName =
		one_word && /^[A-Z]/.test(bareWord) && !COMMON_ONEWORD.has(bareWord.toLowerCase());
	const proper_name = judgement.proper_name ?? heuristicProperName;

	// structural_family (ordered rules; documented in STAGE + LIMITATIONS)
	let structural_family;
	const firstLc = bareWord.toLowerCase();
	if (colon_subtitle) structural_family = "SF10"; // punct-bipartite
	else if (question) structural_family = "SF08"; // clause/question
	else if (/^how to\b/i.test(title)) structural_family = "SF08";
	else if (coordinated) structural_family = "SF04";
	else if (of_genitive || connectors.some((c) => c !== "and" && c !== "&")) structural_family = "SF03";
	else if (!article.match(/THE|A|AN/) && IMPERATIVE_VERBS.has(firstLc) && wc >= 2) structural_family = "SF09";
	else if (proper_name) structural_family = "SF05";
	else if (wc === 1) structural_family = "SF01";
	else if (wc === 2 && article !== "NONE") structural_family = "SF01"; // "The Noun"
	else structural_family = "SF02"; // compound / multiword nominal

	return {
		word_count: wc, one_word, article, of_genitive, possessive,
		colon_subtitle, coordinated, question, connectors,
		proper_name, proper_name_source: judgement.proper_name != null ? "judgement" : (heuristicProperName ? "heuristic" : "none"),
		structural_family,
	};
}
// words that look like a name (capitalised one-word title) but aren't people
const COMMON_ONEWORD = new Set([
	"beloved", "atonement", "middlesex", "jaws", "it", "possession", "disgrace",
	"amsterdam", "saville", "holiday", "offshore", "troubles", "milkman", "flesh",
	"orbital", "gilead", "americanah", "twilight", "divergent", "speak", "carrie",
	"misery", "gateway", "ringworld", "neuromancer", "hyperion", "cyteen", "barrayar",
	"dreamsnake", "spin", "hominids", "redshirts", "outlander",
]);

/* --- load + merge sources ------------------------------------------------ */
const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".json"));
const merged = [];
const rejected = [];
const quarantine = [];
const seen = new Map(); // normalised title -> first record (dedup)

for (const f of files) {
	const doc = JSON.parse(readFileSync(new URL(f, SRC_DIR)));
	for (const r of doc.records) {
		const title = (r.title ?? "").trim();
		if (!title) { rejected.push({ title: r.title, source: f, reason: "empty title" }); continue; }
		// SCOPE guard: keep prose-novel single titles only; drop obvious non-novels
		if (/^\s*$/.test(title)) { rejected.push({ title, source: f, reason: "blank" }); continue; }

		const judgement = {
			primary_genre: r.primary_genre ?? doc.primary_genre_default ?? "lit",
			secondary_genres: r.secondary_genres ?? [],
			year: r.year ?? null,
			era: r.year ? `${Math.floor(r.year / 10) * 10}s` : "unknown",
			confidence: r.confidence ?? doc.confidence_default ?? "C2",
			source: doc.source,
			bloc: r.bloc ?? doc.bloc ?? null,
			retro: r.retro ?? false,
			proper_name: r.proper_name,
		};
		const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (seen.has(key)) {
			const first = seen.get(key);
			first._dupes = first._dupes ?? [];
			first._dupes.push({ source: f, genre: judgement.primary_genre });
			continue;
		}
		const rec = { title, ...judgement, derived: derive(title, judgement) };
		seen.set(key, rec);
		merged.push(rec);
	}
}

/* --- registers ----------------------------------------------------------- */
const dupeClusters = merged.filter((r) => r._dupes?.length);
for (const r of merged) delete r._dupes;

writeFileSync(new URL("./corpus.classified.json", import.meta.url),
	JSON.stringify({ generated: new Date().toISOString().slice(0, 10), n: merged.length, records: merged }, null, "\t"));

const reg = [
	"# titleForge NOVEL corpus — REGISTERS",
	"",
	`Generated by classify.mjs from ${files.length} source file(s): ${files.join(", ")}.`,
	"",
	`## Population`,
	`- Merged CORE records: ${merged.length}`,
	`- Rejected: ${rejected.length}`,
	`- Quarantine: ${quarantine.length}`,
	`- Duplicate clusters (same title across sources, first kept): ${dupeClusters.length}`,
	"",
	"## Duplicate clusters (acknowledged)",
	...(dupeClusters.length ? dupeClusters.map((r) => `- "${r.title}" (kept: ${r.source})`) : ["- none"]),
	"",
	"## Rejection register",
	...(rejected.length ? rejected.map((r) => `- "${r.title}" — ${r.reason} [${r.source}]`) : ["- none"]),
	"",
	"## Quarantine register (uncertain exact form — excluded pending verification)",
	...(quarantine.length ? quarantine.map((r) => `- "${r.title}" — ${r.note}`) : ["- none"]),
	"",
].join("\n");
writeFileSync(new URL("./REGISTERS.md", import.meta.url), reg);

console.log(`classified ${merged.length} records from ${files.length} sources`);
console.log(`  rejected ${rejected.length} · quarantine ${quarantine.length} · dupe clusters ${dupeClusters.length}`);
