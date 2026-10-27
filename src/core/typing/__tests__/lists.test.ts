import { describe, expect, it } from "vitest";
import { DEFAULT_ELISIONS, DEFAULT_SPECIAL_CHARACTERS, OLD_ENGLISH_GROUP } from "../defaults";
import {
	TYPING_LIMITS,
	isCharacterList,
	isElisionList,
	isNameList,
	isShortcodeMap,
	moved,
	normaliseElision,
	normaliseName,
	normaliseShortcodeCode,
	normaliseShortcodeText,
	normaliseSpecialCharacter,
	withEntry,
	withoutEntry,
} from "../lists";

describe("elisions", () => {
	it("are the letters after the apostrophe, lower case", () => {
		expect(normaliseElision("tis")).toBe("tis");
		expect(normaliseElision("’Twas")).toBe("twas");
		expect(normaliseElision("  'em ")).toBe("em");
		expect(normaliseElision("‘til")).toBe("til");
	});
	it("refuse anything that isn't letters", () => {
		for (const bad of ["", "  ", "'", "t is", "90s", "tis!", "a".repeat(TYPING_LIMITS.codeLength + 1)]) expect(normaliseElision(bad), bad).toBeNull();
	});
	it("the starting list is valid, and has the words Kenny named", () => {
		expect(isElisionList([...DEFAULT_ELISIONS])).toBe(true);
		expect(DEFAULT_ELISIONS).toEqual(expect.arrayContaining(["tis", "twas", "em", "cause"]));
	});
	it("a stored list must already be tidy and free of repeats", () => {
		expect(isElisionList(["tis", "twas"])).toBe(true);
		expect(isElisionList(["Tis"])).toBe(false);
		expect(isElisionList(["tis", "tis"])).toBe(false);
		expect(isElisionList("tis")).toBe(false);
		expect(isElisionList([1])).toBe(false);
	});
});

describe("names", () => {
	it("are one line, tidied, and can't hold what a Codex name can't", () => {
		expect(normaliseName("  Red   Blossom ")).toBe("Red Blossom");
		expect(normaliseName("Ælfric")).toBe("Ælfric");
		for (const bad of ["", "   ", "Jane [2]", "a#b", "a^b", "a|b", "x".repeat(TYPING_LIMITS.nameLength + 1)]) expect(normaliseName(bad), bad).toBeNull();
	});
	it("a stored list may not repeat a name apart from capitals", () => {
		expect(isNameList(["Red Blossom", "Ælfric"])).toBe(true);
		expect(isNameList(["Red Blossom", "red blossom"])).toBe(false);
		expect(isNameList(["  Red"])).toBe(false);
	});
});

describe("shortcodes", () => {
	it("a code is letters after the ~, any script", () => {
		expect(normaliseShortcodeCode("~th")).toBe("th");
		expect(normaliseShortcodeCode("Æl")).toBe("Æl");
		for (const bad of ["", "~", "t h", "th1", "t-h", "~~th ", "x".repeat(TYPING_LIMITS.codeLength + 1)]) expect(normaliseShortcodeCode(bad), bad).toBeNull();
	});
	it("the full text is one line", () => {
		expect(normaliseShortcodeText("the  Right\nHonourable")).toBe("the Right Honourable");
		expect(normaliseShortcodeText("   ")).toBeNull();
		expect(normaliseShortcodeText("x".repeat(TYPING_LIMITS.textLength + 1))).toBeNull();
	});
	it("a stored map has tidy codes and texts, and no two codes the same apart from case", () => {
		expect(isShortcodeMap({ th: "the Right Honourable" })).toBe(true);
		expect(isShortcodeMap({})).toBe(true);
		expect(isShortcodeMap({ "~th": "x" })).toBe(false);
		expect(isShortcodeMap({ th: "line\nbreak" })).toBe(false);
		expect(isShortcodeMap({ th: "a", TH: "b" })).toBe(false);
		expect(isShortcodeMap({ th: 3 })).toBe(false);
		expect(isShortcodeMap([["th", "x"]])).toBe(false);
	});
});

describe("special characters", () => {
	it("are exactly one visible character", () => {
		expect(normaliseSpecialCharacter("æ")).toBe("æ");
		expect(normaliseSpecialCharacter(" ƿ ")).toBe("ƿ");
		expect(normaliseSpecialCharacter("é")).toBe("é"); // a letter with a combining accent is one character
		for (const bad of ["", " ", "ae", "\n", "​", "æœ"]) expect(normaliseSpecialCharacter(bad), JSON.stringify(bad)).toBeNull();
	});
	it("the starting set and the Old English group are valid, and don't overlap", () => {
		expect(isCharacterList([...DEFAULT_SPECIAL_CHARACTERS])).toBe(true);
		expect(isCharacterList([...OLD_ENGLISH_GROUP])).toBe(true);
		expect(DEFAULT_SPECIAL_CHARACTERS).toEqual(["æ", "Æ", "œ", "Œ"]);
		expect(OLD_ENGLISH_GROUP).toEqual(["ð", "Ð", "þ", "Þ", "ƿ", "Ƿ", "ȝ", "Ȝ"]);
		expect(isCharacterList([...DEFAULT_SPECIAL_CHARACTERS, ...OLD_ENGLISH_GROUP])).toBe(true);
	});
	it("repeats are not valid", () => {
		expect(isCharacterList(["æ", "æ"])).toBe(false);
	});
});

describe("editing a list", () => {
	it("adds without repeating, removes, and moves one place", () => {
		expect(withEntry(["a", "b"], "c")).toEqual(["a", "b", "c"]);
		expect(withEntry(["a", "b"], "a")).toEqual(["a", "b"]);
		expect(withEntry(["Red"], "red", (s) => s.toLowerCase())).toEqual(["Red"]);
		expect(withoutEntry(["a", "b", "c"], "b")).toEqual(["a", "c"]);
		expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
		expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
		expect(moved(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
		expect(moved(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
	});
});
