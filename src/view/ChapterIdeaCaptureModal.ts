import { App, Modal } from "obsidian";

/**
 * Light inline capture for a new idea chapter (hand-off brief §5.3/H2): a single one-line
 * title/beat, so the idea shelf preview shows something meaningful later. Unlike
 * ConvertToSeriesModal, an empty submit is not a no-op — the chapter is created either way (it
 * simply stays "Untitled" until the writer names it), since the point is a low-friction jot, not
 * a mandatory field. This modal itself may take keyboard focus as normal; it's the manuscript
 * editor that must not be disturbed, and the chapter file it creates is never opened.
 */
export class ChapterIdeaCaptureModal extends Modal {
	constructor(
		app: App,
		private onSubmit: (title: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-onboarding-modal");
		contentEl.createEl("h2", { text: "Add chapter idea" });
		contentEl.createDiv({ cls: "sf-modal-hint", text: "A one-line title or beat — optional, and easy to change later." });

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Title or beat" },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit(input.value);
			}
		});

		const actionsRow = contentEl.createDiv({ cls: "sf-onboarding-actions" });
		const submitBtn = actionsRow.createEl("button", { cls: "mod-cta", text: "Add" });
		submitBtn.addEventListener("click", () => this.submit(input.value));

		window.setTimeout(() => input.focus(), 0);
	}

	private submit(rawTitle: string): void {
		this.close();
		this.onSubmit(rawTitle.trim());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
