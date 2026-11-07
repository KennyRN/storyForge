import { computeGhostChapterDividerPercents, computeNovelLengthBarLayout, STRUCTURE_GUIDELINE_PERCENTS } from "../../core/novelLengthBar";
import { formatWordCount } from "../../core/wordCount";
import { grouped } from "../faces/lengthFields";
import { el } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";
import { MIN_FILL_PX } from "./bars";

/** The least gap between two ghost chapter dividers, in px. */
const GHOST_MIN_GAP_PX = 4;

export interface NovelProgress {
	track: HTMLElement;
	strip: HTMLElement;
	/** The bar and the strip as one shape (Tweaks 1 part 2, §3.4): no gap between them; only the four outer corners are rounded. Put this in the page, not the two parts. */
	joined: HTMLElement;
	/** Redraws the ghost dividers for the bar's width now; the caller calls it after the bar is in the page and when it is resized. */
	drawGhosts(): void;
}

/**
 * The novel's progress bar (segments, dividers, ghost dividers) and its structure strip, shared by the novel overview and the series tab's context panel.
 * Segments are buttons only where `open` is given; without it the bar is read-only.
 */
export function buildNovelProgress(o: { titles: string[]; names: string[]; words: number[]; plannedNovel: number | null; plannedChapter: number | null; open?: (name: string) => void }): NovelProgress {
	const { words, plannedNovel, plannedChapter } = o;
	const total = words.reduce((a, b) => a + b, 0);
	const layout = computeNovelLengthBarLayout(words, plannedNovel);
	const track = el("div", { class: "sf-progress", attrs: { role: "group", "aria-label": `Novel progress: ${formatWordCount(total)}${plannedNovel ? ` of ${grouped(plannedNovel)}` : ""}` } });
	// The whole fill is at least 3px wide when the novel has any words (decision 153); the segments within it stay true to scale, so 30 short chapters do not overstate the total.
	if (total > 0) {
		const filled = layout.segments.reduce((sum, seg) => sum + seg.widthPercent, 0);
		const floor = el("span", { class: "sf-progress-floor", attrs: { "aria-hidden": "true" } });
		floor.style.width = `max(${MIN_FILL_PX}px, ${filled}%)`;
		track.append(floor);
	}
	for (const seg of layout.segments) {
		const label = `${o.titles[seg.chapterIndex]}: ${formatWordCount(words[seg.chapterIndex])}`;
		const name = o.names[seg.chapterIndex];
		const part = o.open
			? el("button", { class: "sf-progress-seg", attrs: { type: "button", "aria-label": label }, on: { click: () => o.open!(name) } })
			: el("span", { class: "sf-progress-seg", attrs: { role: "img", "aria-label": label } });
		part.style.left = `${seg.leftPercent}%`;
		part.style.width = `${seg.widthPercent}%`;
		attachTooltip(part, `${o.titles[seg.chapterIndex]}\n${formatWordCount(words[seg.chapterIndex])}`);
		track.append(part);
	}
	for (const pct of layout.dividerPercents) {
		const d = el("span", { class: "sf-progress-divider", attrs: { "aria-hidden": "true" } });
		d.style.left = `${pct}%`;
		track.append(d);
	}
	// The ghost chapter dividers are drawn only where adjacent ones would be at least GHOST_MIN_GAP_PX apart at the bar's width now, and none below
	// that (a tiny chapter length would otherwise build tens of thousands of them).
	const drawGhosts = (): void => {
		track.querySelectorAll(".sf-progress-ghost").forEach((g) => g.remove());
		const width = track.getBoundingClientRect().width;
		if (width <= 0) return;
		for (const pct of computeGhostChapterDividerPercents(total, plannedNovel, plannedChapter, layout.scale, (GHOST_MIN_GAP_PX / width) * 100)) {
			const g = el("span", { class: "sf-progress-ghost", attrs: { "aria-hidden": "true" } });
			g.style.left = `${pct}%`;
			track.append(g);
		}
	};
	const strip = el("div", { class: "sf-structure-strip", attrs: { role: "img", "aria-label": `Story structure guide marks at ${STRUCTURE_GUIDELINE_PERCENTS.join(", ")} per cent` } });
	for (const pct of STRUCTURE_GUIDELINE_PERCENTS) {
		const m = el("span", { class: "sf-structure-mark" });
		m.style.left = `${pct}%`;
		strip.append(m);
	}
	const joined = el("div", { class: "sf-progress-joined" }, track, strip);
	return { track, strip, joined, drawGhosts };
}
