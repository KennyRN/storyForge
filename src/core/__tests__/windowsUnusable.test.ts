import { describe, expect, it } from "vitest";
import { windowsNameProblem } from "../windowsNames";

describe("existing names Windows can't hold are recognised (and only listed)", () => {
	it("flags the characters, a trailing dot or space, and reserved names", () => {
		expect(windowsNameProblem("What?.md")).toMatch(/character/);
		expect(windowsNameProblem("A: B.md")).toMatch(/character/);
		expect(windowsNameProblem("Notes.")).toMatch(/dot or a space/);
		expect(windowsNameProblem("Aux.md")).toMatch(/reserved/);
	});
	it("passes ordinary names, accents and spaces inside a name", () => {
		for (const n of ["Zoë Åberg.md", "Jane Harbour.md", "Chapter 1 - The Port.md", "Console.md", ".hidden"]) expect(windowsNameProblem(n), n).toBeNull();
	});
});
