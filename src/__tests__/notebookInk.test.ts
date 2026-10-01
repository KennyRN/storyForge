import { describe, expect, it } from "vitest";
import { computeInkGeometry } from "../view/notebookInk";

// Rail at y=100; three 22.5px icons inside 2px-padded buttons, 4px apart. Page from y=100 to 400.
const rail = { top: 100, bottom: 186.5 };
const page = { top: 100, bottom: 400 };
const icons = [
	{ top: 102, bottom: 124.5 },
	{ top: 132.5, bottom: 155 },
	{ top: 163, bottom: 185.5 },
];

describe("computeInkGeometry", () => {
	it("spans the track over the page's full height", () => {
		const g = computeInkGeometry(rail, page, icons, 0);
		expect(g?.trackTop).toBe(0);
		expect(g?.trackHeight).toBe(300);
	});

	it("sizes and places the bar on the active icon's SVG, not its button", () => {
		expect(computeInkGeometry(rail, page, icons, 1)).toMatchObject({ barTop: 32.5, barHeight: 22.5 });
		expect(computeInkGeometry(rail, page, icons, 2)).toMatchObject({ barTop: 63, barHeight: 22.5 });
	});

	it("returns null with no active icon or an unlaid-out pane", () => {
		expect(computeInkGeometry(rail, page, icons, -1)).toBeNull();
		expect(computeInkGeometry(rail, page, [], 0)).toBeNull();
		const hidden = { top: 0, bottom: 0 };
		expect(computeInkGeometry(hidden, hidden, [hidden, hidden, hidden], 0)).toBeNull();
	});
});
