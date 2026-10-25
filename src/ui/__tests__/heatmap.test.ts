import { describe, expect, it } from "vitest";
import { heatClass, heatStep, netLabel } from "../screens/history/heatmap";

describe("heat steps", () => {
	it("leaves a day with no writing empty, not step 1", () => {
		expect(heatStep(0, 100)).toBe(0);
		expect(heatClass(0, 100)).toBe("sf-heat--empty");
	});
	it("rounds the share of the largest value up into four steps", () => {
		expect(heatStep(1, 100)).toBe(1);
		expect(heatStep(25, 100)).toBe(1);
		expect(heatStep(26, 100)).toBe(2);
		expect(heatStep(75, 100)).toBe(3);
		expect(heatStep(76, 100)).toBe(4);
		expect(heatStep(100, 100)).toBe(4);
	});
	it("gives net-loss days their own neutral steps, by size", () => {
		expect(heatClass(-10, 100)).toBe("sf-heat--loss-1");
		expect(heatClass(-90, 100)).toBe("sf-heat--loss-4");
	});
	it("says a loss in words", () => {
		expect(netLabel(-120)).toBe("net loss of 120");
	});
});
