import { getBookChapters, numberedChapterTitle } from "../../core/book";
import { createContinuingChapter } from "../../core/chapterCreation";
import { numberedBookTitle } from "../../core/series";
import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import { icon } from "../kit/icons";
import type { AppModel } from "../model";

const VISIBLE_ROWS = 5;

/**
 * The navigator (from the harness's `CodexFocusNavigator`): the current novel's title, the current
 * chapter with an expandable list of the novel's chapters, and "add the next chapter" (append, then open).
 */
export function mountNavigator(host: HTMLElement, model: AppModel): () => void {
	let expanded = false;
	let shownBook: string | null = null;
	let refocus = false;
	host.classList.add("sf-pane", "sf-navigator");

	const draw = (): void => {
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const settings = running.settings.values;
		const { book, chapter } = model.nav;
		if (book !== shownBook) {
			expanded = false;
			shownBook = book;
		}
		if (!book) {
			fill(host, el("div", { class: "sf-muted sf-nav-empty", text: "Open a chapter to get started." }));
			return;
		}
		const chapters = getBookChapters(project, book);
		const all = [...chapters.ordered, ...chapters.unplaced];
		const title = (name: string): string => numberedChapterTitle(project, book, name, settings.chapterNumberingStyle);
		const noWriting = running.readOnlyReason ? "This project is open read-only." : null;

		const current = el(
			"button",
			{ class: "sf-nav-current", attrs: { type: "button", "aria-expanded": String(expanded), "aria-label": "Chapters" }, on: { click: () => ((expanded = !expanded), (refocus = true), draw()) } },
			el("span", { class: "sf-nav-current-title", text: chapter ? title(chapter) : "No chapter yet" }),
			icon(expanded ? "chevron-down" : "chevron-right", 14),
		);
		const list = el("ul", { class: "sf-nav-list sf-scroll", attrs: { role: "list", "aria-label": "Chapters of this novel" } });
		list.style.maxHeight = `${VISIBLE_ROWS * 28}px`;
		for (const c of all) {
			const active = settings.highlightActiveChapter && c.name === chapter;
			list.append(
				el(
					"li",
					{},
					el("button", { class: `sf-nav-row${active ? " is-active" : ""}`, dataset: { filename: c.name }, attrs: { type: "button" }, text: title(c.name), on: { click: () => void model.openChapter(book, c.name) } }),
				),
			);
		}
		const add = button({
			icon: "plus",
			label: "Add the next chapter",
			kind: "quiet",
			disabled: !!noWriting,
			onClick: () =>
				void model.guard(async () => {
					const created = await createContinuingChapter(project, book, chapter);
					model.touch("library", "stats");
					await model.openChapter(book, created.filename);
				}, "create the chapter"),
		});
		add.classList.add("sf-nav-add");
		if (noWriting) add.title = noWriting;
		fill(
			host,
			el("div", { class: "sf-nav-novel", text: numberedBookTitle(project, book, undefined, settings.seriesNumberingStyle) }),
			current,
			expanded ? list : null,
			add,
		);
		if (refocus) {
			refocus = false;
			host.querySelector<HTMLElement>(".sf-nav-current")?.focus(); // the redraw replaced the button the keyboard was on
		}
	};
	draw();
	return model.subscribe(["library", "nav", "project", "settings"], () => host.isConnected && draw());
}
