import { describe, expect, it } from "vitest";
import { nextNovelCode } from "../novelCode";

describe("nextNovelCode", () => {
	it("starts at 'aaa' when no book exists yet", () => {
		expect(nextNovelCode([])).toBe("aaa");
	});

	it("continues past the highest existing code", () => {
		expect(nextNovelCode(["aaa", "aab"])).toBe("aac");
	});

	it("never reuses a gap left by a deleted book", () => {
		expect(nextNovelCode(["aaa", "aac"])).toBe("aad");
	});

	it("ignores non-code entries mixed into the candidate space", () => {
		expect(nextNovelCode(["aaa", "not-a-code"])).toBe("aab");
	});

	it("carries over correctly at a letter boundary (aaz -> aba)", () => {
		expect(nextNovelCode(["aaz"])).toBe("aba");
	});

	it("carries over correctly at a full wraparound (azz -> baa)", () => {
		expect(nextNovelCode(["azz"])).toBe("baa");
	});

	it("grows to a four-letter code past 'zzz' instead of throwing", () => {
		expect(nextNovelCode(["zzz"])).toBe("aaaa");
	});

	it("continues past an existing four-letter code", () => {
		expect(nextNovelCode(["aaaa", "aaab"])).toBe("aaac");
	});
});
