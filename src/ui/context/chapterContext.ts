import { chapterDisplayTitle, getBookChapters, getChapterEntry, readBookFrontmatter, readChapterPlot, writeChapterLocation, writeChapterPov, type CodexRef } from "../../core/book";
import { getCodexEntriesByType } from "../../core/codex";
import { commitPlotNote, rescuePlotNote } from "../../core/fieldWriter";
import { bookFilePath, libraryChapterPath } from "../../core/paths";
import { applyHashNumbering } from "../../core/titleNumbering";
import { commitFocusedFields } from "../commitOnClose";
import { writingPlaceGone } from "../editor/lastWriting";
import { openCodexPicker } from "../kit/codexPicker";
import { el } from "../kit/dom";
import { metaRow } from "../faces/lengthFields";
import type { AppModel } from "../model";
import { FieldBin, textField, type TextField } from "../overviews/fieldCommitter";
import { trackRestingGrid } from "./restingGrid";
import { mountChapterText, type ChapterText } from "./chapterText";

/** Whether the context panel shows the chosen chapter: on the library side's novel tab. Everywhere else it is the Codex note, as before. */
export const showsChosenChapter = (model: AppModel): boolean => model.nav.face === "storyforge" && model.nav.forgeTab === "novel";

/**
 * The context panel on the library side's novel tab (Brief 14 §1.6): the chosen chapter's PoV and Location (the Codex pickers, the same
 * writes as the cards had: decisions 42 and 43, on the panel's own background), its plot note (the field editor of decision 47 on a
 * working card: commit on blur and on close, compare-then-write, recovery, the typing aids) and its text, read-only (`chapterText.ts`).
 * With no chapter chosen it is blank. The chosen chapter is `nav.chapter`, shared with the storytelling side's editor (§1.7).
 *
 * Changing the chosen chapter commits a plot note being typed in first, to the chapter it belongs to, before the panel is rebuilt;
 * the words are never dropped with the old field.
 */
export function mountChapterContext(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-chapter-context");
	let shown: { path: string; title: string; field: TextField | null; text: ChapterText | null; rows: HTMLElement } | null = null;
	const bin = new FieldBin();
	let drawing: Promise<void> = Promise.resolve();

	const clear = (): void => {
		shown?.text?.destroy();
		bin.clear();
		shown = null;
		host.replaceChildren();
		writingPlaceGone(); // the special-characters button re-reads where the author was
	};

	/** The PoV and Location rows (rebuilt whenever the library changes). */
	const buildRows = (book: string, file: string, title: string): HTMLElement => {
		const running = model.running!;
		const project = running.opened.project;
		const readOnly = running.readOnlyReason;
		const fm = readBookFrontmatter(project, book);
		const entry = getChapterEntry(project, book, file);
		const defaultPov: CodexRef[] = fm?.defaultPovPath ? [{ path: fm.defaultPovPath, name: fm.defaultPovName ?? fm.defaultPovPath }] : [];
		const choose = (what: string, type: string, current: CodexRef[], save: (chosen: CodexRef[]) => Promise<void>): void =>
			openCodexPicker({
				title: what,
				entries: getCodexEntriesByType(project, type),
				selected: current,
				multi: true,
				emptyText: type === "person" ? "There are no people in the Codex yet." : "There are no places in the Codex yet.",
				exists: (p) => project.isFile(p),
				onApply: (chosen) => void model.guard(async () => (await save(chosen), model.touch("library", "nav")), "save the choice"),
			});
		/** PoV or Location: a button like the default PoV's, showing the chosen names (plain labels: they open nothing, §2). */
		const row = (label: string, kind: "pov" | "location", own: CodexRef[], type: string, fallback: CodexRef[]): HTMLElement => {
			const hasOwn = own.length > 0;
			const list = hasOwn ? own : fallback;
			const pieces: Node[] = [];
			list.forEach((r, i) => {
				const missing = !project.isFile(r.path);
				const muted = !hasOwn || missing;
				if (i > 0) pieces.push(document.createTextNode(", "));
				pieces.push(el("span", { class: muted ? "sf-muted" : "", text: missing ? `${r.name} (missing)` : r.name, attrs: missing ? { title: `${r.path} is not in the Codex` } : {} }));
			});
			if (!list.length) pieces.push(el("span", { class: "sf-muted", text: "None" }));
			else if (!hasOwn) pieces.push(document.createTextNode(" "), el("span", { class: "sf-muted", text: "(default)" }));
			const names = list.length ? list.map((r) => r.name).join(", ") + (hasOwn ? "" : " (default)") : "None";
			return metaRow(`${label}:`, names, {
				content: pieces,
				dataRow: kind,
				disabled: !!readOnly,
				title: kind === "pov" ? "Choose the point-of-view characters" : "Choose the locations",
				name: `${label} for ${title}: ${names}. Choose`,
				onClick: () => choose(`${label} for ${title}`, type, own, (c) => (kind === "pov" ? writeChapterPov : writeChapterLocation)(project, book, file, c)),
			});
		};
		return el("div", { class: "sf-card-rows sf-chapter-rows" }, row("PoV", "pov", entry?.pov ?? [], "person", defaultPov), row("Location", "location", entry?.location ?? [], "place", []));
	};

	/** Builds the panel for the chosen chapter. */
	const build = (path: string, book: string, file: string): void => {
		const running = model.running!;
		const project = running.opened.project;
		const { ordered, unplaced } = getBookChapters(project, book);
		const names = [...ordered, ...unplaced].map((c) => c.name);
		const titles = applyHashNumbering(names.map((n) => chapterDisplayTitle(project, book, n)), running.settings.values.chapterNumberingStyle);
		const title = titles[names.indexOf(file)] ?? chapterDisplayTitle(project, book, file);
		const rows = buildRows(book, file, title);
		const field = textField(
			{
				label: `Plot note for ${title}`,
				readOnly: !!running.readOnlyReason,
				read: () => readChapterPlot(project, book, file),
				commit: (expected, next) => commitPlotNote(project, book, file, expected, next),
				recover: (text) => rescuePlotNote(project, book, file, text),
				notify: (n) => model.notices.notify(n),
				placeholder: "Plot note",
				typing: () => model.typingOptions(),
				links: model.codexLinksFor(bookFilePath(book), false), // the plot note is stored in the novel file
			},
			bin,
		);
		field.element.dataset.plot = file;
		const plotCard = el("div", { class: "sf-ctx-card sf-ctx-plot" }, field.element);
		const text = mountChapterText(model, path, `Text of ${title}`);
		const textCard = el("div", { class: "sf-ctx-card sf-ctx-text" }, text.element);
		host.replaceChildren(rows, plotCard, textCard);
		void readChapterPlot(project, book, file).then((p) => field.show(p));
		shown = { path, title, field, text, rows };
	};

	const draw = async (): Promise<void> => {
		const running = model.running;
		const book = model.shownBook;
		const chapter = model.shownChapter; // an automatic choice (the first placed chapter) only shows; the chapter being written is unchanged (Tweaks 2 §1.8)
		const path = running && showsChosenChapter(model) && book && chapter ? libraryChapterPath(book, chapter) : null;
		const exists = !!(path && running!.opened.project.entry(path));
		if (!path || !exists || !book || !chapter) {
			// Not on the novel tab, or no chapter chosen: blank. A plot note being typed in is committed before it goes.
			if (shown) {
				await commitFocusedFields();
				clear();
			}
			host.hidden = !showsChosenChapter(model);
			return;
		}
		host.hidden = false;
		if (shown && shown.path === path) {
			// The same chapter: the rows follow the library (a PoV chosen elsewhere), the plot note follows the disk unless it is being typed in.
			const rows = buildRows(book, chapter, shown.title);
			shown.rows.replaceWith(rows);
			shown.rows = rows;
			void readChapterPlot(running!.opened.project, book, chapter).then((p) => shown?.field?.show(p));
			return;
		}
		// Another chapter: what is being typed in goes to the chapter it belongs to first, then the panel is rebuilt for the new one.
		if (shown) {
			await commitFocusedFields();
			clear();
		}
		build(path, book, chapter);
	};
	/**
	 * The chapter information box's top is level with the top of the novel synopsis box in the centre pane (Tweaks 1, §1.6), worked out live from the layout on the
	 * resting grid (`restingGrid.ts`): never a fixed figure, and never following the pane's scrolling. The PoV and Location rows sit above it, 12px clear. If they
	 * would have to rise above the panel's top line the box stays where it is: the rows are never squeezed or pushed over it.
	 */
	const grid = trackRestingGrid(host, () => {
		const plot = host.querySelector<HTMLElement>(".sf-ctx-plot");
		const synopsis = document.querySelector<HTMLElement>(".sf-overview .sf-overview-head .sf-section-field");
		return plot && synopsis ? { anchor: plot, target: synopsis } : null;
	});
	const alignSoon = grid.align;
	const schedule = (): void => {
		drawing = drawing.then(draw).then(alignSoon).catch(() => undefined);
	};
	schedule();
	const off = model.subscribe(["nav", "face", "library", "project"], schedule);
	return () => {
		off();
		grid.dispose();
		void drawing.then(() => {
			clear();
			host.classList.remove("sf-chapter-context");
		});
	};
}
