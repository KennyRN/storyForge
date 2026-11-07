import { archiveChapter, chapterDisplayTitle, getBookChapters, readBookFrontmatter, renameChapterTitle, writeBookChapterOrder, writeBookUnplacedOrder, writeBookPlannedChapterLength, writeBookPlannedNovelLength, writeDefaultPov, createChapter } from "../../core/book";
import { getCodexEntriesByType } from "../../core/codex";
import { readChapterWordCount, recordChapterArchive } from "../../core/history";
import { libraryChapterPath } from "../../core/paths";
import { applyHashNumbering } from "../../core/titleNumbering";
import { el, fill } from "../kit/dom";
import { attachInlineRename } from "../kit/inlineRename";
import { menuPoint, showMenu } from "../kit/menu";
import type { AppModel } from "../model";
import { grouped, lengthRow as sharedLengthRow, metaRow } from "./lengthFields";
import { isDragInProgress, listRow, reorderable, rowTitle, zoneHeader } from "./rows";

/** Archives a chapter: its editor is closed (and saved) first, and the selection moves on if it was the selected one. */
export async function archiveChapterAndTidy(model: AppModel, book: string, filename: string): Promise<void> {
	const running = model.running;
	if (!running) return;
	const project = running.opened.project;
	const path = libraryChapterPath(book, filename);
	const slot = model.editors?.where(path);
	if (slot) await model.editors?.close(slot);
	const words = await readChapterWordCount(project, book, filename);
	await archiveChapter(project, book, filename);
	await recordChapterArchive(project, book, filename, words);
	if (model.nav.book === book && model.nav.chapter === filename) {
		const rest = getBookChapters(project, book);
		model.nav.chapter = rest.ordered[0]?.name ?? rest.unplaced[0]?.name ?? null;
		const next = model.currentChapterPath();
		if (next) await model.editors?.open("centre", next);
	}
	model.touch("library", "archive", "stats", "nav");
}

/** The novel tab: the placed and unplaced chapters of the selected novel, the planned lengths and the default PoV. */
export function mountNovelTab(host: HTMLElement, model: AppModel): () => void {
	let unplacedFolded = false;
	let editing: "novel" | "chapter" | null = null;
	host.classList.add("sf-pane", "sf-forge-pane");

	const draw = (): void => {
		if (isDragInProgress()) return;
		const running = model.running;
		const book = model.shownBook; // the library's chosen novel, else the one being written (Brief 19)
		const written = model.nav.book === book;
		if (!running || !book) return fill(host, el("div", { class: "sf-muted sf-empty-inline", text: "Open a chapter to get started." }));
		const project = running.opened.project;
		const settings = running.settings.values;
		const readOnly = running.readOnlyReason;
		const fm = readBookFrontmatter(project, book);
		const { ordered, unplaced } = getBookChapters(project, book);
		const numbered = applyHashNumbering([...ordered, ...unplaced].map((c) => chapterDisplayTitle(project, book, c.name)), settings.chapterNumberingStyle);
		const run = (what: string, action: () => Promise<unknown>): Promise<void> => model.guard(async () => (await action(), model.touch("library", "nav")), what).then(() => undefined);

		const row = (name: string, index: number): HTMLElement => {
			const r = listRow(name, model.shownChapter === name); // the chosen chapter is always marked (the "Highlight the active chapter" setting was retired in 1.7.0; a stored key is never read)
			const label = rowTitle(r, numbered[index]);
			r.addEventListener("click", (e) => {
				if ((e.target as HTMLElement).closest(".sf-drag-handle, input")) return;
				void model.chooseChapter(book, name);
			});
			r.addEventListener("keydown", (e) => {
				if (e.target === r && e.key === "Enter") void model.chooseChapter(book, name);
			});
			if (!readOnly) {
				attachInlineRename({
					row: r,
					label,
					getCurrentTitle: () => chapterDisplayTitle(project, book, name),
					onCommit: (title) => renameChapterTitle(project, book, name, title).then(() => model.touch("library", "nav")),
					extraMenuItems: [{ title: "Archive", onClick: () => run("archive the chapter", () => archiveChapterAndTidy(model, book, name)) }],
					doubleClick: false,
				});
			}
			return r;
		};
		const placedList = el("div", { class: "sf-list sf-chapter-list", attrs: { role: "list", "aria-label": "Placed chapters" } });
		ordered.forEach((c, i) => placedList.append(row(c.name, i)));
		if (ordered.length === 0) placedList.append(el("div", { class: "sf-muted sf-empty-inline", text: "Drag a chapter here to sequence it." }));
		const unplacedList = el("div", { class: "sf-list sf-unplaced-list sf-chapter-list", attrs: { role: "list", "aria-label": "Unplaced chapters" } });
		unplaced.forEach((c, i) => unplacedList.append(row(c.name, ordered.length + i)));

		// Planned lengths and the default PoV
		const meta = el("div", { class: "sf-meta" });
		const pov = fm?.defaultPovPath ?? null;
		meta.append(
			metaRow("Default PoV:", pov ? (fm?.defaultPovName ?? pov) : "None", {
				title: pov ? "Change the point-of-view character" : "Set the point-of-view character",
				disabled: !!readOnly,
				onClick: (anchor) => {
					const people = getCodexEntriesByType(project, "person");
					showMenu(
						[...(people.length ? people.map((p) => ({ label: p.name, onSelect: () => run("set the PoV", () => writeDefaultPov(project, book, p.path, p.name)) })) : [{ label: "No person entries in the Codex yet.", disabled: true }]), ...(pov ? [{ separator: true }, { label: "Clear", onSelect: () => run("clear the PoV", () => writeDefaultPov(project, book, null, null)) }] : [])],
						menuPoint(anchor),
					);
				},
			}),
		);
		const words = ordered.reduce((n, c) => n + project.wordCount(c.path), 0);
		const lengthRow = (which: "novel" | "chapter", label: string, value: number | null, shown: string, write: (n: number | null) => Promise<void>): HTMLElement =>
			sharedLengthRow({ which, label, value, shown, readOnly, editing: editing === which, startEditing: () => ((editing = which), draw()), stopEditing: () => ((editing = null), draw()), save: (n) => run("save the length", () => write(n)) });
		const plannedNovel = fm?.plannedNovelLength ?? null;
		const plannedChapter = fm?.plannedChapterLength ?? null;
		meta.append(lengthRow("novel", "Novel Length:", plannedNovel, plannedNovel === null ? "Not set" : `${grouped(words)} of ${grouped(plannedNovel)}`, (n) => writeBookPlannedNovelLength(project, book, n)));
		meta.append(lengthRow("chapter", "Chapter Length:", plannedChapter, plannedChapter === null ? "Not set" : grouped(plannedChapter), (n) => writeBookPlannedChapterLength(project, book, n)));
		if (editing === "chapter" && ordered.length > 0) {
			const counts = ordered.map((c) => project.wordCount(c.path)).sort((a, b) => a - b);
			const mid = Math.floor(counts.length / 2);
			const median = counts.length % 2 === 0 ? (counts[mid - 1] + counts[mid]) / 2 : counts[mid];
			meta.append(metaRow("Average:", grouped(counts.reduce((a, b) => a + b, 0) / counts.length), {}), metaRow("Median:", grouped(median), {}));
		}

		fill(
			host,
			el(
				"div",
				{ class: "sf-forge-body sf-scroll" },
				meta,
				el("div", { class: "sf-placed-zone" }, zoneHeader("Placed Chapters", false, () => undefined, undefined, { chevron: false, foldable: false }), placedList),
				el("div", { class: "sf-unplaced-zone" }, zoneHeader("Unplaced Chapters", unplacedFolded, () => ((unplacedFolded = !unplacedFolded), draw()), { name: "New chapter", disabled: !!readOnly, reason: "This project is open read-only.", onCreate: () => run("create the chapter", () => createChapter(project, book)) }, { chevron: false }), unplacedFolded ? null : unplacedList),
			),
		);
		if (!readOnly) {
			reorderable(
				model,
				[{ key: "ordered", container: placedList }, ...(unplacedFolded ? [] : [{ key: "unplaced", container: unplacedList }])],
				async (keys) => {
					// The placed list can't be folded; the check stays for a zone that is absent.
					if (keys.ordered) await writeBookChapterOrder(project, book, keys.ordered.filter(Boolean));
					// ...and the unplaced list as it was left, so a chapter dropped at the top of it stays at the top.
					if (keys.unplaced) await writeBookUnplacedOrder(project, book, keys.unplaced.filter(Boolean));
				},
				draw,
			);
		}
	};
	draw();
	return model.subscribe(["library", "project", "nav", "settings"], () => host.isConnected && draw());
}
