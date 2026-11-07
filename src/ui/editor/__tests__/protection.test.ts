import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownLanguage } from "../markdownLanguage";
import { protectedAt } from "../protection";

const stateOf = (doc: string): EditorState => EditorState.create({ doc, extensions: [markdownLanguage.extension] });

describe("protectedAt: the parse tree at the caret, within a budget", () => {
	it("gives the protected ranges once the parse has reached the caret", () => {
		const doc = "a `code` b <!-- c -->";
		const r = protectedAt(stateOf(doc), doc.length, 1000);
		expect(r?.map(([a, b]) => doc.slice(a, b))).toEqual(["`code`", "<!-- c -->"]);
	});
	it("gives null when the parse has not reached the caret in the budget: the aid does nothing", () => {
		const doc = "A line of prose with *emphasis* and `code`, again and again.\n\n".repeat(120000); // about 7 MB: more than any budget
		expect(protectedAt(stateOf(doc), doc.length, 0)).toBeNull();
	});
});
