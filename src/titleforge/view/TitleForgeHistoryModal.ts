import { Modal, type App } from "obsidian";
import type { GeneratorSpec, HistoryEntry } from "../engine/types.js";
import type { TitleForgeController } from "../TitleForgeController.js";
import { renderTitleRow } from "./titleRow.js";

/**
 * "Previous generations" — every title ever generated across every tradition reachable in the
 * panel's own scope (TitleForgePanel.renderBottomBar passes `scopedGeneratorIds()`, the same set
 * "kept titles" pools from), newest first — not scoped down to just the currently active
 * section/generator. Moved out here so the inline box (TitleForgePanel.renderHistory) can stay
 * just the current batch. Headerless, same shell treatment as nameForge's own previous-generations
 * modal.
 *
 * Every row carries the same info/short-list/use-this-title actions the inline rows do (see
 * titleRow.ts) — nothing is lost by the move. Kept-toggling here re-reads/re-writes straight from
 * storage rather than threading through the panel's own in-memory state, since the panel isn't
 * showing this generator's history while the modal is open.
 */
export class TitleForgeHistoryModal extends Modal {
	private contentHost: HTMLElement | null = null;

	constructor(
		app: App,
		private controller: TitleForgeController,
		/** Every generator id whose history this modal should pool and show, newest first —
		 * TitleForgePanel.renderBottomBar passes every tradition reachable in the panel's own scope
		 * (`scopedGeneratorIds()`), not just the currently active section. */
		private generatorIds: string[],
		private opts: { onUse?: (title: string) => void; useTooltipFor?: (generatorId: string) => string } = {},
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.empty();
		this.titleEl.hide();
		this.modalEl.addClass("titleforge-history-modal");

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("titleforge-history-modal-content");
		this.contentHost = contentEl;

		void this.renderList();
	}

	onClose(): void {
		this.contentEl.empty();
		this.contentHost = null;
	}

	private async renderList(): Promise<void> {
		const host = this.contentHost;
		if (!host) return;
		host.empty();

		const lists = await Promise.all(this.generatorIds.map((id) => this.controller.storage.loadHistory(id)));
		const entries = lists.flat().sort((a, b) => b.at.localeCompare(a.at));

		if (entries.length === 0) {
			host.createDiv({ cls: "titleforge-empty", text: "Nothing generated yet." });
			return;
		}

		const list = host.createEl("ul", { cls: "titleforge-history-modal-list" });
		for (const entry of entries) {
			const spec = this.controller.getGeneratorById(entry.generatorId);
			if (!spec) continue; // a hand-edited/removed lexicon — nothing sensible to show
			renderTitleRow(list, spec, entry, {
				app: this.app,
				onToggleKept: (spec, entry) => void this.toggleKept(spec, entry),
				onUse: this.opts.onUse
					? (title) => {
							this.close();
							this.opts.onUse!(title);
						}
					: undefined,
				useTooltip: this.opts.useTooltipFor?.(entry.generatorId),
			});
		}
	}

	private async toggleKept(spec: GeneratorSpec, entry: HistoryEntry): Promise<void> {
		const history = await this.controller.storage.loadHistory(spec.id);
		const index = history.findIndex((e) => e.seed === entry.seed && e.title === entry.title && e.at === entry.at);
		if (index === -1) return;
		const updated = [...history];
		updated[index] = { ...updated[index], kept: !updated[index].kept };
		await this.controller.storage.saveHistory(spec.id, updated);
		void this.renderList();
	}
}
