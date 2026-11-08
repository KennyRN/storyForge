import { describe, expect, it } from "vitest";
import { isReservedFileName, sanitizeCodexBasename } from "../codex";
import { nameProblem } from "../../ui/screens/renameCodex";

/** Brief 22, ruling 2: a name made on the Mac must be one Windows can hold. Applies to new names only. */
describe("names Windows can't hold", () => {
	it("recognises the reserved device names, with or without an extension, in any case", () => {
		for (const n of ["CON", "con", "Nul", "AUX", "PRN", "COM1", "com9", "LPT3", "NUL.txt", "Con.md"]) expect(isReservedFileName(n), n).toBe(true);
		for (const n of ["Conan", "COM0", "COM10", "Console", "Nullable", "Zoë Åberg", "lpt"]) expect(isReservedFileName(n), n).toBe(false);
	});
	it("drops a trailing dot or space and every character a Windows name can't hold", () => {
		expect(sanitizeCodexBasename("Hello. ")).toBe("Hello");
		expect(sanitizeCodexBasename("What?")).toBe("What");
		expect(sanitizeCodexBasename('a<b>c:d"e|f?g*h')).toBe("abcdefgh");
		expect(sanitizeCodexBasename("Zoë Åberg")).toBe("Zoë Åberg");
	});
	it("the rename and new-note boxes refuse a reserved name in words", () => {
		expect(nameProblem("NUL", "")).toMatch(/reserved by Windows/);
		expect(nameProblem("Nullable", "")).toBeNull();
	});
});
