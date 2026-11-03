import { createBook, renameBookTitle, reorderSeriesBooks } from "../../core/book";
import { bookDisplayTitle, getSeriesBooks, writeSeriesTitle, writeUnplacedOrder } from "../../core/series";
import { applyHashNumbering } from "../../core/titleNumbering";
import { el, fill } from "../kit/dom";
import { attachInlineRename } from "../kit/inlineRename";
import type { AppModel } from "../model";
import { isDragInProgress, listRow, reorderable, rowTitle, zoneHeader } from "./rows";

/** The series tab: the series title (renamed here, inline), the placed novels, and the unplaced ones. */
export function mountSeriesTab(host: HTMLElement, model: AppModel): () => void {
	let unplacedFolded = false;
	host.classList.add("sf-pane", "sf-forge-pane");

	const draw = (): void => {
		if (isDragInProgress()) return;
		const running = model.running;
		if (!running) return fill(host);
		const project = running.opened.project;
		const settings = running.settings.values;
		const readOnly = running.readOnlyReason;
		const series = getSeriesBooks(project);
		const numbered = applyHashNumbering([...series.ordered, ...series.unplaced].map((f) => bookDisplayTitle(project, f.name)), settings.seriesNumberingStyle);
		const run = (what: string, action: () => Promise<unknown>) => void model.guard(async () => (await action(), model.touch("library", "nav")), what);

		const titleText = el("span", { class: "sf-series-title-text", text: series.seriesTitle });
		const titleRow = el("div", { class: "sf-series-title", attrs: { tabindex: "0" } }, titleText);
		if (!readOnly) attachInlineRename({ row: titleRow, label: titleText, getCurrentTitle: () => getSeriesBooks(project).seriesTitle, onCommit: (name) => writeSeriesTitle(project, name).then(() => model.touch("library")) });

		const row = (folder: string, index: number, unplaced: boolean): HTMLElement => {
			const selected = model.nav.book === folder;
			const r = listRow(folder, selected) // the chosen novel is always marked (the "Highlight the active chapter" setting was retired in 1.7.0);
			const label = rowTitle(r, numbered[index], unplaced);
			r.addEventListener("click", (e) => {
				if ((e.target as HTMLElement).closest(".sf-drag-handle, input")) return;
				model.select({ kind: "novel", book: folder });
				void model.selectBook(folder);
			});
			if (!readOnly) attachInlineRename({ row: r, label, getCurrentTitle: () => bookDisplayTitle(project, folder), onCommit: (name) => renameBookTitle(project, folder, name).then(() => model.touch("library", "nav")), doubleClick: false });
			return r;
		};

		const placed = el("div", { class: "sf-list", attrs: { role: "list", "aria-label": "Novels in the series" } });
		series.ordered.forEach((f, i) => placed.append(row(f.name, i, false)));
		if (series.ordered.length === 0) placed.append(el("div", { class: "sf-muted sf-empty-inline", text: "Drag a book here to sequence it." }));
		const unplacedList = el("div", { class: "sf-list sf-unplaced-list", attrs: { role: "list", "aria-label": "Unplaced novels" } });
		series.unplaced.forEach((f, i) => unplacedList.append(row(f.name, series.ordered.length + i, true)));

		fill(
			host,
			titleRow,
			el("div", { class: "sf-forge-body sf-scroll" }, placed, el("div", { class: "sf-unplaced-zone" }, zoneHeader("Unplaced Novels", unplacedFolded, () => ((unplacedFolded = !unplacedFolded), draw()), { name: "New novel", disabled: !!readOnly, reason: "This project is open read-only.", onCreate: () => run("create the novel", () => createBook(project)) }), unplacedFolded ? null : unplacedList)),
		);
		if (!readOnly) {
			reorderable(
				model,
				[{ key: "ordered", container: placed }, ...(unplacedFolded ? [] : [{ key: "unplaced", container: unplacedList }])],
				async (keys) => {
					await reorderSeriesBooks(project, (keys.ordered ?? []).filter(Boolean));
					if (keys.unplaced) await writeUnplacedOrder(project, keys.unplaced.filter(Boolean));
				},
				draw,
			);
		}
	};
	draw();
	return model.subscribe(["library", "project", "nav", "settings"], () => host.isConnected && draw());
}
