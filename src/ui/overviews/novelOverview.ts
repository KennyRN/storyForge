import { chapterDisplayTitle, getBookChapters, getChapterEntry, readBookFrontmatter, readChapterPlot, writeBookPlannedChapterLength, writeBookPlannedNovelLength, writeChapterLocation, writeChapterPov, writeDefaultPov, type CodexRef } from "../../core/book";
import { getCodexEntriesByType } from "../../core/codex";
import { computeGhostChapterDividerPercents, computeNovelLengthBarLayout, STRUCTURE_GUIDELINE_PERCENTS } from "../../core/novelLengthBar";
import { libraryChapterPath } from "../../core/paths";
import { bookDisplayTitle, getSeriesBooks } from "../../core/series";
import { nextPlotCardTier, plotCardTooltip, type PlotCardTier } from "../../core/plotCardTier";
import { applyHashNumbering } from "../../core/titleNumbering";
import { formatWordCount } from "../../core/wordCount";
import { grouped, lengthRow } from "../faces/lengthFields";
import { openCodexPicker } from "../kit/codexPicker";
import { el, fill } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";
import { dataBar } from "./bars";
import { commitPlotNote, rescuePlotNote } from "../../core/fieldWriter";
import { textField } from "./fieldCommitter";
import { coverBox, removeCoverButton } from "./cover";
import { synopsisField } from "./sectionFields";
import { debounced, redrawKeepingFocus } from "./refresh";

/** The novel overview: the progress bar (segments, ghost dividers, structure strip), the planned lengths, and a bar-tier card per chapter. */
export function mountNovelOverview(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-overview-body");
	let editing: "novel" | "chapter" | null = null;
	/** Plot notes read on first hover, kept until the next redraw (the index changed). */
	let plots = new Map<string, string>();

	const draw = (): void => {
		// A redraw never steals focus: leave a field being typed in alone.
		if (editing !== null && host.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
		// Nor a plot note being typed in: its text isn't saved yet.
		if (host.contains(document.activeElement) && document.activeElement instanceof HTMLTextAreaElement) return;
		plots = new Map();
		const running = model.running;
		const book = model.nav.book;
		if (!running || !book) return fill(host, el("div", { class: "sf-muted", text: "Select a novel." }));
		const project = running.opened.project;
		const settings = running.settings.values;
		const readOnly = running.readOnlyReason;
		const fm = readBookFrontmatter(project, book);
		const { ordered, unplaced } = getBookChapters(project, book);
		const titles = applyHashNumbering([...ordered, ...unplaced].map((c) => chapterDisplayTitle(project, book, c.name)), settings.chapterNumberingStyle);
		const words = ordered.map((c) => project.wordCount(libraryChapterPath(book, c.name)));
		const total = words.reduce((a, b) => a + b, 0);
		const plannedNovel = fm?.plannedNovelLength ?? null;
		const plannedChapter = fm?.plannedChapterLength ?? null;
		const run = (write: () => Promise<void>): Promise<void> => model.guard(async () => (await write(), model.touch("library", "nav")), "save the length").then(() => undefined);
		const open = (name: string): void => void model.openChapter(book, name);

		const novelTitle = (): string => {
			const series = getSeriesBooks(project);
			const all = [...series.ordered, ...series.unplaced].map((f) => f.name);
			const numbered = applyHashNumbering(all.map((f) => bookDisplayTitle(project, f)), settings.seriesNumberingStyle);
			return numbered[all.indexOf(book)] ?? bookDisplayTitle(project, book);
		};

		// References to Codex notes: PoV, Location and the default PoV
		const openNote = (path: string): void => {
			model.setCentreView("chapter");
			void model.editors?.open("centre", path);
		};
		const noteExists = (path: string): boolean => project.isFile(path);
		const refButtons = (refs: CodexRef[], muted: boolean): HTMLElement[] =>
			refs.map((r) => {
				const missing = !noteExists(r.path);
				return el("button", { class: `sf-ref${muted || missing ? " is-muted" : ""}`, text: missing ? `${r.name} (missing)` : r.name, attrs: { type: "button", title: missing ? `${r.path} is not in the Codex` : r.path }, on: { click: () => (missing ? undefined : openNote(r.path)) } });
			});
		const choose = (what: string, type: string, multi: boolean, current: CodexRef[], save: (chosen: CodexRef[]) => Promise<void>): void =>
			openCodexPicker({
				title: what,
				entries: getCodexEntriesByType(project, type),
				selected: current,
				multi,
				emptyText: type === "person" ? "There are no people in the Codex yet." : "There are no places in the Codex yet.",
				exists: noteExists,
				onApply: (chosen) => void model.guard(async () => (await save(chosen), model.touch("library", "nav")), "save the choice"),
			});
		const defaultPov: CodexRef[] = fm?.defaultPovPath ? [{ path: fm.defaultPovPath, name: fm.defaultPovName ?? fm.defaultPovPath }] : [];
		const povRow = el(
			"div",
			{ class: "sf-meta-row sf-ref-row", dataset: { row: "default-pov" } },
			el("span", { class: "sf-meta-label", text: "Default PoV:" }),
			el("span", { class: "sf-ref-list" }, ...(defaultPov.length ? refButtons(defaultPov, false) : [el("span", { class: "sf-muted", text: "None" })])),
			readOnly ? null : el("button", { class: "sf-ref-choose", text: "Choose…", attrs: { type: "button", "aria-label": "Choose the default PoV" }, on: { click: () => choose("Default PoV", "person", false, defaultPov, async (c) => writeDefaultPov(project, book, c[0]?.path ?? null, c[0]?.name ?? null)) } }),
		);

		// The progress bar
		const layout = computeNovelLengthBarLayout(words, plannedNovel);
		const track = el("div", { class: "sf-progress", attrs: { role: "group", "aria-label": `Novel progress: ${formatWordCount(total)}${plannedNovel ? ` of ${grouped(plannedNovel)}` : ""}` } });
		for (const seg of layout.segments) {
			const name = ordered[seg.chapterIndex].name;
			const part = el("button", { class: "sf-progress-seg", attrs: { type: "button", "aria-label": `${titles[seg.chapterIndex]}: ${formatWordCount(words[seg.chapterIndex])}` }, on: { click: () => open(name) } });
			part.style.left = `${seg.leftPercent}%`;
			part.style.width = `${seg.widthPercent}%`;
			attachTooltip(part, `${titles[seg.chapterIndex]}\n${formatWordCount(words[seg.chapterIndex])}`);
			track.append(part);
		}
		for (const pct of layout.dividerPercents) {
			const d = el("span", { class: "sf-progress-divider", attrs: { "aria-hidden": "true" } });
			d.style.left = `${pct}%`;
			track.append(d);
		}
		for (const pct of computeGhostChapterDividerPercents(total, plannedNovel, plannedChapter, layout.scale)) {
			const g = el("span", { class: "sf-progress-ghost", attrs: { "aria-hidden": "true" } });
			g.style.left = `${pct}%`;
			track.append(g);
		}
		const strip = el("div", { class: "sf-structure-strip", attrs: { role: "img", "aria-label": `Story structure guide marks at ${STRUCTURE_GUIDELINE_PERCENTS.join(", ")} per cent` } });
		for (const pct of STRUCTURE_GUIDELINE_PERCENTS) {
			const m = el("span", { class: "sf-structure-mark" });
			m.style.left = `${pct}%`;
			strip.append(m);
		}

		// The planned lengths
		const row = (which: "novel" | "chapter", label: string, value: number | null, shown: string, write: (n: number | null) => Promise<void>): HTMLElement =>
			lengthRow({ which, label, value, shown, readOnly, editing: editing === which, startEditing: () => ((editing = which), draw()), stopEditing: () => ((editing = null), draw()), save: (n) => run(() => write(n)) });
		const meta = el(
			"div",
			{ class: "sf-meta sf-overview-meta" },
			row("novel", "Novel Length:", plannedNovel, plannedNovel === null ? "Not set" : `${grouped(total)} of ${grouped(plannedNovel)}`, (n) => writeBookPlannedNovelLength(project, book, n)),
			row("chapter", "Chapter Length:", plannedChapter, plannedChapter === null ? "Not set" : grouped(plannedChapter), (n) => writeBookPlannedChapterLength(project, book, n)),
		);

		// The chapter cards
		const scale = Math.max(plannedChapter ?? 0, ...words);
		const names = ordered.map((c) => c.name);
		const tiers = names.map((n) => model.cardTier(book, n));
		const nextLabel: Record<PlotCardTier, string> = { extended: "Show plot note only", collapsed: "Show bar only", bar: "Show all details" };
		const cards = ordered.map((c, i) => {
			const key = c.name;
			const tier = tiers[i];
			const bar = dataBar({
				title: titles[i],
				words: words[i],
				target: plannedChapter,
				scale,
				tooltip: () => plotCardTooltip(words[i], plots.get(key) ?? ""),
				onHover: () => void readChapterPlot(project, book, key).then((p) => plots.set(key, p)),
			});
			bar.classList.add("sf-bar--link");
			bar.addEventListener("click", () => open(key));
			const chevron = el("button", { class: "sf-card-chevron", text: "▾", attrs: { type: "button", "aria-label": `${titles[i]}: ${nextLabel[tier]}`, "aria-expanded": String(tier !== "bar") }, on: { click: () => model.setCardTiers(book, [key], nextPlotCardTier(tier)) } });
			chevron.dataset.tier = tier;
			const head = el("div", { class: "sf-card-head" }, el("button", { class: "sf-overview-name", text: titles[i], attrs: { type: "button" }, on: { click: () => open(key) } }), chevron);
			const card = el("div", { class: `sf-card sf-card--${tier}`, dataset: { chapter: key, tier } }, head, bar);
			if (tier !== "bar") {
				if (tier === "extended") {
					const entry = getChapterEntry(project, book, key);
					const refRow = (label: string, kind: "pov" | "location", refs: CodexRef[], type: string, fallback: CodexRef[]): HTMLElement => {
						const own = refs.length > 0;
						const shown = own ? refs : fallback;
						return el(
							"div",
							{ class: "sf-card-row sf-ref-row", dataset: { row: kind } },
							el("span", { class: "sf-muted", text: label }),
							el("span", { class: "sf-ref-list" }, ...(shown.length ? refButtons(shown, !own) : [el("span", { class: "sf-muted", text: "None" })]), !own && shown.length ? el("span", { class: "sf-muted", text: "(default)" }) : null),
							readOnly ? null : el("button", { class: "sf-ref-choose", text: "Choose…", attrs: { type: "button", "aria-label": `Choose ${label.toLowerCase()} for ${titles[i]}` }, on: { click: () => choose(`${label} for ${titles[i]}`, type, true, refs, (c) => (kind === "pov" ? writeChapterPov : writeChapterLocation)(project, book, key, c)) } }),
						);
					};
					card.append(
						el(
							"div",
							{ class: "sf-card-rows" },
							refRow("PoV", "pov", entry?.pov ?? [], "person", defaultPov),
							refRow("Location", "location", entry?.location ?? [], "place", []),
							el("div", { class: "sf-card-row" }, el("span", { class: "sf-muted", text: "Length" }), el("span", { text: formatWordCount(words[i]) })),
						),
					);
				}
				const field = textField({
					label: `Plot note for ${titles[i]}`,
					readOnly: !!readOnly,
					read: () => readChapterPlot(project, book, key),
					commit: (expected, next) => commitPlotNote(project, book, key, expected, next),
					recover: (text) => rescuePlotNote(project, book, key, text),
					notify: (n) => model.notices.notify(n),
					written: (stored) => plots.set(key, stored),
				});
				field.element.dataset.plot = key;
				card.append(field.element);
				void readChapterPlot(project, book, key).then((p) => {
					plots.set(key, p);
					field.show(p);
				});
			}
			return card;
		});
		const sizeOf = (t: PlotCardTier): boolean => tiers.length > 0 && tiers.every((x) => x === t);
		const sizeControl = el("div", { class: "sf-size-control", attrs: { role: "radiogroup", "aria-label": "Size of all chapter cards" } }, ...(["bar", "collapsed", "extended"] as const).map((t) => el("button", { class: "sf-size-option", text: t === "bar" ? "Bar" : t === "collapsed" ? "Collapsed" : "Extended", attrs: { type: "button", role: "radio", "aria-checked": String(sizeOf(t)) }, dataset: { size: t }, on: { click: () => model.setCardTiers(book, names, t) } })));
		const unplacedList = unplaced.length
			? [el("h3", { class: "sf-overview-sub", text: "Unplaced" }), el("div", { class: "sf-overview-list", attrs: { role: "list", "aria-label": "Chapters not yet placed" } }, ...unplaced.map((c, i) => el("div", { class: "sf-overview-row sf-overview-row--unplaced", attrs: { role: "listitem" } }, el("button", { class: "sf-overview-name", text: titles[ordered.length + i], attrs: { type: "button" }, on: { click: () => open(c.name) } }))))]
			: [];
		fill(host, el("h2", { class: "sf-overview-title", text: novelTitle() }), el("div", { class: "sf-overview-head" }, el("div", { class: "sf-cover-column" }, coverBox(model, { kind: "book", code: book }, novelTitle()), removeCoverButton(model, { kind: "book", code: book }, novelTitle())), synopsisField(model, book, novelTitle())), povRow, track, strip, meta, sizeControl, el("div", { class: "sf-overview-list sf-cards", attrs: { role: "list", "aria-label": "Placed chapters with word counts" } }, ...cards), ...unplacedList);
	};
	draw();
	const refresh = debounced(() => redrawKeepingFocus(host, draw));
	const off = model.subscribe(["library", "stats", "project", "archive", "nav"], refresh);
	return () => {
		off();
		refresh.cancel();
		host.classList.remove("sf-overview-body");
	};
}
