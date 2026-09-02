import { describe, expect, it } from "vitest";
import {
	collectReferencedPaths,
	countFilesInFolder,
	findContainer,
	flattenCodexTreeFiles,
	insertIntoContainer,
	isDescendantFolder,
	isFolderKey,
	mintFolderId,
	removeFromContainer,
	resolveCodexTree,
	type CodexFolders,
} from "../codexTree";

describe("isFolderKey", () => {
	it("is true only for keys present in folders", () => {
		const folders: CodexFolders = { characters: { name: "Characters", order: [] } };
		expect(isFolderKey(folders, "characters")).toBe(true);
		expect(isFolderKey(folders, "Codex/Jane.md")).toBe(false);
	});
});

describe("mintFolderId", () => {
	it("dedupes against existing folder ids", () => {
		const folders: CodexFolders = { characters: { name: "Characters", order: [] } };
		expect(mintFolderId("Characters", folders)).toBe("characters-2");
		expect(mintFolderId("Locations", folders)).toBe("locations");
	});
});

describe("resolveCodexTree", () => {
	it("resolves nested folders and files in stored order", () => {
		const folders: CodexFolders = {
			characters: { name: "Characters", order: ["Codex/Jane.md", "sub"] },
			sub: { name: "Sub", order: ["Codex/Bob.md"] },
		};
		const realPaths = new Set(["Codex/Jane.md", "Codex/Bob.md"]);
		const tree = resolveCodexTree(folders, ["characters"], realPaths, realPaths);
		expect(tree.children).toHaveLength(1);
		const top = tree.children[0];
		if (top.type !== "folder") throw new Error("expected folder");
		expect(top.id).toBe("characters");
		expect(top.children.map((c) => c.name)).toEqual(["Jane", "Sub"]);
		const nested = top.children[1];
		if (nested.type !== "folder") throw new Error("expected nested folder");
		expect(nested.children.map((c) => c.name)).toEqual(["Bob"]);
	});

	it("hides a folder whose real content is entirely filtered out of the current view", () => {
		const folders: CodexFolders = { characters: { name: "Characters", order: ["Codex/Jane.md"] } };
		const realPaths = new Set(["Codex/Jane.md"]);
		const visiblePaths = new Set<string>(); // Jane.md exists but isn't visible in this book scope
		const tree = resolveCodexTree(folders, ["characters"], realPaths, visiblePaths);
		expect(tree.children).toEqual([]);
	});

	it("keeps a genuinely empty folder as a placeholder", () => {
		const folders: CodexFolders = { characters: { name: "Characters", order: [] } };
		const tree = resolveCodexTree(folders, ["characters"], new Set(), new Set());
		expect(tree.children).toHaveLength(1);
		expect(tree.children[0]).toMatchObject({ type: "folder", id: "characters", children: [] });
	});

	it("in tagFilterMode keeps a lore folder whose linked note is visible even with no tagged children", () => {
		const folders: CodexFolders = {
			villains: {
				name: "Villains",
				order: ["Codex/Untagged.md"],
				linkedNotePath: "Codex/Villains.md",
			},
		};
		const realPaths = new Set(["Codex/Villains.md", "Codex/Untagged.md"]);
		const visiblePaths = new Set(["Codex/Villains.md"]);
		const tree = resolveCodexTree(folders, ["villains"], realPaths, visiblePaths, { tagFilterMode: true });
		expect(tree.children).toHaveLength(1);
		expect(tree.children[0]).toMatchObject({ type: "folder", id: "villains", path: "Codex/Villains.md", children: [] });
	});

	it("in tagFilterMode omits empty organisational folders and folders with only untagged content", () => {
		const folders: CodexFolders = {
			empty: { name: "Empty", order: [] },
			hidden: { name: "Hidden", order: ["Codex/Untagged.md"] },
		};
		const realPaths = new Set(["Codex/Untagged.md"]);
		const tree = resolveCodexTree(folders, ["empty", "hidden"], realPaths, new Set(), { tagFilterMode: true });
		expect(tree.children).toEqual([]);
	});

	it("appends unreferenced real, visible files as unplaced at the root", () => {
		const realPaths = new Set(["Codex/Jane.md", "Codex/Bob.md"]);
		const tree = resolveCodexTree({}, [], realPaths, realPaths);
		expect(tree.children.map((c) => c.name).sort()).toEqual(["Bob", "Jane"]);
	});

	it("silently skips orphaned order entries with no matching folder or file", () => {
		const tree = resolveCodexTree({}, ["Codex/Deleted.md", "ghost-folder"], new Set(), new Set());
		expect(tree.children).toEqual([]);
	});
});

describe("container helpers", () => {
	it("finds, removes, and inserts a key across root and nested folders", () => {
		const folders: CodexFolders = {
			characters: { name: "Characters", order: ["Codex/Jane.md"] },
		};
		const rootOrder = ["characters"];

		expect(findContainer(folders, rootOrder, "Codex/Jane.md")).toEqual({
			order: folders.characters.order,
			folderId: "characters",
		});

		removeFromContainer(folders, rootOrder, "Codex/Jane.md");
		expect(folders.characters.order).toEqual([]);

		insertIntoContainer(folders, rootOrder, null, "Codex/Jane.md", 0);
		expect(rootOrder).toEqual(["Codex/Jane.md", "characters"]);
	});

	it("is a no-op removing a key that isn't found anywhere", () => {
		const folders: CodexFolders = {};
		const rootOrder = ["Codex/Jane.md"];
		removeFromContainer(folders, rootOrder, "Codex/Missing.md");
		expect(rootOrder).toEqual(["Codex/Jane.md"]);
	});
});

describe("isDescendantFolder", () => {
	const folders: CodexFolders = {
		characters: { name: "Characters", order: ["sub"] },
		sub: { name: "Sub", order: [] },
		locations: { name: "Locations", order: [] },
	};

	it("treats a folder as its own descendant (self cycle guard)", () => {
		expect(isDescendantFolder(folders, "characters", "characters")).toBe(true);
	});

	it("finds a direct child", () => {
		expect(isDescendantFolder(folders, "characters", "sub")).toBe(true);
	});

	it("is false for unrelated folders", () => {
		expect(isDescendantFolder(folders, "characters", "locations")).toBe(false);
	});
});

describe("collectReferencedPaths / countFilesInFolder", () => {
	it("recursively collects file paths across nested folders", () => {
		const folders: CodexFolders = {
			characters: { name: "Characters", order: ["Codex/Jane.md", "sub"] },
			sub: { name: "Sub", order: ["Codex/Bob.md"] },
		};
		expect(collectReferencedPaths(folders, ["characters"])).toEqual(new Set(["Codex/Jane.md", "Codex/Bob.md"]));
		expect(countFilesInFolder(folders, "characters")).toBe(2);
		expect(countFilesInFolder(folders, "missing")).toBe(0);
	});
});

describe("flattenCodexTreeFiles", () => {
	it("emits files in fully-expanded tree order, including nested folders", () => {
		const folders: CodexFolders = {
			characters: { name: "Characters", order: ["Codex/Jane.md", "sub"] },
			sub: { name: "Sub", order: ["Codex/Bob.md"] },
		};
		const realPaths = new Set(["Codex/Jane.md", "Codex/Bob.md", "Codex/Unplaced.md"]);
		const tree = resolveCodexTree(folders, ["characters"], realPaths, realPaths);
		expect(flattenCodexTreeFiles(tree).map((e) => e.name)).toEqual(["Jane", "Bob", "Unplaced"]);
	});

	it("emits a lore-entry folder's linked note where the folder sits, then its children", () => {
		const folders: CodexFolders = {
			group: { name: "The Crew", order: ["Codex/Jane.md"], linkedNotePath: "Codex/Crew.md" },
		};
		const realPaths = new Set(["Codex/Crew.md", "Codex/Jane.md"]);
		const tree = resolveCodexTree(folders, ["group"], realPaths, realPaths);
		expect(flattenCodexTreeFiles(tree)).toEqual([
			{ path: "Codex/Crew.md", name: "Crew" },
			{ path: "Codex/Jane.md", name: "Jane" },
		]);
	});
});
