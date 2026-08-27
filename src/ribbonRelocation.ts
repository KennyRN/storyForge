import { OBSIDIAN_SELECTORS } from "./obsidianInternals";

/** Runtime-public on WorkspaceRibbon; omitted from published typings. */
export type LeftRibbonRuntime = { containerEl?: HTMLElement | null };

/**
 * Prefer Workspace.leftRibbon.containerEl over a live-document query: the node still
 * exists (and still holds the action buttons) when Appearance → Show ribbon is off
 * or when CSS has set display:none on the strip.
 */
export function resolveWorkspaceRibbon(leftRibbon: LeftRibbonRuntime | null | undefined, doc: Document): HTMLElement | null {
	const fromApi = leftRibbon?.containerEl ?? null;
	const fromDom = doc.querySelector<HTMLElement>(OBSIDIAN_SELECTORS.workspaceRibbon);
	const apiHasActions =
		fromApi &&
		typeof fromApi.querySelector === "function" &&
		fromApi.querySelector(OBSIDIAN_SELECTORS.ribbonAction);
	if (apiHasActions) return fromApi;
	if (fromDom) return fromDom;
	return fromApi;
}

/** True when this action is one the user has not hidden from the ribbon menu. */
export function isRibbonActionShown(action: HTMLElement): boolean {
	if (action.hasAttribute("hidden") || action.getAttribute("aria-hidden") === "true") return false;
	if (action.classList.contains("is-hidden")) return false;
	if (action.style.display === "none") return false;
	return true;
}

export function ribbonActionLabel(action: HTMLElement): string {
	return (action.getAttribute("aria-label") || action.getAttribute("title") || "").trim();
}

/**
 * Ribbon buttons in DOM order (plugin icons, then Help/Settings). Skips the collapse
 * control. Used to paint the Tools pane without moving the native strip.
 */
export function listVisibleRibbonActions(ribbon: HTMLElement): HTMLElement[] {
	const tagged = Array.from(ribbon.querySelectorAll<HTMLElement>(OBSIDIAN_SELECTORS.ribbonAction));
	const actions =
		tagged.length > 0
			? tagged
			: Array.from(ribbon.querySelectorAll<HTMLElement>(".clickable-icon")).filter(
					(el) => !el.classList.contains("workspace-ribbon-collapse-btn"),
				);
	return actions.filter(isRibbonActionShown);
}

/**
 * If an older Tools-panel build reparented the native ribbon into a view, put it back
 * so the strip lives under `.workspace` again (still hidden by sf-use-tools-panel CSS).
 */
export function returnRibbonToWorkspace(doc: Document): void {
	const hosted = doc.querySelector<HTMLElement>(`.sf-tools-view ${OBSIDIAN_SELECTORS.workspaceRibbon}`);
	if (!hosted) return;
	const workspace = doc.querySelector(".workspace");
	if (!workspace || hosted.parentElement === workspace) return;
	workspace.insertBefore(hosted, workspace.firstChild);
}
