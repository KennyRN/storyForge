import { chapterDisplayTitle, getBookChapters, readBookFrontmatter, readChapterPlot } from "../../core/book";
import { libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { plotCardTooltip } from "../../core/plotCardTier";
import { applyHashNumbering } from "../../core/titleNumbering";
import { formatWordCount } from "../../core/wordCount";
import { grouped } from "../faces/lengthFields";
import { el, fill } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";
import { dataBar, frameWidthPercent } from "./bars";
import { FieldBin } from "./fieldCommitter";
import { coverBox } from "./cover";
import { synopsisField } from "./sectionFields";
import { debounced, redrawKeepingFocus } from "./refresh";
import { buildNovelProgress } from "./novelProgress";

/** The novel overview: the progress bar (segments, ghost dividers, structure strip) and a bar per placed chapter (Brief 14: the planned lengths, the default PoV and the chapters' details are not shown here). */
export function mountNovelOverview(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-overview-body");
	/** The synopsis editor of the current draw. */
	const bin = new FieldBin();
	/** Plot notes read on first hover, kept until the next redraw (the index changed). */
	let plots = new Map<string, string>();

	let ghostWatch: ResizeObserver | null = null;
	const draw = (): void => {
		ghostWatch?.disconnect();
		ghostWatch = null;
		// A redraw never takes the synopsis being typed in: its text isn't saved yet.
		if (document.activeElement instanceof HTMLElement && host.contains(document.activeElement) && document.activeElement.closest(".sf-note-field")) return;
		bin.clear(); // the editors of the last draw go with it
		plots = new Map();
		const running = model.running;
		const book = model.nav.book;
		if (!running || !book) return fill(host, el("div", { class: "sf-muted", text: "Select a novel." }));
		const project = running.opened.project;
		const settings = running.settings.values;
		const fm = readBookFrontmatter(project, book);
		const { ordered, unplaced } = getBookChapters(project, book); // unplaced is only for the numbering below: the numbers follow the left pane's list
		const titles = applyHashNumbering([...ordered, ...unplaced].map((c) => chapterDisplayTitle(project, book, c.name)), settings.chapterNumberingStyle);
		const words = ordered.map((c) => project.wordCount(libraryChapterPath(book, c.name)));
		const total = words.reduce((a, b) => a + b, 0);
		const plannedNovel = fm?.plannedNovelLength ?? null;
		const plannedChapter = fm?.plannedChapterLength ?? null;
		const open = (name: string): void => void model.chooseChapter(book, name); // choosing: the overview stays up (Brief 14 §1.7)

		const novelTitle = (): string => {
			const series = getSeriesBooks(project);
			const all = [...series.ordered, ...series.unplaced].map((f) => f.name);
			const numbered = applyHashNumbering(all.map((f) => bookDisplayTitle(project, f)), settings.seriesNumberingStyle);
			return numbered[all.indexOf(book)] ?? bookDisplayTitle(project, book);
		};

		// The progress bar
		const { track, strip, drawGhosts } = buildNovelProgress({ titles, names: ordered.map((c) => c.name), words, plannedNovel, plannedChapter, open });

		// The chapter bars: one per placed chapter, the bar and nothing else (the unplaced chapters stay in the left pane's list)
		const scale = Math.max(...words, 0);
		const framePercent = frameWidthPercent(words, plannedChapter);
		const cards = ordered.map((c, i) => {
			const key = c.name;
			const bar = dataBar({
				title: titles[i],
				words: words[i],
				target: plannedChapter,
				scale,
				framePercent,
				name: titles[i],
				tooltip: () => `${titles[i]}\n${plotCardTooltip(words[i], plots.get(key) ?? "")}`,
				onHover: () => void readChapterPlot(project, book, key).then((p) => plots.set(key, p)),
			});
			bar.classList.add("sf-bar--link");
			bar.addEventListener("click", () => open(key));
			return el("div", { class: "sf-card", dataset: { chapter: key } }, bar);
		});
		fill(host, el("h2", { class: "sf-overview-title", text: novelTitle() }), el("div", { class: "sf-overview-head" }, el("div", { class: "sf-cover-column" }, coverBox(model, { kind: "book", code: book }, novelTitle())), synopsisField(model, bin, book, novelTitle())), track, strip, el("div", { class: "sf-overview-list sf-cards", attrs: { role: "list", "aria-label": "Placed chapters with word counts" } }, ...cards));
		drawGhosts();
		if (typeof ResizeObserver !== "undefined") {
			ghostWatch = new ResizeObserver(drawGhosts);
			ghostWatch.observe(track);
		}
	};
	draw();
	const refresh = debounced(() => redrawKeepingFocus(host, draw));
	const off = model.subscribe(["library", "stats", "project", "archive", "nav"], refresh);
	return () => {
		off();
		ghostWatch?.disconnect();
		refresh.cancel();
		bin.clear();
		host.classList.remove("sf-overview-body");
	};
}
