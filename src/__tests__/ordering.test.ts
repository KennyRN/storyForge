import { describe, expect, it } from "vitest";
import { resolveOrder } from "../ordering";

interface Item {
	name: string;
}

const item = (name: string): Item => ({ name });

describe("resolveOrder", () => {
	it("orders members according to the order list", () => {
		const members = [item("c.md"), item("a.md"), item("b.md")];
		const { ordered, unplaced, orphans } = resolveOrder(members, ["a.md", "b.md", "c.md"], (m) => m.name);
		expect(ordered.map((m) => m.name)).toEqual(["a.md", "b.md", "c.md"]);
		expect(unplaced).toEqual([]);
		expect(orphans).toEqual([]);
	});

	it("appends members absent from order as unplaced, in original (folder) order", () => {
		const members = [item("a.md"), item("b.md"), item("c.md")];
		const { ordered, unplaced } = resolveOrder(members, ["b.md"], (m) => m.name);
		expect(ordered.map((m) => m.name)).toEqual(["b.md"]);
		expect(unplaced.map((m) => m.name)).toEqual(["a.md", "c.md"]);
	});

	it("surfaces an order entry with no matching member as an orphan, never dropping it silently", () => {
		const members = [item("a.md")];
		const { ordered, orphans } = resolveOrder(members, ["a.md", "missing.md"], (m) => m.name);
		expect(ordered.map((m) => m.name)).toEqual(["a.md"]);
		expect(orphans).toEqual(["missing.md"]);
	});

	it("treats every member as unplaced when order is empty", () => {
		const members = [item("a.md"), item("b.md")];
		const { ordered, unplaced } = resolveOrder(members, [], (m) => m.name);
		expect(ordered).toEqual([]);
		expect(unplaced.map((m) => m.name)).toEqual(["a.md", "b.md"]);
	});
});
