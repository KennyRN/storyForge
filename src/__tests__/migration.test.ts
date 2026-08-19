import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { migrateStructuralLayout } from "../migration";
import { LIBRARY_ROOT, BACKSTAGE_ROOT, bookFilePath, seriesFilePath } from "../paths";

/**
 * Minimal in-memory vault: a flat map of path -> "file" | "folder", plus
 * separate content/frontmatter stores. `rename` (used for both
 * `vault.rename` and `fileManager.renameFile`, matching how real Obsidian's
 * FileManager wraps Vault) moves an entry and — for a folder — every
 * descendant, preserving each moved file's content/frontmatter under its new
 * path. Good enough to exercise migrateStructuralLayout's folder-tree moves
 * without a real vault.
 */
function makeFakeVaultApp() {
	const kinds = new Map<string, "file" | "folder">();
	const content = new Map<string, string>();
	const frontmatter = new Map<string, Record<string, unknown>>();

	function childrenOf(path: string): Array<{ path: string; kind: "file" | "folder" }> {
		const prefix = `${path}/`;
		const direct = new Map<string, "file" | "folder">();
		for (const [p, kind] of kinds) {
			if (!p.startsWith(prefix)) continue;
			const rest = p.slice(prefix.length);
			if (rest.includes("/")) continue; // not a direct child
			direct.set(p, kind);
		}
		return [...direct].map(([p, kind]) => ({ path: p, kind }));
	}

	function getAbstractFileByPath(path: string) {
		const kind = kinds.get(path);
		if (kind === "file") return makeTFile(path);
		if (kind === "folder") {
			const folder = makeTFolder(path);
			folder.children = childrenOf(path).map((c) => (c.kind === "folder" ? makeTFolder(c.path) : makeTFile(c.path)));
			return folder;
		}
		return null;
	}

	async function rename(file: { path: string }, newPath: string): Promise<void> {
		const oldPath = file.path;
		const toMove = [...kinds.keys()].filter((p) => p === oldPath || p.startsWith(`${oldPath}/`));
		for (const p of toMove) {
			const suffix = p.slice(oldPath.length);
			const dest = `${newPath}${suffix}`;
			kinds.set(dest, kinds.get(p)!);
			kinds.delete(p);
			if (content.has(p)) {
				content.set(dest, content.get(p)!);
				content.delete(p);
			}
			if (frontmatter.has(p)) {
				frontmatter.set(dest, frontmatter.get(p)!);
				frontmatter.delete(p);
			}
		}
	}

	const app = {
		vault: {
			getAbstractFileByPath,
			getName: () => "TestVault",
			rename,
			createFolder: async (path: string) => {
				kinds.set(path, "folder");
			},
			create: async (path: string, text: string) => {
				kinds.set(path, "file");
				content.set(path, text);
				return makeTFile(path);
			},
		},
		metadataCache: {
			getCache: (path: string) => {
				const fm = frontmatter.get(path);
				return fm ? { frontmatter: fm } : null;
			},
		},
		fileManager: {
			renameFile: rename,
			processFrontMatter: async (file: { path: string }, mutate: (fm: Record<string, unknown>) => void) => {
				const fm = frontmatter.get(file.path) ?? {};
				mutate(fm);
				frontmatter.set(file.path, fm);
			},
		},
	} as unknown as App;

	function seedFolder(path: string): void {
		kinds.set(path, "folder");
	}
	function seedFile(path: string, text = ""): void {
		kinds.set(path, "file");
		content.set(path, text);
	}
	function seedFrontmatter(path: string, fm: Record<string, unknown>): void {
		frontmatter.set(path, fm);
	}

	return { app, kinds, content, frontmatter, seedFolder, seedFile, seedFrontmatter };
}

describe("migrateStructuralLayout", () => {
	function seedLegacyVault() {
		const helpers = makeFakeVaultApp();
		const { seedFolder, seedFile, seedFrontmatter } = helpers;

		// Legacy story library: two books, title-derived folder codes.
		seedFolder("_sf-storylibrary");
		seedFolder("_sf-storylibrary/utta");
		seedFile("_sf-storylibrary/utta/utta_chapter-aaa.md", "prose one");
		seedFolder("_sf-storylibrary/uttb");
		seedFile("_sf-storylibrary/uttb/uttb_chapter-aaa.md", "prose two");

		// Legacy backstage: series.md + each book's novel.md/cover/wordcount/sidecars.
		seedFolder("_sf-backstage");
		seedFile("_sf-backstage/series.md");
		seedFrontmatter("_sf-backstage/series.md", {
			"series-title": "UnTold Tales",
			order: ["utta", "uttb"],
			books: {
				utta: { "book-id": "utta", "book-title": "Book One" },
				uttb: { "book-id": "uttb", "book-title": "Book Two" },
			},
		});

		seedFolder("_sf-backstage/utta");
		seedFile("_sf-backstage/utta/novel.md");
		seedFrontmatter("_sf-backstage/utta/novel.md", {
			"book-id-reference": "utta",
			"book-title-reference": "Book One",
			"chapter-order": ["utta_chapter-aaa.md"],
		});
		seedFile("_sf-backstage/utta/cover.png", "cover-bytes");
		seedFile("_sf-backstage/utta/wordcount.md", "---\n---\n");
		seedFolder("_sf-backstage/utta/chapters");
		seedFile("_sf-backstage/utta/chapters/utta_chapter-aaa.md", "fingerprint-one");

		seedFolder("_sf-backstage/uttb");
		seedFile("_sf-backstage/uttb/novel.md");
		seedFrontmatter("_sf-backstage/uttb/novel.md", {
			"book-id-reference": "uttb",
			"book-title-reference": "Book Two",
			"chapter-order": ["uttb_chapter-aaa.md"],
		});

		seedFile("_sf-backstage/codex.md");
		seedFrontmatter("_sf-backstage/codex.md", { folders: {}, order: [] });
		seedFolder("_sf-backstage/settings-presets/formatForge");
		seedFile("_sf-backstage/settings-presets/formatForge/Nord.json", "{}");

		return helpers;
	}

	it("renames both roots, moves series.md/novel.md, and assigns plain sequential codes", async () => {
		const { app, kinds, content, frontmatter } = seedLegacyVault();

		await migrateStructuralLayout(app);

		// Roots renamed; legacy roots gone.
		expect(kinds.has("_sf-storylibrary")).toBe(false);
		expect(kinds.has("_sf-backstage")).toBe(false);
		expect(kinds.get(LIBRARY_ROOT)).toBe("folder");
		expect(kinds.get(BACKSTAGE_ROOT)).toBe("folder");

		// Manuscript chapter files are untouched apart from moving with their folder —
		// same filenames, same content, still keyed by the original bookId prefix.
		expect(content.get(`${LIBRARY_ROOT}/aaa/utta_chapter-aaa.md`)).toBe("prose one");
		expect(content.get(`${LIBRARY_ROOT}/aab/uttb_chapter-aaa.md`)).toBe("prose two");

		// series.md lives at the library root.
		expect(kinds.get(seriesFilePath())).toBe("file");
		const seriesFm = frontmatter.get(seriesFilePath());
		expect(seriesFm?.order).toEqual(["aaa", "aab"]);
		expect(seriesFm?.books).toEqual({
			aaa: { "book-id": "utta", "book-title": "Book One" },
			aab: { "book-id": "uttb", "book-title": "Book Two" },
		});

		// Each novel.md moved to the library root, renamed novel-<code>.md,
		// sibling of (not inside) its book's chapter folder.
		expect(kinds.get(bookFilePath("aaa"))).toBe("file");
		expect(kinds.get(bookFilePath("aab"))).toBe("file");
		expect(frontmatter.get(bookFilePath("aaa"))?.["book-id-reference"]).toBe("utta");
		expect(kinds.has(`${LIBRARY_ROOT}/aaa/novel-aaa.md`)).toBe(false);

		// Backstage bookkeeping (cover, wordcount, sidecars) moved with the folder rename.
		expect(content.get(`${BACKSTAGE_ROOT}/aaa/cover.png`)).toBe("cover-bytes");
		expect(kinds.get(`${BACKSTAGE_ROOT}/aaa/wordcount.md`)).toBe("file");
		expect(content.get(`${BACKSTAGE_ROOT}/aaa/chapters/utta_chapter-aaa.md`)).toBe("fingerprint-one");

		// Unrelated backstage content (codex, settings presets) carried along by the root rename.
		expect(kinds.get(`${BACKSTAGE_ROOT}/codex.md`)).toBe("file");
		expect(kinds.get(`${BACKSTAGE_ROOT}/settings-presets/formatForge/Nord.json`)).toBe("file");
	});

	it("is a true no-op on a second run", async () => {
		const { app, kinds, content, frontmatter } = seedLegacyVault();
		await migrateStructuralLayout(app);

		const kindsSnapshot = new Map(kinds);
		const contentSnapshot = new Map(content);
		const frontmatterSnapshot = new Map([...frontmatter].map(([k, v]) => [k, { ...v }]));

		await migrateStructuralLayout(app);

		expect(kinds).toEqual(kindsSnapshot);
		expect(content).toEqual(contentSnapshot);
		expect(frontmatter).toEqual(frontmatterSnapshot);
	});

	it("no-ops entirely on a vault with no legacy roots", async () => {
		const { app, kinds } = makeFakeVaultApp();
		await expect(migrateStructuralLayout(app)).resolves.toBeUndefined();
		expect(kinds.size).toBe(0);
	});

	it("doesn't let an old title-derived folder name skew the new sequence — a fresh 'aaa' isn't handed out twice", async () => {
		// One book already on the new scheme (as if a book was created post-upgrade,
		// or a previous partial migration run got this far), one still legacy.
		// Regression coverage: nextNovelCode's scan can't tell "aaa" (a real new
		// code) apart from an old title-derived name that happens to decode the
		// same way — the old name must never be treated as if it reserved a code.
		const { app, seedFolder, seedFile, seedFrontmatter, kinds, content, frontmatter } = makeFakeVaultApp();

		seedFolder("_sf-storylibrary");
		seedFolder("_sf-storylibrary/aaa");
		seedFile("_sf-storylibrary/aaa/knna_chapter-aaa.md", "already migrated prose");
		seedFolder("_sf-storylibrary/uttb");
		seedFile("_sf-storylibrary/uttb/uttb_chapter-aaa.md", "legacy prose");

		seedFolder("_sf-backstage");
		seedFile("_sf-backstage/series.md");
		seedFrontmatter("_sf-backstage/series.md", {
			"series-title": "UnTold Tales",
			order: ["aaa", "uttb"],
			books: {
				aaa: { "book-id": "knna", "book-title": "Book One" },
				uttb: { "book-id": "uttb", "book-title": "Book Two" },
			},
		});

		// Already-migrated book: its novel.md already lives at the library root.
		seedFile(`${"_story-library"}/novel-aaa.md`);
		seedFrontmatter(`${"_story-library"}/novel-aaa.md`, { "book-id-reference": "knna" });

		seedFolder("_sf-backstage/uttb");
		seedFile("_sf-backstage/uttb/novel.md");
		seedFrontmatter("_sf-backstage/uttb/novel.md", { "book-id-reference": "uttb" });

		await migrateStructuralLayout(app);

		// The already-migrated book's code must not be reused.
		expect(kinds.get(`${LIBRARY_ROOT}/aaa/knna_chapter-aaa.md`)).toBe("file");
		expect(content.get(`${LIBRARY_ROOT}/aaa/knna_chapter-aaa.md`)).toBe("already migrated prose");
		expect(kinds.get(bookFilePath("aaa"))).toBe("file");

		// The legacy book gets the next free code, not "aaa" again.
		expect(kinds.get(`${LIBRARY_ROOT}/aab/uttb_chapter-aaa.md`)).toBe("file");
		expect(content.get(`${LIBRARY_ROOT}/aab/uttb_chapter-aaa.md`)).toBe("legacy prose");
		expect(kinds.get(bookFilePath("aab"))).toBe("file");
		expect(frontmatter.get(bookFilePath("aab"))?.["book-id-reference"]).toBe("uttb");
	});
});
