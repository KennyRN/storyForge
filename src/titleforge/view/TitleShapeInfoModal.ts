import { App, Modal } from "obsidian";
import { ancestorIds, genreById } from "../engine/generate.js";
import { replay } from "../engine/history.js";
import { humanizeTemplate } from "../engine/template.js";
import type { GeneratorSpec, HistoryEntry, Pattern } from "../engine/types.js";

/**
 * "About this title" — a small read-only modal opened from a history/kept row's info icon
 * (TitleForgePanel.ts's `renderTitleRow`). Shows the granular path a title took: its
 * genre → sub-genre → shape, then the exact template that produced it — one line, lower case
 * throughout, every crumb joined by the same chevron (this is descriptive chrome, not a result;
 * the title itself, in the `h2` above it, stays exactly as generated).
 *
 * The shape is read straight off the entry (`patternId` / `templateIndex`, recorded by
 * `toEntry`). Entries written before those fields existed fall back to replaying the entry's
 * seed (`replay()`), which is exact only while the lexicon hasn't changed since — hence the
 * preference for the stored fields.
 */

/** Bracketed slot names in a humanized shape string, in order — `"The [Adj] [Noun]"` →
 * `["Adj", "Noun"]`. Used to compare a pattern's authored label against the exact template that
 * ran, since both are written in this same `[Bracket]` convention. */
function bracketTokens(text: string): string[] {
	return [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1] ?? "");
}

/** Whether a pattern's authored label and its actual template describe the same shape closely
 * enough that showing both would just repeat one thing twice: same number of slots, and each
 * pair either identical or one a generic stand-in for the other ("adjective"/"adj" — most
 * patterns' one template matches their label exactly this loosely). A template that narrows a
 * slot to something the label never named — `stacked-modifiers`' second template draws
 * `{colour}` where its label only promises "[Adjective]" — fails this, and both get shown. */
function sameShape(label: string, template: string): boolean {
	const labelTokens = bracketTokens(label);
	const templateTokens = bracketTokens(humanizeTemplate(template));
	if (labelTokens.length !== templateTokens.length) return false;
	return labelTokens.every((word, i) => {
		const a = word.toLowerCase();
		const b = (templateTokens[i] ?? "").toLowerCase();
		return a === b || a.startsWith(b) || b.startsWith(a);
	});
}

/** A leading literal article reads better parenthesised than capitalised — "(the) [adjective]
 * [noun]" instead of "the [adjective] [noun]" — it's shorter, and it stops the one fixed word
 * competing for attention with the placeholders either side of it. */
function compactArticle(text: string): string {
	return text.replace(/^(the|an?)\b\s*/i, (_, word: string) => `(${word.toLowerCase()}) `);
}

/** The pattern's own label, plus the exact template that ran — but only when the template says
 * something the label doesn't already (see `sameShape`); most of the time that's just noise. */
function shapeCrumbs(label: string, template: string | undefined): string[] {
	const shownLabel = compactArticle(label.toLowerCase());
	if (!template || sameShape(label, template)) return [shownLabel];
	return [shownLabel, compactArticle(humanizeTemplate(template).toLowerCase())];
}

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
		const template = pattern.templates[templateIndex] ?? pattern.templates[0];

		// Genre crumbs are already lower case (see the genre-label sweep); the shape crumbs aren't
		// authored that way, so they're lowered as they're built. Every crumb — genre, sub-genre,
		// shape — is joined with the same chevron, including the shape's own label/template pair.
		const crumbs = [...this.genreCrumbs(), ...shapeCrumbs(pattern.label, template)];
		contentEl.createEl("p", { cls: "titleforge-shape-info-path", text: crumbs.join("  ›  ") });
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
