import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { scanComments, scanEmphasis, scanHeading, scanHighlights, toggleEmphasis } from "../dressing";

const spans = (line: string) => scanEmphasis(line).map((s) => [s.kind, line.slice(s.from, s.to)]);

describe("scanEmphasis", () => {
	it("finds each marker style", () => {
		expect(spans("a *b* c")).toEqual([["em", "*b*"]]);
		expect(spans("a _b_ c")).toEqual([["em", "_b_"]]);
		expect(spans("a **b** c")).toEqual([["strong", "**b**"]]);
		expect(spans("a __b__ c")).toEqual([["strong", "__b__"]]);
		expect(spans("a ***b*** c")).toEqual([["strong-em", "***b***"]]);
	});

	it("finds several on a line, and emphasis nested inside", () => {
		expect(spans("*one* and *two*")).toEqual([
			["em", "*one*"],
			["em", "*two*"],
		]);
		expect(spans("**bold *ital* bold**")).toEqual([
			["strong", "**bold *ital* bold**"],
			["em", "*ital*"],
		]);
	});

	it("needs non-space just inside both markers", () => {
		expect(spans("a * b * c")).toEqual([]);
		expect(spans("2 * 3 = 6 * 1")).toEqual([]);
		expect(spans("*a *")).toEqual([]);
	});

	it("leaves intraword underscores alone but allows intraword asterisks", () => {
		expect(spans("snake_case_name")).toEqual([]);
		expect(spans("un*frigging*believable")).toEqual([["em", "*frigging*"]]);
	});

	it("skips escaped markers and code spans", () => {
		expect(spans("\\*not\\* em")).toEqual([]);
		expect(spans("`*code*` and *em*")).toEqual([["em", "*em*"]]);
	});

	it("leaves an unclosed marker as plain text", () => {
		expect(spans("*open only")).toEqual([]);
		expect(spans("**open *em*")).toEqual([["em", "*em*"]]);
	});
});

describe("scanHeading", () => {
	it("recognises 1–6 hashes followed by a space", () => {
		expect(scanHeading("# Title")).toEqual({ level: 1, markerEnd: 2 });
		expect(scanHeading("###### Six")).toEqual({ level: 6, markerEnd: 7 });
		expect(scanHeading("#hashtag")).toBeNull();
		expect(scanHeading("####### seven")).toBeNull();
		expect(scanHeading(" # indented")).toBeNull();
	});
});

describe("scanComments", () => {
	it("finds inline and multi-line comments, and an unclosed one runs to the end", () => {
		const text = "a %%x%% b\n%%\nmulti\n%% c %%open";
		expect(scanComments(text).map((c) => text.slice(c.from, c.to))).toEqual(["%%x%%", "%%\nmulti\n%%", "%%open"]);
	});
});

describe("toggleEmphasis", () => {
	function run(doc: string, from: number, to: number, marker: "**" | "*") {
		const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
		const next = state.update(toggleEmphasis(state, marker)).state;
		const sel = next.selection.main;
		return { doc: next.doc.toString(), selected: next.doc.sliceString(sel.from, sel.to) };
	}

	it("wraps a selection and keeps it selected", () => {
		expect(run("a word here", 2, 6, "**")).toEqual({ doc: "a **word** here", selected: "word" });
		expect(run("a word here", 2, 6, "*")).toEqual({ doc: "a *word* here", selected: "word" });
	});

	it("unwraps when the markers sit just outside or just inside the selection", () => {
		expect(run("a **word** here", 4, 8, "**")).toEqual({ doc: "a word here", selected: "word" });
		expect(run("a **word** here", 2, 10, "**")).toEqual({ doc: "a word here", selected: "word" });
		expect(run("a *word* here", 3, 7, "*")).toEqual({ doc: "a word here", selected: "word" });
	});

	it("does not take half of a bold marker for an italic one", () => {
		expect(run("a **word** here", 4, 8, "*")).toEqual({ doc: "a ***word*** here", selected: "word" });
	});

	it("inserts a pair with the caret between for an empty selection", () => {
		const state = EditorState.create({ doc: "ab", selection: EditorSelection.cursor(1) });
		const next = state.update(toggleEmphasis(state, "*")).state;
		expect(next.doc.toString()).toBe("a**b");
		expect(next.selection.main.head).toBe(2);
	});
});

// ==highlight== (Brief 17). Only the plain `==x==` is confirmed against Obsidian (Kenny); the rest are the proposed rules, unconfirmed (docs/colours.md §4).
const marks = (line: string) => scanHighlights(line).map((h) => line.slice(h.from, h.to));
describe("scanHighlights", () => {
	it("finds ==x==, several on a line, and none where there isn't one", () => {
		expect(marks("a ==b== c")).toEqual(["==b=="]);
		expect(marks("==one== and ==two==")).toEqual(["==one==", "==two=="]);
		expect(marks("no highlight, a = b == c")).toEqual([]);
		expect(marks("")).toEqual([]);
	});

	it("needs non-space just inside both markers, and something inside", () => {
		expect(marks("== a ==")).toEqual([]);
		expect(marks("==a ==")).toEqual([]);
		expect(marks("== a==")).toEqual([]);
		expect(marks("====")).toEqual([]);
		expect(marks("==a b c==")).toEqual(["==a b c=="]);
	});

	it("three or more equals signs don't open or close one", () => {
		expect(marks("===a===")).toEqual([]);
		expect(marks("==a===")).toEqual([]);
		expect(marks("a ==b== ==c==")).toEqual(["==b==", "==c=="]);
	});

	it("==a==b== highlights ==a== only, with b== plain (docs/colours.md §4 case 3, confirmed against Obsidian on 7 November 2026)", () => {
		expect(marks("==a==b==")).toEqual(["==a=="]);
		expect(marks("x ==a==b== y")).toEqual(["==a=="]);
	});

	it("emphasis may sit inside, and touch, a highlight", () => {
		expect(marks("==**a**==")).toEqual(["==**a**=="]);
		expect(marks("==a *b* c==")).toEqual(["==a *b* c=="]);
		expect(marks("**==a==**")).toEqual(["==a=="]);
		expect(spans("==**a**==")).toEqual([["strong", "**a**"]]); // the emphasis is still found inside
	});

	it("is not inside code, a link or a URL", () => {
		expect(marks("`==a==`")).toEqual([]);
		expect(marks("[[x==a==y]]")).toEqual([]);
		expect(marks("see https://example.com/a==b==c now")).toEqual([]);
		expect(marks("`code` and ==real==")).toEqual(["==real=="]);
	});

	it("is on one line: an opening with no closing on its line is nothing", () => {
		expect(marks("==never closed")).toEqual([]);
		expect(marks("closed ==x== then ==open")).toEqual(["==x=="]);
	});
});
