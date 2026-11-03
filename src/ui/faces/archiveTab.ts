import { getArchivedChapters, unarchiveChapter } from "../../core/book";
import { getArchivedCodexItems, unarchiveCodexItem } from "../../core/codex";
import { recordChapterUnarchive } from "../../core/history";
import { libraryChapterPath } from "../../core/paths";
import { formatSingleLine } from "../../core/titleNumbering";
import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { archivedItemShown, filterFor, isFiltering } from "./codexFilter";
import { openFilterPopover } from "./filterPopover";

/** The archive tab: archived chapters (by novel) and archived Codex items, each with Unarchive. Clicking one shows it read-only. */
export function mountArchiveTab(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-pane", "sf-forge-pane");

	// The filter by type (decision 107), the same button as the Codex lists' under the same strip. It filters the archived Codex items (chapters have no type).
	const filter = () => filterFor(model.running!, "archive");
	let closeFilter: (() => void) | null = null;
	const filterButton = button({
		icon: "filter",
		name: "Filter by type",
		tooltip: "filter by type",
		kind: "quiet",
		onClick: () => {
			if (closeFilter) return closeFilter();
			closeFilter = openFilterPopover({ model, anchor: filterButton, filter: filter(), label: "Filter by type", onChange: () => (paint(), draw()), onClose: () => (closeFilter = null) });
		},
	});
	filterButton.setAttribute("aria-haspopup", "menu");
	filterButton.setAttribute("aria-expanded", "false");
	const paint = (): void => void filterButton.classList.toggle("is-filtering", !!model.running && isFiltering(filter()));
	const strip = el("div", { class: "sf-codex-strip", attrs: { role: "toolbar", "aria-orientation": "vertical", "aria-label": "Archive actions" } }, filterButton);

	const draw = (): void => {
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const readOnly = running.readOnlyReason;
		const run = (what: string, action: () => Promise<unknown>) => void model.guard(async () => (await action(), model.touch("library", "archive", "codex", "stats", "nav")), what);

		const chapters = getArchivedChapters(project);
		const allCodex = getArchivedCodexItems(project);
		const codex = allCodex.filter((c) => archivedItemShown(project, filter(), c.key));
		const byBook = new Map<string, typeof chapters>();
		for (const c of chapters) byBook.set(c.bookFolderName, [...(byBook.get(c.bookFolderName) ?? []), c]);

		const row = (name: string, onOpen: () => void, onUnarchive: () => void): HTMLElement =>
			el(
				"div",
				{ class: "sf-archive-row", attrs: { role: "listitem" } },
				el("button", { class: "sf-archive-open", attrs: { type: "button" }, text: name, on: { click: onOpen } }),
				button({ icon: "archive-restore", name: `Unarchive ${name}`, tooltip: readOnly ? "This project is open read-only." : "Unarchive", disabled: !!readOnly, onClick: onUnarchive }),
			);

		const sections: HTMLElement[] = [];
		for (const [book, list] of byBook) {
			sections.push(
				el(
					"section",
					{ class: "sf-archive-section", attrs: { "aria-label": `Archived chapters of ${list[0].bookTitle}` } },
					el("h3", { class: "sf-zone-label", text: formatSingleLine(list[0].bookTitle) }),
					el(
						"div",
						{ attrs: { role: "list" } },
						...list.map((c) =>
							row(formatSingleLine(c.chapterTitle), () => void model.editors?.open("archive", libraryChapterPath(book, c.filename)), () =>
								run("unarchive the chapter", async () => {
									await unarchiveChapter(project, book, c.filename);
									await recordChapterUnarchive(project, book, c.filename);
								}),
							),
						),
					),
				),
			);
		}
		if (allCodex.length) {
			sections.push(
				el(
					"section",
					{ class: "sf-archive-section", attrs: { "aria-label": "Archived Codex items" } },
					el("h3", { class: "sf-zone-label", text: "Codex" }),
					el(
						"div",
						{ attrs: { role: "list" } },
						...(codex.length === 0 ? [el("div", { class: "sf-muted sf-empty-inline", text: "Nothing archived matches the filter." })] : []),
						...codex.map((c) =>
							row(c.type === "folder" ? `${c.name} (folder with ${c.childCount ?? 0} children)` : c.name, () => c.type === "file" && void model.editors?.open("archive", c.key), () => run("unarchive the Codex item", () => unarchiveCodexItem(project, c.key))),
						),
					),
				),
			);
		}
		paint();
		fill(host, el("div", { class: "sf-codex-body" }, strip, el("div", { class: "sf-forge-body sf-scroll" }, ...(sections.length ? sections : [el("div", { class: "sf-muted sf-empty-inline", text: "Nothing is archived." })]))));
	};
	draw();
	const off = model.subscribe(["library", "archive", "codex", "project"], () => host.isConnected && draw());
	return () => (closeFilter?.(), off());
}
