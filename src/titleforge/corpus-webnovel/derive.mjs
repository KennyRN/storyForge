// @ts-nocheck
/**
 * derive.mjs — emit live-schema Pattern objects + new lexicon slots for every
 * frozen, promoted GAP family. Weights come from the frozen shares (code); the
 * template wording/notes come from pattern-templates.mjs (judgement); exemplars
 * are pulled from the verified English-original corpus so every "Why this shape"
 * card cites a real, traced title — never an invented one.
 *
 * Output:
 *   derived-patterns.json  — { patterns:[...], newSlots:{...}, provenance:[...] }
 *   PATCH.txt               — a ready-to-merge TypeScript block for westernSerial.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GAP_PATTERNS } from "./pattern-templates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.1.0";

// weight from frozen share, graduated and monotonic, commensurate with the
// shipped spec (2..4 plus an occasional 5). No "dominant" special-case — a
// modest top share shouldn't automatically earn the max.
function weightFromShare(share) {
	if (share >= 0.12) return 5;
	if (share >= 0.08) return 4;
	if (share >= 0.05) return 3;
	return 2;
}

function main() {
	const frozen = JSON.parse(readFileSync(join(here, "frozen", `webnovel.v${VERSION}.json`), "utf8"));
	const { rows } = JSON.parse(readFileSync(join(here, "classified.json"), "utf8"));

	const gaps = frozen.families.filter((f) => f.isGap);

	// platforms declared by westernSerial.ts at freeze time; any platform a new
	// pattern references that isn't here must be added to spec.platforms.
	const BASE_PLATFORMS = new Set(["all", "royalroad", "scribblehub", "spacebattles", "wattpad"]);
	const PLATFORM_LABELS = { webnovel: "WebNovel" };

	const patterns = [];
	const newSlots = {};
	const provenance = [];
	const newPlatformIds = new Set();

	for (const g of gaps) {
		const spec = GAP_PATTERNS[g.family];
		if (!spec) { console.warn(`no judgement-layer template for gap "${g.family}" — skipped`); continue; }

		// exemplar: a verified english-original corpus title crediting this family,
		// preferring a title NOT from the over-sampled bloc.
		const candidates = rows.filter((r) =>
			r.scope === "english-original" && r.families.includes(g.family));
		const pref = spec.exemplarPrefer;
		// score: shape-match dominates (so the exemplar actually looks like the
		// pattern), then most-read (top-quartile > above-median > frame > rest).
		const metricScore = (r) => (r.topQuartile ? 3 : r.rated && r.aboveMedian ? 2 : r.frameCoverage ? 1 : 0);
		const score = (r) => (pref && pref.test(r.title) ? 100 : 0) + metricScore(r);
		const chosen = candidates.slice().sort((a, b) => score(b) - score(a))[0];
		const exemplar = chosen ? chosen.title : null;
		if (!exemplar) { console.warn(`no corpus exemplar for "${g.family}" — skipped`); continue; }

		let weight = weightFromShare(g.share);
		let capped = false;
		if (spec.weightCap != null && weight > spec.weightCap) { weight = spec.weightCap; capped = true; }

		const pattern = {
			id: spec.id,
			label: spec.label,
			templates: spec.templates,
			genres: spec.genres,
			...(spec.platforms ? { platforms: spec.platforms } : {}),
			weight,
			note: spec.note,
			exemplar,
		};
		for (const pf of spec.platforms ?? []) if (!BASE_PLATFORMS.has(pf)) newPlatformIds.add(pf);
		patterns.push(pattern);
		Object.assign(newSlots, spec.newSlots ?? {});
		provenance.push({
			pattern: spec.id, family: g.family, weight,
			frozenShare: g.share, exemplar, exemplarBloc: chosen.bloc, exemplarSource: chosen.source,
			...(capped ? { weightCapped: true, capReason: spec.weightCapReason } : {}),
		});
	}

	const newPlatforms = [...newPlatformIds].map((id) => ({ id, label: PLATFORM_LABELS[id] ?? id }));
	const out = { version: VERSION, patterns, newSlots, newPlatforms, provenance };
	writeFileSync(join(here, "derived-patterns.json"), JSON.stringify(out, null, 2));

	// ready-to-merge TS
	const slotTs = Object.entries(newSlots).map(([slot, glosses]) =>
		`\t\t"${slot}": [\n${glosses.map((x) => `\t\t\t${JSON.stringify(x)}`).join(",\n")}\n\t\t]`).join(",\n");
	const patTs = patterns.map((p) => JSON.stringify(p, null, 2)
		.split("\n").map((l) => "\t\t" + l).join("\n")).join(",\n");
	const patch = `// ==== titleForge corpus-webnovel v${VERSION} — ADDITIVE PATCH for westernSerial.ts ====
// Merge these ${patterns.length} objects into westernSerialLexicon.patterns:
${patTs}

// Merge these ${Object.keys(newSlots).length} slots into westernSerialLexicon.lexicon:
${slotTs}
${newPlatforms.length ? `\n// Add these ${newPlatforms.length} option(s) to westernSerialLexicon.platforms:\n${newPlatforms.map((p) => `\t\t${JSON.stringify(p)}`).join(",\n")}` : ""}
`;
	writeFileSync(join(here, "PATCH.txt"), patch);

	console.log(`derived ${patterns.length} new patterns, ${Object.keys(newSlots).length} new slots`);
	for (const p of provenance) {
		console.log(`  ${p.pattern.padEnd(20)} w=${p.weight}  exemplar="${p.exemplar}"  <- ${p.exemplarBloc}/${p.exemplarSource}`);
	}
}

main();
