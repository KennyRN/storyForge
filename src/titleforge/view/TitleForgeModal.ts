import { App, Modal } from "obsidian";
import type { TitleForgeOpenOptions } from "../settings.js";
import type { TitleForgeController } from "../TitleForgeController.js";
import { TitleForgePanel } from "./TitleForgePanel.js";

/**
 * titleForge's one and only surface — a modal window, never a main-area workspace tab (see
 * TitleForgeController's class doc for why). Opened from the ribbon icon, the command, the
 * settings modal's "Open titleForge" button, and a rename modal's dice icon (NovelTitleModal.ts,
 * SeriesTitleModal.ts) — all of it via TitleForgeController.openModal(). All the actual UI/state
 * lives in TitleForgePanel; this class is just a thin Modal shell around it.
 */
export class TitleForgeModal extends Modal {
	private panel: TitleForgePanel | null = null;

	constructor(
		app: App,
		private controller: TitleForgeController,
		private options: TitleForgeOpenOptions = {},
	) {
		super(app);
		this.modalEl.addClass("sf-titleforge-modal");
	}

	async onOpen(): Promise<void> {
		// Wrapping onUse here (rather than in the panel) closes the modal right after a title is
		// used — the panel just needs to call it, not know how to close its own host.
		const onUse = this.options.onUse;
		const wrappedOnUse = onUse
			? (title: string) => {
					onUse(title);
					this.close();
				}
			: undefined;
		this.panel = new TitleForgePanel(this.contentEl, this.controller, {
			scope: this.options.scope ?? "all",
			onUse: wrappedOnUse,
		});
		await this.panel.load();
	}

	onClose(): void {
		this.contentEl.empty();
		this.panel = null;
	}
}
