import { App, Modal, Setting } from "obsidian";

/** Confirmation prompt for deleting a tag/type — shared by TagRegistryModal and TagPickerModal. */
class ConfirmDeleteModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private label: string,
		private resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Delete "${this.label}"?`);
		this.contentEl.createEl("p", {
			text: "Anything already tagged with this keeps its raw id — it'll just stop showing an icon or label for it.",
		});
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.finish(false)))
			.addButton((b) => b.setButtonText("Delete").setDestructive().setCta().onClick(() => this.finish(true)));
	}

	onClose(): void {
		if (!this.settled) this.resolve(false);
	}

	private finish(value: boolean): void {
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

export function confirmDelete(app: App, label: string): Promise<boolean> {
	return new Promise((resolve) => new ConfirmDeleteModal(app, label, resolve).open());
}
