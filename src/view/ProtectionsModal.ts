import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import { formatCompanionState } from "../formatCompanionActive";
import { renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";
import { ProtectionsController } from "./protectionsController";

/**
 * Thin Modal wrapper around ProtectionsController — the actual state and rendering now live there
 * (shared with SeriesModal.ts's general tab, which renders the same two sections inline instead of
 * behind this modal). This class only owns the tabbed-modal presentation (Themes/Backup tab bar).
 */
export class ProtectionsModal extends Modal {
	private controller: ProtectionsController;

	constructor(
		app: App,
		private plugin: StoryForgePlugin,
	) {
		super(app);
		this.controller = new ProtectionsController(app, plugin, () => this.render());
	}

	onOpen(): void {
		this.modalEl.addClass("sf-protections-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-protections-modal");

		const companionState = formatCompanionState(
			this.plugin.getFormatCompanion(),
			this.plugin.api?.formatting?.isCompanionActive() === true,
			this.app,
		);

		const tabs: StyleModalTab[] = [];
		// Only a live companion takes formatting over. If formatForge is enabled but has
		// not registered (still loading, or failed to load), keep this fallback available.
		if (companionState !== "connected") {
			tabs.push({
				id: "import-export",
				label: "Themes",
				render: (body) => this.controller.renderThemesSection(body, companionState),
			});
		}
		tabs.push({
			id: "backup",
			label: "Backup",
			render: (body) => this.controller.renderBackupSection(body, companionState),
		});

		renderTabbedBody(contentEl, tabs);
	}
}
