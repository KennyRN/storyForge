import { ItemView, WorkspaceLeaf } from "obsidian";

export const SPACER_VIEW_TYPE = "storyforge-spacer-view";

/**
 * Empty right-rail leaf that keeps the sidebar open (and the editor visually centred)
 * when the author doesn't want Story Context or Archive in view.
 */
export class SpacerView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return SPACER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Spacer";
	}

	getIcon(): string {
		return "minus";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("sf-spacer-view");
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
