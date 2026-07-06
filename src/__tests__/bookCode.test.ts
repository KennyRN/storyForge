import { describe, expect, it } from "vitest";
import { nextBookFolderCode, titleToId } from "../bookCode";

describe("titleToId", () => {
	it("splits internal capitals and takes the first + last two segments", () => {
		expect(titleToId("UnTold Tales")).toBe("UTT");
	});

	it("drops grammatical stop words but keeps honorifics", () => {
		expect(titleToId("Great and Amazing Mr. Jones")).toBe("GMJ");
	});

	it("drops a leading 'The' but keeps the rest", () => {
		expect(titleToId("The Great Gatsby")).toBe("GGR");
	});

	it("pads from tail letters when there are too few segments", () => {
		expect(titleToId("Jones")).toBe("JON");
	});

	it("supports a custom length", () => {
		expect(titleToId("Indefatigable", { length: 4 })).toBe("INDE");
	});
});

describe("nextBookFolderCode", () => {
	it("starts at the guide letter 'a' when no book exists yet", () => {
		expect(nextBookFolderCode("UnTold Tales", [])).toBe("utta");
	});

	it("continues past the highest existing guide letter", () => {
		expect(nextBookFolderCode("UnTold Tales", ["UTTa", "UTTb"])).toBe("uttc");
	});

	it("ignores names with a different 3-letter prefix", () => {
		expect(nextBookFolderCode("UnTold Tales", ["ABCa", "ABCb"])).toBe("utta");
	});

	it("never reuses a gap left by a deleted book", () => {
		expect(nextBookFolderCode("UnTold Tales", ["UTTa", "UTTc"])).toBe("uttd");
	});

	it("is case-insensitive when scanning existing names", () => {
		expect(nextBookFolderCode("UnTold Tales", ["utta"])).toBe("uttb");
	});

	it("returns a fully lowercase code even though the prefix is derived uppercase internally", () => {
		expect(nextBookFolderCode("UnTold Tales", [])).toMatch(/^[a-z]{4}$/);
	});
});
