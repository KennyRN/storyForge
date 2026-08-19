import { App, Modal, setIcon } from "obsidian";

/**
 * Renders a scrollable, most-recent-first list of rolled titles, each with a plain right-arrow icon
 * that hands the title back to the caller via `onSelect`. Shared by SeriesNameGeneratorSettingsModal's
 * "recently generated series name" pane (embedded, alongside its genre picker) and TitleHistoryModal
 * below (standalone), so both fields' recent-rolls lists render and behave identically.
 */
export function renderTitleHistoryList(
	host: HTMLElement,
	history: string[],
	onSelect: (title: string) => void,
	emptyText = "No titles rolled yet.",
): HTMLElement {
	const list = host.createDiv({ cls: "sf-title-gen-history-list" });
	if (history.length === 0) {
		list.createDiv({ cls: "sf-title-gen-history-empty", text: emptyText });
		return list;
	}
	for (const title of history) {
		const row = list.createDiv({ cls: "sf-title-gen-history-item" });
		row.createSpan({ cls: "sf-title-gen-history-title", text: title });
		const useBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": `Use "${title}"` },
		});
		setIcon(useBtn, "arrow-right");
		useBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onSelect(title);
		});
	}
	return list;
}

/**
 * Headerless, fixed-size modal mirroring SeriesNameGeneratorSettingsModal's "recently generated
 * series name" pane, but on its own - opened from the book title field's history icon
 * (SeriesOnboardingModal.createBookTitleField). Picking a row hands its title back and closes.
 */
export class TitleHistoryModal extends Modal {
	constructor(
		app: App,
		private history: string[],
		private onSelect: (title: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-title-history-modal-el");
		const { contentEl } = this;
		contentEl.addClass("sf-title-history-modal");
		renderTitleHistoryList(contentEl, this.history, (title) => {
			this.onSelect(title);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
