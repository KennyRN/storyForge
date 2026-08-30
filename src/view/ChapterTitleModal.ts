import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { chapterDisplayTitle, getChapterEntry, renameChapterTitle, writeChapterPlotThread } from "../book";
import { getDefaultPlotThread, getSelectablePlotThread, isPlotThreadUsed, MAIN_THREAD_ID, readPlotThreads, type PlotThread } from "../plotThreads";
import { bindTextCommit } from "./SeriesModal";
import { resolvePlotThreadTextColor } from "./novelColor";
import { makeAccessibleActivatable } from "./a11y";

/**
 * Opened by clicking a chapter's title on the storyLibrary panel's Novel-overview page
 * (NovelPanel.ts's renderNovelPlot, `wide` layout) — same shape as NovelTitleModal for the title
 * input and the "#"/"//" hint, minus the dice button: chapters have no titleForge generator of
 * their own to jump to.
 *
 * Below the hint, a full-width row per plot thread (plotThreads.ts). Rows are muted until hovered;
 * the chapter's current thread stays at full colour. Clicking a row assigns that thread
 * (writeChapterPlotThread). New threads are created in PlotThreadRegistryModal (series-pane icon),
 * not here. Unassigned chapters already belong to the default "main thread", which is selected
 * until another thread is picked.
 */
export class ChapterTitleModal extends Modal {
	private selectedId: string | null = null;
	private titleDraft: string | null = null;

	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private bookFolderName: string,
		private filename: string,
		private onChange: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-chapter-title-modal");
		this.selectedId = getChapterEntry(this.app, this.bookFolderName, this.filename)?.plotThreadId
			?? getDefaultPlotThread(this.app)?.id
			?? MAIN_THREAD_ID;
		if (!getSelectablePlotThread(this.app, this.selectedId)) {
			this.selectedId = getDefaultPlotThread(this.app)?.id ?? null;
		}
		this.titleDraft = null;
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private captureTitleDraft(): void {
		const input = this.contentEl.querySelector<HTMLInputElement>(".sf-chapter-title-row input");
		if (input) this.titleDraft = input.value;
	}

	private applySelection(): void {
		this.contentEl.querySelectorAll<HTMLElement>(".sf-plot-thread-row").forEach((el) => {
			const on = el.dataset.threadId === this.selectedId;
			el.toggleClass("is-selected", on);
			el.setAttr("aria-pressed", String(on));
		});
	}

	private render(): void {
		const { contentEl } = this;
		this.captureTitleDraft();
		contentEl.empty();
		contentEl.addClass("sf-chapter-title-modal");

		const header = contentEl.createDiv({ cls: "sf-chapter-title-header" });
		const titleRow = header.createDiv({ cls: "sf-modal-title-row sf-chapter-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Chapter title" },
		});
		input.value = this.titleDraft ?? chapterDisplayTitle(this.app, this.bookFolderName, this.filename);
		bindTextCommit(input, async (value) => {
			await renameChapterTitle(this.app, this.bookFolderName, this.filename, value);
			this.onChange();
		});
		// Enter commits (bindTextCommit's own blur-triggered path, above) and also closes the modal —
		// same added behaviour as NovelTitleModal's own title input.
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") this.close();
		});

		header.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});

		const threads = readPlotThreads(this.app).filter(isPlotThreadUsed);
		const settings = this.plugin.getSettings();

		const list = contentEl.createDiv({ cls: "sf-plot-thread-list" });
		if (threads.length === 0) {
			list.createDiv({
				cls: "sf-empty sf-empty-inline",
				text: "No plot threads yet — add them from the series pane.",
			});
		}
		for (const thread of threads) {
			this.renderThreadRow(list, thread, settings);
		}

		window.setTimeout(() => input.focus(), 0);
	}

	private renderThreadRow(list: HTMLElement, thread: PlotThread, settings: StoryForgePluginSettings): void {
		const text = resolvePlotThreadTextColor(settings, thread);
		const row = list.createDiv({
			cls: "sf-plot-thread-row",
			attr: { "aria-label": thread.label },
		});
		row.dataset.threadId = thread.id;
		row.style.setProperty("--sf-thread-bg", thread.color);
		row.style.setProperty("--sf-thread-fg", text);
		row.createSpan({ cls: "sf-plot-thread-row-label", text: thread.label });
		const pick = () => {
			if (this.selectedId === thread.id) return;
			this.selectedId = thread.id;
			this.applySelection();
			void writeChapterPlotThread(this.app, this.bookFolderName, this.filename, thread.id).then(() =>
				this.onChange(),
			);
		};
		row.addEventListener("click", pick);
		makeAccessibleActivatable(row, pick);
		row.toggleClass("is-selected", thread.id === this.selectedId);
		row.setAttr("aria-pressed", String(thread.id === this.selectedId));
	}
}
