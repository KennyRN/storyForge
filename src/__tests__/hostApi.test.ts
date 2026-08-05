import { describe, expect, it } from "vitest";
import { BUILTIN_CODEX_TYPES, CODEX_TYPES, registerCodexType } from "../codex";
import { buildRightRailTypeOrder, isCanonicalTypeOrder } from "../rightRailOrder";

describe("registerCodexType", () => {
	it("keeps builtins and adds sibling types idempotently", () => {
		const before = CODEX_TYPES.map((t) => t.type);
		expect(before).toEqual(BUILTIN_CODEX_TYPES.map((t) => t.type));

		registerCodexType({ type: "event", label: "Event", icon: "tf-calendar-today" });
		expect(CODEX_TYPES.some((t) => t.type === "event")).toBe(true);

		registerCodexType({ type: "event", label: "Plot event", icon: "tf-calendar-note" });
		const events = CODEX_TYPES.filter((t) => t.type === "event");
		expect(events).toHaveLength(1);
		expect(events[0].label).toBe("Plot event");
		expect(events[0].icon).toBe("tf-calendar-note");

		// cleanup for other tests sharing the module
		const idx = CODEX_TYPES.findIndex((t) => t.type === "event");
		if (idx >= 0) CODEX_TYPES.splice(idx, 1);
	});
});

describe("buildRightRailTypeOrder", () => {
	it("places Forge then registered views after Story Context", () => {
		expect(
			buildRightRailTypeOrder("spacer", "context", "forge", [
				{ viewType: "timeline", orderHint: 50 },
			]),
		).toEqual(["spacer", "context", "forge", "timeline"]);
	});

	it("sorts multiple registrations by orderHint", () => {
		expect(
			buildRightRailTypeOrder("spacer", "context", "forge", [
				{ viewType: "b", orderHint: 80 },
				{ viewType: "a", orderHint: 40 },
			]),
		).toEqual(["spacer", "context", "forge", "a", "b"]);
	});
});

describe("isCanonicalTypeOrder", () => {
	it("allows missing tabs but rejects wrong relative order", () => {
		const expected = ["spacer", "context", "forge", "timeline"];
		expect(isCanonicalTypeOrder(expected, ["spacer", "context", "timeline"])).toBe(true);
		expect(isCanonicalTypeOrder(expected, ["spacer", "timeline", "context"])).toBe(false);
		expect(isCanonicalTypeOrder(expected, ["spacer", "context", "forge", "timeline"])).toBe(true);
	});
});
