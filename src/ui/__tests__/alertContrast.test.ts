import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The five alerts' contrast (Brief 20, decision 157), WCAG 2 on flat sRGB: `--ef-fg` on each tint, and the alert's edge colour on its tint.
 * NOTE (4.45) and TIP (4.47) are under 4.5 and are Kenny's accepted exception (decision 122, ruling of 7 November 2026), like the notices'.
 * IMPORTANT's tint is Everforest's purple mixed 20% into bg0 (Everforest has no purple tint).
 */
const palette = readFileSync("src/ui/theme/everforest-soft-dark.css", "utf8");
const hex = (name: string): string => new RegExp(`--ef-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(palette)![1];
const lum = (h: string): number => {
	const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string): number => {
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};
const ALERTS = [
	{ kind: "note", tint: "bg-blue", edge: "blue", fg: 4.45, edgeOn: 3.46 },
	{ kind: "tip", tint: "bg-green", edge: "green", fg: 4.47, edgeOn: 3.77 },
	{ kind: "important", tint: "bg-purple", edge: "purple", fg: 4.7, edgeOn: 3.44 },
	{ kind: "warning", tint: "bg-yellow", edge: "yellow", fg: 4.51, edgeOn: 4.18 },
	{ kind: "caution", tint: "bg-red", edge: "red", fg: 5.17, edgeOn: 3.19 },
];

describe("the alerts' contrast", () => {
	for (const a of ALERTS) {
		it(`${a.kind}: fg ${a.fg}:1 on the tint, the edge colour ${a.edgeOn}:1`, () => {
			expect(ratio(hex("fg"), hex(a.tint))).toBeCloseTo(a.fg, 1);
			expect(ratio(hex(a.edge), hex(a.tint))).toBeCloseTo(a.edgeOn, 1);
		});
	}
	it("IMPORTANT's tint is 20% of purple mixed into bg0", () => {
		const mix = [1, 3, 5].map((i) => Math.round(parseInt(hex("bg0").slice(i, i + 2), 16) * 0.8 + parseInt(hex("purple").slice(i, i + 2), 16) * 0.2));
		expect("#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("")).toBe(hex("bg-purple").toLowerCase());
	});
});
