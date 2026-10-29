import { describe, expect, it } from "vitest";
import { DEFAULT_SPECIAL_CHARACTERS, OLD_ENGLISH_GROUP } from "../defaults";
import { codePoints, spokenName } from "../characterNames";

describe("what a special character is called", () => {
	it("the starting set and the Old English group have proper names", () => {
		expect([...DEFAULT_SPECIAL_CHARACTERS, ...OLD_ENGLISH_GROUP].map(spokenName)).toEqual([
			"ash", "capital ash", "ethel", "capital ethel",
			"eth", "capital eth", "thorn", "capital thorn", "wynn", "capital wynn", "yogh", "capital yogh",
		]);
	});
	it("any other character is itself with its code point", () => {
		expect(spokenName("ø")).toBe("ø, U+00F8");
		expect(spokenName("€")).toBe("€, U+20AC");
		expect(spokenName("é")).toBe("é, U+0065 U+0301".replace("é", "é"));
		expect(codePoints("😀")).toBe("U+1F600");
	});
});
