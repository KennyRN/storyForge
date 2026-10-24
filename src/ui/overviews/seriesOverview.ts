import { getBookChapters, } from "../../core/book";
import { libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { applyHashNumbering } from "../../core/titleNumbering";
import { computeSeriesNovelBarLayout } from "../../core/seriesNovelBar";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { plainBar } from "./bars";

/** The words in a novel's placed chapters, from the index. */
export function novelWordTotal(model: AppModel, book: string): number {
	const project = model.running?.opened.project;
	if (!project) return 0;
	return getBookChapters(project, book).ordered.reduce((sum, c) => sum + project.wordCount(libraryChapterPath(book, c.name)), 0);
}

/** The series overview: each placed novel with its word-count bar, then the unplaced novels. Read-only. */
export function mountSeriesOverview(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-overview-body");
	const draw = (): void => {
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
			row.append(name, plainBar(title, words, layout[i].fillPercent, layout[i].sliver));
			placed.append(row);
		});
		if (series.ordered.length === 0) placed.append(el("div", { class: "sf-muted", text: "No novels are placed in the series yet." }));
		const unplaced = series.unplaced.length
			? [
					el("h3", { class: "sf-overview-sub", text: "Unplaced" }),
					el("div", { class: "sf-overview-list", attrs: { role: "list", "aria-label": "Novels not yet placed" } }, ...series.unplaced.map((f, i) => el("div", { class: "sf-overview-row sf-overview-row--unplaced", attrs: { role: "listitem" } }, el("button", { class: "sf-overview-name", text: titles[series.ordered.length + i], attrs: { type: "button" }, on: { click: () => open(f.name) } })))),
				]
			: [];
		fill(host, el("h2", { class: "sf-overview-title", text: series.seriesTitle }), placed, ...unplaced);
	};
	draw();
	const off = model.subscribe(["library", "stats", "project", "archive"], draw);
	return () => {
		off();
		host.classList.remove("sf-overview-body");
	};
}
