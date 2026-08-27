import { ItemView, WorkspaceLeaf } from "obsidian";
import { ICON_TOOLS } from "../icons";
import { debounce } from "../debounce";
import {
	listVisibleRibbonActions,
	resolveWorkspaceRibbon,
	returnRibbonToWorkspace,
	ribbonActionLabel,
} from "../ribbonRelocation";
import { makeAccessibleActivatable } from "./a11y";

export const TOOLS_VIEW_TYPE = "storyforge-tools-view";

export class ToolsView extends ItemView {
	private listEl: HTMLElement | null = null;
	private ribbonObserver: MutationObserver | null = null;
	private lastSignature = "";

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
		this.listEl = this.contentEl.createDiv({ cls: "sf-tools-list" });
		this.render();
		this.registerEvent(this.app.workspace.on("layout-change", this.debouncedRender));
		this.registerEvent(this.app.workspace.on("css-change", this.debouncedRender));
		this.register(() => this.teardown());
	}

	async onClose(): Promise<void> {
		this.teardown();
	}

	/**
	 * Puts a previously reparented native ribbon back under `.workspace`. Kept for
	 * onunload / rebuildView so a hot-reload from the old move-the-node Tools panel
	 * cannot leave the strip stranded inside a dying leaf.
	 */
	restoreRibbon(): void {
		returnRibbonToWorkspace(this.containerEl.ownerDocument);
	}

	private readonly debouncedRender = debounce(() => this.render(), 50);

	private render(): void {
		if (!this.listEl) return;
		const doc = this.containerEl.ownerDocument;
		returnRibbonToWorkspace(doc);
		const ribbon = resolveWorkspaceRibbon(this.app.workspace.leftRibbon as { containerEl?: HTMLElement }, doc);
		if (!ribbon) {
			this.replaceList("missing", () => {
				this.listEl?.createDiv({
					cls: "sf-tools-empty",
					text: "Ribbon actions will appear here once Obsidian's ribbon is available.",
				});
			});
			return;
		}
		this.observeNativeRibbon(ribbon);
		const actions = listVisibleRibbonActions(ribbon);
		if (actions.length === 0) {
			this.replaceList("empty", () => {
				this.listEl?.createDiv({
					cls: "sf-tools-empty",
					text: "No ribbon actions to show. Right-click Obsidian's ribbon to re-enable hidden items.",
				});
			});
			return;
		}
		const signature = actions.map((a) => `${ribbonActionLabel(a)}\0${a.querySelector("svg")?.outerHTML ?? ""}`).join("\n");
		this.replaceList(signature, () => {
			for (const action of actions) this.renderAction(action);
		});
	}

	private replaceList(signature: string, paint: () => void): void {
		if (!this.listEl) return;
		if (signature === this.lastSignature && this.listEl.childElementCount > 0) return;
		this.lastSignature = signature;
		this.listEl.empty();
		paint();
	}

	private renderAction(action: HTMLElement): void {
		if (!this.listEl) return;
		const label = ribbonActionLabel(action);
		const row = this.listEl.createDiv({
			cls: "side-dock-ribbon-action clickable-icon",
			attr: { "aria-label": label || "Ribbon action" },
		});
		const svg = action.querySelector("svg");
		if (svg) row.appendChild(svg.cloneNode(true));
		const activate = () => action.click();
		row.addEventListener("click", (evt) => {
			evt.preventDefault();
			activate();
		});
		row.addEventListener("contextmenu", (evt) => {
			action.dispatchEvent(
				new MouseEvent("contextmenu", {
					bubbles: true,
					cancelable: true,
					clientX: evt.clientX,
					clientY: evt.clientY,
				}),
			);
		});
		makeAccessibleActivatable(row, activate);
	}

	private observeNativeRibbon(ribbon: HTMLElement): void {
		if (this.ribbonObserver) return;
		this.ribbonObserver = new MutationObserver(() => this.debouncedRender());
		this.ribbonObserver.observe(ribbon, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-label"],
		});
	}

	private teardown(): void {
		this.debouncedRender.cancel();
		this.ribbonObserver?.disconnect();
		this.ribbonObserver = null;
		this.lastSignature = "";
		returnRibbonToWorkspace(this.containerEl.ownerDocument);
		document.body.classList.remove("sf-tools-open");
		this.listEl = null;
	}
}
