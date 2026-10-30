import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { originOf } from "../editor";
import { INSERTION_EVENT } from "../lastWriting";

describe("a character put in by the special-characters button", () => {
	it("is typing to the session counter, never a paste", () => {
		const state = EditorState.create({ doc: "word " });
		const tr = state.update({ changes: { from: 5, insert: "æ" }, userEvent: INSERTION_EVENT });
		expect(originOf(tr)).toBe("type");
		expect(tr.isUserEvent("input.paste")).toBe(false);
	});
});
