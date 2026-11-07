import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commentSpans, parseMarkdown } from "../markdownTree";
import { stripForCounting } from "../wordCount";

/**
 * Brief 20, ruling on the word count: it stays a regex, and this checks it against the parser's comment
 * spans. Where they differ the difference is listed here, not hidden: the regex (a closed `<!-- … -->`
 * anywhere) strips what the parser calls code, and leaves an unclosed `<!--` that the parser reads as a
 * comment running to the end of the document.
 */
const strippedByParser = (text: string): string => {
	let out = "";
	let at = 0;
	for (const s of commentSpans(parseMarkdown(text))) {
		out += text.slice(at, s.from);
		at = s.to;
	}
	return out + text.slice(at);
};
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** The count strips frontmatter first; the parser is given the body only, as the editor is. */
const body = (text: string): string => {
	if (!text.startsWith("---")) return text;
	const end = text.indexOf("\n---", 3);
	if (end === -1) return text;
	const after = text.indexOf("\n", end + 1);
	return after === -1 ? "" : text.slice(after + 1);
};
const agrees = (text: string) => squash(stripForCounting(text)) === squash(strippedByParser(body(text)));

const SAMPLES: Record<string, { text: string; agree: boolean }> = {
	"inline": { text: "a <!-- x --> b", agree: true },
	"multi-line block": { text: "<!-- x\ny -->\nafter", agree: true },
	"two comments": { text: "a <!-- 1 --> b <!-- 2 --> c", agree: true },
	"none": { text: "no comments here", agree: true },
	"inside inline code": { text: "`<!-- c -->` x", agree: false },
	"inside a fence": { text: "```\n<!-- c -->\n```\nz", agree: false },
	"unclosed block comment": { text: "<!-- unclosed\nmore words", agree: false },
	"unclosed inline comment": { text: "text <!-- open\nstill\n\npara", agree: true },
};

describe("the word count's comment strip against the parser", () => {
	for (const [name, { text, agree }] of Object.entries(SAMPLES)) {
		it(`${name}: ${agree ? "agree" : "a listed disagreement"}`, () => expect(agrees(text)).toBe(agree));
	}

	it("agrees on every markdown file in the fixtures, and any disagreement is listed", () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const p = join(dir, name);
				if (statSync(p).isDirectory()) walk(p);
				else if (name.endsWith(".md")) files.push(p);
			}
		};
		walk("test/fixtures");
		expect(files.length).toBeGreaterThan(10);
		const disagreements = files.filter((f) => !agrees(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
		// The sidecar files' "AUTO-MAINTAINED" notice is a closed block comment on both sides; nothing else differs.
		expect(disagreements).toEqual([]);
	});
});
