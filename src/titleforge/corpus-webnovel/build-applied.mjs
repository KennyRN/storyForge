// @ts-nocheck
// Emit a fully-applied westernSerial.ts: inserts the derived patterns, slots and
// the webnovel platform into the shipped file by anchored string insertion, so
// the result is a clean, reviewable diff of the original (nothing else changes).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../lexicons/westernSerial.ts"), "utf8");
const derived = JSON.parse(readFileSync(join(here, "derived-patterns.json"), "utf8"));

const indent = (text, tabs) => text.split("\n").map((l) => (l ? "\t".repeat(tabs) + l : l)).join("\n");

// 1) patterns: insert before the patterns-array close that precedes "lexicon"
const patBlock = derived.patterns.map((p) => indent(JSON.stringify(p, null, "\t"), 2)).join(",\n");
const PAT_ANCHOR = '\n\t],\n\t"lexicon": {';
if (!src.includes(PAT_ANCHOR)) throw new Error("patterns anchor not found");
let out = src.replace(PAT_ANCHOR, `,\n${patBlock}\n\t],\n\t"lexicon": {`);

// 2) slots: insert before the lexicon-object close at end of file
const slotBlock = Object.entries(derived.newSlots)
	.map(([slot, glosses]) => `\t\t${JSON.stringify(slot)}: [\n${glosses.map((g) => `\t\t\t${JSON.stringify(g)}`).join(",\n")}\n\t\t]`)
	.join(",\n");
const SLOT_ANCHOR = "\n\t\t]\n\t}\n};";
if (!out.includes(SLOT_ANCHOR)) throw new Error("lexicon-close anchor not found");
out = out.replace(SLOT_ANCHOR, `\n\t\t],\n${slotBlock}\n\t}\n};`);

// 3) platform: add webnovel after the wattpad option
for (const pf of derived.newPlatforms ?? []) {
	const PF_ANCHOR = '\t\t{\n\t\t\t"id": "wattpad",\n\t\t\t"label": "Wattpad"\n\t\t}\n\t],';
	if (!out.includes(PF_ANCHOR)) throw new Error("platform anchor not found");
	out = out.replace(PF_ANCHOR,
		`\t\t{\n\t\t\t"id": "wattpad",\n\t\t\t"label": "Wattpad"\n\t\t},\n\t\t{\n\t\t\t"id": ${JSON.stringify(pf.id)},\n\t\t\t"label": ${JSON.stringify(pf.label)}\n\t\t}\n\t],`);
}

writeFileSync(join(here, "westernSerial.applied.ts"), out);
console.log(`wrote westernSerial.applied.ts (${out.split("\n").length} lines; +${out.split("\n").length - src.split("\n").length} vs original)`);
console.log(`inserted ${derived.patterns.length} patterns, ${Object.keys(derived.newSlots).length} slots, ${(derived.newPlatforms ?? []).length} platform(s)`);
