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

/** A composite label spells out more than one shape as alternatives joined by " / " —
 * `series-compound`'s "[Adjective] [Noun] / The [Adjective] [Noun]" is two shapes, not one.
 * A plain label comes back as its own single-element array. */
function labelAlternatives(label: string): string[] {
	return label.split(/\s*\/\s*/);
}

/** Whether a pattern's authored label and its actual template describe the same shape closely
 * enough that showing both would just repeat one thing twice: same number of slots, and each
 * pair either identical or one a generic stand-in for the other ("adjective"/"adj" — most
 * patterns' one template matches their label exactly this loosely). A template that narrows a
 * slot to something the label never named — `stacked-modifiers`' second template draws
 * `{colour}` where its label only promises "[Adjective]" — fails this, and both get shown. A
 * composite label matches if the template agrees with *any* one of its alternatives. */
function sameShape(label: string, template: string): boolean {
	const templateTokens = bracketTokens(humanizeTemplate(template));
	return labelAlternatives(label).some((alt) => {
		const labelTokens = bracketTokens(alt);
		if (labelTokens.length !== templateTokens.length) return false;
		return labelTokens.every((word, i) => {
			const a = word.toLowerCase();
			const b = (templateTokens[i] ?? "").toLowerCase();
			return a === b || a.startsWith(b) || b.startsWith(a);
		});
	});
}

/** A leading literal article reads better parenthesised than capitalised — "(the) [adjective]
 * [noun]" instead of "the [adjective] [noun]" — it's shorter, and it stops the one fixed word
 * competing for attention with the placeholders either side of it. Runs on each alternative of a
 * composite label too, so the article after a " / " gets the same treatment as one at the very
 * start — though `collapseArticleAlternatives` (below) handles the common case of a composite
 * that's nothing *but* an optional article, so this rarely still sees a "/" by the time it runs. */
function compactArticle(text: string): string {
	return text.replace(
		/(^|\/\s*)(the|an?)\b\s*/gi,
		(_, prefix: string, word: string) => `${prefix}(${word.toLowerCase()}) `,
	);
}

/** When a composite label's alternatives are the exact same shape except for a leading article —
 * `series-compound`'s "[Adjective] [Noun] / The [Adjective] [Noun]" is the common case — spelling
 * out both full alternatives joined by " / " says the same thing twice and makes the crumb needlessly
 * long; collapsing to one shape with a parenthesised article ("(the) [adjective] [noun]") says
 * exactly as much — the article is merely optional, not a genuinely different shape — in a third
 * the length. Leaves any other composite (genuinely different alternatives, not just an article)
 * untouched for `compactArticle` to handle article-wise, one alternative at a time, as before. */
function collapseArticleAlternatives(label: string): string {
	const alts = labelAlternatives(label);
	if (alts.length < 2) return label;
	const articleRe = /^(the|an?)\b\s*/i;
	const stripped = alts.map((alt) => alt.replace(articleRe, ""));
	const allSameShape = stripped.every((s) => s.toLowerCase() === stripped[0].toLowerCase());
	if (!allSameShape) return label;
	const articled = alts.find((alt) => articleRe.test(alt));
	const article = articled?.match(articleRe)?.[1]?.toLowerCase();
	return article ? `(${article}) ${stripped[0]}` : stripped[0];
}

/** The pattern's own label, plus the exact template that ran — but only when the template says
 * something the label doesn't already (see `sameShape`); most of the time that's just noise.
 * Exported for `shapeInfoBreadcrumbs.test.ts` — everything else here stays module-private. */
export function shapeCrumbs(label: string, template: string | undefined): string[] {
	const shownLabel = compactArticle(collapseArticleAlternatives(label).toLowerCase());
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

	/** `["fantasy", "epic fantasy"]` — the genre and any sub-genre, top level first. Always at least
	 * one crumb — "any genre" when the title was generated under "any genre" — so the line always
	 * opens with a genre crumb rather than sometimes starting straight on the shape. */
	private genreCrumbs(): string[] {
		const id = this.entry.genre;
		if (!id || id === "all") return ["any genre"];
		const ids = [...ancestorIds(this.spec, id)].reverse();
		ids.push(id);
		return ids.map((gid) => genreById(this.spec, gid)?.label ?? gid);
	}
}
