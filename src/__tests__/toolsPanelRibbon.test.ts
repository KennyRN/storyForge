import { describe, expect, it } from "vitest";
import {
	isRibbonActionShown,
	listVisibleRibbonActions,
	resolveWorkspaceRibbon,
	returnRibbonToWorkspace,
	ribbonActionLabel,
} from "../ribbonRelocation";

describe("resolveWorkspaceRibbon", () => {
	it("prefers leftRibbon.containerEl when that node actually holds ribbon actions", () => {
		const detached = {
			id: "detached",
			querySelector: () => ({ id: "action" }),
		} as unknown as HTMLElement;
		const live = { id: "live" } as unknown as HTMLElement;
		const doc = { querySelector: () => live } as unknown as Document;
		expect(resolveWorkspaceRibbon({ containerEl: detached }, doc)).toBe(detached);
	});

	it("falls back to a document query when the API node has no actions", () => {
		const emptyApi = {
			id: "api",
			querySelector: () => null,
		} as unknown as HTMLElement;
		const live = { id: "live" } as unknown as HTMLElement;
		const doc = { querySelector: () => live } as unknown as Document;
		expect(resolveWorkspaceRibbon({ containerEl: emptyApi }, doc)).toBe(live);
	});

	it("falls back to a document query when the API handle is missing", () => {
		const live = { id: "live" } as unknown as HTMLElement;
		const doc = { querySelector: () => live } as unknown as Document;
		expect(resolveWorkspaceRibbon({}, doc)).toBe(live);
		expect(resolveWorkspaceRibbon(null, doc)).toBe(live);
	});
});

describe("isRibbonActionShown", () => {
	function action(opts: { hidden?: boolean; ariaHidden?: string; cls?: string; display?: string }): HTMLElement {
		const classSet = new Set(opts.cls ? [opts.cls] : []);
		const attrs = new Map<string, string>();
		if (opts.hidden) attrs.set("hidden", "");
		if (opts.ariaHidden) attrs.set("aria-hidden", opts.ariaHidden);
		return {
			classList: { contains: (name: string) => classSet.has(name) },
			hasAttribute: (name: string) => attrs.has(name),
			getAttribute: (name: string) => attrs.get(name) ?? null,
			style: { display: opts.display ?? "" },
		} as unknown as HTMLElement;
	}

	it("keeps a normal action", () => {
		expect(isRibbonActionShown(action({}))).toBe(true);
	});

	it("drops actions the user hid from the ribbon menu", () => {
		expect(isRibbonActionShown(action({ hidden: true }))).toBe(false);
		expect(isRibbonActionShown(action({ ariaHidden: "true" }))).toBe(false);
		expect(isRibbonActionShown(action({ cls: "is-hidden" }))).toBe(false);
		expect(isRibbonActionShown(action({ display: "none" }))).toBe(false);
	});
});

describe("listVisibleRibbonActions", () => {
	it("returns tagged actions in order, skipping hidden ones", () => {
		const visible = {
			classList: { contains: () => false },
			hasAttribute: () => false,
			getAttribute: () => null,
			style: { display: "" },
		} as unknown as HTMLElement;
		const hidden = {
			classList: { contains: () => false },
			hasAttribute: () => true,
			getAttribute: () => null,
			style: { display: "none" },
		} as unknown as HTMLElement;
		const ribbon = {
			querySelectorAll: () => [visible, hidden],
		} as unknown as HTMLElement;
		expect(listVisibleRibbonActions(ribbon)).toEqual([visible]);
	});
});

describe("ribbonActionLabel", () => {
	it("prefers aria-label over title", () => {
		const el = {
			getAttribute: (name: string) => (name === "aria-label" ? "Open graph" : "Graph"),
		} as unknown as HTMLElement;
		expect(ribbonActionLabel(el)).toBe("Open graph");
	});
});

describe("returnRibbonToWorkspace", () => {
	it("moves a ribbon hosted in the tools pane back under .workspace", () => {
		const ribbon = { id: "ribbon" };
		const tools = { containsRibbon: true };
		const workspace = {
			marbles: [] as unknown[],
			insertBefore(node: unknown, _ref: unknown) {
				this.marbles.push(node);
			},
			firstChild: null,
		};
		const doc = {
			querySelector: (sel: string) => {
				if (sel.includes("sf-tools-view")) return ribbon;
				if (sel === ".workspace") return workspace;
				return null;
			},
		} as unknown as Document;
		(ribbon as unknown as { parentElement: unknown }).parentElement = tools;
		returnRibbonToWorkspace(doc);
		expect(workspace.marbles).toEqual([ribbon]);
	});

	it("no-ops when the ribbon is not inside the tools pane", () => {
		const doc = { querySelector: () => null } as unknown as Document;
		expect(() => returnRibbonToWorkspace(doc)).not.toThrow();
	});
});
