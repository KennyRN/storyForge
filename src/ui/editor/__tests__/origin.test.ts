import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import { originOf, originOfUpdate } from "../editor";
import { AID_EVENT, typedRun } from "../typingAids";
import { isolateHistory } from "@codemirror/commands";

const state = () => EditorState.create({ doc: "hello world", extensions: [history()] });
const tr = (userEvent: string | undefined, insert = "x") => state().update({ changes: { from: 0, to: 0, insert }, ...(userEvent ? { userEvent } : {}) });

describe("every CodeMirror input path supplies an origin", () => {
	it.each([
		["typing", "input.type", "type"],
		["IME composition", "input.type.compose", "type"],
		["dictation and other input", "input", "type"],
		["paste", "input.paste", "paste"],
		["drop", "input.drop", "drop"],
		["cut", "delete.cut", "cut"],
		["backspace", "delete.backward", "delete"],
		["forward delete", "delete.forward", "delete"],
		["a typing aid's own change", AID_EVENT, "type"], // typing, never a paste (decision 34)
		["a change nobody labelled", undefined, "other"],
	] as const)("%s → %s", (_name, userEvent, expected) => {
		expect(originOf(tr(userEvent))).toBe(expected);
	});

	it("undo and redo come from the history commands", () => {
		let s = state();
		s = s.update({ changes: { from: 0, insert: "typed " }, userEvent: "input.type" }).state;
		let seen: ReturnType<typeof originOf> | null = null;
		undo({ state: s, dispatch: (t) => ((seen = originOf(t)), (s = t.state)) });
		expect(seen).toBe("undo");
		redo({ state: s, dispatch: (t) => (seen = originOf(t)) });
		expect(seen).toBe("redo");
	});

	it("a paste outranks typing within one update, and an unlabelled update counts as typing", () => {
		expect(originOfUpdate([tr("input.type"), tr("input.paste")])).toBe("paste");
		expect(originOfUpdate([])).toBe("type");
	});
});

describe("a typing aid's change in the history and the run", () => {
	it("is its own undo step: undo takes back the aid and leaves exactly what was typed", () => {
		let s = EditorState.create({ doc: "", extensions: [history(), typedRun] });
		s = s.update({ changes: { from: 0, insert: "don'" }, selection: { anchor: 4 }, userEvent: "input.type" }).state;
		s = s.update({ changes: { from: 3, to: 4, insert: "’" }, selection: { anchor: 4 }, userEvent: AID_EVENT, annotations: isolateHistory.of("full") }).state;
		expect(s.doc.toString()).toBe("don’");
		undo({ state: s, dispatch: (t) => (s = t.state) });
		expect(s.doc.toString()).toBe("don'");
		redo({ state: s, dispatch: (t) => (s = t.state) });
		expect(s.doc.toString()).toBe("don’");
		undo({ state: s, dispatch: (t) => (s = t.state) });
		undo({ state: s, dispatch: (t) => (s = t.state) });
		expect(s.doc.toString()).toBe("");
	});

	it("the typed run follows typing and the aid's change, and ends at a caret move, Return, a paste, an undo or a reload", () => {
		let s = EditorState.create({ doc: "old ", selection: { anchor: 4 }, extensions: [history(), typedRun] });
		expect(s.field(typedRun)).toBeNull();
		s = s.update({ changes: { from: 4, insert: "a" }, selection: { anchor: 5 }, userEvent: "input.type" }).state;
		expect(s.field(typedRun)).toBe(4);
		s = s.update({ changes: { from: 5, insert: "b" }, selection: { anchor: 6 }, userEvent: "input.type" }).state;
		s = s.update({ changes: { from: 5, to: 6, insert: "B" }, selection: { anchor: 6 }, userEvent: AID_EVENT }).state;
		expect(s.field(typedRun)).toBe(4);
		s = s.update({ changes: { from: 5, to: 6 }, userEvent: "delete.backward" }).state; // Backspace inside the run keeps it
		expect(s.field(typedRun)).toBe(4);
		for (const [name, spec] of [
			["a caret move", { selection: { anchor: 0 }, userEvent: "select" }],
			["Return", { changes: { from: 6, insert: "\n" }, userEvent: "input" }],
			["a paste", { changes: { from: 6, insert: "p" }, userEvent: "input.paste" }],
			["a reload", { changes: { from: 6, insert: "r" } }],
		] as const) {
			const typed = s.update({ changes: { from: s.doc.length, insert: "z" }, userEvent: "input.type" }).state;
			expect(typed.field(typedRun), `before ${name}`).not.toBeNull();
			expect(typed.update(spec as never).state.field(typedRun), name).toBeNull();
		}
	});
});
