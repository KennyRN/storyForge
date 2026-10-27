import { chapterDisplayTitle, getBookChapters, readBookFrontmatter, readChapterPlot, writeBookPlannedChapterLength, writeBookPlannedNovelLength } from "../../core/book";
import { computeGhostChapterDividerPercents, computeNovelLengthBarLayout, STRUCTURE_GUIDELINE_PERCENTS } from "../../core/novelLengthBar";
import { libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { nextPlotCardTier, plotCardTooltip, type PlotCardTier } from "../../core/plotCardTier";
import { applyHashNumbering } from "../../core/titleNumbering";
import { formatWordCount } from "../../core/wordCount";
import { grouped, lengthRow } from "../faces/lengthFields";
import { el, fill } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";
import { dataBar } from "./bars";
import { commitPlotNote } from "../../core/fieldWriter";
import { textField } from "./fieldCommitter";
import { debounced, redrawKeepingFocus } from "./refresh";

/** The novel overview: the progress bar (segments, ghost dividers, structure strip), the planned lengths, and a bar-tier card per chapter. */
export function mountNovelOverview(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-overview-body");
	let editing: "novel" | "chapter" | null = null;
	/** Plot notes read on first hover, kept until the next redraw (the index changed). */
	let plots = new Map<string, string>();

	const draw = (): void => {
		// A redraw never steals focus: leave a field being typed in alone.
		if (editing !== null && host.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
		// Nor a plot note being typed in: its text isn't saved yet.
		if (host.contains(document.activeElement) && document.activeElement instanceof HTMLTextAreaElement) return;
		plots = new Map();
		const running = model.running;
		const book = model.nav.book;
		if (!running || !book) return fill(host, el("div", { class: "sf-muted", text: "Select a novel." }));
		const project = running.opened.project;
		const settings = running.settings.values;
		const readOnly = running.readOnlyReason;
		const fm = readBookFrontmatter(project, book);
		const { ordered, unplaced } = getBookChapters(project, book);
		const titles = applyHashNumbering([...ordered, ...unplaced].map((c) => chapterDisplayTitle(project, book, c.name)), settings.chapterNumberingStyle);
		const words = ordered.map((c) => project.wordCount(libraryChapterPath(book, c.name)));
		const total = words.reduce((a, b) => a + b, 0);
		const plannedNovel = fm?.plannedNovelLength ?? null;
		const plannedChapter = fm?.plannedChapterLength ?? null;
		const run = (write: () => Promise<void>): void => void model.guard(async () => (await write(), model.touch("library", "nav")), "save the length");
		const open = (name: string): void => void model.openChapter(book, name);

		const novelTitle = (): string => {
			const series = getSeriesBooks(project);
			const all = [...series.ordered, ...series.unplaced].map((f) => f.name);
			const numbered = applyHashNumbering(all.map((f) => bookDisplayTitle(project, f)), settings.seriesNumberingStyle);
			return numbered[all.indexOf(book)] ?? bookDisplayTitle(project, book);
		};

		// The progress bar
		const layout = computeNovelLengthBarLayout(words, plannedNovel);
		const track = el("div", { class: "sf-progress", attrs: { role: "group", "aria-label": `Novel progress: ${formatWordCount(total)}${plannedNovel ? ` of ${grouped(plannedNovel)}` : ""}` } });
		for (const seg of layout.segments) {
			const name = ordered[seg.chapterIndex].name;
			const part = el("button", { class: "sf-progress-seg", attrs: { type: "button", "aria-label": `${titles[seg.chapterIndex]}: ${formatWordCount(words[seg.chapterIndex])}` }, on: { click: () => open(name) } });
			part.style.left = `${seg.leftPercent}%`;
			part.style.width = `${seg.widthPercent}%`;
			attachTooltip(part, `${titles[seg.chapterIndex]}\n${formatWordCount(words[seg.chapterIndex])}`);
			track.append(part);
		}
		for (const pct of layout.dividerPercents) {
			const d = el("span", { class: "sf-progress-divider", attrs: { "aria-hidden": "true" } });
			d.style.left = `${pct}%`;
			track.append(d);
		}
		for (const pct of computeGhostChapterDividerPercents(total, plannedNovel, plannedChapter, layout.scale)) {
			const g = el("span", { class: "sf-progress-ghost", attrs: { "aria-hidden": "true" } });
			g.style.left = `${pct}%`;
			track.append(g);
		}
		const strip = el("div", { class: "sf-structure-strip", attrs: { role: "img", "aria-label": `Story structure guide marks at ${STRUCTURE_GUIDELINE_PERCENTS.join(", ")} per cent` } });
		for (const pct of STRUCTURE_GUIDELINE_PERCENTS) {
			const m = el("span", { class: "sf-structure-mark" });
			m.style.left = `${pct}%`;
			strip.append(m);
		}

		// The planned lengths
		const row = (which: "novel" | "chapter", label: string, value: number | null, shown: string, write: (n: number | null) => Promise<void>): HTMLElement =>
			lengthRow({ which, label, value, shown, readOnly, editing: editing === which, startEditing: () => ((editing = which), draw()), stopEditing: () => ((editing = null), draw()), save: (n) => run(() => write(n)) });
		const meta = el(
			"div",
			{ class: "sf-meta sf-overview-meta" },
			row("novel", "Novel Length:", plannedNovel, plannedNovel === null ? "Not set" : `${grouped(total)} of ${grouped(plannedNovel)}`, (n) => writeBookPlannedNovelLength(project, book, n)),
			row("chapter", "Chapter Length:", plannedChapter, plannedChapter === null ? "Not set" : grouped(plannedChapter), (n) => writeBookPlannedChapterLength(project, book, n)),
		);

		// The chapter cards
		const scale = Math.max(plannedChapter ?? 0, ...words);
		const names = ordered.map((c) => c.name);
		const tiers = names.map((n) => model.cardTier(book, n));
		const nextLabel: Record<PlotCardTier, string> = { extended: "Show plot note only", collapsed: "Show bar only", bar: "Show all details" };
		const cards = ordered.map((c, i) => {
			const key = c.name;
			const tier = tiers[i];
			const bar = dataBar({
				title: titles[i],
				words: words[i],
				target: plannedChapter,
				scale,
				tooltip: () => plotCardTooltip(words[i], plots.get(key) ?? ""),
				onHover: () => void readChapterPlot(project, book, key).then((p) => plots.set(key, p)),
			});
			bar.classList.add("sf-bar--link");
			bar.addEventListener("click", () => open(key));
			const chevron = el("button", { class: "sf-card-chevron", text: "▾", attrs: { type: "button", "aria-label": `${titles[i]}: ${nextLabel[tier]}`, "aria-expanded": String(tier !== "bar") }, on: { click: () => model.setCardTiers(book, [key], nextPlotCardTier(tier)) } });
			chevron.dataset.tier = tier;
			const head = el("div", { class: "sf-card-head" }, el("button", { class: "sf-overview-name", text: titles[i], attrs: { type: "button" }, on: { click: () => open(key) } }), chevron);
			const card = el("div", { class: `sf-card sf-card--${tier}`, dataset: { chapter: key, tier } }, head, bar);
			if (tier !== "bar") {
				if (tier === "extended") card.append(el("div", { class: "sf-card-rows" }, el("div", { class: "sf-card-row" }, el("span", { class: "sf-muted", text: "Length" }), el("span", { text: formatWordCount(words[i]) }))));
				const field = textField({
					label: `Plot note for ${titles[i]}`,
					readOnly: !!readOnly,
					read: () => readChapterPlot(project, book, key),
					commit: (expected, next) => commitPlotNote(project, book, key, expected, next),
					notify: (n) => model.notices.notify(n),
					written: (stored) => plots.set(key, stored),
				});
				field.element.dataset.plot = key;
				card.append(field.element);
				void readChapterPlot(project, book, key).then((p) => {
					plots.set(key, p);
					field.show(p);
				});
			}
			return card;
		});
		const sizeOf = (t: PlotCardTier): boolean => tiers.length > 0 && tiers.every((x) => x === t);
		const sizeControl = el("div", { class: "sf-size-control", attrs: { role: "radiogroup", "aria-label": "Size of all chapter cards" } }, ...(["bar", "collapsed", "extended"] as const).map((t) => el("button", { class: "sf-size-option", text: t === "bar" ? "Bar" : t === "collapsed" ? "Collapsed" : "Extended", attrs: { type: "button", role: "radio", "aria-checked": String(sizeOf(t)) }, dataset: { size: t }, on: { click: () => model.setCardTiers(book, names, t) } })));
		const unplacedList = unplaced.length
			? [el("h3", { class: "sf-overview-sub", text: "Unplaced" }), el("div", { class: "sf-overview-list", attrs: { role: "list", "aria-label": "Chapters not yet placed" } }, ...unplaced.map((c, i) => el("div", { class: "sf-overview-row sf-overview-row--unplaced", attrs: { role: "listitem" } }, el("button", { class: "sf-overview-name", text: titles[ordered.length + i], attrs: { type: "button" }, on: { click: () => open(c.name) } }))))]
			: [];
		fill(host, el("h2", { class: "sf-overview-title", text: novelTitle() }), track, strip, meta, sizeControl, el("div", { class: "sf-overview-list sf-cards", attrs: { role: "list", "aria-label": "Placed chapters with word counts" } }, ...cards), ...unplacedList);
	};
	draw();
	const refresh = debounced(() => redrawKeepingFocus(host, draw));
	const off = model.subscribe(["library", "stats", "project", "archive", "nav"], refresh);
	return () => {
		off();
		refresh.cancel();
		host.classList.remove("sf-overview-body");
	};
}
