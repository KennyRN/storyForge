import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import {
	SEPARATOR,
	assembleManuscript,
	bodyOffsetToFileOffset,
	parseChapterFile,
	serialiseChapterFile,
	splitFrontmatter,
	validateRanges,
	type ChapterRange,
} from "../manuscript/manuscriptModel";
import { chapterIndexAt, chapterIndexNear, chaptersTouched, classifyChange, classifyEdit, separatorSpans } from "../manuscript/manuscriptBoundaries";
import { chapterRangesField, editRefused, manuscriptStateExtensions, structuralSpec } from "../manuscript/manuscriptState";

const FILES: Record<string, string> = {
	"a.md": "Alpha one.\n\nAlpha two.\n",
	"b.md": "---\ntags: [x]\n---\nBravo.",
	"c.md": "",
	"d.md": "Delta line one.\r\nDelta line two.\r\n",
};

function load(files: Record<string, string> = FILES) {
	const parsed = Object.entries(files).map(([id, raw]) => ({ id, raw, ...parseChapterFile(raw) }));
	const { text, ranges } = assembleManuscript(parsed.map(({ id, body }) => ({ id, body })));
	return { parsed, text, ranges };
}

function stateFor(files: Record<string, string> = FILES) {
	const { parsed, text, ranges } = load(files);
	const state = EditorState.create({ doc: text, extensions: [manuscriptStateExtensions(ranges), history()] });
	return { parsed, state };
}

function rangesOf(state: EditorState): readonly ChapterRange[] {
	return state.field(chapterRangesField);
}

function bodyOf(state: EditorState, id: string): string {
	const r = rangesOf(state).find((x) => x.id === id)!;
	return state.doc.sliceString(r.from, r.to);
}

function rangeOf(state: EditorState, id: string): ChapterRange {
	return rangesOf(state).find((x) => x.id === id)!;
}

describe("splitFrontmatter", () => {
	it("splits an LF and a CRLF block verbatim", () => {
		expect(splitFrontmatter("---\na: 1\n---\nbody")).toEqual({ frontmatter: "---\na: 1\n---\n", rest: "body" });
		expect(splitFrontmatter("---\r\na: 1\r\n---\r\nbody")).toEqual({ frontmatter: "---\r\na: 1\r\n---\r\n", rest: "body" });
	});

	it("handles a closing fence at end of file", () => {
		expect(splitFrontmatter("---\na: 1\n---")).toEqual({ frontmatter: "---\na: 1\n---", rest: "" });
	});

	it("treats an unclosed block, or a rule mid-file, as body", () => {
		expect(splitFrontmatter("---\na: 1\nno close")).toEqual({ frontmatter: "", rest: "---\na: 1\nno close" });
		expect(splitFrontmatter("text\n---\nmore")).toEqual({ frontmatter: "", rest: "text\n---\nmore" });
		expect(splitFrontmatter("----\nx\n---\n").frontmatter).toBe("");
	});

	it("does not take a longer rule as the closing fence", () => {
		expect(splitFrontmatter("---\na: 1\n----\nb\n---\nbody").rest).toBe("body");
	});
});

describe("§3.2 invariant 2 — byte-exact round trip", () => {
	const cases: Record<string, string> = {
		empty: "",
		"lone newline": "\n",
		"no trailing newline": "One.\n\nTwo.",
		"trailing newline": "One.\n\nTwo.\n",
		"two trailing newlines": "One.\n\n",
		crlf: "One.\r\n\r\nTwo.\r\n",
		"crlf frontmatter": "---\r\nk: v\r\n---\r\nBody.\r\n",
		"frontmatter only": "---\nk: v\n---\n",
		"frontmatter at eof": "---\nk: v\n---",
		"leading blank lines": "\n\nStart.",
		unicode: "Ça va — “quoted” 🐉\n",
	};
	for (const [name, raw] of Object.entries(cases)) {
		it(name, () => {
			const { shape, body } = parseChapterFile(raw);
			expect(body.includes("\r")).toBe(false);
			expect(serialiseChapterFile(shape, body)).toBe(raw);
		});
	}

	it("never shows frontmatter as document text", () => {
		const { text } = load();
		expect(text).not.toContain("tags:");
		expect(text).not.toContain("---");
	});

	it("restores CRLF on an edited chapter", () => {
		const { shape } = parseChapterFile("A.\r\nB.\r\n");
		expect(serialiseChapterFile(shape, "A.\nB.\nC.")).toBe("A.\r\nB.\r\nC.\r\n");
	});

	it("rebuilds every file unchanged from the assembled document", () => {
		const { parsed, text, ranges } = load();
		for (const [i, p] of parsed.entries()) {
			expect(serialiseChapterFile(p.shape, text.slice(ranges[i].from, ranges[i].to))).toBe(p.raw);
		}
	});
});

describe("§3.2 invariant 1 — ranges", () => {
	it("one contiguous range per chapter, in spine order, separated by exactly one separator", () => {
		const { text, ranges } = load();
		expect(ranges.map((r) => r.id)).toEqual(["a.md", "b.md", "c.md", "d.md"]);
		expect(validateRanges(ranges, text.length)).toBeNull();
		for (let i = 1; i < ranges.length; i++) expect(text.slice(ranges[i - 1].to, ranges[i].from)).toBe(SEPARATOR);
	});

	it("survive any sequence of in-chapter edits", () => {
		let { state } = stateFor();
		const ids = ["a.md", "b.md", "c.md", "d.md"];
		for (let n = 0; n < 60; n++) {
			const r = rangeOf(state, ids[n % ids.length]);
			const at = r.from + ((n * 7) % (r.to - r.from + 1));
			const spec: TransactionSpec =
				n % 3 === 2 && r.to > r.from ? { changes: { from: r.from, to: Math.min(r.to, r.from + 2) } } : { changes: { from: at, insert: `x${n}\n` } };
			state = state.update(spec).state;
			expect(validateRanges([...rangesOf(state)], state.doc.length)).toBeNull();
		}
	});

	it("flags broken shapes", () => {
		expect(validateRanges([{ id: "a", from: 1, to: 2 }], 2)).not.toBeNull();
		expect(validateRanges([{ id: "a", from: 0, to: 2 }, { id: "b", from: 3, to: 4 }], 4)).not.toBeNull();
		expect(validateRanges([{ id: "a", from: 0, to: 2 }], 3)).not.toBeNull();
	});
});

describe("§3.2 invariant 3 — an empty chapter is a line the caret can occupy", () => {
	it("an empty chapter is its own empty line", () => {
		const { state } = stateFor();
		const r = rangeOf(state, "c.md");
		expect(r.from).toBe(r.to);
		const line = state.doc.lineAt(r.from);
		expect(line.text).toBe("");
		expect(line.from).toBe(r.from);
	});

	it("typing into it lands in it", () => {
		const { state } = stateFor();
		const r = rangeOf(state, "c.md");
		const next = state.update({ changes: { from: r.from, insert: "Charlie." } }).state;
		expect(bodyOf(next, "c.md")).toBe("Charlie.");
		expect(bodyOf(next, "b.md")).toBe("Bravo.");
		expect(bodyOf(next, "d.md")).toBe("Delta line one.\nDelta line two.");
	});
});

describe("§3.2 invariant 4 — titles are never document text", () => {
	it("the document is exactly the bodies and separators", () => {
		const { parsed, text } = load();
		expect(text).toBe(parsed.map((p) => p.body).join(SEPARATOR));
	});
});

describe("§3.3 boundary rules", () => {
	it("typing at the end of N goes to N; at the start of N + 1 to N + 1", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const b = rangeOf(state, "b.md");
		const s1 = state.update({ changes: { from: a.to, insert: " end" } }).state;
		expect(bodyOf(s1, "a.md")).toBe("Alpha one.\n\nAlpha two. end");
		expect(bodyOf(s1, "b.md")).toBe("Bravo.");
		const s2 = state.update({ changes: { from: b.from, insert: "Start " } }).state;
		expect(bodyOf(s2, "b.md")).toBe("Start Bravo.");
		expect(bodyOf(s2, "a.md")).toBe("Alpha one.\n\nAlpha two.");
	});

	it("Enter at the end of a chapter adds a line inside that chapter", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const next = state.update({ changes: { from: a.to, insert: "\n" } }).state;
		expect(bodyOf(next, "a.md")).toBe("Alpha one.\n\nAlpha two.\n");
		expect(validateRanges([...rangesOf(next)], next.doc.length)).toBeNull();
	});

	it("Backspace at a chapter's start and Delete at a chapter's end do nothing, silently", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const b = rangeOf(state, "b.md");
		// CodeMirror widens a character delete across the atomic separator, so both keys produce
		// a delete of exactly the separator — and a plain character delete is confined to it too.
		for (const span of [
			{ from: a.to, to: b.from },
			{ from: b.from - 1, to: b.from },
			{ from: a.to, to: a.to + 1 },
		]) {
			const tr = state.update({ changes: span, userEvent: "delete.backward" });
			expect(tr.docChanged).toBe(false);
			expect(tr.effects.some((e) => e.is(editRefused))).toBe(false);
			expect(tr.state.doc.toString()).toBe(state.doc.toString());
		}
	});

	it("a change across a separator is refused whole, with the refusal flagged", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const b = rangeOf(state, "b.md");
		const tr = state.update({ changes: { from: a.to - 3, to: b.from + 2 } });
		expect(tr.docChanged).toBe(false);
		expect(tr.effects.some((e) => e.is(editRefused))).toBe(true);
	});

	it("an edit with one crossing span is refused whole, even with an allowed span alongside", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const d = rangeOf(state, "d.md");
		const tr = state.update({
			changes: [
				{ from: a.from, insert: "ok " },
				{ from: d.from - 3, to: d.from + 1 },
			],
		});
		expect(tr.docChanged).toBe(false);
	});

	it("paste lands in the chapter at the caret, whatever it contains", () => {
		const { state } = stateFor();
		const b = rangeOf(state, "b.md");
		const pasted = "Pasted.\n\n\n\nWith blank lines.\n\n";
		const next = state.update({ changes: { from: b.to, insert: pasted } }).state;
		expect(bodyOf(next, "b.md")).toBe(`Bravo.${pasted}`);
		expect(bodyOf(next, "c.md")).toBe("");
	});

	it("copying across a break yields chapters joined by a blank line, no titles", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const b = rangeOf(state, "b.md");
		expect(state.doc.sliceString(a.to - 4, b.from + 5)).toBe("two.\n\nBravo");
	});

	it("an edit of several spans inside different chapters is allowed and touches each", () => {
		const { state } = stateFor();
		const a = rangeOf(state, "a.md");
		const d = rangeOf(state, "d.md");
		const spans = [
			{ from: a.from, to: a.from },
			{ from: d.from, to: d.from + 2 },
		];
		expect(classifyEdit(rangesOf(state), spans)).toBe("allow");
		expect(chaptersTouched(rangesOf(state), spans)).toEqual(["a.md", "d.md"]);
	});

	it("structural transactions bypass the filter and stay out of undo history", () => {
		const { state } = stateFor();
		const b = rangeOf(state, "b.md");
		const typed = state.update({ changes: { from: b.to, insert: "!" } }).state;
		// A spine rebuild that drops chapters c and d: it crosses separators, yet passes.
		const c = rangeOf(typed, "c.md");
		const d = rangeOf(typed, "d.md");
		const keep = rangesOf(typed).slice(0, 2).map((r) => ({ ...r }));
		const s = typed.update(structuralSpec({ from: rangeOf(typed, "b.md").to, to: d.to }, keep)).state;
		expect(c.from).toBeGreaterThan(0);
		expect(s.doc.toString()).toBe("Alpha one.\n\nAlpha two.\n\nBravo.!");
		expect(rangesOf(s).map((r) => r.id)).toEqual(["a.md", "b.md"]);
		expect(validateRanges([...rangesOf(s)], s.doc.length)).toBeNull();
		// Undo skips the structural rebuild (it is not history) and takes back the typed "!".
		let current = s;
		undo({ state: current, dispatch: (tr) => (current = tr.state) });
		expect(current.doc.toString()).toBe("Alpha one.\n\nAlpha two.\n\nBravo.");
		expect(validateRanges([...rangesOf(current)], current.doc.length)).toBeNull();
	});

	it("a structural reload of one chapter replaces just its range", () => {
		const { state } = stateFor();
		const b = rangeOf(state, "b.md");
		const s = state.update(structuralSpec({ from: b.from, to: b.to, insert: "Bravo, reloaded\nfrom disk." })).state;
		expect(bodyOf(s, "b.md")).toBe("Bravo, reloaded\nfrom disk.");
		expect(bodyOf(s, "a.md")).toBe("Alpha one.\n\nAlpha two.");
		expect(bodyOf(s, "c.md")).toBe("");
		expect(validateRanges([...rangesOf(s)], s.doc.length)).toBeNull();
	});

	it("undo and redo work across chapters", () => {
		let { state } = stateFor();
		const step = (spec: TransactionSpec) => (state = state.update({ ...spec, userEvent: "input.type" }).state);
		step({ changes: { from: rangeOf(state, "a.md").from, insert: "A" } });
		// Separate history events: a selection jump between edits.
		state = state.update({ selection: EditorSelection.cursor(rangeOf(state, "d.md").to) }).state;
		step({ changes: { from: rangeOf(state, "d.md").to, insert: "D" } });
		const dispatch = { dispatch: (tr: { state: EditorState }) => (state = tr.state) };
		undo({ state, ...dispatch });
		expect(bodyOf(state, "d.md")).toBe("Delta line one.\nDelta line two.");
		expect(bodyOf(state, "a.md").startsWith("A")).toBe(true);
		undo({ state, ...dispatch });
		expect(bodyOf(state, "a.md")).toBe("Alpha one.\n\nAlpha two.");
		redo({ state, ...dispatch });
		redo({ state, ...dispatch });
		expect(bodyOf(state, "a.md").startsWith("A")).toBe(true);
		expect(bodyOf(state, "d.md").endsWith("D")).toBe(true);
	});
});

describe("chapter lookups", () => {
	const { ranges } = load();

	it("chapterIndexAt includes both ends and excludes separator interiors", () => {
		expect(chapterIndexAt(ranges, ranges[0].from)).toBe(0);
		expect(chapterIndexAt(ranges, ranges[0].to)).toBe(0);
		expect(chapterIndexAt(ranges, ranges[0].to + 1)).toBe(-1);
		expect(chapterIndexAt(ranges, ranges[1].from)).toBe(1);
		expect(chapterIndexAt(ranges, ranges[2].from)).toBe(2);
	});

	it("chapterIndexNear counts a separator as the chapter after it", () => {
		expect(chapterIndexNear(ranges, ranges[0].to + 1)).toBe(1);
		expect(chapterIndexNear(ranges, ranges[1].from)).toBe(1);
		expect(chapterIndexNear(ranges, 0)).toBe(0);
		expect(chapterIndexNear([], 0)).toBe(-1);
	});

	it("classifyChange", () => {
		expect(classifyChange(ranges, ranges[1].from, ranges[1].to)).toBe("allow");
		expect(classifyChange(ranges, ranges[0].to, ranges[1].from)).toBe("boundary");
		expect(classifyChange(ranges, ranges[0].to - 1, ranges[1].from)).toBe("refuse");
		expect(classifyChange(ranges, ranges[0].to + 1, ranges[0].to + 1)).toBe("refuse");
	});

	it("separatorSpans sit between each pair", () => {
		expect(separatorSpans(ranges)).toEqual(ranges.slice(1).map((r, i) => ({ from: ranges[i].to, to: r.from })));
	});
});

describe("bodyOffsetToFileOffset", () => {
	it("adds the frontmatter and, for CRLF, one per preceding break", () => {
		const raw = "---\r\nk: v\r\n---\r\nOne.\r\nTwo.";
		const { shape, body } = parseChapterFile(raw);
		const offset = body.indexOf("Two");
		expect(raw.slice(bodyOffsetToFileOffset(shape, body, offset))).toBe("Two.");
	});

	it("is the plain offset plus frontmatter for LF", () => {
		const raw = "---\nk: v\n---\nOne.\nTwo.";
		const { shape, body } = parseChapterFile(raw);
		expect(raw.slice(bodyOffsetToFileOffset(shape, body, body.indexOf("Two")))).toBe("Two.");
	});
});
