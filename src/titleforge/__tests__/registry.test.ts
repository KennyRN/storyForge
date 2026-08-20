import { beforeEach, describe, expect, it } from "vitest";
import {
	getGenerator,
	listByTradition,
	listGenerators,
	register,
	unregister,
} from "../engine/registry.js";
import type { GeneratorSpec } from "../engine/types.js";

const stub: GeneratorSpec = {
	id: "stub-gen",
	name: "Stub",
	blurb: "",
	tradition: "Stub tradition",
	genres: [{ id: "all", label: "Any" }],
	patterns: [{ id: "p", label: "p", templates: ["{noun}"], exemplar: "n/a", note: "n/a" }],
	lexicon: { noun: ["Word"] },
};

describe("titleforge registry", () => {
	beforeEach(() => {
		unregister("stub-gen");
	});

	it("registers and retrieves a spec by id", () => {
		register(stub);
		expect(getGenerator("stub-gen")).toBe(stub);
	});

	it("throws on a duplicate id", () => {
		register(stub);
		expect(() => register(stub)).toThrow();
	});

	it("unregister removes it and reports whether it existed", () => {
		register(stub);
		expect(unregister("stub-gen")).toBe(true);
		expect(unregister("stub-gen")).toBe(false);
		expect(getGenerator("stub-gen")).toBeUndefined();
	});

	it("listGenerators includes a registered spec", () => {
		register(stub);
		expect(listGenerators()).toContain(stub);
	});

	it("listByTradition groups by tradition", () => {
		register(stub);
		const groups = listByTradition();
		const group = groups.find((g) => g.tradition === "Stub tradition");
		expect(group?.specs).toContain(stub);
	});
});
