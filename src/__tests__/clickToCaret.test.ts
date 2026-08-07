import { describe, expect, it } from "vitest";
import { buildRenderedMapping, renderedOffsetToSourceOffset, splitIntoBlocks, splitListBlockIntoItems } from "../clickToCaret";

describe("buildRenderedMapping — plain text", () => {
	it("maps a plain sentence 1:1", () => {
		const { renderedText, sourceOffsets } = buildRenderedMapping("Hello world");
		expect(renderedText).toBe("Hello world");
		expect(sourceOffsets).toEqual([...Array(11).keys()]);
	});
});

describe("buildRenderedMapping — emphasis", () => {
	it("strips ** bold markers and maps the inner text back to its source position", () => {
		const source = "She said **hello** to him";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("She said hello to him");
		// "hello" in rendered text starts at index 9; in source it starts after "She said **" (index 11).
		const helloRenderedIndex = renderedText.indexOf("hello");
		expect(sourceOffsets[helloRenderedIndex]).toBe(source.indexOf("hello"));
	});

	it("strips __ bold markers the same way as **", () => {
		const source = "a __b__ c";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("a b c");
		expect(sourceOffsets[renderedText.indexOf("b")]).toBe(source.indexOf("b"));
	});

	it("strips single * italic markers without eating list bullets", () => {
		const source = "an *italic* word";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("an italic word");
		expect(sourceOffsets[renderedText.indexOf("italic")]).toBe(source.indexOf("italic"));
	});

	it("strips single _ italic markers", () => {
		const source = "an _italic_ word";
		const { renderedText } = buildRenderedMapping(source);
		expect(renderedText).toBe("an italic word");
	});

	it("strips ~~ strikethrough markers", () => {
		const source = "not ~~deleted~~ text";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("not deleted text");
		expect(sourceOffsets[renderedText.indexOf("deleted")]).toBe(source.indexOf("deleted"));
	});

	it("handles nested emphasis (bold inside italic)", () => {
		const source = "*italic **bold** end*";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("italic bold end");
		expect(sourceOffsets[renderedText.indexOf("bold")]).toBe(source.indexOf("bold"));
	});
});

describe("buildRenderedMapping — wikilinks", () => {
	it("renders a bare wikilink as its target", () => {
		const source = "He walked to [[The Old Mill]] at dusk";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("He walked to The Old Mill at dusk");
		const targetIndex = renderedText.indexOf("The Old Mill");
		expect(sourceOffsets[targetIndex]).toBe(source.indexOf("The Old Mill"));
	});

	it("renders a piped wikilink as its display text, not its target", () => {
		const source = "He walked to [[The Old Mill|the mill]] at dusk";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("He walked to the mill at dusk");
		expect(renderedText).not.toContain("The Old Mill");
		const displayIndex = renderedText.indexOf("the mill");
		expect(sourceOffsets[displayIndex]).toBe(source.indexOf("the mill"));
	});

	it("renders a markdown link as its link text, not its url", () => {
		const source = "See [the article](https://example.com/article) for more";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("See the article for more");
		const textIndex = renderedText.indexOf("the article");
		expect(sourceOffsets[textIndex]).toBe(source.indexOf("the article"));
	});
});

describe("buildRenderedMapping — inline code", () => {
	it("strips backticks but keeps the code content verbatim", () => {
		const source = "run `npm test` first";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("run npm test first");
		expect(sourceOffsets[renderedText.indexOf("npm test")]).toBe(source.indexOf("npm test"));
	});
});

describe("buildRenderedMapping — leading block markers", () => {
	it("strips a heading's leading hashes", () => {
		const source = "## Chapter title";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("Chapter title");
		expect(sourceOffsets[0]).toBe(source.indexOf("Chapter"));
	});

	it("strips an unordered list bullet", () => {
		const source = "- first item";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("first item");
		expect(sourceOffsets[0]).toBe(source.indexOf("first"));
	});

	it("strips an ordered list marker", () => {
		const source = "1. first item";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("first item");
		expect(sourceOffsets[0]).toBe(source.indexOf("first"));
	});

	it("strips a blockquote marker", () => {
		const source = "> a quoted line";
		const { renderedText, sourceOffsets } = buildRenderedMapping(source);
		expect(renderedText).toBe("a quoted line");
	});
});

describe("renderedOffsetToSourceOffset", () => {
	it("maps a mid-word click through a bold span to the right source character", () => {
		const source = "She said **hello** to him";
		const renderedText = buildRenderedMapping(source).renderedText;
		const clickIndex = renderedText.indexOf("hello") + 2; // clicks between 'e' and 'l'
		const result = renderedOffsetToSourceOffset(source, clickIndex);
		expect(source[result]).toBe(renderedText[clickIndex]);
	});

	it("maps a click on a piped wikilink's display text back into the display span, not the target", () => {
		const source = "[[The Old Mill|the mill]] stood there";
		const renderedText = buildRenderedMapping(source).renderedText;
		const clickIndex = renderedText.indexOf("mill"); // within "the mill"
		const result = renderedOffsetToSourceOffset(source, clickIndex);
		expect(result).toBeGreaterThanOrEqual(source.indexOf("|") + 1);
		expect(result).toBeLessThan(source.indexOf("]]"));
	});

	it("clamps to the first source character when the offset is before the block", () => {
		const source = "## Chapter title";
		expect(renderedOffsetToSourceOffset(source, -5)).toBe(source.indexOf("Chapter"));
	});

	it("clamps to just past the last source character when the offset is past the end", () => {
		const source = "a plain sentence";
		expect(renderedOffsetToSourceOffset(source, 999)).toBe(source.length);
	});

	it("round-trips every position in a plain sentence exactly", () => {
		const source = "the quick brown fox";
		for (let i = 0; i <= source.length; i++) {
			expect(renderedOffsetToSourceOffset(source, i)).toBe(i);
		}
	});
});

describe("splitIntoBlocks", () => {
	it("splits paragraphs separated by a blank line", () => {
		const source = "First paragraph.\n\nSecond paragraph.";
		const blocks = splitIntoBlocks(source);
		expect(blocks.map((b) => b.text)).toEqual(["First paragraph.", "Second paragraph."]);
		expect(blocks[1].start).toBe(source.indexOf("Second"));
	});

	it("treats a heading as its own block", () => {
		const source = "## A heading\n\nA paragraph.";
		const blocks = splitIntoBlocks(source);
		expect(blocks[0].text).toBe("## A heading");
		expect(blocks[1].text).toBe("A paragraph.");
	});

	it("keeps a run of consecutive list lines as a single block", () => {
		const source = "- one\n- two\n- three\n\nAfter the list.";
		const blocks = splitIntoBlocks(source);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].text).toBe("- one\n- two\n- three");
		expect(blocks[1].text).toBe("After the list.");
	});

	it("tolerates multiple blank lines between blocks", () => {
		const source = "First.\n\n\n\nSecond.";
		const blocks = splitIntoBlocks(source);
		expect(blocks.map((b) => b.text)).toEqual(["First.", "Second."]);
	});

	it("skips leading/trailing blank runs without producing empty blocks", () => {
		const source = "\n\nOnly paragraph.\n\n";
		const blocks = splitIntoBlocks(source);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].text).toBe("Only paragraph.");
	});
});

describe("splitListBlockIntoItems", () => {
	it("splits a simple list block into one item per line", () => {
		const blockText = "- one\n- two\n- three";
		const items = splitListBlockIntoItems(blockText);
		expect(items.map((i) => i.text)).toEqual(["- one", "- two", "- three"]);
		expect(items[1].start).toBe(blockText.indexOf("- two"));
		expect(items[2].start).toBe(blockText.indexOf("- three"));
	});

	it("splits an ordered list block", () => {
		const blockText = "1. first\n2. second";
		const items = splitListBlockIntoItems(blockText);
		expect(items.map((i) => i.text)).toEqual(["1. first", "2. second"]);
	});
});
