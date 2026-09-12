import { App, Modal } from "obsidian";
import { ancestorIds, genreById } from "../engine/generate.js";
import { replay } from "../engine/history.js";
import { humanizeTemplate } from "../engine/template.js";
import type { GeneratorSpec, HistoryEntry, Pattern } from "../engine/types.js";

/**
 * "About this title" — a small read-only modal opened from a history/kept row's info icon
 * (TitleForgePanel.ts's `renderTitleRow`). Shows the granular path a title took: its
 * genre → sub-genre → shape, then the exact template that produced it — one line, lower case
 * throughout (this is descriptive chrome, not a result; the title itself, in the `h2` above it,
 * stays exactly as generated).
 *
 * The shape is read straight off the entry (`patternId` / `templateIndex`, recorded by
 * `toEntry`). Entries written before those fields existed fall back to replaying the entry's
 * seed (`replay()`), which is exact only while the lexicon hasn't changed since — hence the
 * preference for the stored fields.
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

		const resolved = this.resolveShape();
		if (!resolved) {
			contentEl.createDiv({
				cls: "titleforge-empty",
				text: "Couldn't recover this title's shape.",
			});
			return;
		}
		const { pattern, templateIndex } = resolved;

		// Genre crumbs are already lower case (see the genre-label sweep); the pattern's own label
		// and its exact template aren't authored that way, so they're lowered here to match — this
		// line is all description, not a result.
		const crumbs = [...this.genreCrumbs(), pattern.label.toLowerCase()].join("  ›  ");
		const template = pattern.templates[templateIndex] ?? pattern.templates[0];
		const line = template ? `${crumbs}  —  ${humanizeTemplate(template).toLowerCase()}` : crumbs;

		contentEl.createEl("p", { cls: "titleforge-shape-info-path", text: line });
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** The recorded pattern + template, or — for a pre-`patternId` entry — a replay of the seed. */
	private resolveShape(): { pattern: Pattern; templateIndex: number } | undefined {
		if (this.entry.patternId) {
			const pattern = this.spec.patterns.find((p) => p.id === this.entry.patternId);
			if (pattern) {
				const templateIndex =
					this.entry.templateIndex !== undefined &&
					this.entry.templateIndex < pattern.templates.length
						? this.entry.templateIndex
						: 0;
				return { pattern, templateIndex };
			}
		}
		const recomputed = replay(this.spec, this.entry);
		const pattern = this.spec.patterns.find((p) => p.id === recomputed.patternId);
		return pattern ? { pattern, templateIndex: recomputed.templateIndex } : undefined;
	}

	/** `["fantasy", "epic fantasy"]` — the genre and any sub-genre, top level first. Empty when the
	 * title was generated under "any genre" (nothing narrower to show). */
	private genreCrumbs(): string[] {
		const id = this.entry.genre;
		if (!id || id === "all") return [];
		const ids = [...ancestorIds(this.spec, id)].reverse();
		ids.push(id);
		return ids.map((gid) => genreById(this.spec, gid)?.label ?? gid);
	}
}
