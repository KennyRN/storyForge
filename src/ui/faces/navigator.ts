import { getBookChapters, numberedChapterTitle } from "../../core/book";
import { numberedBookTitle, readSeriesFrontmatter } from "../../core/series";
import { el, fill } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";

/**
 * The navigator (Brief 13, decisions 79 to 81): the series name and the novel's name, each leading to its tab on the library
 * side, then the chapter selector. The selector's list opens over the top of the Codex list (it never pushes it down) and holds
 * the novel's placed chapters only, with "add the next chapter" (a true append) as its last item.
 */
export function mountNavigator(host: HTMLElement, model: AppModel): () => void {
	let expanded = false;
	let shownBook: string | null = null;
	let refocus = false;
	let offOutside: (() => void) | null = null;
	host.classList.add("sf-pane", "sf-navigator");

	/** Everything else in the left panel can't be reached while the list is open: a click outside only closes it. */
	const setBehind = (inert: boolean): void => {
		for (const sibling of Array.from(host.parentElement?.children ?? [])) if (sibling !== host) (sibling as HTMLElement).inert = inert;
	};
	const close = (focus: boolean): void => {
		if (!expanded) return;
		expanded = false;
		refocus = focus;
		draw();
	};

	const draw = (): void => {
		offOutside?.();
		offOutside = null;
		setBehind(false);
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
		const title = (name: string): string => numberedChapterTitle(project, book, name, settings.chapterNumberingStyle);
		const noWriting = running.readOnlyReason ? "This project is open read-only." : null;
		const placed = chapters.ordered.some((c) => c.name === chapter);
		const outside = chapter && !placed ? (chapters.unplaced.some((c) => c.name === chapter) ? "unplaced" : "archived") : null;

		const lead = (cls: string, text: string, label: string, tab: "series" | "novel"): HTMLElement => {
			const b = el("button", { class: `sf-nav-lead ${cls}`, attrs: { type: "button", "aria-label": label }, text, on: { click: () => model.openLibraryTab(tab) } });
			attachTooltip(b, label);
			return b;
		};
		const seriesLine = settings.storyKind === "series" ? lead("sf-nav-series", readSeriesFrontmatter(project).seriesTitle, "Open the series on the library side", "series") : null;
		const novelLine = lead("sf-nav-novel", numberedBookTitle(project, book, undefined, settings.seriesNumberingStyle), "Open the novel on the library side", "novel");

		const current = el(
			"button",
			{
				class: `sf-nav-current${outside ? " is-outside" : ""}`,
				attrs: { type: "button", "aria-expanded": String(expanded), "aria-haspopup": "true", "aria-label": "Chapters" },
				on: { click: () => ((expanded = !expanded), (refocus = true), draw()) },
			},
			el("span", { class: "sf-nav-current-title", text: chapter ? title(chapter) : "No chapter yet" }),
			outside ? el("span", { class: "sf-nav-note", text: outside }) : null,
		);

		const list = el("ul", { class: "sf-nav-list sf-scroll", attrs: { role: "list", "aria-label": "Chapters of this novel" } });
		for (const c of chapters.ordered) {
			const selected = c.name === chapter;
			list.append(
				el(
					"li",
					{},
					el("button", {
						class: `sf-nav-row${selected ? " is-active" : ""}`,
						dataset: { filename: c.name },
						attrs: { type: "button", ...(selected ? { "aria-current": "true" } : {}) },
						text: title(c.name),
						on: { click: () => (close(false), void model.openChapter(book, c.name)) },
					}),
				),
			);
		}
		const add = el("button", {
			class: "sf-nav-row sf-nav-add",
			attrs: { type: "button", ...(noWriting ? { disabled: "", title: noWriting } : {}) },
			on: { click: () => (close(false), void model.addNextChapter()) },
			text: "Add the next chapter",
		});
		list.append(el("li", {}, add));
		list.addEventListener("keydown", (e) => {
			const items = Array.from(list.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
			const at = items.indexOf(document.activeElement as HTMLButtonElement);
			const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
			if (to === null) return;
			e.preventDefault();
			items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
		});

		const select = el("div", { class: "sf-nav-select" }, current, expanded ? list : null);
		fill(host, seriesLine, novelLine, select);
		if (expanded) {
			list.style.top = `${current.offsetTop + current.offsetHeight}px`;
			setBehind(true);
			const away = (e: Event): void => {
				if (!(e.target instanceof Node) || !select.contains(e.target)) close(false);
			};
			const key = (e: KeyboardEvent): void => {
				if (e.key === "Escape") (e.stopPropagation(), close(true));
			};
			document.addEventListener("pointerdown", away, true);
			host.addEventListener("keydown", key);
			offOutside = () => (document.removeEventListener("pointerdown", away, true), host.removeEventListener("keydown", key));
		}
		if (refocus) {
			refocus = false;
			host.querySelector<HTMLElement>(".sf-nav-current")?.focus(); // the redraw replaced the button the keyboard was on
		}
	};
	draw();
	const off = model.subscribe(["library", "nav", "project", "settings"], () => host.isConnected && draw());
	return () => (off(), offOutside?.(), setBehind(false));
}
