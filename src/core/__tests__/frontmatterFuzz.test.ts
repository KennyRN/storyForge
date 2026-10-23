import { describe, expect, it } from "vitest";
import { FrontmatterRoundTripError, editFrontmatter, readFrontmatter } from "../frontmatter";
import { assertMinimal, leafDiffs } from "../../../test/helpers/diskSafety";

// A small deterministic generator: random block-style YAML documents (maps, lists, scalars, comments)
// and random mutations. Every edit must read back as exactly what was asked for, and every pair the
// mutation didn't touch must keep its source text. A FrontmatterRoundTripError counts as a failure
// here: the splicer should be right for ordinary documents, not merely safe.
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

const WORDS = ["alpha", "beta", "gamma", "Book #", "x: y", "a - b", "", "42", "true", "null", "ünï", "日本語", "it's", 'say "hi"', "line"];
const KEYS = ["title", "order", "chapters", "ch-1.md", "plot", "tags", "x-unknown", "n", "pov", "k1", "k2", "k3"];

type Val = string | number | boolean | null | Val[] | { [k: string]: Val };

function genScalar(r: () => number): Val {
	const t = r();
	if (t < 0.5) return WORDS[Math.floor(r() * WORDS.length)];
	if (t < 0.7) return Math.floor(r() * 1000);
	if (t < 0.8) return r() < 0.5;
	return null;
}
function genVal(r: () => number, depth: number): Val {
	const t = r();
	if (depth >= 3 || t < 0.5) return genScalar(r);
	if (t < 0.75) return Array.from({ length: 1 + Math.floor(r() * 3) }, () => (r() < 0.7 ? genScalar(r) : genVal(r, depth + 1)));
	return genMap(r, depth + 1);
}
function genMap(r: () => number, depth: number): { [k: string]: Val } {
	const out: { [k: string]: Val } = {};
	const n = 1 + Math.floor(r() * 4);
	for (let i = 0; i < n; i++) out[KEYS[Math.floor(r() * KEYS.length)]] = genVal(r, depth);
	return out;
}

import { stringify } from "yaml";
function render(data: { [k: string]: Val }, r: () => number): string {
	// stringify, then sprinkle comments and blank lines between top-level and nested lines
	const lines = stringify(data, { indent: 2, indentSeq: true, nullStr: "" }).split("\n");
	const out: string[] = [];
	for (const line of lines) {
		if (line && r() < 0.12) out.push(`${" ".repeat(line.length - line.trimStart().length)}# a comment`);
		if (line && !line.trimStart().startsWith("-") && r() < 0.08) out.push("");
		out.push(line);
	}
	return `---\n${out.join("\n")}---\nbody text\n`.replace(/\n\n---\n/, "\n---\n");
}

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function mutate(r: () => number, data: { [k: string]: Val }): void {
	const ops = 1 + Math.floor(r() * 3);
	for (let i = 0; i < ops; i++) {
		// walk to a random map
		let node: { [k: string]: Val } = data;
		for (let d = 0; d < 3; d++) {
			const maps = Object.values(node).filter((v): v is { [k: string]: Val } => !!v && typeof v === "object" && !Array.isArray(v));
			if (maps.length && r() < 0.5) node = maps[Math.floor(r() * maps.length)];
			else break;
		}
		const keys = Object.keys(node);
		const t = r();
		if (t < 0.4 && keys.length) node[keys[Math.floor(r() * keys.length)]] = genVal(r, 2);
		else if (t < 0.7) node[KEYS[Math.floor(r() * KEYS.length)] + (r() < 0.5 ? "-new" : "")] = genVal(r, 2);
		else if (keys.length > 1) delete node[keys[Math.floor(r() * keys.length)]];
	}
}

describe("frontmatter editing, fuzzed", () => {
	it("reads back exactly what was asked for across 3000 random documents and mutations", () => {
		const failures: string[] = [];
		let edited = 0;
		for (let seed = 1; seed <= 3000; seed++) {
			const r = rng(seed);
			const data = genMap(r, 1);
			const text = render(data, r);
			const before = readFrontmatter(text);
			if (before.state !== "ok") continue;
			const wanted = clone(before.data) as { [k: string]: Val };
			mutate(r, wanted);
			try {
				const out = editFrontmatter(text, (fm) => {
					for (const k of Object.keys(fm)) delete fm[k];
					Object.assign(fm, clone(wanted));
				});
				const after = readFrontmatter(out);
				expect(after.state === "ok" && after.data).toEqual(wanted);
				expect(out.endsWith("---\nbody text\n")).toBe(true);
				// everything the mutation didn't touch keeps its exact source text
				assertMinimal(`seed ${seed}`, text, out, { format: "frontmatter", touched: leafDiffs(before.data, wanted) });
				edited++;
			} catch (err) {
				if (err instanceof FrontmatterRoundTripError) failures.push(`seed ${seed}: ${err.message}\n${JSON.stringify(text)}\n=> ${JSON.stringify(wanted)}`);
				else throw err;
			}
		}
		expect(failures.slice(0, 3).join("\n\n"), `${failures.length} round-trip failures`).toBe("");
		expect(edited).toBeGreaterThan(2000);
	});
});

describe("frontmatter editing, fuzzed with CRLF files", () => {
	it("keeps CRLF throughout 1000 random documents and mutations", () => {
		let edited = 0;
		for (let seed = 5001; seed <= 6000; seed++) {
			const r = rng(seed);
			const data = genMap(r, 1);
			const text = render(data, r).replace(/\n/g, "\r\n");
			const before = readFrontmatter(text);
			if (before.state !== "ok") continue;
			const wanted = clone(before.data) as { [k: string]: Val };
			mutate(r, wanted);
			const out = editFrontmatter(text, (fm) => {
				for (const k of Object.keys(fm)) delete fm[k];
				Object.assign(fm, clone(wanted));
			});
			expect(out.replace(/\r\n/g, ""), `seed ${seed}: bare \\n in a CRLF file`).not.toContain("\n");
			const after = readFrontmatter(out);
			expect(after.state === "ok" && after.data).toEqual(wanted);
			assertMinimal(`seed ${seed}`, text, out, { format: "frontmatter", touched: leafDiffs(before.data, wanted) });
			edited++;
		}
		expect(edited).toBeGreaterThan(700);
	});
});
