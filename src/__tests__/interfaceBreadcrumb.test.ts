import { describe, expect, it } from "vitest";
import {
	clickBreadcrumb,
	ensureLeafPath,
	groupsForPath,
	isLeafNode,
	nodeAtPath,
	type BreadcrumbNode,
} from "../view/interfaceBreadcrumb";

const tree: BreadcrumbNode[] = [
	{
		id: "visual",
		label: "visual interface editing",
		icon: "visual",
		children: [
			{
				id: "storyforge",
				label: "storyforge",
				icon: "storyforge",
				children: [
					{ id: "series", label: "series", icon: "series", render: () => undefined },
					{ id: "library", label: "library", icon: "library", render: () => undefined },
				],
			},
			{ id: "storytelling", label: "storytelling", icon: "storytelling", render: () => undefined },
			{
				id: "story-context",
				label: "story context",
				icon: "clipboard",
				children: [
					{ id: "chrome", label: "navigation", icon: "nav", render: () => undefined },
					{ id: "novel", label: "novel", icon: "novel", render: () => undefined },
					{ id: "box", label: "chapter", icon: "chapter", render: () => undefined },
					{ id: "details", label: "dossier", icon: "dossier", render: () => undefined },
					{ id: "archive", label: "archive", icon: "archive", render: () => undefined },
				],
			},
		],
	},
	{
		id: "list",
		label: "list interface editing",
		icon: "list",
		children: [{ id: "text", label: "text", icon: "text", render: () => undefined }],
	},
];

describe("clickBreadcrumb", () => {
	it("selects a root with an empty path", () => {
		expect(clickBreadcrumb([], 0, "visual")).toEqual(["visual"]);
	});

	it("replaces descendants when a higher-level sibling is clicked", () => {
		expect(clickBreadcrumb(["visual", "storyforge", "series"], 0, "list")).toEqual(["list"]);
		expect(clickBreadcrumb(["visual", "storyforge", "series"], 1, "storytelling")).toEqual([
			"visual",
			"storytelling",
		]);
	});

	it("extends the path when a child is clicked", () => {
		expect(clickBreadcrumb(["visual", "storyforge"], 2, "library")).toEqual([
			"visual",
			"storyforge",
			"library",
		]);
	});
});

describe("groupsForPath", () => {
	it("starts with only the top-tier icons", () => {
		expect(groupsForPath(tree, []).map((group) => group.map((n) => n.id))).toEqual([
			["visual", "list"],
		]);
	});

	it("reveals the next tier beside a selected ancestor", () => {
		expect(groupsForPath(tree, ["visual"]).map((group) => group.map((n) => n.id))).toEqual([
			["visual", "list"],
			["storyforge", "storytelling", "story-context"],
		]);
		expect(
			groupsForPath(tree, ["visual", "storyforge"]).map((group) => group.map((n) => n.id)),
		).toEqual([
			["visual", "list"],
			["storyforge", "storytelling", "story-context"],
			["series", "library"],
		]);
	});

	it("does not add a group after a leaf", () => {
		expect(
			groupsForPath(tree, ["visual", "storytelling"]).map((group) => group.map((n) => n.id)),
		).toEqual([
			["visual", "list"],
			["storyforge", "storytelling", "story-context"],
		]);
	});

	it("promotes novel, chapter, and dossier beside navigation and archive", () => {
		expect(
			groupsForPath(tree, ["visual", "story-context"]).map((group) => group.map((n) => n.id)),
		).toEqual([
			["visual", "list"],
			["storyforge", "storytelling", "story-context"],
			["chrome", "novel", "box", "details", "archive"],
		]);
	});
});

describe("nodeAtPath / isLeafNode", () => {
	it("resolves story-context children at the promoted depth", () => {
		expect(nodeAtPath(tree, ["visual", "story-context"])?.icon).toBe("clipboard");
		expect(nodeAtPath(tree, ["visual", "story-context", "novel"])?.icon).toBe("novel");
		expect(nodeAtPath(tree, ["visual", "story-context", "box"])?.icon).toBe("chapter");
	});

	it("treats nodes with children as non-leaves", () => {
		expect(isLeafNode(nodeAtPath(tree, ["visual"]))).toBe(false);
		expect(isLeafNode(nodeAtPath(tree, ["visual", "storytelling"]))).toBe(true);
		expect(isLeafNode(nodeAtPath(tree, ["visual", "story-context"]))).toBe(false);
		expect(isLeafNode(nodeAtPath(tree, ["visual", "story-context", "novel"]))).toBe(true);
	});
});

describe("ensureLeafPath", () => {
	it("is a no-op on a leaf", () => {
		expect(ensureLeafPath(tree, ["visual", "storytelling"])).toEqual(["visual", "storytelling"]);
	});

	it("appends the first child when no preference is given", () => {
		expect(ensureLeafPath(tree, ["visual"])).toEqual(["visual", "storyforge", "series"]);
		expect(ensureLeafPath(tree, ["list"])).toEqual(["list", "text"]);
	});

	it("uses preferredChild when that id exists among children", () => {
		expect(
			ensureLeafPath(tree, ["visual"], (id) => (id === "visual" ? "storytelling" : undefined)),
		).toEqual(["visual", "storytelling"]);
		expect(
			ensureLeafPath(tree, ["visual", "storyforge"], (id) => (id === "storyforge" ? "library" : undefined)),
		).toEqual(["visual", "storyforge", "library"]);
	});

	it("falls back to the first child when preferredChild is missing", () => {
		expect(ensureLeafPath(tree, ["visual"], () => "missing")).toEqual(["visual", "storyforge", "series"]);
	});
});

describe("dual-icon nodes", () => {
	const dualTree: BreadcrumbNode[] = [
		{
			id: "body",
			label: "Body",
			icon: "body",
			children: [
				{
					id: "links",
					label: "Links and lists",
					icon: "link",
					icons: ["link", "list"],
					render: () => undefined,
				},
			],
		},
	];

	it("treats a dual-icon crumb as one sibling", () => {
		expect(groupsForPath(dualTree, ["body"]).map((group) => group.map((n) => n.id))).toEqual([
			["body"],
			["links"],
		]);
		expect(nodeAtPath(dualTree, ["body", "links"])?.icons).toEqual(["link", "list"]);
		expect(isLeafNode(nodeAtPath(dualTree, ["body", "links"]))).toBe(true);
	});
});
