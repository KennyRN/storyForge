import { App, Modal, setIcon, setTooltip, TFile } from "obsidian";
import { getArchivedCodexItems, unarchiveCodexItem, type ArchivedCodexItem } from "../codex";
import { ICON_ARCHIVE, ICON_UNARCHIVE } from "../icons";
import { stripForCounting } from "../wordCount";

const EXCERPT_LENGTH = 200;

/** Collapses a note's raw markdown into a short, single-line preview for the row tooltip. */
function noteExcerpt(raw: string): string {
	const collapsed = stripForCounting(raw).trim().replace(/\s+/g, " ");
	if (!collapsed) return "";
	return collapsed.length > EXCERPT_LENGTH ? `${collapsed.slice(0, EXCERPT_LENGTH).trimEnd()}…` : collapsed;
}

/**
 * Modal listing archived Codex items — global, not scoped to any book (unlike the book-pane
 * ArchiveModal). Folder entries were archived as a unit and are restored with their previous
 * nested contents intact, shown as "<name> (folder with x children)"; file entries show a lazy
 * excerpt tooltip on hover, same as the book-pane archive modal.
 */
export class CodexArchiveModal extends Modal {
	private onChange: () => void;
	private archived: ArchivedCodexItem[] = [];

	constructor(app: App, onChange: () => void) {
		super(app);
		this.onChange = onChange;
	}

	onOpen(): void {
		this.titleEl.remove();
		this.archived = getArchivedCodexItems(this.app);
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async attachExcerptTooltip(el: HTMLElement, path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const excerpt = noteExcerpt(await this.app.vault.read(file));
		if (excerpt) setTooltip(el, excerpt);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-archive-modal");

		const headerRow = contentEl.createDiv({ cls: "sf-archive-modal-header" });
		setIcon(headerRow.createSpan({ cls: "sf-icon" }), ICON_ARCHIVE);
		headerRow.createEl("h2", { text: "Archived Codex Items" });

		if (this.archived.length === 0) {
			contentEl.createDiv({ cls: "sf-empty", text: "No archived codex items." });
			return;
		}

		const list = contentEl.createDiv({ cls: "sf-archive-list" });
		for (const entry of this.archived) {
			const row = list.createDiv({ cls: "sf-row" });
			const label =
				entry.type === "folder" ? `${entry.name} (folder with ${entry.childCount ?? 0} children)` : entry.name;
			row.createSpan({ cls: "sf-archive-label", text: label });
			if (entry.type === "file") {
				void this.attachExcerptTooltip(row, entry.key);
			}
			const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
			setIcon(unarchiveBtn, ICON_UNARCHIVE);
			unarchiveBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await unarchiveCodexItem(this.app, entry.key);
				this.archived = this.archived.filter((a) => a.key !== entry.key);
				this.onChange();
				this.render();
			});
		}
	}
}
