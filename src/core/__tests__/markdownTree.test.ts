import { describe, expect, it } from "vitest";
import { alerts, commentSpans, parseMarkdown } from "../markdownTree";

const names = (text: string): string[] => {
	const out: string[] = [];
	parseMarkdown(text).iterate({ enter: (n) => void out.push(n.name) });
	return out;
};

describe("the footnote extension", () => {
	it("reads a reference and a definition", () => {
		expect(names("Text[^1].\n\n[^1]: the note")).toEqual(expect.arrayContaining(["FootnoteReference", "FootnoteDefinition", "FootnoteMark"]));
	});
	it("takes indented continuation lines into the definition", () => {
		const text = "[^a]: one\n    two\n\nafter";
		const def = [] as { from: number; to: number }[];
		parseMarkdown(text).iterate({ enter: (n) => void (n.name === "FootnoteDefinition" && def.push({ from: n.from, to: n.to })) });
		expect(text.slice(def[0].from, def[0].to)).toBe("[^a]: one\n    two");
	});
	it("leaves an ordinary bracket alone", () => {
		expect(names("a [b] c")).not.toContain("FootnoteReference");
	});
});

describe("indented text", () => {
	it("an indented paragraph after a blank line is prose, never code (decision 22)", () => {
		expect(names("First.\n\n    indented paragraph\n\n\tTabbed one")).not.toContain("CodeBlock");
	});
	it("fenced code is still code", () => {
		expect(names("```\ncode\n```")).toContain("FencedCode");
	});
});

describe("comments", () => {
	const spans = (t: string) => commentSpans(parseMarkdown(t)).map((s) => t.slice(s.from, s.to));
	it("finds inline and block HTML comments, across lines", () => {
		expect(spans("a <!-- x --> b")).toEqual(["<!-- x -->"]);
		expect(spans("<!-- x\ny -->\nafter")).toEqual(["<!-- x\ny -->"]);
	});
	it("never inside code", () => {
		expect(spans("`<!-- c -->` x")).toEqual([]);
		expect(spans("```\n<!-- c\n```\nz")).toEqual([]);
	});
	it("an unclosed block comment runs to the end; an unclosed inline one is no comment", () => {
		expect(spans("<!-- unclosed\nmore")).toEqual(["<!-- unclosed\nmore"]);
		expect(spans("text <!-- open\nstill\n\npara")).toEqual([]);
	});
});

describe("alerts: GitHub's rule", () => {
	const kinds = (t: string) => alerts(parseMarkdown(t), t).map((a) => a.kind);
	it("a top-level quote with the marker alone on its first line and a body", () => {
		expect(kinds("> [!NOTE]\n> upper")).toEqual(["note"]);
		expect(kinds("> [!note]\n> lower")).toEqual(["note"]);
		expect(kinds("> [!TIP]  \n> trailing spaces on the marker")).toEqual(["tip"]);
		for (const k of ["TIP", "IMPORTANT", "WARNING", "CAUTION"]) expect(kinds(`> [!${k}]\n> b`)).toEqual([k.toLowerCase()]);
	});
	it("everything GitHub shows as a plain quote is one here", () => {
		expect(kinds("> [!NOTE] text after\n> body")).toEqual([]);
		expect(kinds("> [!FOO]\n> unknown")).toEqual([]);
		expect(kinds("> [!TIP]")).toEqual([]);
		expect(kinds("> [!TIP]\n>")).toEqual([]);
		expect(kinds("- item\n  > [!WARNING]\n  > in a list")).toEqual([]);
		expect(kinds("> quote\n> > [!CAUTION]\n> > nested")).toEqual([]);
	});
	it("the marker's span is the marker only", () => {
		const t = "intro\n\n> [!NOTE]\n> body";
		const [a] = alerts(parseMarkdown(t), t);
		expect(t.slice(a.marker.from, a.marker.to)).toBe("[!NOTE]");
	});
});
