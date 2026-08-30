import { describe, expect, it } from "vitest";
import {
	buildTypesTagsExport,
	parseTypesTagsExport,
	stringifyTypesTagsExport,
	TYPES_TAGS_EXPORT_FORMAT,
} from "../typesTagsExport";
import type { TagRegistryShape } from "../tagRegistry";

const registry: TagRegistryShape = {
	codexTypes: [
		{ id: "person", label: "Person", iconAlias: "person-fill" },
		{ id: "place", label: "Place", iconAlias: "location-pin" },
		{ id: "faction", label: "Faction", iconAlias: "crown", parentId: "person" },
	],
	chapterTags: [{ id: "draft", label: "Draft", iconAlias: "pencil" }],
	novelTags: [{ id: "editing", label: "Editing", iconAlias: "warning-square" }],
};

describe("types & tags export", () => {
	it("includes only the selected sections", () => {
		const both = buildTypesTagsExport(registry, new Date("2026-08-28T12:00:00.000Z"), {
			description: "roman cast",
		});
		expect(both.format).toBe(TYPES_TAGS_EXPORT_FORMAT);
		expect(both.types).toHaveLength(3);
		expect(both.chapterTags).toEqual(registry.chapterTags);
		expect(both.novelTags).toEqual(registry.novelTags);
		expect(both.description).toBe("roman cast");

		const typesOnly = buildTypesTagsExport(registry, new Date(), {
			included: { types: true, chapterTags: false, novelTags: false },
		});
		expect(typesOnly.types).toHaveLength(3);
		expect(typesOnly.chapterTags).toBeNull();
		expect(typesOnly.novelTags).toBeNull();

		const chapterOnly = buildTypesTagsExport(registry, new Date(), {
			included: { types: false, chapterTags: true, novelTags: false },
		});
		expect(chapterOnly.types).toBeNull();
		expect(chapterOnly.chapterTags).toEqual(registry.chapterTags);
		expect(chapterOnly.novelTags).toBeNull();
	});

	it("round-trips JSON and accepts legacy nested tags", () => {
		const document = buildTypesTagsExport(registry, new Date("2026-08-28T12:00:00.000Z"));
		const parsed = parseTypesTagsExport(stringifyTypesTagsExport(document));
		expect(parsed.types).toEqual(document.types);
		expect(parsed.chapterTags).toEqual(document.chapterTags);
		expect(parsed.novelTags).toEqual(document.novelTags);

		const dashCased = parseTypesTagsExport(
			JSON.stringify({
				format: TYPES_TAGS_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-28T12:00:00.000Z",
				included: { types: true, tags: true },
				types: [{ id: "faction", label: "Faction", "icon-alias": "crown", "parent-id": "person" }],
				tags: {
					"chapter-tags": [{ id: "draft", label: "Draft", "icon-alias": "pencil" }],
					"novel-tags": [],
				},
			}),
		);
		expect(dashCased.types).toEqual([
			{ id: "faction", label: "Faction", iconAlias: "crown", parentId: "person" },
		]);
		expect(dashCased.chapterTags).toEqual([{ id: "draft", label: "Draft", iconAlias: "pencil" }]);
		expect(dashCased.novelTags).toEqual([]);
		expect(dashCased.included).toEqual({ types: true, chapterTags: true, novelTags: true });
	});

	it("rejects JSON that is not a types & tags export", () => {
		expect(() => parseTypesTagsExport("{")).toThrow("not valid");
		expect(() => parseTypesTagsExport(JSON.stringify({ format: "formatForge-settings" }))).toThrow(
			"types & tags export",
		);
	});
});
