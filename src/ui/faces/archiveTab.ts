import { getArchivedChapters, unarchiveChapter } from "../../core/book";
import { getArchivedCodexItems, unarchiveCodexItem } from "../../core/codex";
import { recordChapterUnarchive } from "../../core/history";
import { libraryChapterPath } from "../../core/paths";
import { formatSingleLine } from "../../core/titleNumbering";
import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";

/** The archive tab: archived chapters (by novel) and archived Codex items, each with Unarchive. Clicking one shows it read-only. */
export function mountArchiveTab(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-pane", "sf-forge-pane");

	const draw = (): void => {
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const readOnly = running.readOnlyReason;
		const run = (what: string, action: () => Promise<unknown>) => void model.guard(async () => (await action(), model.touch("library", "archive", "codex", "stats", "nav")), what);

		const chapters = getArchivedChapters(project);
		const codex = getArchivedCodexItems(project);
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
		if (codex.length) {
			sections.push(
				el(
					"section",
					{ class: "sf-archive-section", attrs: { "aria-label": "Archived Codex items" } },
					el("h3", { class: "sf-zone-label", text: "Codex" }),
					el(
						"div",
						{ attrs: { role: "list" } },
						...codex.map((c) =>
							row(c.type === "folder" ? `${c.name} (folder with ${c.childCount ?? 0} children)` : c.name, () => c.type === "file" && void model.editors?.open("archive", c.key), () => run("unarchive the Codex item", () => unarchiveCodexItem(project, c.key))),
						),
					),
				),
			);
		}
		fill(host, el("div", { class: "sf-forge-body sf-scroll" }, ...(sections.length ? sections : [el("div", { class: "sf-muted sf-empty-inline", text: "Nothing is archived." })])));
	};
	draw();
	return model.subscribe(["library", "archive", "codex", "project"], () => host.isConnected && draw());
}
