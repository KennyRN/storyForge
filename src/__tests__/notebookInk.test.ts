import { describe, expect, it } from "vitest";
import { computeInkGeometry } from "../view/notebookInk";

// Rail at y=100; three 22.5px icons inside 2px-padded buttons, 4px apart.
const rail = { top: 100, bottom: 186.5 };
const icons = [
	{ top: 102, bottom: 124.5 },
	{ top: 132.5, bottom: 155 },
	{ top: 163, bottom: 185.5 },
];

describe("computeInkGeometry", () => {
	it("spans the track from the first icon's top to the last icon's bottom", () => {
		const g = computeInkGeometry(rail, icons, 0);
		expect(g?.trackTop).toBe(2);
		expect(g?.trackHeight).toBe(83.5);
	});

	it("sizes and places the bar on the active icon's SVG, not its button", () => {
		expect(computeInkGeometry(rail, icons, 1)).toMatchObject({ barTop: 32.5, barHeight: 22.5 });
		expect(computeInkGeometry(rail, icons, 2)).toMatchObject({ barTop: 63, barHeight: 22.5 });
	});

	it("returns null with no active icon or an unlaid-out pane", () => {
		expect(computeInkGeometry(rail, icons, -1)).toBeNull();
		expect(computeInkGeometry(rail, [], 0)).toBeNull();
		const hidden = { top: 0, bottom: 0 };
		expect(computeInkGeometry(hidden, [hidden, hidden, hidden], 0)).toBeNull();
	});
});
