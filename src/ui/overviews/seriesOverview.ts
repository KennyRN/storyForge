import { getBookChapters, } from "../../core/book";
import { libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { applyHashNumbering } from "../../core/titleNumbering";
import { computeSeriesNovelBarLayout } from "../../core/seriesNovelBar";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { plainBar } from "./bars";
import { coverBox, removeCoverButton } from "./cover";
import { descriptionField, synopsisField } from "./sectionFields";
import { debounced, redrawKeepingFocus } from "./refresh";

/** The words in a novel's placed chapters, from the index. */
export function novelWordTotal(model: AppModel, book: string): number {
	const project = model.running?.opened.project;
	if (!project) return 0;
	return getBookChapters(project, book).ordered.reduce((sum, c) => sum + project.wordCount(libraryChapterPath(book, c.name)), 0);
}

/** The series overview: the description, each placed novel with its word-count bar and synopsis, then the unplaced novels. The description and synopses are the only things written here. */
export function mountSeriesOverview(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-overview-body");
	const draw = (): void => {
		// A redraw never takes a description or synopsis being typed in: its text isn't saved yet.
		if (host.contains(document.activeElement) && document.activeElement instanceof HTMLTextAreaElement) return;
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const series = getSeriesBooks(project);
		const all = [...series.ordered, ...series.unplaced].map((f) => f.name);
		const titles = applyHashNumbering(all.map((f) => bookDisplayTitle(project, f)), running.settings.values.seriesNumberingStyle);
		const layout = computeSeriesNovelBarLayout(series.ordered.map((f) => novelWordTotal(model, f.name)));
		const open = (folder: string): void => {
			model.select({ kind: "novel", book: folder });
			void model.selectBook(folder);
		};
		const placed = el("div", { class: "sf-overview-list", attrs: { role: "list", "aria-label": "Placed novels with word counts" } });
		series.ordered.forEach((f, i) => {
			const words = novelWordTotal(model, f.name);
			const title = titles[i];
			const row = el("div", { class: "sf-overview-row", attrs: { role: "listitem" } });
			const name = el("button", { class: "sf-overview-name", text: title, attrs: { type: "button" }, on: { click: () => open(f.name) } });
			row.append(coverBox(model, { kind: "book", code: f.name }, title), el("div", { class: "sf-overview-row-main" }, name, plainBar(title, words, layout[i].fillPercent, layout[i].sliver), synopsisField(model, f.name, title)));
			placed.append(row);
		});
		if (series.ordered.length === 0) placed.append(el("div", { class: "sf-muted", text: "No novels are placed in the series yet." }));
		const unplaced = series.unplaced.length
			? [
					el("h3", { class: "sf-overview-sub", text: "Unplaced" }),
					el("div", { class: "sf-overview-list", attrs: { role: "list", "aria-label": "Novels not yet placed" } }, ...series.unplaced.map((f, i) => el("div", { class: "sf-overview-row sf-overview-row--unplaced", attrs: { role: "listitem" } }, coverBox(model, { kind: "book", code: f.name }, titles[series.ordered.length + i]), el("div", { class: "sf-overview-row-main" }, el("button", { class: "sf-overview-name", text: titles[series.ordered.length + i], attrs: { type: "button" }, on: { click: () => open(f.name) } }), synopsisField(model, f.name, titles[series.ordered.length + i]))))),
				]
			: [];
		fill(host, el("h2", { class: "sf-overview-title", text: series.seriesTitle }), el("div", { class: "sf-overview-head" }, el("div", { class: "sf-cover-column" }, coverBox(model, { kind: "series" }, series.seriesTitle), removeCoverButton(model, { kind: "series" }, series.seriesTitle)), descriptionField(model)), placed, ...unplaced);
	};
	draw();
	const refresh = debounced(() => redrawKeepingFocus(host, draw));
	const off = model.subscribe(["library", "stats", "project", "archive"], refresh);
	return () => {
		off();
		refresh.cancel();
		host.classList.remove("sf-overview-body");
	};
}
