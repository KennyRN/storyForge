import { App, Modal, setIcon } from "obsidian";
import { ICON_REGISTRY } from "../iconRegistry";

/** Lists every icon storyForge knows about (custom and stock), where each is used, and flags any with no known usage. */
export class IconAuditModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-icon-audit-modal");

		contentEl.createEl("h2", { text: "Icon usage" });

		const unusedCount = ICON_REGISTRY.filter((entry) => entry.usedIn.length === 0).length;
		contentEl.createEl("p", {
			cls: "sf-icon-audit-summary",
			text:
				unusedCount === 0
					? `${ICON_REGISTRY.length} icons, all in use.`
					: `${ICON_REGISTRY.length} icons, ${unusedCount} with no known usage.`,
		});

		const sorted = [...ICON_REGISTRY].sort((a, b) => a.usedIn.length - b.usedIn.length || a.label.localeCompare(b.label));

		const list = contentEl.createDiv({ cls: "sf-icon-audit-list" });
		for (const entry of sorted) {
			const row = list.createDiv({ cls: "sf-icon-audit-row" });
			if (entry.usedIn.length === 0) row.addClass("sf-icon-audit-unused");

			setIcon(row.createDiv({ cls: "sf-icon-audit-preview" }), entry.id);

			const info = row.createDiv({ cls: "sf-icon-audit-info" });
			const headerLine = info.createDiv({ cls: "sf-icon-audit-header-line" });
			headerLine.createSpan({ cls: "sf-icon-audit-label", text: entry.label });
			headerLine.createEl("code", { cls: "sf-icon-audit-id", text: entry.id });
			headerLine.createSpan({ cls: "sf-icon-audit-source", text: entry.source });

			if (entry.usedIn.length > 0) {
				const usedList = info.createEl("ul", { cls: "sf-icon-audit-used-list" });
				for (const usage of entry.usedIn) {
					usedList.createEl("li", { text: usage });
				}
			} else {
				info.createDiv({ cls: "sf-icon-audit-unused-badge", text: "No known usage" });
			}
		}
	}
}
