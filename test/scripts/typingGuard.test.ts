import { describe, expect, it } from "vitest";
import { decide } from "../../scripts/lib/typingGuard.mjs";

describe("the typing guard (decision 72)", () => {
	it("allows typing only with the one test copy in front and a text box focused", () => {
		expect(decide("focus=AXTextArea\n", 1).ok).toBe(true);
		expect(decide("focus=AXTextField", 1).ok).toBe(true);
	});
	it("refuses when anything else is in front, and says what", () => {
		const r = decide("front=Xcode (com.apple.dt.Xcode)", 1);
		expect(r.ok).toBe(false);
		expect(r.why).toContain("Xcode");
	});
	it("lets a key for a control (Return on a Codex row) through only with the test copy in front, alone", () => {
		expect(decide("focus=AXGroup", 1, true).ok).toBe(true);
		expect(decide("focus=AXGroup", 1).ok).toBe(false);
		expect(decide("front=Xcode (com.apple.dt.Xcode)", 1, true).ok).toBe(false);
		expect(decide("focus=AXGroup", 2, true).ok).toBe(false);
	});
	it("refuses with no window, no focus, a non-text focus, an empty answer or any other number of copies", () => {
		for (const a of ["nowindow", "nofocus", "focus=AXButton", "", "nonsense"]) expect(decide(a, 1).ok, a).toBe(false);
		expect(decide("focus=AXTextArea", 0).ok).toBe(false);
		expect(decide("focus=AXTextArea", 2).ok).toBe(false);
	});
});
