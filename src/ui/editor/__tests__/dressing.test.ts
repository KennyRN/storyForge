import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { parseMarkdown } from "../../../core/markdownTree";
import { toggleEmphasis } from "../dressing";
import { dressingPlan, type PlanItem } from "../dressingPlan";

/** The plan for `text`, with the caret on the line holding `caretAt` (default: nowhere, so every marker is hidden). */
const plan = (text: string, caretAt = -1): PlanItem[] => {
	const active = (pos: number): boolean => {
		if (caretAt < 0) return false;
		const a = text.lastIndexOf("\n", caretAt - 1);
		const b = text.lastIndexOf("\n", pos - 1);
		return a === b;
	};
	return dressingPlan(parseMarkdown(text), text, active);
};
const marks = (text: string, cls: string, caretAt = -1) => plan(text, caretAt).filter((i) => i.t === "mark" && cls.split(" ").every((c) => i.cls.split(" ").includes(c))).map((i) => (i as { from: number; to: number }).from === undefined ? "" : text.slice((i as { from: number }).from, (i as { to: number }).to));
const hidden = (text: string, caretAt = -1) => plan(text, caretAt).filter((i) => i.t === "hide").map((i) => text.slice((i as { from: number }).from, (i as { to: number }).to));

describe("the dressing plan: emphasis, from the parse (CommonMark's rules)", () => {
	it("finds each marker style and hides the markers", () => {
		expect(marks("a *b* c", "sf-em")).toEqual(["b"]);
		expect(marks("a _b_ c", "sf-em")).toEqual(["b"]);
		expect(marks("a **b** c", "sf-strong")).toEqual(["b"]);
		expect(marks("a __b__ c", "sf-strong")).toEqual(["b"]);
		const t = "a ***b*** c";
		expect(marks(t, "sf-em")).toEqual(["b"]); // bold italic is one span on the inner text, with both classes
		expect(marks(t, "sf-strong")).toEqual(["b"]);
		expect(marks(t, "sf-strong sf-em")).toEqual(["b"]);
		expect(marks("a _**b**_ c", "sf-strong sf-em")).toEqual(["b"]);
		expect(marks("***b*** *c*", "sf-em")).toEqual(["b", "c"]);
		expect(hidden("a **b** c")).toEqual(["**", "**"]);
	});
	it("shows the markers, muted, on the caret's line", () => {
		const t = "a **b** c\nnext";
		expect(hidden(t, 3)).toEqual([]);
		expect(marks(t, "sf-marker", 3)).toEqual(["**", "**"]);
		expect(hidden(t, 12)).toEqual(["**", "**"]);
	});
	it("leaves plain what CommonMark leaves plain", () => {
		expect(marks("a * b * c", "sf-em")).toEqual([]);
		expect(marks("snake_case_name", "sf-em")).toEqual([]);
		expect(marks("\\*not\\* em", "sf-em")).toEqual([]);
		expect(marks("`*code*` and *em*", "sf-em")).toEqual(["em"]);
		expect(marks("*open only", "sf-em")).toEqual([]);
	});
	it("allows intraword asterisks and nested emphasis", () => {
		expect(marks("un*frigging*believable", "sf-em")).toEqual(["frigging"]);
		expect(marks("**bold *ital* bold**", "sf-em")).toEqual(["ital"]);
	});
});

describe("the dressing plan: the rest of GFM", () => {
	it("headings: a line class, the marker hidden, the text styled", () => {
		const t = "## Title";
		expect(plan(t).some((i) => i.t === "line" && i.cls === "sf-heading sf-heading-2")).toBe(true);
		expect(hidden(t)).toEqual(["## "]);
		expect(marks(t, "sf-heading-text")).toEqual(["Title"]);
		expect(plan("#hashtag").some((i) => i.t === "line")).toBe(false);
	});
	it("strikethrough, inline code and links hide their markers; a link shows only its text", () => {
		expect(marks("a ~~b~~ c", "sf-strike")).toEqual(["b"]);
		expect(marks("a `b` c", "sf-code")).toEqual(["b"]);
		const link = "see [Jane](../../Codex/Jane%20Harbour.md) now";
		expect(marks(link, "sf-link")).toEqual(["Jane"]);
		expect(hidden(link)).toEqual(["[", "](../../Codex/Jane%20Harbour.md)"]);
		expect(hidden(link, 5)).toEqual([]); // the caret's line shows the whole link
	});
	it("a bracket with no target, and an image, are left as plain source", () => {
		expect(marks("[just brackets]", "sf-link")).toEqual([]);
		expect(plan("![alt](pic.png)")).toEqual([]);
	});
	it("block quotes, fenced code, scene breaks, lists and tasks", () => {
		expect(plan("> quoted").some((i) => i.t === "line" && i.cls === "sf-quote")).toBe(true);
		expect(hidden("> quoted")).toEqual(["> "]);
		expect(plan("```\ncode\n```").filter((i) => i.t === "line" && i.cls === "sf-codeblock")).toHaveLength(3);
		expect(plan("***").some((i) => i.t === "line" && i.cls === "sf-hr")).toBe(true);
		expect(plan("- item").some((i) => i.t === "widget" && i.kind === "bullet")).toBe(true);
		expect(plan("- [ ] t").some((i) => i.t === "widget" && i.kind === "task-open")).toBe(true);
		const done = "- [x] t";
		expect(plan(done).some((i) => i.t === "widget" && i.kind === "task-done")).toBe(true);
		expect(marks(done, "sf-task-done")).toEqual([" t"]);
	});
	it("tables: pipes and the alignment row are muted, the header row is marked", () => {
		const t = "|a|b|\n|-|:-:|\n|1|2|";
		expect(marks(t, "sf-table-head")).toEqual(["|a|b|"]);
		expect(marks(t, "sf-marker")).toContain("|-|:-:|".slice(0, 0) + t.slice(6, 13));
	});
	it("footnotes and HTML comments", () => {
		expect(marks("x[^1]\n\n[^1]: n", "sf-footnote-ref")).toEqual(["[^1]"]);
		expect(marks("a <!-- c --> b", "sf-comment")).toEqual(["<!-- c -->"]);
		expect(marks("`<!-- c -->`", "sf-comment")).toEqual([]);
		expect(marks("%% not a comment %%", "sf-comment")).toEqual([]);
	});
	it("an alert gets its box and its label; away from the caret the marker is the label, on it the marker shows", () => {
		const t = "> [!NOTE]\n> body";
		expect(plan(t).filter((i) => i.t === "line" && i.cls.includes("sf-alert-note"))).toHaveLength(2);
		expect(plan(t).some((i) => i.t === "alert" && i.alert === "note")).toBe(true);
		expect(plan(t, 3).some((i) => i.t === "alert")).toBe(false);
		expect(marks(t, "sf-marker", 3)).toContain("[!NOTE]");
		// GitHub's plain quotes stay plain quotes
		expect(plan("> [!NOTE] text\n> body").some((i) => i.t === "alert")).toBe(false);
		expect(plan("> [!FOO]\n> body").some((i) => i.t === "alert")).toBe(false);
	});
	it("==highlights== and [[wiki links]] are plain text now (decision 157)", () => {
		expect(plan("a ==marked== b")).toEqual([]);
		expect(plan("see [[Jane]]")).toEqual([]);
	});
	it("an indented paragraph is prose (decision 22)", () => {
		expect(plan("one\n\n    indented").some((i) => i.t === "line" && i.cls === "sf-codeblock")).toBe(false);
	});
	it("a plan never describes a change: every span lies inside the text", () => {
		const t = "# H\n\n> [!TIP]\n> **b** [a](b.md) `c` ~~d~~\n\n- [x] t\n\n|a|\n|-|\n|1|";
		for (const i of plan(t)) {
			if (i.t === "line") expect(i.at).toBeLessThanOrEqual(t.length);
			else {
				expect(i.from).toBeGreaterThanOrEqual(0);
				expect(i.to).toBeLessThanOrEqual(t.length);
				expect(i.to).toBeGreaterThanOrEqual(i.from);
			}
		}
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
