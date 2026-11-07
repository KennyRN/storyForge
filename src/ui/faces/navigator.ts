import { getBookChapters, numberedChapterTitle } from "../../core/book";
import { bookDisplayTitle, getSeriesBooks, numberedBookTitle, readSeriesFrontmatter } from "../../core/series";
import { applyHashNumbering } from "../../core/titleNumbering";
import { el, fill } from "../kit/dom";
import { addChapterIcon } from "../kit/statsIcons";
import { attachTooltip } from "../kit/tooltip";
import { mountSelectList, type SelectState } from "../kit/selectList";
import type { AppModel } from "../model";

/**
 * The navigator (Brief 13, decisions 79 to 81): the series name and the novel's name, each leading to its tab on the library
 * side, then the chapter selector. The selector's list opens over the top of the Codex list (it never pushes it down) and holds
 * the novel's placed chapters only, with "add the next chapter" (a true append) as its last item.
 */
export function mountNavigator(host: HTMLElement, model: AppModel): () => void {
	const state: SelectState = { expanded: false };
	const novelState: SelectState = { expanded: false };
	let shownBook: string | null = null;
	let selector: { dispose(): void } | null = null;
	let novelSelector: { dispose(): void } | null = null;
	host.classList.add("sf-pane", "sf-navigator");

	/** Everything else in the left panel can't be reached while the list is open: a click outside only closes it. */
	const setBehind = (inert: boolean): void => {
		for (const sibling of Array.from(host.parentElement?.children ?? [])) if (sibling !== host) (sibling as HTMLElement).inert = inert;
	};

	const draw = (): void => {
		selector?.dispose();
		selector = null;
		novelSelector?.dispose();
		novelSelector = null;
		setBehind(false);
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const settings = running.settings.values;
		const { book, chapter } = model.nav;
		if (book !== shownBook) {
			state.expanded = false;
			novelState.expanded = false;
			shownBook = book;
		}
		if (!book) {
			fill(host, el("div", { class: "sf-muted sf-nav-empty", text: "Open a chapter to get started." }));
			return;
		}
		const chapters = getBookChapters(project, book);
		const title = (name: string): string => numberedChapterTitle(project, book, name, settings.chapterNumberingStyle);
		const noWriting = running.readOnlyReason ? "This project is open read-only." : null;
		const placed = chapters.ordered.some((c) => c.name === chapter);
		const outside = chapter && !placed ? (chapters.unplaced.some((c) => c.name === chapter) ? "unplaced" : "archived") : null;

		const lead = (cls: string, text: string, label: string, tab: "series" | "novel"): HTMLElement => {
			const b = el("button", { class: `sf-nav-lead ${cls}`, attrs: { type: "button", "aria-label": label }, text, on: { click: () => model.openLibraryTab(tab, { resetChoice: tab === "novel" }) } });
			attachTooltip(b, label);
			return b;
		};
		const seriesLine = settings.storyKind === "series" ? lead("sf-nav-series", readSeriesFrontmatter(project).seriesTitle, "Open the series on the library side", "series") : null;
		const novelName = numberedBookTitle(project, book, undefined, settings.seriesNumberingStyle);
		// A standalone project has no selector: its novel's name is a plain label. In a series the name is the novel selector (Tweaks 1 part 2, §6.1), listing the placed novels only.
		const novelHost = el("div", { class: "sf-select-host sf-nav-novel-host" });
		const novelLine = settings.storyKind === "series" ? novelHost : el("div", { class: "sf-nav-lead sf-nav-novel sf-nav-plain", text: novelName });

		// "Add the next chapter" (a true append) is the list's last item.
		const add = el("button", {
			class: "sf-select-row sf-select-add",
			attrs: { type: "button", "aria-label": "Add the next chapter", ...(noWriting ? { disabled: "", title: noWriting } : {}) },
			on: { click: () => (state.expanded = false, setBehind(false), void model.addNextChapter()) },
		}, addChapterIcon());
		if (!noWriting) attachTooltip(add, "add the next chapter");

		const selectHost = el("div", { class: "sf-select-host" });
		fill(host, seriesLine, novelLine, selectHost);
		selector = mountSelectList(
			selectHost,
			() => ({
				title: chapter ? title(chapter) : "No chapter yet",
				note: outside,
				outside: !!outside,
				label: "Chapters",
				listLabel: "Chapters of this novel",
				rows: chapters.ordered.map((c) => ({ key: c.name, text: title(c.name), active: c.name === chapter, dataset: { filename: c.name } })),
				footer: [add],
				onChoose: (name) => void model.openChapter(book, name),
			}),
			state,
			{ onToggled: setBehind, modifier: "sf-select--chapters" },
		);
		if (settings.storyKind === "series") {
			const series = getSeriesBooks(project);
			const folders = series.ordered.map((f) => f.name);
			const numbered = applyHashNumbering(folders.map((f) => bookDisplayTitle(project, f)), settings.seriesNumberingStyle);
			novelSelector = mountSelectList(
				novelHost,
				() => ({
					title: novelName,
					label: "Novels",
					listLabel: "Novels of this series",
					rows: folders.map((f, i) => ({ key: f, text: numbered[i], active: f === book, dataset: { book: f } })), // an unplaced novel being written highlights no row
					onChoose: (f) => void model.switchNovel(f),
				}),
				novelState,
				{ onToggled: setBehind, modifier: "sf-select--novelname", titleClass: "sf-nav-novel" },
			);
		}
		setBehind(state.expanded || novelState.expanded);
	};
	draw();
	const off = model.subscribe(["library", "nav", "project", "settings"], () => host.isConnected && draw());
	return () => (off(), selector?.dispose(), novelSelector?.dispose(), setBehind(false));
}
