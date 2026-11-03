import { describe, expect, it } from "vitest";
import type { CodexFolders, CodexTreeItem } from "../../core/codexTree";
import { clearFilter, isFiltering, newTypeFilter, resolveFiltered, toggleType, toggleUntyped } from "../faces/codexFilter";

// Decision 107: the filtered Codex tree's folder rules, and the filter's own state. (The matching itself is the core's.)
const P = (n: string) => `Codex/${n}.md`;
const folders: CodexFolders = {
	cast: { name: "Cast", order: [P("Jane"), P("Sam")] },
	harbour: { name: "Harbour", order: [P("Dock")], linkedNotePath: P("Harbour") },
	empty: { name: "Empty one", order: [] },
	nest: { name: "Nest", order: ["cast"] },
};
const real = new Set([P("Jane"), P("Sam"), P("Dock"), P("Harbour"), P("Loose"), P("Plain")]);
const order = ["nest", "harbour", "empty", P("Plain")];
const names = (items: CodexTreeItem[]): string[] => items.map((i) => (i.type === "folder" ? `[${i.name}: ${names(i.children).join(", ")}]` : i.name));

describe("the filtered Codex tree", () => {
	it("shows a folder when anything inside it shows, however deep, and only the matching notes", () => {
		const tree = resolveFiltered(folders, order, real, new Set([P("Jane")]));
		expect(names(tree.children)).toEqual(["[Nest: [Cast: Jane]]"]);
	});

	it("shows a folder whose own linked note matches, even when none of its children do", () => {
		const tree = resolveFiltered(folders, order, real, new Set([P("Harbour")]));
		expect(names(tree.children)).toEqual(["[Harbour: ]"]);
		const folder = tree.children[0];
		expect(folder.type === "folder" && folder.path).toBe(P("Harbour"));
	});

	it("hides a folder with nothing showing, including an empty one (so there is no Empty line)", () => {
		const tree = resolveFiltered(folders, order, real, new Set([P("Plain")]));
		expect(names(tree.children)).toEqual(["Plain"]);
	});

	it("keeps a folder created while filtering until the filter changes", () => {
		const tree = resolveFiltered(folders, order, real, new Set([P("Plain")]), new Set(["empty"]));
		expect(names(tree.children)).toEqual(["[Empty one: ]", "Plain"]);
	});

	it("shows a matching note that is in no folder, after the placed ones", () => {
		const tree = resolveFiltered(folders, order, real, new Set([P("Loose"), P("Jane")]));
		expect(names(tree.children)).toEqual(["[Nest: [Cast: Jane]]", "Loose"]);
	});

	it("shows nothing when nothing matches", () => {
		expect(resolveFiltered(folders, order, real, new Set()).children).toEqual([]);
	});
});

describe("the filter's state", () => {
	it("ticks a type, ticks Untyped, and Show all clears both", () => {
		const f = newTypeFilter();
		expect(isFiltering(f)).toBe(false);
		toggleType(f, "person");
		toggleType(f, "place");
		expect([...f.types]).toEqual(["person", "place"]);
		toggleType(f, "person");
		expect([...f.types]).toEqual(["place"]);
		toggleUntyped(f);
		expect(f.untyped).toBe(true);
		expect(isFiltering(f)).toBe(true);
		clearFilter(f);
		expect(isFiltering(f)).toBe(false);
	});

	it("what was kept visible while filtering is let go when the filter next changes", () => {
		const f = newTypeFilter();
		toggleType(f, "person");
		f.keptNotes.add(P("New"));
		f.keptFolders.add("fresh");
		toggleUntyped(f);
		expect(f.keptNotes.size + f.keptFolders.size).toBe(0);
	});
});
