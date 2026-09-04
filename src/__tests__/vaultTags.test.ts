import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { BACKSTAGE_ROOT, vaultTagsFilePath } from "../paths";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG, VAULT_TAG_ICON_CATALOG } from "../iconRegistry";
import {
	applySiblingReorder,
	collectVaultTagIds,
	collectNotesTagIds,
	ensureVaultTagsFile,
	filterVisiblePathsByTag,
	isVaultTagScanExcluded,
	listVaultTagRows,
	normalizeVaultTagId,
	parseVaultTagsShape,
	readVaultTags,
	reorderVaultTags,
	setVaultTagDisplay,
	setVaultTagNotesDisplay,
	setVaultTagIcon,
	setVaultTagPageOrder,
	siblingOrderAfterMove,
	sortTreeByPageOrder,
	tagsFromFileCache,
} from "../vaultTags";
import type { CodexTreeFolder } from "../codexTree";

function makeFakeApp(
	exists: boolean,
	initialFrontmatter: Record<string, unknown> = {},
	files: Array<{ path: string; cache: { tags?: Array<{ tag?: string }>; frontmatter?: Record<string, unknown> } }> = [],
): { app: App; frontmatter: Record<string, unknown>; fileExists: () => boolean } {
	const path = vaultTagsFilePath();
	let fileExists = exists;
	const frontmatter: Record<string, unknown> = { ...initialFrontmatter };
	const markdownFiles = files.map((file) => makeTFile(file.path));
	const caches = new Map(files.map((file) => [file.path, file.cache]));

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => {
				if (p === path) return fileExists ? makeTFile(p) : null;
				if (p === BACKSTAGE_ROOT) return makeTFolder(p);
				return markdownFiles.find((file) => file.path === p) ?? null;
			},
			create: async (p: string) => {
				fileExists = true;
				return makeTFile(p);
			},
			createFolder: async () => {
				/* no-op */
			},
			getMarkdownFiles: () => markdownFiles,
		},
		metadataCache: {
			getCache: (p: string) => {
				if (p === path) return { frontmatter };
				return caches.get(p) ?? null;
			},
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === path) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter, fileExists: () => fileExists };
}

describe("normalizeVaultTagId", () => {
	it("strips a leading hash and trims", () => {
		expect(normalizeVaultTagId("#Hero")).toBe("Hero");
		expect(normalizeVaultTagId("  foo/bar  ")).toBe("foo/bar");
	});

	it("rejects empty strings", () => {
		expect(normalizeVaultTagId("")).toBeNull();
		expect(normalizeVaultTagId("#")).toBeNull();
		expect(normalizeVaultTagId("   ")).toBeNull();
	});
});

describe("tagsFromFileCache", () => {
	it("collects inline tags and YAML tags/tag", () => {
		expect(
			tagsFromFileCache({
				tags: [{ tag: "#hero" }, { tag: "#cast/main" }],
				frontmatter: { tags: ["place", "#world"], tag: "extra" },
			}).sort(),
		).toEqual(["cast/main", "extra", "hero", "place", "world"]);
	});

	it("returns an empty list for a missing cache", () => {
		expect(tagsFromFileCache(null)).toEqual([]);
	});
});

describe("isVaultTagScanExcluded", () => {
	it("skips backstage, backup, and export paths", () => {
		expect(isVaultTagScanExcluded("_backstage/storyforge/vault-tags.md")).toBe(true);
		expect(isVaultTagScanExcluded("_backstage/titleforge/foo.md")).toBe(true);
		expect(isVaultTagScanExcluded("_sf-backup/x.zip")).toBe(true);
		expect(isVaultTagScanExcluded("_export/types.json")).toBe(true);
		expect(isVaultTagScanExcluded("Codex/Jane.md")).toBe(false);
	});
});

describe("ensureVaultTagsFile / readVaultTags", () => {
	it("creates the file and returns an empty shape", async () => {
		const { app, fileExists } = makeFakeApp(false);
		const result = await ensureVaultTagsFile(app);
		expect(fileExists()).toBe(true);
		expect(result).toEqual({ order: [], tags: [] });
	});

	it("parses stored entries and forces display off when there is no icon", () => {
		const { app } = makeFakeApp(true, {
			order: ["hero", "place"],
			tags: [
				{ id: "hero", "icon-alias": "person-fill", display: true, "page-order": ["Codex/Jane.md"] },
				{ id: "place", "icon-alias": "", display: true, "page-order": [] },
			],
		});
		const result = readVaultTags(app);
		expect(result.tags).toEqual([
			{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] },
			{ id: "place", iconAlias: "", display: false, notesDisplay: false, pageOrder: [] },
		]);
	});
});

describe("vault tag mutators", () => {
	it("refuses display without an icon", async () => {
		const { app } = makeFakeApp(true, { order: ["hero"], tags: [{ id: "hero", "icon-alias": "", display: false }] });
		await setVaultTagDisplay(app, "hero", true);
		expect(readVaultTags(app).tags[0]?.display).toBe(false);
	});

	it("allows display after an icon is picked", async () => {
		const { app } = makeFakeApp(true, { order: [], tags: [] });
		await setVaultTagIcon(app, "hero", "person-fill");
		await setVaultTagDisplay(app, "hero", true);
		expect(readVaultTags(app).tags[0]).toMatchObject({
			id: "hero",
			iconAlias: "person-fill",
			display: true,
		});
	});

	it("clears notesDisplay when the icon is cleared", async () => {
		const { app } = makeFakeApp(true, {
			order: ["hero"],
			tags: [{ id: "hero", "icon-alias": "person-fill", display: true, "notes-display": true }],
		});
		await setVaultTagIcon(app, "hero", "");
		expect(readVaultTags(app).tags[0]).toMatchObject({ iconAlias: "", display: false, notesDisplay: false });
	});

	it("allows notesDisplay after an icon is picked, independently of Codex display", async () => {
		const { app } = makeFakeApp(true, { order: [], tags: [] });
		await setVaultTagIcon(app, "hero", "person-fill");
		await setVaultTagNotesDisplay(app, "hero", true);
		expect(readVaultTags(app).tags[0]).toMatchObject({
			iconAlias: "person-fill",
			display: false,
			notesDisplay: true,
		});
	});

	it("reorders listed ids and appends anything missing from the new order", async () => {
		const { app } = makeFakeApp(true, { order: ["a", "b", "c"], tags: [] });
		await reorderVaultTags(app, ["c", "a"]);
		expect(readVaultTags(app).order).toEqual(["c", "a", "b"]);
	});

	it("stores a per-tag page order", async () => {
		const { app } = makeFakeApp(true, { order: [], tags: [] });
		await setVaultTagPageOrder(app, "hero", ["Codex/Bob.md", "Codex/Jane.md"]);
		expect(readVaultTags(app).tags[0]?.pageOrder).toEqual(["Codex/Bob.md", "Codex/Jane.md"]);
	});
});

describe("collectVaultTagIds / filterVisiblePathsByTag", () => {
	it("scans vault files and skips bookkeeping", () => {
		const { app } = makeFakeApp(false, {}, [
			{ path: "Codex/Jane.md", cache: { tags: [{ tag: "#hero" }] } },
			{ path: "_backstage/storyforge/codex.md", cache: { tags: [{ tag: "#ignored" }] } },
			{ path: "_story-library/aaa/chapter.md", cache: { frontmatter: { tags: ["hero", "draft"] } } },
		]);
		expect(collectVaultTagIds(app).sort()).toEqual(["draft", "hero"]);
	});

	it("collects notebook tags only from notes/*.md", () => {
		const { app } = makeFakeApp(false, {}, [
			{ path: "notes/spark.md", cache: { tags: [{ tag: "#plot" }] } },
			{ path: "Codex/Jane.md", cache: { tags: [{ tag: "#hero" }] } },
			{ path: "notes/archive/old.md", cache: { tags: [{ tag: "#archived" }] } },
		]);
		expect([...collectNotesTagIds(app)]).toEqual(["plot"]);
	});

	it("filters Codex paths to those carrying the tag", () => {
		const { app } = makeFakeApp(false, {}, [
			{ path: "Codex/Jane.md", cache: { tags: [{ tag: "#hero" }] } },
			{ path: "Codex/Town.md", cache: { tags: [{ tag: "#place" }] } },
		]);
		const visible = new Set(["Codex/Jane.md", "Codex/Town.md"]);
		expect([...filterVisiblePathsByTag(app, visible, "hero")]).toEqual(["Codex/Jane.md"]);
	});
});

describe("listVaultTagRows", () => {
	it("uses persisted order then appends newly seen tags alphabetically", () => {
		const { app } = makeFakeApp(
			true,
			{ order: ["zebra"], tags: [{ id: "zebra", "icon-alias": "flag-fill", display: true }] },
			[
				{ path: "Codex/A.md", cache: { tags: [{ tag: "#alpha" }, { tag: "#zebra" }] } },
				{ path: "Codex/B.md", cache: { tags: [{ tag: "#mid" }] } },
			],
		);
		expect(listVaultTagRows(app).map((row) => row.id)).toEqual(["zebra", "alpha", "mid"]);
	});

	it("does not jump a newly iconed tag out of alphabetical newcomer position", async () => {
		const { app } = makeFakeApp(
			true,
			{ order: ["zebra"], tags: [] },
			[{ path: "Codex/A.md", cache: { tags: [{ tag: "#alpha" }, { tag: "#zebra" }] } }],
		);
		await setVaultTagIcon(app, "alpha", "person-fill");
		expect(listVaultTagRows(app).map((row) => row.id)).toEqual(["zebra", "alpha"]);
	});
});

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

	it("sorts each sibling group by page-order rank", () => {
		const tree: CodexTreeFolder = {
			type: "folder",
			id: "",
			name: "Codex",
			children: [
				{ type: "file", name: "Jane", path: "Codex/Jane.md" },
				{
					type: "folder",
					id: "villains",
					name: "Villains",
					children: [
						{ type: "file", name: "Worse", path: "Codex/Worse.md" },
						{ type: "file", name: "Evil", path: "Codex/Evil.md" },
					],
				},
				{ type: "file", name: "Bob", path: "Codex/Bob.md" },
			],
		};
		const sorted = sortTreeByPageOrder(tree, ["Codex/Bob.md", "villains", "Codex/Jane.md", "Codex/Evil.md", "Codex/Worse.md"]);
		expect(sorted.children.map((child) => (child.type === "folder" ? child.id : child.path))).toEqual([
			"Codex/Bob.md",
			"villains",
			"Codex/Jane.md",
		]);
		const folder = sorted.children[1];
		if (folder.type !== "folder") throw new Error("expected folder");
		expect(folder.children.map((child) => (child.type === "file" ? child.path : child.id))).toEqual([
			"Codex/Evil.md",
			"Codex/Worse.md",
		]);
	});
});

describe("parseVaultTagsShape", () => {
	it("accepts camelCase JSON and kebab-case on-disk fields", () => {
		expect(
			parseVaultTagsShape({
				order: ["hero"],
				tags: [{ id: "hero", iconAlias: "person-fill", display: true, pageOrder: ["Codex/Jane.md"] }],
			}),
		).toEqual({
			order: ["hero"],
			tags: [{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] }],
		});
		expect(
			parseVaultTagsShape({
				order: ["hero"],
				tags: [{ id: "hero", "icon-alias": "person-fill", display: true, "page-order": ["Codex/Jane.md"] }],
			}),
		).toEqual({
			order: ["hero"],
			tags: [{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] }],
		});
	});
});

describe("VAULT_TAG_ICON_CATALOG", () => {
	it("includes every type icon plus the requested tag extras, without duplicate aliases", () => {
		const aliases = VAULT_TAG_ICON_CATALOG.map((entry) => entry.alias);
		expect(new Set(aliases).size).toBe(aliases.length);
		for (const entry of CODEX_ICON_CATALOG) {
			expect(aliases).toContain(entry.alias);
		}
		for (const extra of [
			"number-0",
			"number-9",
			"heart-fill",
			"star-duotone",
			"star-fill",
			"bookmark-fill",
			"flag-fill",
			"warning-square-fill",
		]) {
			expect(aliases).toContain(extra);
			expect(TAG_ICON_CATALOG.some((entry) => entry.alias === extra) || extra === "bookmark-fill").toBe(true);
		}
		expect(aliases).not.toContain("lock");
		expect(aliases).not.toContain("pencil");
	});
});
