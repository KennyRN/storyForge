import { beforeEach, describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { ensureTagRegistryFile, readTagRegistry, resolveIconAlias } from "../tagRegistry";
import { BACKSTAGE_ROOT, tagRegistryFilePath } from "../core/paths";
import { BUILTIN_CODEX_TYPES, CODEX_TYPES, registerCodexType } from "../codex";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG } from "../core/iconRegistry";
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

	it("parses archive-types independently of idea-types", () => {
		const { app } = makeFakeApp(true, {
			"archive-types": [{ id: "ref", label: "Reference", "icon-alias": "crown" }],
			"idea-types": [{ id: "plot", label: "Plot", "icon-alias": "pencil" }],
		});
		const result = readTagRegistry(app);
		expect(result.archiveTypes).toEqual([{ id: "ref", label: "Reference", iconAlias: "crown" }]);
		expect(result.ideaTypes).toEqual([{ id: "plot", label: "Plot", iconAlias: "pencil" }]);
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

