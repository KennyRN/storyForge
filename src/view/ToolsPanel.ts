import { ItemView, WorkspaceLeaf } from "obsidian";
import { ICON_TOOLS } from "../icons";
import { OBSIDIAN_SELECTORS } from "../obsidianInternals";

export const TOOLS_VIEW_TYPE = "storyforge-tools-view";

export class ToolsView extends ItemView {
	private ribbonEl: HTMLElement | null = null;
	private ribbonOriginalParent: HTMLElement | null = null;
	private ribbonOriginalNextSibling: Node | null = null;
	private tooltipAttrs = new Map<HTMLElement, { position: string | null; delay: string | null }>();

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return TOOLS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Tools";
	}

	getIcon(): string {
		return ICON_TOOLS;
	}

	async onOpen(): Promise<void> {
		document.body.classList.add("sf-tools-open");
		this.contentEl.addClass("sf-tools-view");
		this.mountRibbon();
	}

	async onClose(): Promise<void> {
		document.body.classList.remove("sf-tools-open");
		this.restoreRibbon();
	}

	/** Moves Obsidian's native ribbon into this pane so it's the only thing shown here. */
	private mountRibbon(): void {
		const ribbon = document.querySelector<HTMLElement>(OBSIDIAN_SELECTORS.workspaceRibbon);
		if (!ribbon) return;
		this.ribbonEl = ribbon;
		this.ribbonOriginalParent = ribbon.parentElement;
		this.ribbonOriginalNextSibling = ribbon.nextSibling;
		this.contentEl.appendChild(ribbon);

		// Labels are always visible in this pane, so the hover tooltips (and their delay)
		// are redundant here - strip the trigger attributes and restore them on restoreRibbon()
		// so the native ribbon's tooltips keep working once it's back in its native spot.
		ribbon.querySelectorAll<HTMLElement>(OBSIDIAN_SELECTORS.ribbonAction).forEach((action) => {
			this.tooltipAttrs.set(action, {
				position: action.getAttribute("data-tooltip-position"),
				delay: action.getAttribute("data-tooltip-delay"),
			});
			action.removeAttribute("data-tooltip-position");
			action.removeAttribute("data-tooltip-delay");
		});
	}

	/** Restores the native ribbon to its original spot in the workspace DOM. */
	private restoreRibbon(): void {
		if (!this.ribbonEl || !this.ribbonOriginalParent) return;
		for (const [action, attrs] of this.tooltipAttrs) {
			if (attrs.position !== null) action.setAttribute("data-tooltip-position", attrs.position);
			if (attrs.delay !== null) action.setAttribute("data-tooltip-delay", attrs.delay);
		}
		this.tooltipAttrs.clear();
		this.ribbonOriginalParent.insertBefore(this.ribbonEl, this.ribbonOriginalNextSibling);
		this.ribbonEl = null;
		this.ribbonOriginalParent = null;
		this.ribbonOriginalNextSibling = null;
	}
}
