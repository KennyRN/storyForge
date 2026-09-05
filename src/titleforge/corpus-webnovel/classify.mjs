// @ts-nocheck
/**
 * classify.mjs — derive structural fields for each corpus title.
 *
 * This is the code-derived layer of the pipeline: every field here is computed
 * from the title STRING, never hand-assigned, so re-running it over a grown
 * corpus reproduces the taxonomy. Editorial judgement (template wording, notes)
 * lives elsewhere (pattern-templates.mjs), kept deliberately separate.
 *
 * Usage: node classify.mjs            (writes classified.json, prints summary)
 *        node classify.mjs --no-write (summary only)
 *
 * Families are the NEW web-novel structural taxonomy the brief asked for. They
 * are not mutually exclusive — a title can be first-person AND a regression
 * marker (e.g. "I Reincarnated as ...") — so each is an independent boolean and
 * a title is credited to every family it matches. `primaryFamily` is the single
 * highest-priority match, used only for headline dedup/among-family shares.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function loadCorpus() {
	const raw = readFileSync(join(here, "corpus.jsonl"), "utf8").trim().split("\n");
	return raw.filter(Boolean).map((line) => JSON.parse(line));
}

const words = (t) => t.trim().split(/\s+/).filter(Boolean);
const lc = (t) => t.toLowerCase();

// --- structural detectors (each reads the title string only) -----------------

// No trailing \b: stems like "reincarnat" are followed by a word char
// ("reincarnation", "reincarnated"), which a trailing boundary would reject.
const REGRESSION_RE =
	/\b(reincarnat|reborn|rebirth|regress|transmigrat|return of|second life|lives? (again|twice)|reset|became|becoming|awakened as|do[- ]?over|re:)/i;
const FIRST_PERSON_RE = /^(i |i'|my |we |me,? )/i;
const SYSTEM_LEXIS_RE =
	/\b(system|level(l)?(ed|ing|s| up)?|stat(us|s)?|skill|dungeon|class|respawn|guild|tutorial|patch|loot|mana|xp|rank(ed)?|tier)\b/i;
const BRACKET_RE = /[\[(][^\])]+[\])]/; // [LitRPG] or (Progression)
const INTERROGATIVE_RE = /\?/;
const CONVERSATIONAL_RE = /^(so |turns out|what do you mean|why |oh so|guess |apparently)\b/i;
const WARNING_RE = /^(beware|mind the|do not|please (ignore|do not)|caution|warning)\b/i;
const POSSESSIVE_RE = /\b\w+['’]s\b/; // the Duke's, the Billionaire's
// romance-app "relationship status" hook: [participle] by/to the [role]
const STATUS_HOOK_RE = /\b(rejected|reclaimed|married|mated|kidnapped|sold|claimed|bound|owned|promised|betrothed|divorced|bought|abandoned|stolen|captured|hunted|traded|gifted) (by|to)\b/i;
const SETTING_ANCHOR_RE =
	/\b(dungeon|tower|academy|apocalypse|gate|inn|floor|core|world online|sect|labyrinth)\b/i;
const CLASS_ROLE_RE =
	/\b(necromancer|summoner|alchemist|villain(ess)?|saintess|regressor|duke|duchess|mechanic|healer|hunter|core|inn ?keeper|alpha|dragon)\b/i;
const NUMERIC_RE = /\b(\d[\d,]*|one|two|three|nine|ten|hundred|thousand|\d+ years|\d+ levels)\b/i;
const GENRE_SUBTITLE_RE = /:\s*(a|an|the)?\s*[^:]*\b(litrpg|progression|gamelit|cultivation|space opera|adventure|serial)\b/i;

function finiteVerbish(title) {
	// crude full-sentence signal: contains a pronoun/aux + a space, and > 4 words
	return words(title).length >= 6 && /\b(i|is|are|was|were|am|has|have|will|can|do|did|got|want|refuse|became|becomes)\b/i.test(title);
}

function classifyOne(entry) {
	const t = entry.title;
	const wc = words(t).length;
	const families = [];
	const add = (f, cond) => { if (cond) families.push(f); };

	add("regression-rebirth", REGRESSION_RE.test(t));
	add("first-person-declarative", FIRST_PERSON_RE.test(t));
	add("system-bracket", BRACKET_RE.test(t) || !!entry.bracket);
	add("interrogative-hook", INTERROGATIVE_RE.test(t) || CONVERSATIONAL_RE.test(t));
	add("warning-label", WARNING_RE.test(t));
	add("possessive-relation", POSSESSIVE_RE.test(t));
	add("status-hook", STATUS_HOOK_RE.test(t));
	add("setting-anchor", SETTING_ANCHOR_RE.test(t));
	add("class-role", CLASS_ROLE_RE.test(t));
	add("numeric-grind", NUMERIC_RE.test(t) && SYSTEM_LEXIS_RE.test(t));
	add("genre-subtitle", GENRE_SUBTITLE_RE.test(t));
	add("full-sentence", finiteVerbish(t));
	add("system-litrpg", SYSTEM_LEXIS_RE.test(t) && !families.includes("setting-anchor"));

	// register: the tonal contract of the title (coarse, rule-based)
	let register = "neutral";
	if (entry.bloc === "wattpad-romance" || /\b(alpha|luna|mate|billionaire|ceo|bride|wife|husband|rejected|werewolf|wolf|heart|kiss|mine|love)\b/i.test(t)) register = "sincere";
	else if (WARNING_RE.test(t) || /\b(chicken|soup|tea|refund|notes|somehow|accidental|please|diary|mushroom)\b/i.test(t)) register = "ironic-cosy";
	else if (/\b(dark|blood|kill|death|apocalypse|grim|villain|demon|abyss)\b/i.test(t)) register = "hard";

	// length mode: web novels have a long tail trad titles lack
	const lengthMode = wc <= 2 ? "terse" : wc <= 5 ? "standard" : wc <= 9 ? "long" : "extreme";

	// priority order for a single headline family
	const PRIORITY = [
		"regression-rebirth", "status-hook", "possessive-relation", "interrogative-hook",
		"warning-label", "genre-subtitle", "system-bracket", "numeric-grind",
		"setting-anchor", "class-role", "first-person-declarative",
		"full-sentence", "system-litrpg",
	];
	const primaryFamily = PRIORITY.find((f) => families.includes(f)) ?? "unclassified";

	// formula signature: collapse to a structural skeleton so near-duplicate
	// instances ("Bone Dungeon"/"Slime Dungeon") dedup to one FORMULA.
	const formula = lc(t)
		.replace(/[\[(][^\])]*[\])]/g, "[TAG]")
		.replace(/\b\w+['’]s\b/g, "OWNER's")
		.replace(REGRESSION_RE, "REBIRTH")
		.replace(STATUS_HOOK_RE, "STATUS by")
		.replace(/\b(necromancer|summoner|alchemist|villainess|villain|mechanic|healer|hunter|dragon|core|dungeon|alpha|duke|billionaire)\b/gi, "ROLE")
		.replace(/\b\d[\d,]*\b/g, "N")
		.replace(/\s+/g, " ")
		.trim();

	return { ...entry, wordCount: wc, lengthMode, register, families, primaryFamily, formula };
}

function summarise(rows, { includeBlocs = null, selector = null } = {}) {
	const pool = rows.filter((r) => r.scope === "english-original")
		.filter((r) => (includeBlocs ? includeBlocs.includes(r.bloc) : true))
		.filter((r) => (selector ? selector(r) : true));
	const famCount = {};
	const byPrimary = {};
	const lengths = {};
	const registers = {};
	for (const r of pool) {
		for (const f of r.families) famCount[f] = (famCount[f] ?? 0) + 1;
		byPrimary[r.primaryFamily] = (byPrimary[r.primaryFamily] ?? 0) + 1;
		lengths[r.lengthMode] = (lengths[r.lengthMode] ?? 0) + 1;
		registers[r.register] = (registers[r.register] ?? 0) + 1;
	}
	// distinct sources per family (materiality input)
	const srcPerFam = {};
	for (const r of pool) {
		for (const f of r.families) {
			(srcPerFam[f] ??= new Set()).add(r.bloc);
		}
	}
	const distinctSources = Object.fromEntries(
		Object.entries(srcPerFam).map(([f, s]) => [f, s.size]),
	);
	// distinct FORMULAS per family — a family that is all one formula is weak
	const formPerFam = {};
	for (const r of pool) for (const f of r.families) (formPerFam[f] ??= new Set()).add(r.formula);
	const distinctFormulas = Object.fromEntries(
		Object.entries(formPerFam).map(([f, s]) => [f, s.size]),
	);
	return { n: pool.length, famCount, byPrimary, lengths, registers, distinctSources, distinctFormulas };
}

function main() {
	const corpus = loadCorpus();
	const rows = corpus.map(classifyOne);
	const write = !process.argv.includes("--no-write");

	const full = summarise(rows);
	// sensitivity cut: drop the over-sampled RR progression bloc
	const withoutRR = summarise(rows, {
		includeBlocs: [...new Set(rows.map((r) => r.bloc))].filter((b) => b !== "rr-progression"),
	});
	// quality-filtered views (the requested "top 25% / above median" focus)
	const selected = summarise(rows, { selector: (r) => r.selected !== false });
	const topQuartile = summarise(rows, { selector: (r) => r.topQuartile === true });

	if (write) {
		writeFileSync(join(here, "classified.json"),
			JSON.stringify({ rows, summary: { full, sensitivity_noRRbloc: withoutRR, selected, topQuartile } }, null, 2));
	}

	console.log(`classified ${rows.length} titles (${full.n} english-original; ${selected.n} selected; ${topQuartile.n} top-quartile)\n`);
	console.log("FAMILY FREQUENCY — SELECTED pool (above-median ratings + frame coverage):");
	for (const [f, c] of Object.entries(selected.famCount).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${String(c).padStart(3)}  ${f}  (${selected.distinctSources[f]} blocs)`);
	}
	console.log("\nTOP-QUARTILE pool family frequency:");
	for (const [f, c] of Object.entries(topQuartile.famCount).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${String(c).padStart(3)}  ${f}`);
	}
	console.log("\nregisters (selected):", selected.registers, "\nlength modes (selected):", selected.lengths);
}

main();
