import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import { ProtectionsController } from "./protectionsController";

/** Thin Modal wrapper around ProtectionsController's backup controls. */
export class ProtectionsModal extends Modal {
	private controller: ProtectionsController;

	constructor(
		app: App,
		private plugin: StoryForgePlugin,
	) {
		super(app);
		this.controller = new ProtectionsController(app, plugin);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-protections-modal");
		this.titleEl.remove();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-protections-modal");
		this.controller.renderBackupSection(contentEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
