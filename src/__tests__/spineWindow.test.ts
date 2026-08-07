import { describe, expect, it } from "vitest";
import { computeSpineWindow } from "../spineWindow";

interface Chapter {
	name: string;
}
const ch = (name: string): Chapter => ({ name });
const keyOf = (c: Chapter) => c.name;

const chapterSlot = (file: Chapter, isCurrent: boolean) => ({ kind: "chapter", file, isCurrent });
const createSlot = () => ({ kind: "create", file: null, isCurrent: false });
const emptySlot = () => ({ kind: "empty", file: null, isCurrent: false });

describe("computeSpineWindow", () => {
	const spine = [ch("a.md"), ch("b.md"), ch("c.md"), ch("d.md"), ch("e.md")];

	it("pins the first placed chapter to the top slot, filling downward", () => {
		const win = computeSpineWindow(spine, "a.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("a.md"), true), chapterSlot(ch("b.md"), false), chapterSlot(ch("c.md"), false)]);
	});

	it("the second chapter shows the identical window to the first — only the highlight moves", () => {
		const first = computeSpineWindow(spine, "a.md", keyOf);
		const second = computeSpineWindow(spine, "b.md", keyOf);
		expect(second.slots.map((s) => s.file)).toEqual(first.slots.map((s) => s.file));
		expect(first.slots[0].isCurrent).toBe(true);
		expect(second.slots[1].isCurrent).toBe(true);
	});

	it("the window slides once the third chapter is current", () => {
		const second = computeSpineWindow(spine, "b.md", keyOf);
		const third = computeSpineWindow(spine, "c.md", keyOf);
		expect(third.slots.map((s) => s.file)).not.toEqual(second.slots.map((s) => s.file));
		expect(third.slots).toEqual([chapterSlot(ch("b.md"), false), chapterSlot(ch("c.md"), true), chapterSlot(ch("d.md"), false)]);
	});

	it("windows a chapter with both real neighbours (steady state)", () => {
		const win = computeSpineWindow(spine, "d.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("c.md"), false), chapterSlot(ch("d.md"), true), chapterSlot(ch("e.md"), false)]);
	});

	it("the last placed chapter stays in the middle slot, with 'create' immediately after it", () => {
		const win = computeSpineWindow(spine, "e.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("d.md"), false), chapterSlot(ch("e.md"), true), createSlot()]);
	});

	it("a single-chapter spine: current pinned to top, create beneath it, empty below that", () => {
		const win = computeSpineWindow([ch("a.md")], "a.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("a.md"), true), createSlot(), emptySlot()]);
	});

	it("a two-chapter spine with the first current: top/middle filled, create in the last slot", () => {
		const win = computeSpineWindow([ch("a.md"), ch("b.md")], "a.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("a.md"), true), chapterSlot(ch("b.md"), false), createSlot()]);
	});

	it("a two-chapter spine with the second (last) current: previous/current/create", () => {
		const win = computeSpineWindow([ch("a.md"), ch("b.md")], "b.md", keyOf);
		expect(win.slots).toEqual([chapterSlot(ch("a.md"), false), chapterSlot(ch("b.md"), true), createSlot()]);
	});

	it("falls back to the first placed chapter when currentKey is an idea/unplaced chapter not on the spine", () => {
		const win = computeSpineWindow(spine, "idea.md", keyOf);
		expect(win.slots[0]).toEqual(chapterSlot(ch("a.md"), true));
	});

	it("falls back to the first placed chapter when currentKey is null (nothing open yet)", () => {
		const win = computeSpineWindow(spine, null, keyOf);
		expect(win.slots[0]).toEqual(chapterSlot(ch("a.md"), true));
	});
});
