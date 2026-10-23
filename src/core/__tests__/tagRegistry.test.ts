import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { BUILTIN_CODEX_TYPES, CODEX_TYPES } from "../codex";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG } from "../iconRegistry";
import { ICON_TAG } from "../icons";
import { tagRegistryFilePath } from "../paths";
import { DEFAULT_TAG_REGISTRY_CONTENT, ensureTagRegistryFile, loadCodexTypesIntoRegistry, readTagRegistry, resolveIconAlias } from "../tagRegistry";

async function registryProject(frontmatter?: Record<string, unknown>) {
	return memoryProject(frontmatter === undefined ? {} : { [tagRegistryFilePath()]: fmFile(frontmatter) });
}

describe("ensureTagRegistryFile", () => {
	it("creates the file and returns the seeded shape when it doesn't exist yet", async () => {
		const { project, backend } = await registryProject();
		const result = await ensureTagRegistryFile(project);
		expect(backend.files.get(tagRegistryFilePath())).toBe(DEFAULT_TAG_REGISTRY_CONTENT);
		expect(result.codexTypes.map((t) => t.id)).toEqual(["person", "place", "populace"]);
		expect(result.chapterTags.length).toBeGreaterThan(0);
		expect(result.novelTags.length).toBeGreaterThan(0);
		// what the file reads back as is what was returned
		expect(readTagRegistry(project)).toEqual(result);
	});

	it("leaves an existing file untouched and returns its parsed contents", async () => {
		const { project, backend } = await registryProject({
			"codex-types": [{ id: "faction", label: "Faction", "icon-alias": "crown" }],
			"chapter-tags": [],
			"novel-tags": [],
		});
		const before = backend.files.get(tagRegistryFilePath());
		const result = await ensureTagRegistryFile(project);
		expect(result.codexTypes).toEqual([{ id: "faction", label: "Faction", iconAlias: "crown" }]);
		expect(backend.files.get(tagRegistryFilePath())).toBe(before);
		expect(backend.writes).toEqual([]);
	});
});

describe("readTagRegistry", () => {
	it("falls back to the starter seed when the file doesn't exist", async () => {
		const { project } = await registryProject();
		const result = readTagRegistry(project);
		expect(result.codexTypes.map((t) => t.id)).toEqual(["person", "place", "populace"]);
		expect(result.chapterTags.length).toBeGreaterThan(0);
		expect(result.novelTags.length).toBeGreaterThan(0);
	});

	it("parses well-formed entries and silently drops malformed ones", async () => {
		const { project } = await registryProject({
			"chapter-tags": [{ id: "draft", label: "Draft", "icon-alias": "pencil" }, { label: "No id" }],
		});
		expect(readTagRegistry(project).chapterTags).toEqual([{ id: "draft", label: "Draft", iconAlias: "pencil" }]);
	});

	it("parses archive-types independently of idea-types", async () => {
		const { project } = await registryProject({
			"archive-types": [{ id: "ref", label: "Reference", "icon-alias": "crown" }],
			"idea-types": [{ id: "plot", label: "Plot", "icon-alias": "pencil" }],
		});
		const result = readTagRegistry(project);
		expect(result.archiveTypes).toEqual([{ id: "ref", label: "Reference", iconAlias: "crown" }]);
		expect(result.ideaTypes).toEqual([{ id: "plot", label: "Plot", iconAlias: "pencil" }]);
	});

	it("reads a nested Codex type's parent", async () => {
		const { project } = await registryProject({
			"codex-types": [
				{ id: "person", label: "Person", "icon-alias": "person-fill" },
				{ id: "hero", label: "Hero", "icon-alias": "crown", "parent-id": "person" },
			],
		});
		expect(readTagRegistry(project).codexTypes[1]).toEqual({ id: "hero", label: "Hero", iconAlias: "crown", parentId: "person" });
	});
});

describe("loadCodexTypesIntoRegistry", () => {
	it("replaces the live Codex types with the registry's, icons resolved", async () => {
		CODEX_TYPES.length = 0;
		CODEX_TYPES.push(...BUILTIN_CODEX_TYPES.map((t) => ({ ...t })));
		const { project } = await registryProject({
			"codex-types": [{ id: "faction", label: "Faction", "icon-alias": "crown" }],
		});
		loadCodexTypesIntoRegistry(project);
		expect(CODEX_TYPES.map((t) => t.type)).toEqual(["faction"]);
		expect(CODEX_TYPES[0].icon).toBe(CODEX_ICON_CATALOG.find((e) => e.alias === "crown")?.iconId);
		CODEX_TYPES.length = 0;
		CODEX_TYPES.push(...BUILTIN_CODEX_TYPES.map((t) => ({ ...t })));
	});
});

describe("resolveIconAlias", () => {
	it("resolves a codexTypes alias against CODEX_ICON_CATALOG", () => {
		const entry = CODEX_ICON_CATALOG.find((e) => e.alias === "crown");
		expect(entry).toBeDefined();
		expect(resolveIconAlias("codexTypes", "crown")).toBe(entry?.iconId);
	});

	it("resolves a chapterTags/novelTags alias against the shared TAG_ICON_CATALOG", () => {
		const entry = TAG_ICON_CATALOG.find((e) => e.alias === "bookmark-fill");
		expect(entry).toBeDefined();
		expect(resolveIconAlias("chapterTags", "bookmark-fill")).toBe(entry?.iconId);
		expect(resolveIconAlias("novelTags", "bookmark-fill")).toBe(entry?.iconId);
	});

	it("falls back to a generic icon for an alias that isn't in the catalog", () => {
		expect(resolveIconAlias("chapterTags", "nonexistent")).toBe(ICON_TAG);
		expect(resolveIconAlias("codexTypes", "nonexistent")).toBe(ICON_TAG);
	});
});
