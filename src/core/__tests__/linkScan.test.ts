import { describe, expect, it } from "vitest";
import { protectedRanges, scanLinks } from "../linkScan";

const targets = (text: string) => scanLinks(text).map((l) => [l.form, l.target]);

describe("scanLinks: the forms", () => {
	it("wikilinks with heading, block, display text and combinations", () => {
		expect(targets("[[Jane]] [[Jane|J]] [[Jane#Early life]] [[Jane#^abc123]] [[Jane#Early life|her]] [[Jane#^abc|b]]")).toEqual([
			["wikilink", "Jane"], ["wikilink", "Jane"], ["wikilink", "Jane"], ["wikilink", "Jane"], ["wikilink", "Jane"], ["wikilink", "Jane"],
		]);
	});
	it("embeds in every variant", () => {
		expect(targets("![[Jane]] ![[Jane|200]] ![[Jane#Heading]] ![[Jane#^b]]")).toEqual([["embed", "Jane"], ["embed", "Jane"], ["embed", "Jane"], ["embed", "Jane"]]);
		expect(scanLinks("see ![[Jane]]")[0].start).toBe(4);
	});
	it("path-qualified forms, with or without .md", () => {
		expect(targets("[[Codex/Jane]] [[Codex/Jane.md]] [[Codex/Jane.md|x]] [[Codex/Jane#h]]")).toEqual([
			["wikilink", "Codex/Jane"], ["wikilink", "Codex/Jane.md"], ["wikilink", "Codex/Jane.md"], ["wikilink", "Codex/Jane"],
		]);
	});
	it("markdown links, encoded spaces, angle brackets, titles, fragments, images", () => {
		const text = '[a](Codex/Jane.md) [b](Codex/Jane%20Doe.md) [c](<Codex/Jane Doe.md>) [d](Codex/Jane.md "title") [e](Codex/Jane.md#Heading) ![f](Codex/Jane.md) [g](https://example.com/a(b)c)';
		const found = scanLinks(text);
		expect(found.map((l) => [l.form, l.target])).toEqual([
			["markdown", "Codex/Jane.md"], ["markdown", "Codex/Jane%20Doe.md"], ["markdown", "Codex/Jane Doe.md"], ["markdown", "Codex/Jane.md"],
			["markdown", "Codex/Jane.md#Heading"], ["markdown-embed", "Codex/Jane.md"], ["markdown", "https://example.com/a(b)c"],
		]);
		expect(found[2].angle).toBe(true);
		for (const l of found) expect(text.slice(l.targetStart, l.targetEnd)).toBe(l.target);
	});
	it("finds a wikilink inside the text of a markdown link", () => {
		expect(targets("[see [[Jane]] here](Codex/Other.md)").map((t) => t[1])).toEqual(["Codex/Other.md", "Jane"]);
	});
	it("an escaped pipe inside a table ends the target before the backslash", () => {
		const [l] = scanLinks("| [[Jane\\|J]] |");
		expect(l.target).toBe("Jane");
	});
	it("offsets are exact", () => {
		const text = "a [[Codex/Jane.md#h|x]] b";
		const [l] = scanLinks(text);
		expect(text.slice(l.start, l.end)).toBe("[[Codex/Jane.md#h|x]]");
		expect(text.slice(l.targetStart, l.targetEnd)).toBe("Codex/Jane.md");
	});
	it("ignores things that are not links", () => {
		expect(targets("[[]] [[ ]] [[a\nb]] [x] (Codex/Jane.md) [[unclosed [text](")).toEqual([]);
	});
});

describe("scanLinks: what never counts", () => {
	it("fenced code blocks, with ``` and ~~~, and longer closing fences", () => {
		expect(targets("before [[A]]\n```\n[[B]]\n```\nafter [[C]]\n~~~md\n[[D]]\n~~~\n````\n[[E]]\n```\n[[F]]\n````\n[[G]]")).toEqual([
			["wikilink", "A"], ["wikilink", "C"], ["wikilink", "G"],
		]);
	});
	it("fences in a file with CRLF line endings close properly", () => {
		expect(targets("[[A]]\r\n```\r\n[[B]]\r\n```\r\n[[C]]\r\n~~~\r\n[[D]]\r\n~~~\r\n[[E]]")).toEqual([["wikilink", "A"], ["wikilink", "C"], ["wikilink", "E"]]);
	});
	it("an unclosed fence protects the rest of the text", () => {
		expect(targets("[[A]]\n```\n[[B]]\n[[C]]")).toEqual([["wikilink", "A"]]);
	});
	it("fences inside lists and block quotes", () => {
		expect(targets("> ```\n> [[A]]\n> ```\n[[B]]\n    ```\n    [[C]]\n    ```\n[[D]]")).toEqual([["wikilink", "B"], ["wikilink", "D"]]);
	});
	it("inline code, with longer backtick runs, and an unmatched backtick", () => {
		expect(targets("`[[A]]` [[B]] ``[[C]] ` [[D]]`` [[E]] ` lone [[F]]")).toEqual([["wikilink", "B"], ["wikilink", "E"], ["wikilink", "F"]]);
	});
	it("inline code does not run across a blank line", () => {
		expect(targets("`open [[A]]\n\nclose` [[B]]")).toEqual([["wikilink", "A"], ["wikilink", "B"]]);
	});
	it("%% comments %%, single and multi-line, and an unclosed comment", () => {
		expect(targets("[[A]] %% [[B]] %% [[C]] %%\n[[D]]\n%% [[E]]")).toEqual([["wikilink", "A"], ["wikilink", "C"], ["wikilink", "E"]]);
		expect(targets("%% a\n[[X]]\n%% [[Y]]")).toEqual([["wikilink", "Y"]]);
	});
	it("backticks inside a comment, and comment markers inside code, don't start the other", () => {
		expect(targets("%% ` %% [[A]] ` [[B]]")).toEqual([["wikilink", "A"], ["wikilink", "B"]]); // the comment hid the first backtick, so the second is alone
		expect(targets("`%%` [[A]] %% x %% [[B]]")).toEqual([["wikilink", "A"], ["wikilink", "B"]]);
	});
	it("a link may not run into protected text", () => {
		expect(targets("[[Jane `code]]`")).toEqual([]);
		expect(targets("[t](Codex/Jane.md `x`)")).toEqual([]);
	});
	it("can scan a non-markdown string without protection", () => {
		expect(scanLinks("`[[A]]`", { protect: false }).map((l) => l.target)).toEqual(["A"]);
		expect(protectedRanges("no code here")).toEqual([]);
	});
});
