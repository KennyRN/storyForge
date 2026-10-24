import { chapterDisplayTitle, getBookChapters } from "../../../core/book";
import { dayNetsFromStats, defaultHeatmapRange, getBookWordStats, getProjectWordStats, weekNetsFromDayNets, type BookWordStats, type ProjectWordStats } from "../../../core/history";
import { todayISOInEngland } from "../../../core/historyMath";
import { libraryChapterPath } from "../../../core/paths";
import { formatWordCount } from "../../../core/wordCount";
import { el, fill } from "../../kit/dom";
import { openDialog } from "../../kit/dialog";
import type { AppModel } from "../../model";
import { dayHeatmap, dayLabel, heatScale, netLabel, weekHeatmap } from "./heatmap";

/** The word-count history: series total, this novel's summary, day and week heatmaps, and a day's chapters. Read-only. */
export function openHistoryDialog(model: AppModel): void {
	const running = model.running;
	if (!running) return;
	const body = el("div", { class: "sf-history" });
	let selected: string | null = null;
	let generation = 0;
	let focusDate: string | null = null;

	const draw = async (): Promise<void> => {
		const mine = ++generation;
		const project = model.running?.opened.project;
		if (!project) return;
		const book = model.nav.book;
		let all: ProjectWordStats | null = null;
		let stats: BookWordStats | null = null;
		try {
			all = await getProjectWordStats(project);
			if (book) stats = await getBookWordStats(project, book);
		} catch {
			/* unreadable history shows what it can */
		}
		if (mine !== generation) return;
		const active = body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.date : undefined;
		const today = todayISOInEngland();
		const { fromISO, toISO } = defaultHeatmapRange(today);
		const days = stats ? dayNetsFromStats(stats, fromISO, toISO) : [];
		const weeks = weekNetsFromDayNets(days);
		const max = heatScale(days, weeks);
		const stat = (label: string, value: string): HTMLElement => el("div", { class: "sf-history-stat" }, el("span", { class: "sf-muted", text: label }), el("span", { text: value }));
		const parts: (HTMLElement | null)[] = [
			el("h3", { class: "sf-overview-sub", text: "All novels" }),
			el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(all?.current ?? 0)), stat("Written, ever", formatWordCount(all?.lifetimeWritten ?? 0)), stat("Removed, ever", formatWordCount(all?.lifetimeRemoved ?? 0))),
		];
		if (stats && book) {
			parts.push(
				el("h3", { class: "sf-overview-sub", text: "This novel" }),
				el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(stats.current)), stat("Today", netLabel(stats.todayNet)), stat("This week", netLabel(stats.weekNet)), stat("Written, ever", formatWordCount(stats.lifetimeWritten)), stat("Removed, ever", formatWordCount(stats.lifetimeRemoved))),
				el("h3", { class: "sf-overview-sub", text: "Days" }),
				dayHeatmap({ days, maxAbs: max, selected, onSelect: (d) => ((selected = d), (focusDate = d), void draw()) }),
				el("h3", { class: "sf-overview-sub", text: "Weeks" }),
				weekHeatmap(weeks, max),
			);
			if (selected) {
				const entry = stats.daily[selected];
				const rows = Object.entries(entry?.chapters ?? {}).filter(([, n]) => n !== 0);
				const detail = el("div", { class: "sf-history-day", attrs: { "aria-live": "polite" } }, el("h3", { class: "sf-overview-sub", text: dayLabel(selected, entry?.net ?? 0) }));
				if (rows.length === 0) detail.append(el("div", { class: "sf-muted", text: "No chapter changed that day." }));
				const live = new Set(getBookChapters(project, book).ordered.map((c) => c.name));
				for (const [file, n] of rows) {
					const exists = live.has(file) || project.exists(libraryChapterPath(book, file));
					detail.append(el("div", { class: "sf-history-chapter" }, el("span", { class: exists ? "" : "sf-muted", text: exists ? chapterDisplayTitle(project, book, file) : file }), el("span", { text: netLabel(n) })));
				}
				parts.push(detail);
			}
		} else parts.push(el("div", { class: "sf-muted", text: "Select a novel to see its days." }));
		fill(body, ...parts);
		const refocus = focusDate ?? active;
		focusDate = null;
		if (refocus) body.querySelector<HTMLElement>(`[data-date="${refocus}"]`)?.focus();
	};

	const offs = [model.subscribe(["stats", "library", "project"], () => void draw())];
	openDialog({ title: "Word count history", body, buttons: [{ label: "Close", kind: "primary" }], onClose: () => offs.forEach((o) => o()) });
	void draw();
}
