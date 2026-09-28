import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import { renderCyclingGuideCard, renderDepthGuideCard, renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";

/**
 * Fixed-size modal — "guides to help with storytelling" — wrapping the cycling-guide and depth-guide
 * settings cards behind a "cycling"/"depth" tab bar (cycling: toggle + interval/colour/thickness/flag
 * size/rounded lines + manuscript-page preview; depth: toggle + depth level/chapters covered). Opened
 * from SeriesModal's general tab via the document-page-break hover icon — the cycling card itself
 * used to render inline on that tab, before this modal existed.
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

		const settings = this.plugin.getSettings();
		const tabs: StyleModalTab[] = [
			{
				id: "cycling",
				label: "cycling",
				render: (body) => renderCyclingGuideCard(this.app, this.plugin, body, settings, true),
			},
			{
				id: "depth",
				label: "depth",
				render: (body) => renderDepthGuideCard(this.plugin, body, settings),
			},
		];
		renderTabbedBody(contentEl, tabs);
	}
}
