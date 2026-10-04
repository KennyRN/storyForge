import { describe, expect, it } from "vitest";
import { generateOne, validateSpec } from "../engine/generate.js";
import { parseCompactEntry } from "../engine/lexicon.js";
import { inventName, MIN_NAME_LENGTH, MIN_NAME_SOURCES, withNameSources } from "../engine/names.js";
import { createRng } from "../engine/rng.js";
import { renderTemplate } from "../engine/template.js";
import type { GeneratorSpec, Lexeme } from "../engine/types.js";
import { NAME_REGISTERS } from "../lexicons/nameRegisters.js";
import { titleComposerLexicon } from "../lexicons/titleComposer.js";
import { westernSerialLexicon } from "../lexicons/westernSerial.js";

/** Edit distance, for the "never within one edit of a source" guarantee. */
function distance(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
	}
	return d[a.length][b.length];
}

describe("inventName", () => {
	const fantasy = NAME_REGISTERS.fantasy;

	it("is deterministic per seed", () => {
		expect(inventName(fantasy, 42)).toBe(inventName(fantasy, 42));
	});

	it("never reproduces a source, or comes within one edit of one, and stays in the length band", () => {
		for (const gen of Object.values(NAME_REGISTERS)) {
			const sources = gen.sources.map((s) => s.toLowerCase());
			for (let seed = 1; seed <= 40; seed++) {
				const name = inventName(gen, seed * 7919);
				if (name === undefined) continue;
				expect(name.length).toBeGreaterThanOrEqual(MIN_NAME_LENGTH);
				for (const s of sources) expect(distance(name.toLowerCase(), s)).toBeGreaterThan(1);
			}
		}
	});

	it("produces varied names, not one name over and over", () => {
		const names = new Set<string>();
		for (let seed = 1; seed <= 40; seed++) names.add(inventName(NAME_REGISTERS.hero, seed * 7919) ?? "");
		expect(names.size).toBeGreaterThan(25);
	});

	it("refuses a register with too few sources", () => {
		expect(inventName({ label: "thin", sources: ["Ann", "Bob"] }, 1)).toBeUndefined();
	});
});

describe("withNameSources (the writer's nameForge packs)", () => {
	const enough = Array.from({ length: MIN_NAME_SOURCES }, (_, i) => `Elvenname${i}`);

	it("swaps a register's sources without mutating the spec", () => {
		const swapped = withNameSources(titleComposerLexicon, { fantasy: enough });
		expect(swapped.nameGenerators!.fantasy.sources).toEqual(enough);
		expect(titleComposerLexicon.nameGenerators!.fantasy.sources).toBe(NAME_REGISTERS.fantasy.sources);
	});

	it("keeps built-in sources for a pack that's too small or a register that doesn't exist", () => {
		expect(withNameSources(titleComposerLexicon, { fantasy: ["Ann"], nope: enough })).toBe(titleComposerLexicon);
	});
});

describe("@register entries", () => {
	it("parse to a generator id", () => {
		expect(parseCompactEntry("@fantasy #epic")).toEqual({ gloss: "@fantasy", generator: "fantasy", tags: ["epic"] });
	});

	it("indexed tokens echo one name, different indices get different names", () => {
		const lexemes: Record<string, Lexeme[]> = { name: [{ gloss: "@x", generator: "x" }] };
		let n = 0;
		const invent = () => `Name${n++ % 3}`;
		expect(renderTemplate(createRng(1), "{name#1} and {name#1}", lexemes, undefined, invent)).toBe("Name0 and Name0");
		const out = renderTemplate(createRng(1), "{name#1} & {name#2}", lexemes, undefined, invent);
		const [a, b] = out.split(" & ");
		expect(a).not.toBe(b);
	});

	it("validateSpec flags an unknown register and a thin one", () => {
		const spec: GeneratorSpec = {
			...titleComposerLexicon,
			lexicon: { ...titleComposerLexicon.lexicon, name: ["@nope #lit"] },
			nameGenerators: { thin: { label: "Thin", sources: ["Ann"] } },
		};
		const problems = validateSpec(spec).join("\n");
		expect(problems).toContain('"@nope" names an unknown name register');
		expect(problems).toContain('name register "thin" has 1 sources');
	});

	it("no shipped title uses a name the lexicons used to list verbatim", () => {
		const scraped = ["Adam", "Andy", "Amelia", "Chloe", "Clara", "Teren", "Jake", "Derek", "Nyx", "Yona"];
		for (let seed = 1; seed <= 200; seed++) {
			const title = generateOne(westernSerialLexicon, { pattern: "name-anchor", seed }).title;
			for (const name of scraped) expect(title.split(/\W+/)).not.toContain(name);
		}
	});
});
