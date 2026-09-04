import { describe, expect, it } from "vitest";
import {
	buildTypesTagsExport,
	parseTypesTagsExport,
	stringifyTypesTagsExport,
	TYPES_TAGS_EXPORT_FORMAT,
} from "../typesTagsExport";
import type { TagRegistryShape } from "../tagRegistry";
import type { VaultTagsShape } from "../vaultTags";

const registry: TagRegistryShape = {
	codexTypes: [
		{ id: "person", label: "Person", iconAlias: "person-fill" },
		{ id: "place", label: "Place", iconAlias: "location-pin" },
		{ id: "faction", label: "Faction", iconAlias: "crown", parentId: "person" },
	],
	chapterTags: [{ id: "draft", label: "Draft", iconAlias: "pencil" }],
	novelTags: [{ id: "editing", label: "Editing", iconAlias: "warning-square" }],
	ideaTypes: [],
};

const vaultTags: VaultTagsShape = {
	order: ["hero", "harbour"],
	tags: [
		{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] },
		{ id: "harbour", iconAlias: "location-pin", display: false, notesDisplay: false, pageOrder: [] },
	],
};

describe("types & tags export", () => {
	it("includes only the selected sections", () => {
		const both = buildTypesTagsExport(registry, new Date("2026-08-28T12:00:00.000Z"), {
			description: "roman cast",
			vaultTags,
		});
		expect(both.format).toBe(TYPES_TAGS_EXPORT_FORMAT);
		expect(both.types).toHaveLength(3);
		expect(both.codexTags).toEqual(vaultTags);
		expect(both.chapterTags).toEqual(registry.chapterTags);
		expect(both.novelTags).toEqual(registry.novelTags);
		expect(both.description).toBe("roman cast");

		const typesOnly = buildTypesTagsExport(registry, new Date(), {
			included: { types: true, codexTags: false, chapterTags: false, novelTags: false },
			vaultTags,
		});
		expect(typesOnly.types).toHaveLength(3);
		expect(typesOnly.codexTags).toBeNull();
		expect(typesOnly.chapterTags).toBeNull();
		expect(typesOnly.novelTags).toBeNull();

		const chapterOnly = buildTypesTagsExport(registry, new Date(), {
			included: { types: false, codexTags: false, chapterTags: true, novelTags: false },
		});
		expect(chapterOnly.types).toBeNull();
		expect(chapterOnly.codexTags).toBeNull();
		expect(chapterOnly.chapterTags).toEqual(registry.chapterTags);
		expect(chapterOnly.novelTags).toBeNull();

		const codexTagsOnly = buildTypesTagsExport(registry, new Date(), {
			included: { types: false, codexTags: true, chapterTags: false, novelTags: false },
			vaultTags,
		});
		expect(codexTagsOnly.types).toBeNull();
		expect(codexTagsOnly.codexTags).toEqual(vaultTags);
		expect(codexTagsOnly.chapterTags).toBeNull();
		expect(codexTagsOnly.novelTags).toBeNull();
	});

	it("round-trips JSON and accepts legacy nested tags", () => {
		const document = buildTypesTagsExport(registry, new Date("2026-08-28T12:00:00.000Z"), { vaultTags });
		const parsed = parseTypesTagsExport(stringifyTypesTagsExport(document));
		expect(parsed.types).toEqual(document.types);
		expect(parsed.codexTags).toEqual(document.codexTags);
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
		expect(dashCased.codexTags).toBeNull();
		expect(dashCased.chapterTags).toEqual([{ id: "draft", label: "Draft", iconAlias: "pencil" }]);
		expect(dashCased.novelTags).toEqual([]);
		expect(dashCased.included).toEqual({
			types: true,
			codexTags: false,
			chapterTags: true,
			novelTags: true,
		});
	});

	it("parses camelCase vault `#tag` JSON", () => {
		const parsed = parseTypesTagsExport(
			JSON.stringify({
				format: TYPES_TAGS_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-28T12:00:00.000Z",
				included: { types: false, codexTags: true, chapterTags: false, novelTags: false },
				codexTags: {
					order: ["hero"],
					tags: [{ id: "hero", iconAlias: "person-fill", display: true, pageOrder: ["Codex/Jane.md"] }],
				},
			}),
		);
		expect(parsed.codexTags).toEqual({
			order: ["hero"],
			tags: [{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] }],
		});
	});

	it("parses kebab-case vault `#tag` JSON and the vaultTags alias", () => {
		const parsed = parseTypesTagsExport(
			JSON.stringify({
				format: TYPES_TAGS_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-28T12:00:00.000Z",
				included: { types: false, vaultTags: true, chapterTags: false, novelTags: false },
				vaultTags: {
					order: ["hero"],
					tags: [{ id: "hero", "icon-alias": "person-fill", display: true, "page-order": ["Codex/Jane.md"] }],
				},
			}),
		);
		expect(parsed.included.codexTags).toBe(true);
		expect(parsed.codexTags).toEqual({
			order: ["hero"],
			tags: [{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] }],
		});
	});

	it("rejects JSON that is not a types & tags export", () => {
		expect(() => parseTypesTagsExport("{")).toThrow("not valid");
		expect(() => parseTypesTagsExport(JSON.stringify({ format: "formatForge-settings" }))).toThrow(
			"types & tags export",
		);
	});
});
