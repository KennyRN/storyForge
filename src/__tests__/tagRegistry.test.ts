import { beforeEach, describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import {
	addTagDefinition,
	deleteTagDefinition,
	ensureTagRegistryFile,
	readTagRegistry,
	renameTagDefinition,
	reorderTagDefinitions,
	resolveIconAlias,
	setTagDefinitionIcon,
} from "../tagRegistry";
import { BACKSTAGE_ROOT, tagRegistryFilePath } from "../paths";
import { BUILTIN_CODEX_TYPES, CODEX_TYPES, registerCodexType } from "../codex";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG } from "../iconRegistry";
import { ICON_TAG } from "../icons";

// Fake App: tag-registry.md's frontmatter is a single mutable object shared between
// metadataCache.getCache and fileManager.processFrontMatter, mirroring book.test.ts's fixture.
function makeFakeApp(
	exists: boolean,
	initialFrontmatter: Record<string, unknown> = {},
): { app: App; frontmatter: Record<string, unknown>; fileExists: () => boolean } {
	const path = tagRegistryFilePath();
	let fileExists = exists;
	const frontmatter: Record<string, unknown> = { ...initialFrontmatter };

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => {
				if (p === path) return fileExists ? makeTFile(p) : null;
				if (p === BACKSTAGE_ROOT) return makeTFolder(p);
				return null;
			},
			create: async (p: string) => {
				fileExists = true;
				return makeTFile(p);
			},
			createFolder: async () => {
				/* no-op — BACKSTAGE_ROOT already resolves via getAbstractFileByPath above */
			},
		},
		metadataCache: {
			getCache: (p: string) => (p === path ? { frontmatter } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === path) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter, fileExists: () => fileExists };
}

describe("ensureTagRegistryFile", () => {
	it("creates the file and returns the seeded shape when it doesn't exist yet", async () => {
		const { app, fileExists } = makeFakeApp(false);
		const result = await ensureTagRegistryFile(app);
		expect(fileExists()).toBe(true);
		expect(result.codexTypes.map((t) => t.id)).toEqual(["person", "place", "populace"]);
		expect(result.chapterTags.length).toBeGreaterThan(0);
		expect(result.novelTags.length).toBeGreaterThan(0);
	});

	it("leaves an existing file untouched and returns its parsed contents", async () => {
		const { app } = makeFakeApp(true, {
			"codex-types": [{ id: "faction", label: "Faction", "icon-alias": "crown" }],
			"chapter-tags": [],
			"novel-tags": [],
		});
		const result = await ensureTagRegistryFile(app);
		expect(result.codexTypes).toEqual([{ id: "faction", label: "Faction", iconAlias: "crown" }]);
	});
});

describe("readTagRegistry", () => {
	it("falls back to the starter seed when the file doesn't exist", () => {
		const { app } = makeFakeApp(false);
		const result = readTagRegistry(app);
		expect(result.codexTypes.map((t) => t.id)).toEqual(["person", "place", "populace"]);
		expect(result.chapterTags.length).toBeGreaterThan(0);
		expect(result.novelTags.length).toBeGreaterThan(0);
	});

	it("parses well-formed entries and silently drops malformed ones", () => {
		const { app } = makeFakeApp(true, {
			"chapter-tags": [{ id: "draft", label: "Draft", "icon-alias": "pencil" }, { label: "No id" }],
		});
		const result = readTagRegistry(app);
		expect(result.chapterTags).toEqual([{ id: "draft", label: "Draft", iconAlias: "pencil" }]);
	});
});

describe("tag definition CRUD (chapterTags)", () => {
	it("mints a slug id from the label and appends it", async () => {
		const { app, frontmatter } = makeFakeApp(true, { "chapter-tags": [] });
		const id = await addTagDefinition(app, "chapterTags", "2nd Pass", "pencil");
		expect(id).toBe("2nd-pass");
		expect(frontmatter["chapter-tags"]).toEqual([{ id: "2nd-pass", label: "2nd Pass", "icon-alias": "pencil" }]);
	});

	it("de-duplicates a slug that's already taken", async () => {
		const { app } = makeFakeApp(true, { "chapter-tags": [{ id: "pass", label: "Pass", "icon-alias": "pencil" }] });
		const id = await addTagDefinition(app, "chapterTags", "Pass", "pencil");
		expect(id).toBe("pass-2");
	});

	it("renames by id without touching other entries", async () => {
		const { app } = makeFakeApp(true, {
			"chapter-tags": [
				{ id: "draft", label: "Draft", "icon-alias": "pencil" },
				{ id: "final", label: "Final", "icon-alias": "done-fill" },
			],
		});
		await renameTagDefinition(app, "chapterTags", "draft", "First draft");
		const { chapterTags } = readTagRegistry(app);
		expect(chapterTags).toEqual([
			{ id: "draft", label: "First draft", iconAlias: "pencil" },
			{ id: "final", label: "Final", iconAlias: "done-fill" },
		]);
	});

	it("changes only the icon alias on setTagDefinitionIcon", async () => {
		const { app } = makeFakeApp(true, { "chapter-tags": [{ id: "draft", label: "Draft", "icon-alias": "pencil" }] });
		await setTagDefinitionIcon(app, "chapterTags", "draft", "flag");
		expect(readTagRegistry(app).chapterTags).toEqual([{ id: "draft", label: "Draft", iconAlias: "flag" }]);
	});

	it("removes only the targeted entry on delete, leaving others untouched", async () => {
		const { app } = makeFakeApp(true, {
			"chapter-tags": [
				{ id: "draft", label: "Draft", "icon-alias": "pencil" },
				{ id: "final", label: "Final", "icon-alias": "done-fill" },
			],
		});
		await deleteTagDefinition(app, "chapterTags", "draft");
		expect(readTagRegistry(app).chapterTags).toEqual([{ id: "final", label: "Final", iconAlias: "done-fill" }]);
	});

	it("reorders to the given id sequence and appends anything missing from it", async () => {
		const { app } = makeFakeApp(true, {
			"chapter-tags": [
				{ id: "a", label: "A", "icon-alias": "flag" },
				{ id: "b", label: "B", "icon-alias": "flag" },
				{ id: "c", label: "C", "icon-alias": "flag" },
			],
		});
		await reorderTagDefinitions(app, "chapterTags", ["c", "a"]);
		expect(readTagRegistry(app).chapterTags.map((t) => t.id)).toEqual(["c", "a", "b"]);
	});

	it("no-ops for a protected codexTypes id (person/place) but still deletes an unprotected one (populace)", async () => {
		const { app } = makeFakeApp(true, {
			"codex-types": [
				{ id: "person", label: "Person", "icon-alias": "person-fill" },
				{ id: "place", label: "Place", "icon-alias": "location-pin" },
				{ id: "populace", label: "Populace", "icon-alias": "person-2-fill" },
			],
		});
		await deleteTagDefinition(app, "codexTypes", "person");
		await deleteTagDefinition(app, "codexTypes", "place");
		expect(readTagRegistry(app).codexTypes.map((t) => t.id)).toEqual(["person", "place", "populace"]);
		await deleteTagDefinition(app, "codexTypes", "populace");
		expect(readTagRegistry(app).codexTypes.map((t) => t.id)).toEqual(["person", "place"]);
	});

	it("does not protect a chapterTags/novelTags entry that happens to be named \"person\" or \"place\"", async () => {
		const { app } = makeFakeApp(true, { "chapter-tags": [{ id: "person", label: "Person", "icon-alias": "flag" }] });
		await deleteTagDefinition(app, "chapterTags", "person");
		expect(readTagRegistry(app).chapterTags).toEqual([]);
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

describe("codexTypes mutations refresh the live CODEX_TYPES registry", () => {
	beforeEach(() => {
		// CODEX_TYPES is a module-level singleton — reset it to exactly the builtins between tests.
		// (loadCodexTypesFromRegistry itself deliberately preserves anything not in the passed list,
		// as "sibling" registrations — a previous test's leftovers would survive that call, so reset
		// by mutating the array directly instead.)
		CODEX_TYPES.length = 0;
		CODEX_TYPES.push(...BUILTIN_CODEX_TYPES.map((t) => ({ ...t })));
	});

	it("reflects an added codex type immediately, with no separate reload step", async () => {
		const { app } = makeFakeApp(true, {
			"codex-types": [{ id: "person", label: "Person", "icon-alias": "person-fill" }],
		});
		await addTagDefinition(app, "codexTypes", "Faction", "crown");
		expect(CODEX_TYPES.map((t) => t.type)).toContain("faction");
	});

	it("reflects a delete immediately", async () => {
		// "populace" rather than "person"/"place" — those two are protected from deletion (see the
		// dedicated describe block below) and would no-op here instead of demonstrating the refresh.
		const { app } = makeFakeApp(true, {
			"codex-types": [
				{ id: "person", label: "Person", "icon-alias": "person-fill" },
				{ id: "populace", label: "Populace", "icon-alias": "person-2-fill" },
			],
		});
		await deleteTagDefinition(app, "codexTypes", "populace");
		expect(CODEX_TYPES.map((t) => t.type)).toEqual(["person"]);
	});

	it("preserves a sibling-registered type not present in the persisted list", async () => {
		registerCodexType({ type: "sibling-thing", label: "Sibling Thing", icon: "flag" });
		const { app } = makeFakeApp(true, {
			"codex-types": [{ id: "person", label: "Person", "icon-alias": "person-fill" }],
		});
		await renameTagDefinition(app, "codexTypes", "person", "Main Character");
		const types = CODEX_TYPES.map((t) => t.type);
		expect(types).toContain("sibling-thing");
		expect(CODEX_TYPES.find((t) => t.type === "person")?.label).toBe("Main Character");
	});
});
