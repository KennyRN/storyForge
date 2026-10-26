import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import { originOf, originOfUpdate } from "../editor";

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
