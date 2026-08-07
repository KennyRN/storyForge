import { describe, expect, it } from "vitest";
import { computeSpineWindow } from "../spineWindow";

interface Chapter {
	name: string;
}
const ch = (name: string): Chapter => ({ name });
const keyOf = (c: Chapter) => c.name;

describe("computeSpineWindow", () => {
	it("windows a middle chapter with both neighbours", () => {
		const ordered = [ch("a.md"), ch("b.md"), ch("c.md")];
		const win = computeSpineWindow(ordered, "b.md", keyOf);
		expect(win).toEqual({ previous: ch("a.md"), current: ch("b.md"), next: ch("c.md"), atStart: false, atEnd: false });
	});

	it("the first placed chapter has no previous slot", () => {
		const ordered = [ch("a.md"), ch("b.md")];
		const win = computeSpineWindow(ordered, "a.md", keyOf);
		expect(win.previous).toBeNull();
		expect(win.atStart).toBe(true);
		expect(win.atEnd).toBe(false);
	});

	it("the last placed chapter has no next slot ([+] replaces it there)", () => {
		const ordered = [ch("a.md"), ch("b.md")];
		const win = computeSpineWindow(ordered, "b.md", keyOf);
		expect(win.next).toBeNull();
		expect(win.atEnd).toBe(true);
		expect(win.atStart).toBe(false);
	});

	it("a single-chapter spine is both the start and the end", () => {
		const ordered = [ch("a.md")];
		const win = computeSpineWindow(ordered, "a.md", keyOf);
		expect(win).toEqual({ previous: null, current: ch("a.md"), next: null, atStart: true, atEnd: true });
	});

	it("an empty spine yields an all-null window, not a throw", () => {
		const win = computeSpineWindow([], "a.md", keyOf);
		expect(win).toEqual({ previous: null, current: null, next: null, atStart: true, atEnd: true });
	});

	it("falls back to the first placed chapter when currentKey is an idea/unplaced chapter not on the spine", () => {
		const ordered = [ch("a.md"), ch("b.md")];
		const win = computeSpineWindow(ordered, "idea.md", keyOf);
		expect(win.current).toEqual(ch("a.md"));
		expect(win.atStart).toBe(true);
	});

	it("falls back to the first placed chapter when currentKey is null (nothing open yet)", () => {
		const ordered = [ch("a.md"), ch("b.md")];
		const win = computeSpineWindow(ordered, null, keyOf);
		expect(win.current).toEqual(ch("a.md"));
	});
});
