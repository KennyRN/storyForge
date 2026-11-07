import { readBookFrontmatter } from "../../core/book";
import { libraryChapterPath } from "../../core/paths";
import { el } from "../kit/dom";
import type { AppModel } from "../model";
import { chapterLengthBarState } from "../overviews/bars";

/**
 * The chapter length bar (Brief 20, decision 160): a picture in the strip under the chapter box on the storytelling side, with no text and no tooltip,
 * and a name for the screen reader. An 8px bar in a 12px rail, 2px in from the rail's edges, the same geometry rules as the data bars. It follows typing
 * live from the project's own word count (the one the stats panel shows), never from a separate count; a chapter with no planned length shows nothing.
 */
export function mountChapterLengthBar(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-length-strip");
	const rail = el("div", { class: "sf-length-rail", attrs: { "aria-hidden": "true" } });
	const fill = el("div", { class: "sf-length-fill", attrs: { "aria-hidden": "true" } });
	host.append(rail, fill);

	const draw = (): void => {
		const running = model.running;
		const { book, chapter, face } = model.nav;
		const hide = (): void => {
			host.hidden = true;
			host.removeAttribute("role"); // a hidden bar has no name to be found by
			host.removeAttribute("aria-label");
		};
		if (!running || !book || !chapter || face !== "storytelling") return hide();
		const project = running.opened.project;
		const target = readBookFrontmatter(project, book)?.plannedChapterLength ?? null;
		const words = project.wordCount(libraryChapterPath(book, chapter));
		const s = chapterLengthBarState(words, target);
		if (!s.shown) return hide();
		host.hidden = false;
		host.setAttribute("role", "img");
		host.setAttribute("aria-label", s.label);
		// The rail is the row divided by the scale; the bar starts 2px in and, as the data bars', its padding is not scaled, so the longest bar ends exactly at the row's end.
		const inner = s.scale > 1 ? `calc((100% - 2px) / ${s.scale})` : "calc(100% - 4px)";
		host.style.setProperty("--lb-rail", s.scale > 1 ? `min(100%, calc(${inner} + 4px))` : "100%");
		host.style.setProperty("--lb-bar", `min(calc(${inner} * ${s.ratio}), calc(100% - 2px))`);
		fill.hidden = s.kind === "empty";
		fill.classList.toggle("sf-length-fill--cut", s.cut);
	};
	draw();
	return model.subscribe(["stats", "nav", "library", "project", "face"], draw);
}
