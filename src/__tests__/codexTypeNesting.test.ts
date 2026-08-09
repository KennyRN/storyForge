import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_CODEX_TYPES, CODEX_TYPES, codexTypeMatchesOrDescendsFrom } from "../codex";

describe("codexTypeMatchesOrDescendsFrom", () => {
	beforeEach(() => {
		// CODEX_TYPES is a module-level singleton — reset to builtins, then add a two-level nest
		// (person -> hero) for these tests, same reset pattern as tagRegistry.test.ts.
		CODEX_TYPES.length = 0;
		CODEX_TYPES.push(
			...BUILTIN_CODEX_TYPES.map((t) => ({ ...t })),
			{ type: "hero", label: "Hero", icon: "sf-person-fill", parentId: "person" },
			{ type: "villain", label: "Villain", icon: "sf-person-fill", parentId: "person" },
			{ type: "capital", label: "Capital City", icon: "sf-map-pin", parentId: "place" },
		);
	});

	it("matches a type against itself", () => {
		expect(codexTypeMatchesOrDescendsFrom("person", "person")).toBe(true);
	});

	it("matches a nested type against its parent (the 'soft tag' behaviour)", () => {
		expect(codexTypeMatchesOrDescendsFrom("hero", "person")).toBe(true);
		expect(codexTypeMatchesOrDescendsFrom("villain", "person")).toBe(true);
		expect(codexTypeMatchesOrDescendsFrom("capital", "place")).toBe(true);
	});

	it("does not match in the reverse direction (parent is not tagged as its child)", () => {
		expect(codexTypeMatchesOrDescendsFrom("person", "hero")).toBe(false);
	});

	it("does not match unrelated types or siblings", () => {
		expect(codexTypeMatchesOrDescendsFrom("hero", "place")).toBe(false);
		expect(codexTypeMatchesOrDescendsFrom("hero", "villain")).toBe(false);
		expect(codexTypeMatchesOrDescendsFrom("capital", "person")).toBe(false);
	});

	it("returns false for a type that doesn't exist in CODEX_TYPES at all", () => {
		expect(codexTypeMatchesOrDescendsFrom("nonexistent", "person")).toBe(false);
	});
});
