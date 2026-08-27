import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import { renderCyclingGuideCard } from "./styleModalHelpers";

/**
 * Fixed-size modal wrapping the cycling-guide settings card (toggle + interval/colour/thickness/
 * flag size/rounded lines + manuscript-page preview). Opened from SeriesModal's general tab via
 * the document-page-break hover icon — the card itself used to render inline on that tab.
 */
export class CyclingGuideModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-cycling-guide-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-cycling-guide-modal");

		// Same scroll shell as HideUiModal — without it, the fixed-height modal clips content.
		const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
		const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });
		renderCyclingGuideCard(this.app, this.plugin, body, this.plugin.getSettings(), true);
	}
}
