import { describe, expect, it } from "vitest";
import {
	existingMainContentLeaf,
	isRootSplitLeaf,
	resolveMainContentLeaf,
	type MainContentLeaf,
	type MainContentWorkspace,
} from "../mainContentLeaf";

const rootSplit = { name: "root" };
const leftSplit = { name: "left" };
const rightSplit = { name: "right" };

function leaf(id: string, root: unknown): MainContentLeaf & { id: string } {
	return { id, getRoot: () => root };
}

function workspace(opts: {
	byId?: Record<string, MainContentLeaf>;
	recentInRoot?: MainContentLeaf | null;
	created?: MainContentLeaf;
}): MainContentWorkspace {
	const created = opts.created ?? leaf("created-tab", rootSplit);
	return {
		rootSplit,
		getLeafById: (id) => opts.byId?.[id] ?? null,
		getMostRecentLeaf: (root) => {
			if (root === rootSplit) return opts.recentInRoot ?? null;
			return null;
		},
		getLeaf: (newLeaf) => {
			if (newLeaf === "tab") return created;
			return leaf("active-sidebar", leftSplit);
		},
	};
}

describe("isRootSplitLeaf", () => {
	it("accepts a leaf whose root is the workspace root split", () => {
		expect(isRootSplitLeaf({ rootSplit }, leaf("main", rootSplit))).toBe(true);
	});

	it("rejects sidebar leaves", () => {
		expect(isRootSplitLeaf({ rootSplit }, leaf("storytelling", leftSplit))).toBe(false);
		expect(isRootSplitLeaf({ rootSplit }, leaf("context", rightSplit))).toBe(false);
	});
});

describe("existingMainContentLeaf", () => {
	it("returns null when nothing is tracked yet", () => {
		expect(existingMainContentLeaf(workspace({}), null)).toBeNull();
	});

	it("returns null when the tracked leaf has been closed", () => {
		expect(existingMainContentLeaf(workspace({ byId: {} }), "gone")).toBeNull();
	});

	it("returns null when the tracked leaf is a sidebar (wrongly adopted earlier)", () => {
		const sidebar = leaf("storytelling", leftSplit);
		expect(
			existingMainContentLeaf(workspace({ byId: { storytelling: sidebar } }), "storytelling"),
		).toBeNull();
	});

	it("returns the tracked leaf when it is still in the root split", () => {
		const main = leaf("main", rootSplit);
		expect(existingMainContentLeaf(workspace({ byId: { main } }), "main")).toBe(main);
	});
});

describe("resolveMainContentLeaf", () => {
	it("reuses a valid tracked root-split leaf", () => {
		const main = leaf("main", rootSplit);
		const ws = workspace({ byId: { main }, recentInRoot: leaf("other", rootSplit) });
		expect(resolveMainContentLeaf(ws, "main")).toBe(main);
	});

	it("does not adopt the active sidebar via getLeaf(false)", () => {
		const center = leaf("center", rootSplit);
		const ws = workspace({ recentInRoot: center });
		expect(resolveMainContentLeaf(ws, null)).toBe(center);
	});

	it("creates a root-split tab when the center has no leaf yet", () => {
		const created = leaf("new-tab", rootSplit);
		const ws = workspace({ created, recentInRoot: null });
		expect(resolveMainContentLeaf(ws, null)).toBe(created);
	});

	it("self-heals after a sidebar leaf was stored as the tracked id", () => {
		const sidebar = leaf("storytelling", leftSplit);
		const center = leaf("center", rootSplit);
		const ws = workspace({ byId: { storytelling: sidebar }, recentInRoot: center });
		expect(resolveMainContentLeaf(ws, "storytelling")).toBe(center);
	});
});
