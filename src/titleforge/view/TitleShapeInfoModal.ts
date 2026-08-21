import { App, Modal } from "obsidian";
import { replay } from "../engine/history.js";
import type { GeneratorSpec, HistoryEntry } from "../engine/types.js";

/**
 * "Why this shape" — a small read-only modal opened from a history/kept row's info icon
 * (TitleForgePanel.ts's `renderTitleRow`). Shows which tradition a title came from and which
 * shape (Pattern) it was drawn through.
 *
 * `HistoryEntry` doesn't persist a `patternId` (only `generatorId`, `seed`, `genre?`, `title`,
 * `at`, `kept?` — see engine/types.ts), so this recovers it by replaying the entry's own stored
 * seed back through its generator (`replay()`, engine/history.ts) rather than adding a stored
 * field/migration for something derivable on demand. Shares `replay()`'s own pre-existing caveat:
 * exact only while the lexicon hasn't changed since the entry was created.
 */
export class TitleShapeInfoModal extends Modal {
	constructor(
		app: App,
		private spec: GeneratorSpec,
		private entry: HistoryEntry,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("titleforge-shape-info-modal");
		contentEl.createEl("h2", { text: this.entry.title });
		contentEl.createEl("p", {
			cls: "titleforge-shape-info-tradition",
			text: `${this.spec.name} — ${this.spec.tradition}`,
		});

		const recomputed = replay(this.spec, this.entry);
		const pattern = this.spec.patterns.find((p) => p.id === recomputed.patternId);
		if (pattern) {
			contentEl.createEl("h3", { text: pattern.label });
			contentEl.createEl("p", { text: pattern.note });
			contentEl.createEl("p", {
				cls: "titleforge-shape-info-exemplar",
				text: `Modelled on: ${pattern.exemplar}`,
			});
		} else {
			contentEl.createDiv({
				cls: "titleforge-empty",
				text: "Couldn't recover this title's shape.",
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
