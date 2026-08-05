import { ItemView, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { ICON_FORGE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";

export const FORGE_VIEW_TYPE = "storyforge-forge-view";

/**
 * Right-rail hub for xForge companion panels (nameForge, …).
 * Secondary header shows registered companion icons; the body mounts the active panel.
 */
export class ForgeView extends ItemView {
	private companionsEl: HTMLElement | null = null;
	private panelEl: HTMLElement | null = null;
	private panelDisposer: (() => void) | null = null;
	private activeId: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return FORGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Forge";
	}

	getIcon(): string {
		return ICON_FORGE;
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("sf-forge-view");
		this.companionsEl = this.contentEl.createDiv({ cls: "sf-forge-view__companions" });
		this.panelEl = this.contentEl.createDiv({ cls: "sf-forge-view__panel" });
		this.renderCompanions();
	}

	/**
	 * Re-mount companion header (and panel if needed) after registrations change.
	 * Safe to call when a sibling registers after the leaf is already open.
	 */
	renderCompanions(): void {
		if (!this.companionsEl || !this.panelEl) return;

		const panels = this.plugin.getCompanionPanels();
		if (this.activeId && !panels.some((p) => p.id === this.activeId)) {
			this.activeId = null;
		}
		if (!this.activeId && panels.length > 0) {
			this.activeId = panels[0].id;
		}

		this.companionsEl.empty();
		if (panels.length === 0) {
			this.disposePanel();
			this.panelEl.empty();
			this.panelEl.createDiv({
				cls: "sf-empty",
				text: "No companion plugins registered yet.",
			});
			return;
		}

		for (const panel of panels) {
			const btn = this.companionsEl.createSpan({
				cls: `sf-forge-view__companion${panel.id === this.activeId ? " is-active" : ""}`,
				attr: { "aria-label": panel.label, role: "tab", tabindex: "0" },
			});
			setIcon(btn, panel.icon);
			setTooltip(btn, panel.label);
			const select = () => {
				this.activeId = panel.id;
				this.renderCompanions();
			};
			btn.addEventListener("click", select);
			makeAccessibleActivatable(btn, select);
		}

		this.renderActivePanel();
	}

	async onClose(): Promise<void> {
		this.disposePanel();
		this.companionsEl = null;
		this.panelEl = null;
		this.activeId = null;
		this.contentEl.empty();
	}

	private renderActivePanel(): void {
		if (!this.panelEl) return;
		this.disposePanel();
		this.panelEl.empty();

		const panels = this.plugin.getCompanionPanels();
		const active = panels.find((p) => p.id === this.activeId) ?? null;
		if (!active) {
			this.panelEl.createDiv({
				cls: "sf-empty",
				text: "Select a companion above.",
			});
			return;
		}

		this.panelDisposer = active.renderPanel(this.panelEl);
	}

	private disposePanel(): void {
		if (!this.panelDisposer) return;
		try {
			this.panelDisposer();
		} catch {
			/* sibling disposer must not break the host */
		}
		this.panelDisposer = null;
	}
}
