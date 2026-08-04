import { ItemView, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";

export const SPACER_VIEW_TYPE = "storyforge-spacer-view";

/**
 * Empty right-rail leaf that keeps the sidebar open (and the editor visually centred)
 * when the author doesn't want Story Context or Archive in view.
 *
 * Sibling plugins may mount icons into the bottom dock via
 * `api.registerViewContribution({ slot: "spacer", render })`.
 */
export class SpacerView extends ItemView {
	private dockEl: HTMLElement | null = null;
	private disposers: Array<() => void> = [];

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
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
		this.dockEl = this.contentEl.createDiv({ cls: "sf-spacer-view__dock" });
		this.renderContributions();
	}

	/**
	 * Mount (or re-mount) contributions for slot `"spacer"`.
	 * Safe to call when registrations arrive after the leaf is already open.
	 */
	renderContributions(): void {
		this.disposeContributions();
		if (!this.dockEl) return;
		this.dockEl.empty();
		for (const contrib of this.plugin.getViewContributions("spacer")) {
			const slotEl = this.dockEl.createDiv({ cls: "sf-spacer-view__dock-slot" });
			const dispose = contrib.render(slotEl);
			this.disposers.push(dispose);
		}
	}

	async onClose(): Promise<void> {
		this.disposeContributions();
		this.dockEl = null;
		this.contentEl.empty();
	}

	private disposeContributions(): void {
		for (const dispose of this.disposers) {
			try {
				dispose();
			} catch {
				/* sibling disposer must not break the host */
			}
		}
		this.disposers = [];
	}
}
