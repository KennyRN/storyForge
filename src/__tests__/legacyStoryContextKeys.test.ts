import { describe, expect, it } from "vitest";
import { remapLegacyStoryContextKeys } from "../story-context/legacyKeys";

const KNOWN = new Set([
	"storyContextHeaderColor",
	"storyContextIncludeUnknownNames",
	"storyContextTabsFontWeight",
	"storyContextSectionChrome",
]);
const isKnown = (k: string) => KNOWN.has(k);

describe("remapLegacyStoryContextKeys", () => {
	it("moves a legacy recommend* value onto its storyContext* key", () => {
		const raw: Record<string, unknown> = { recommendHeaderColor: "#abcdef" };
		remapLegacyStoryContextKeys(raw, isKnown);
		expect(raw.storyContextHeaderColor).toBe("#abcdef");
		expect("recommendHeaderColor" in raw).toBe(false);
	});

	it("migrates the behaviour toggle too", () => {
		const raw: Record<string, unknown> = { recommendIncludeUnknownNames: true };
		remapLegacyStoryContextKeys(raw, isKnown);
		expect(raw.storyContextIncludeUnknownNames).toBe(true);
	});

	it("does not clobber an already-present new key", () => {
		const raw: Record<string, unknown> = {
			recommendHeaderColor: "#old",
			storyContextHeaderColor: "#new",
		};
		remapLegacyStoryContextKeys(raw, isKnown);
		expect(raw.storyContextHeaderColor).toBe("#new");
		expect("recommendHeaderColor" in raw).toBe(false);
	});

	it("drops a legacy key that has no real storyContext* counterpart, leaving others alone", () => {
		const raw: Record<string, unknown> = { recommendMadeUpKey: 1, keepMe: 2 };
		remapLegacyStoryContextKeys(raw, isKnown);
		expect("recommendMadeUpKey" in raw).toBe(false);
		expect("storyContextMadeUpKey" in raw).toBe(false);
		expect(raw.keepMe).toBe(2);
	});
});
