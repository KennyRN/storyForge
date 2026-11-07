import { chapterDisplayTitle, getBookChapters, readBookFrontmatter, renameBookTitle, writeDefaultPov } from "../../core/book";
import { getCodexEntriesByType } from "../../core/codex";
import { bookFilePath, libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { applyHashNumbering } from "../../core/titleNumbering";
import { formatWordCount } from "../../core/wordCount";
import { commitFocusedFields } from "../commitOnClose";
import { writingPlaceGone } from "../editor/lastWriting";
import { metaRow } from "../faces/lengthFields";
import { el } from "../kit/dom";
import { attachInlineRename } from "../kit/inlineRename";
import { pencilIcon } from "../kit/statsIcons";
import { attachTooltip } from "../kit/tooltip";
import { menuPoint, showMenu } from "../kit/menu";
import type { AppModel } from "../model";
import { dataBar, chapterScale } from "../overviews/bars";
import { coverBox } from "../overviews/cover";
import { FieldBin } from "../overviews/fieldCommitter";
import { buildNovelProgress } from "../overviews/novelProgress";
import { debounced } from "../overviews/refresh";
import { synopsisField } from "../overviews/sectionFields";
import { trackRestingGrid } from "./restingGrid";
import { contextMode } from "./contextMode";

/** Whether the context panel shows the library's chosen novel: on the library side's series tab. */
export const showsChosenNovel = (model: AppModel): boolean => contextMode(model) === "novel";

/**
 * The context panel on the library side's series tab (Brief 19 §1.3): the chosen novel's cover, title, default PoV, synopsis, its progress bar and
 * its chapters as bars without names (a bar's name is its tooltip and its accessible name; a click does nothing). With none chosen it is blank.
 * Only where each editor is mounted moved: the writers are the ones the series overview and the novel tab always used. The synopsis is the
 * field editor of decision 47 (commit on blur and on close, compare-then-write, recovery, the typing aids). Choosing another novel commits a
 * synopsis being typed in first, to the novel it belongs to, before the panel is rebuilt.
 */
export function mountNovelContext(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-novel-context");
	let shown: string | null = null;
	const bin = new FieldBin();
	let ghostWatch: ResizeObserver | null = null;
	let drawing: Promise<void> = Promise.resolve();

	/**
	 * The resting grid (Tweaks 1 part 2, §1, §4.1, §4.2): the cover's top is level with the top of the series description box in the centre pane. Stacked under the
	 * cover (the panel too narrow for them side by side) the synopsis's top is level with the first novel's cover in the centre pane's list, or 12px under the
	 * panel's cover if that is lower, so it never overlaps.
	 */
	const grid = trackRestingGrid(host, () => {
		const cover = host.querySelector<HTMLElement>(".sf-novel-ctx-head > .sf-cover");
		const description = document.querySelector<HTMLElement>(".sf-overview .sf-overview-head .sf-section-field");
		return cover && description ? { anchor: cover, target: description } : null;
	});
	const stack = (): void => {
		const cover = host.querySelector<HTMLElement>(".sf-novel-ctx-head > .sf-cover");
		const synopsis = host.querySelector<HTMLElement>(".sf-novel-ctx-head > .sf-ctx-synopsis");
		const first = document.querySelector<HTMLElement>(".sf-overview .sf-overview-row .sf-cover");
		const overview = document.querySelector<HTMLElement>(".sf-overview");
		if (!cover || !synopsis) return;
		synopsis.style.marginTop = "0px";
		const stacked = synopsis.getBoundingClientRect().top >= cover.getBoundingClientRect().bottom - 1;
		host.dataset.synopsis = stacked ? "under" : "beside";
		if (!stacked || !first || !overview) return;
		const want = first.getBoundingClientRect().top + overview.scrollTop - overview.getBoundingClientRect().top - (synopsis.getBoundingClientRect().top - overview.getBoundingClientRect().top);
		synopsis.style.marginTop = `${Math.max(0, Math.round(want * 100) / 100)}px`;
	};
	const stackWatch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => requestAnimationFrame(stack)) : null;
	stackWatch?.observe(host);

	const clear = (): void => {
		ghostWatch?.disconnect();
		ghostWatch = null;
		bin.clear();
		shown = null;
		host.replaceChildren();
		writingPlaceGone();
	};

	const build = (book: string): void => {
		const running = model.running!;
		const project = running.opened.project;
		const settings = running.settings.values;
		const readOnly = running.readOnlyReason;
		const run = (what: string, action: () => Promise<unknown>): void => void model.guard(async () => (await action(), model.touch("library", "nav")), what);
		const fm = readBookFrontmatter(project, book);
		const series = getSeriesBooks(project);
		const all = [...series.ordered, ...series.unplaced].map((f) => f.name);
		const numbered = applyHashNumbering(all.map((f) => bookDisplayTitle(project, f)), settings.seriesNumberingStyle);
		const title = numbered[all.indexOf(book)] ?? bookDisplayTitle(project, book);

		const titleText = el("span", { class: "sf-novel-ctx-title-text", text: title });
		const titleRow = el("div", { class: "sf-novel-ctx-title", attrs: { tabindex: "0" } }, titleText);
		if (!readOnly) attachInlineRename({ row: titleRow, label: titleText, getCurrentTitle: () => bookDisplayTitle(project, book), onCommit: (name) => renameBookTitle(project, book, name).then(() => model.touch("library", "nav")), doubleClick: false });

		const pov = fm?.defaultPovPath ?? null;
		const povRow = metaRow("Default PoV:", pov ? (fm?.defaultPovName ?? pov) : "None", {
			title: pov ? "Change the point-of-view character" : "Set the point-of-view character",
			disabled: !!readOnly,
			onClick: (anchor) => {
				const people = getCodexEntriesByType(project, "person");
				showMenu(
					[...(people.length ? people.map((p) => ({ label: p.name, onSelect: () => run("set the PoV", () => writeDefaultPov(project, book, p.path, p.name)) })) : [{ label: "No person entries in the Codex yet.", disabled: true }]), ...(pov ? [{ separator: true }, { label: "Clear", onSelect: () => run("clear the PoV", () => writeDefaultPov(project, book, null, null)) }] : [])],
					menuPoint(anchor),
				);
			},
		});
		// "Write this novel" (route 2, §1.4): a hover icon beside the title, distinct from the title's own rename. It makes this novel the one being written.
		const write = el("button", { class: "sf-hover-icon sf-novel-ctx-write", attrs: { type: "button", "aria-label": `Write this novel: ${title}` }, on: { click: () => void model.writeNovel(book) } }, pencilIcon());
		attachTooltip(write, "Write this novel");
		// The title and default PoV sit above, 12px clear of the cover and synopsis (the column's gap); the synopsis is beside the cover, or under it when the panel is too narrow (flex wrap).
		const meta = el("div", { class: "sf-novel-ctx-meta" }, el("div", { class: "sf-novel-ctx-titlerow" }, titleRow, write), povRow);
		const synopsis = el("div", { class: "sf-ctx-card sf-ctx-synopsis" }, synopsisField(model, bin, book, title));
		const head = el("div", { class: "sf-novel-ctx-head" }, coverBox(model, { kind: "book", code: book }, title), synopsis);

		const { ordered, unplaced } = getBookChapters(project, book);
		const names = [...ordered, ...unplaced].map((c) => c.name);
		const titles = applyHashNumbering(names.map((n) => chapterDisplayTitle(project, book, n)), settings.chapterNumberingStyle);
		const words = ordered.map((c) => project.wordCount(libraryChapterPath(book, c.name)));
		const plannedNovel = fm?.plannedNovelLength ?? null;
		const plannedChapter = fm?.plannedChapterLength ?? null;
		const progress = buildNovelProgress({ titles, names: ordered.map((c) => c.name), words, plannedNovel, plannedChapter });
		const scale = Math.max(...words, 0);
		const targets = chapterScale(words, plannedChapter);
		const bars = el(
			"div",
			{ class: "sf-novel-ctx-bars", attrs: { role: "list", "aria-label": `Chapters of ${title}` } },
			...ordered.map((c, i) => el("div", { class: "sf-card", attrs: { role: "listitem" }, dataset: { chapter: c.name } }, dataBar({ title: titles[i], words: words[i], target: plannedChapter, scale, targets, name: titles[i], labelled: false, compact: true, tooltip: `${titles[i]}\n${formatWordCount(words[i])}` }))),
		);
		host.replaceChildren(meta, head, progress.joined, bars);
		progress.drawGhosts();
		if (typeof ResizeObserver !== "undefined") {
			ghostWatch = new ResizeObserver(progress.drawGhosts);
			ghostWatch.observe(progress.track);
		}
		shown = book;
		grid.align();
		requestAnimationFrame(stack);
	};

	const draw = async (): Promise<void> => {
		const running = model.running;
		const book = model.nav.libraryBook;
		const exists = !!(running && book && showsChosenNovel(model) && running.opened.project.entry(bookFilePath(book)));
		if (!exists || !book) {
			// Not on the series tab, or none chosen: blank. A synopsis being typed in is committed before it goes.
			if (shown) {
				await commitFocusedFields();
				clear();
			}
			host.hidden = !showsChosenNovel(model);
			return;
		}
		host.hidden = false;
		// A redraw never takes a synopsis being typed in: its text isn't saved yet.
		if (shown === book && document.activeElement instanceof HTMLElement && host.contains(document.activeElement) && document.activeElement.closest(".sf-note-field")) return;
		if (shown) {
			await commitFocusedFields(); // another novel: what is being typed goes to the novel it belongs to first
			clear();
		}
		build(book);
	};
	const schedule = (): void => {
		drawing = drawing.then(draw).catch(() => undefined);
	};
	schedule();
	const refresh = debounced(schedule);
	const offNav = model.subscribe(["nav", "face"], schedule);
	const offData = model.subscribe(["library", "stats", "project", "archive"], refresh);
	return () => {
		grid.dispose();
		stackWatch?.disconnect();
		offNav();
		offData();
		refresh.cancel();
		void drawing.then(() => {
			clear();
			host.classList.remove("sf-novel-context");
		});
	};
}
