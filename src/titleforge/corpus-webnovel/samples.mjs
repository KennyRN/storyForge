import { readFileSync, writeFileSync } from "node:fs";
import * as genMod from "../engine/generate.ts";
import * as wsMod from "../lexicons/westernSerial.ts";
const gen = genMod.default ?? genMod;
const { generateOne } = gen;
const spec = structuredClone((wsMod.default ?? wsMod).westernSerialLexicon);
const derived = JSON.parse(readFileSync(new URL("./derived-patterns.json", import.meta.url), "utf8"));
for (const p of derived.patterns) spec.patterns.push(p);
for (const [s, g] of Object.entries(derived.newSlots)) spec.lexicon[s] = g;
spec.platforms.push(...(derived.newPlatforms ?? []).filter(np => !spec.platforms.some(p=>p.id===np.id)));

let md = "# New-pattern sample output (for QA review)\n\n";
for (const p of derived.patterns) {
  md += `## ${p.id}  (weight ${p.weight})\n_${p.note}_\n\nExemplar: *${p.exemplar}*\n\n`;
  const seen = new Set();
  for (let seed = 1; seed <= 200 && seen.size < 10; seed++) {
    const r = generateOne(spec, { pattern: p.id, seed });
    if (r.title) seen.add(r.title);
  }
  md += [...seen].map(t => `- ${t}`).join("\n") + "\n\n";
}
writeFileSync(new URL("./SAMPLES.md", import.meta.url), md);
console.log(md);
