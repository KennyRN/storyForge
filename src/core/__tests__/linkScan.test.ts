import { describe, expect, it } from "vitest";
import { protectedRanges, scanLinks } from "../linkScan";

const targets = (text: string) => scanLinks(text).map((l) => [l.form, l.target]);
const L = (name: string) => `[x](Codex/${name}.md)`;

describe("scanLinks: the forms", () => {
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
	it("relative paths, as the Codex links are written from a chapter, a note and a field", () => {
		expect(targets("[a](../../Codex/Jane%20Harbour.md) [b](Jane.md) [c](../Codex/Jane.md)").map((t) => t[1])).toEqual(["../../Codex/Jane%20Harbour.md", "Jane.md", "../Codex/Jane.md"]);
	});
	it("the link's text is found, and its offsets are exact", () => {
		const text = "see [Jane Harbour](../../Codex/Jane%20Harbour.md) now";
		const [l] = scanLinks(text);
		expect(text.slice(l.textStart, l.textEnd)).toBe("Jane Harbour");
		expect(text.slice(l.start, l.end)).toBe("[Jane Harbour](../../Codex/Jane%20Harbour.md)");
		expect(text.slice(l.targetStart, l.targetEnd)).toBe("../../Codex/Jane%20Harbour.md");
	});
	it("finds a link inside the text of another", () => {
		expect(targets("[see [x](Codex/Jane.md) here](Codex/Other.md)").map((t) => t[1])).toEqual(["Codex/Other.md", "Codex/Jane.md"]);
	});
	it("[[wiki links]] and ![[embeds]] are plain text now (decision 157): never found", () => {
		expect(targets("[[Jane]] ![[Jane]] [[Codex/Jane.md|x]] ![[a.png]]")).toEqual([]);
	});
	it("ignores things that are not links", () => {
		expect(targets("[[]] [ ] [a\nb](x.md) [x] (Codex/Jane.md) [text](")).toEqual([]);
	});
});

describe("scanLinks: what never counts", () => {
	it("fenced code blocks, with ``` and ~~~, and longer closing fences", () => {
		expect(targets(`before ${L("A")}\n\`\`\`\n${L("B")}\n\`\`\`\nafter ${L("C")}\n~~~md\n${L("D")}\n~~~\n\`\`\`\`\n${L("E")}\n\`\`\`\n${L("F")}\n\`\`\`\`\n${L("G")}`).map((t) => t[1])).toEqual(["Codex/A.md", "Codex/C.md", "Codex/G.md"]);
	});
	it("fences in a file with CRLF line endings close properly", () => {
		expect(targets(`${L("A")}\r\n\`\`\`\r\n${L("B")}\r\n\`\`\`\r\n${L("C")}\r\n~~~\r\n${L("D")}\r\n~~~\r\n${L("E")}`).map((t) => t[1])).toEqual(["Codex/A.md", "Codex/C.md", "Codex/E.md"]);
	});
	it("an unclosed fence protects the rest of the text", () => {
		expect(targets(`${L("A")}\n\`\`\`\n${L("B")}\n${L("C")}`).map((t) => t[1])).toEqual(["Codex/A.md"]);
	});
	it("fences inside lists and block quotes", () => {
		expect(targets(`> \`\`\`\n> ${L("A")}\n> \`\`\`\n${L("B")}\n    \`\`\`\n    ${L("C")}\n    \`\`\`\n${L("D")}`).map((t) => t[1])).toEqual(["Codex/B.md", "Codex/D.md"]);
	});
	it("inline code, with longer backtick runs, and an unmatched backtick", () => {
		expect(targets(`\`${L("A")}\` ${L("B")} \`\`${L("C")} \` ${L("D")}\`\` ${L("E")} \` lone ${L("F")}`).map((t) => t[1])).toEqual(["Codex/B.md", "Codex/E.md", "Codex/F.md"]);
	});
	it("inline code does not run across a blank line", () => {
		expect(targets(`\`open ${L("A")}\n\nclose\` ${L("B")}`).map((t) => t[1])).toEqual(["Codex/A.md", "Codex/B.md"]);
	});
	it("<!-- HTML comments -->, single and multi-line, and an unclosed comment", () => {
		expect(targets(`${L("A")} <!-- ${L("B")} --> ${L("C")} <!--\n${L("D")}\n${L("E")}`).map((t) => t[1])).toEqual(["Codex/A.md", "Codex/C.md"]);
		expect(targets(`<!-- a\n${L("X")}\n--> ${L("Y")}`).map((t) => t[1])).toEqual(["Codex/Y.md"]);
	});
	it("%% is no longer a comment (decision 157): a link between %% markers counts", () => {
		expect(targets(`%% ${L("A")} %%`).map((t) => t[1])).toEqual(["Codex/A.md"]);
	});
	it("a link may not run into protected text", () => {
		expect(targets("[t `code](Codex/Jane.md)`")).toEqual([]);
		expect(targets("[t](Codex/Jane.md `x`)")).toEqual([]);
	});
	it("can scan a non-markdown string without protection", () => {
		expect(scanLinks(`\`${L("A")}\``, { protect: false }).map((l) => l.target)).toEqual(["Codex/A.md"]);
		expect(protectedRanges("no code here")).toEqual([]);
	});
});
