import { describe, expect, it } from "vitest";
import { applySiblingReorder, siblingOrderAfterMove } from "../siblingOrder";

describe("page-order helpers", () => {
	it("moves a key among siblings", () => {
		expect(siblingOrderAfterMove(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
		expect(siblingOrderAfterMove(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
		expect(siblingOrderAfterMove(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
	});

	it("merges a sibling reorder into the flat ranking without dropping unseen keys", () => {
		expect(applySiblingReorder(["x", "a", "b", "y"], ["b", "a"])).toEqual(["x", "b", "a", "y"]);
		expect(applySiblingReorder(["a", "b"], ["c", "d"])).toEqual(["a", "b", "c", "d"]);
	});
});
