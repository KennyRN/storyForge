import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	getBookChapters,
	numberedChapterTitle,
	readChapterPlot,
	writeChapterPlot,
} from "../book";
import { CODEX_TYPES, codexTypeIcon } from "../codex";
import { debounce } from "../debounce";
import { ICON_TIMELINE } from "../icons";
import {
	bookFolderNameFromChapterPath,
	isLibraryChapterPath,
	libraryChapterPath,
} from "../paths";
import { getBookId } from "../series";
import { buildContinuityTimelines, formatContinuityLine } from "../recommend/continuity";
import { acknowledgeCodexFactChange, updateCodexFact } from "../recommend/factWrites";
import { readRecommendCache } from "../recommend/cache";
import { loadOrRecomputeChapterRecommend, recomputeChapterRecommend } from "../recommend/recompute";
import { createCodexStub } from "../recommend/stubs";
import type { ChapterRecommendReport, ContinuityTimeline, FactCheckRow } from "../recommend/types";
import { makeAccessibleActivatable } from "./a11y";
import { CodexStubTypeModal } from "./CodexStubTypeModal";

export const RECOMMEND_VIEW_TYPE = "storyforge-recommend-view";

type RecommendMode = "chapter" | "continuity";

export class RecommendationView extends ItemView {
	private bookFolderName: string | null = null;
	private chapterFilename: string | null = null;
	private mode: RecommendMode = "chapter";
	private report: ChapterRecommendReport | null = null;
	private continuity: ContinuityTimeline[] = [];
	private continuityBuilding = false;
	private synopsisDraft = "";
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return RECOMMEND_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Story Context";
	}

	getIcon(): string {
		return ICON_TIMELINE;
	}

	private readonly debouncedReload = debounce(() => void this.reload(), 500);

	async onOpen(): Promise<void> {
		this.contentEl.addClass("sf-recommend-view");
		this.contentEl.addClass("sf-context-view");
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isLibraryChapterPath(file.path) || file.path.startsWith("Codex/") || file.path.endsWith("codex.md")) {
					this.debouncedReload();
				}
			}),
		);
		this.syncFromPluginSelection();
		this.followActiveFile();
		await this.reload();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedReload.cancel();
	}

	/** Called when opened from Codex — seed from storyForge selection. */
	syncFromPluginSelection(): void {
		const settings = this.plugin.getSettings();
		if (settings.selectedNovel) this.bookFolderName = settings.selectedNovel;
		if (settings.selectedObject) this.chapterFilename = settings.selectedObject;
	}

	private followActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const book = bookFolderNameFromChapterPath(file.path);
		if (book) {
			this.bookFolderName = book;
			this.chapterFilename = file.name;
			void this.reload();
		}
	}

	private recommendSettings() {
		const s = this.plugin.getSettings();
		return {
			codexFactSectionByType: s.codexFactSectionByType,
			recommendIncludeUnknownNames: s.recommendIncludeUnknownNames,
		};
	}

	private async reload(): Promise<void> {
		if (this.closed) return;
		if (this.mode === "continuity") {
			await this.loadContinuity();
			this.render();
			return;
		}
		if (!this.bookFolderName || !this.chapterFilename) {
			this.report = null;
			this.render();
			return;
		}
		const bookId = getBookId(this.app, this.bookFolderName);
		this.report = await loadOrRecomputeChapterRecommend(
			this.app,
			this.bookFolderName,
			this.chapterFilename,
			bookId,
			this.recommendSettings(),
		);
		if (this.report) this.synopsisDraft = this.report.synopsisHeuristic;
		this.render();
	}

	private async forceRefresh(): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookId = getBookId(this.app, this.bookFolderName);
		this.report = await recomputeChapterRecommend(
			this.app,
			this.bookFolderName,
			this.chapterFilename,
			bookId,
			this.recommendSettings(),
		);
		if (this.report) this.synopsisDraft = this.report.synopsisHeuristic;
		if (this.mode === "continuity") await this.loadContinuity();
		this.render();
	}

	private async loadContinuity(): Promise<void> {
		if (!this.bookFolderName) {
			this.continuity = [];
			return;
		}
		this.continuityBuilding = true;
		this.render();
		const bookId = getBookId(this.app, this.bookFolderName);
		const chapters = getBookChapters(this.app, this.bookFolderName);
		const ordered = chapters.ordered.map((f) => ({
			filename: f.name,
			label: numberedChapterTitle(this.app, this.bookFolderName!, f.name),
		}));
		const reports = new Map<string, ChapterRecommendReport>();
		for (const ch of ordered) {
			let cached = await readRecommendCache(this.app, this.bookFolderName, ch.filename);
			if (!cached) {
				cached = await recomputeChapterRecommend(
					this.app,
					this.bookFolderName,
					ch.filename,
					bookId,
					this.recommendSettings(),
				);
			}
			if (cached) reports.set(ch.filename, cached);
		}
		this.continuity = buildContinuityTimelines(ordered, reports);
		this.continuityBuilding = false;
	}

	private render(): void {
		if (this.closed) return;
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-recommend-view");
		el.addClass("sf-context-view");

		const header = el.createDiv({ cls: "sf-recommend-header" });
		setIcon(header.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
		header.createSpan({ cls: "sf-recommend-title", text: "Story Context" });

		const tabs = header.createDiv({ cls: "sf-recommend-tabs" });
		const chapterTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.mode === "chapter" ? " is-active" : ""}`,
			text: "Chapter",
		});
		const continuityTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.mode === "continuity" ? " is-active" : ""}`,
			text: "Continuity",
		});
		chapterTab.addEventListener("click", () => {
			this.mode = "chapter";
			void this.reload();
		});
		continuityTab.addEventListener("click", () => {
			this.mode = "continuity";
			void this.reload();
		});

		const refreshBtn = header.createSpan({
			cls: "sf-recommend-refresh",
			attr: { "aria-label": "Refresh story context" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.forceRefresh();
		});
		makeAccessibleActivatable(refreshBtn, () => void this.forceRefresh());

		if (this.mode === "continuity") {
			this.renderContinuity(el);
			return;
		}
		this.renderChapter(el);
	}

	private renderChapter(el: HTMLElement): void {
		if (!this.bookFolderName || !this.chapterFilename) {
			el.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}
		if (!this.report) {
			el.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
			return;
		}

		const title = numberedChapterTitle(this.app, this.bookFolderName, this.chapterFilename);
		el.createDiv({ cls: "sf-recommend-chapter-title", text: title });

		// Synopsis
		const synSection = el.createDiv({ cls: "sf-recommend-section" });
		synSection.createDiv({ cls: "sf-recommend-section-title", text: "Synopsis" });
		const textarea = synSection.createEl("textarea", { cls: "sf-recommend-synopsis" });
		textarea.value = this.synopsisDraft;
		textarea.addEventListener("input", () => {
			this.synopsisDraft = textarea.value;
		});
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

		const sendBtn = synSection.createEl("button", {
			cls: "sf-recommend-send-btn",
			text: "Send to chapter plot",
		});
		sendBtn.addEventListener("click", () => void this.sendSynopsis());

		const report = this.report;
		const persons = report.matched.filter((m) => m.type === "person");
		const others = report.matched.filter((m) => m.type !== "person");

		this.renderMatchList(el, "Characters in chapter", persons);
		this.renderUnknownList(el, report.unknownNames);
		this.renderMatchList(el, "Other Codex references", others);
		this.renderDescriptions(el, report);
		this.renderFactWarnings(el, report.factChecks);
	}

	private renderMatchList(
		el: HTMLElement,
		title: string,
		items: ChapterRecommendReport["matched"],
	): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: title });
		if (items.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None found." });
			return;
		}
		for (const item of items) {
			const row = section.createDiv({ cls: "sf-recommend-row" });
			const iconId = codexTypeIcon(item.type);
			if (iconId) setIcon(row.createSpan({ cls: "sf-icon" }), iconId);
			const label = row.createSpan({
				cls: "sf-recommend-row-label",
				text: item.ambiguousWith.length > 0 ? `${item.name} ?` : item.name,
			});
			if (item.ambiguousWith.length > 0) {
				row.createSpan({
					cls: "sf-recommend-ambiguous",
					text: `also ${item.ambiguousWith.join(", ")}`,
				});
			}
			label.addEventListener("click", () => void this.openPath(item.path));
			makeAccessibleActivatable(label, () => void this.openPath(item.path));
		}
	}

	private renderUnknownList(el: HTMLElement, names: string[]): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Named but not in Codex" });
		if (names.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None found." });
			return;
		}
		for (const name of names) {
			const row = section.createDiv({ cls: "sf-recommend-row" });
			row.createSpan({ cls: "sf-recommend-row-label", text: name });
			const btn = row.createEl("button", {
				cls: "sf-recommend-stub-btn",
				text: "Create in Codex",
			});
			btn.addEventListener("click", () => void this.createStub(name));
		}
	}

	private renderDescriptions(el: HTMLElement, report: ChapterRecommendReport): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Descriptions" });
		if (report.descriptions.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None found." });
			return;
		}
		for (const desc of report.descriptions) {
			const row = section.createDiv({ cls: "sf-recommend-desc" });
			const nameText = desc.ambiguous ? `${desc.names.join(" / ")} ?` : desc.names.join(", ");
			row.createDiv({ cls: "sf-recommend-desc-names", text: nameText });
			row.createDiv({ cls: "sf-recommend-desc-text", text: desc.text });
			if (desc.path) {
				row.addEventListener("click", () => void this.openPath(desc.path!));
			}
		}
	}

	private renderFactWarnings(el: HTMLElement, rows: FactCheckRow[]): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Fact warnings" });
		const interesting = rows.filter((r) => r.status === "conflict" || r.status === "unknown" || r.status === "acknowledged");
		if (interesting.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "No warnings." });
			return;
		}
		for (const row of interesting) {
			const line = section.createDiv({
				cls: `sf-recommend-fact sf-recommend-fact-${row.status}`,
			});
			const summary =
				row.status === "conflict"
					? `${row.name} · ${row.displayKey}: Codex “${row.codexValue}” vs chapter “${row.chapterValue}”`
					: row.status === "acknowledged"
						? `${row.name} · ${row.displayKey}: “${row.chapterValue}” (acknowledged)`
						: `${row.name} · ${row.displayKey}: chapter “${row.chapterValue}” (not in Codex)`;
			line.createDiv({ cls: "sf-recommend-fact-text", text: summary });
			if (row.status === "conflict") {
				const actions = line.createDiv({ cls: "sf-recommend-fact-actions" });
				const updateBtn = actions.createEl("button", { text: "Update Codex" });
				updateBtn.addEventListener("click", () => void this.handleUpdateFact(row));
				const ackBtn = actions.createEl("button", { text: "Acknowledge change" });
				ackBtn.addEventListener("click", () => void this.handleAcknowledgeFact(row));
			} else if (row.status === "unknown") {
				const actions = line.createDiv({ cls: "sf-recommend-fact-actions" });
				const addBtn = actions.createEl("button", { text: "Add to Codex" });
				addBtn.addEventListener("click", () => void this.handleUpdateFact(row));
			}
		}
	}

	private renderContinuity(el: HTMLElement): void {
		if (!this.bookFolderName) {
			el.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}
		if (this.continuityBuilding) {
			el.createDiv({ cls: "sf-empty", text: "Building…" });
			return;
		}
		if (this.continuity.length === 0) {
			el.createDiv({ cls: "sf-empty", text: "No continuity signals yet." });
			return;
		}
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Book continuity" });
		for (const timeline of this.continuity) {
			const row = section.createDiv({
				cls: `sf-recommend-continuity${timeline.hasConflict ? " has-conflict" : ""}`,
			});
			row.createDiv({ cls: "sf-recommend-continuity-line", text: formatContinuityLine(timeline) });
			const steps = row.createDiv({ cls: "sf-recommend-continuity-steps" });
			for (const step of timeline.steps) {
				const chip = steps.createSpan({
					cls: `sf-recommend-step sf-recommend-step-${step.status}`,
					text: step.chapterLabel,
				});
				chip.addEventListener("click", () => {
					if (!this.bookFolderName) return;
					void this.openChapter(this.bookFolderName, step.chapterFilename);
				});
			}
		}
	}

	private async sendSynopsis(): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const existing = await readChapterPlot(this.app, this.bookFolderName, this.chapterFilename);
		if (existing.trim() && existing.trim() !== this.synopsisDraft.trim()) {
			const ok = window.confirm("Replace the existing chapter plot notes with this synopsis?");
			if (!ok) return;
		}
		await writeChapterPlot(this.app, this.bookFolderName, this.chapterFilename, this.synopsisDraft);
		new Notice("storyForge: synopsis sent to chapter plot");
	}

	private factHeadingForPath(path: string): string {
		const types = this.plugin.getSettings().codexFactSectionByType;
		// Resolve type from matched report or default
		const matched = this.report?.matched.find((m) => m.path === path);
		const type = matched?.type ?? "person";
		return types[type] ?? "Facts";
	}

	private async handleUpdateFact(row: FactCheckRow): Promise<void> {
		await updateCodexFact(this.app, row.path, this.factHeadingForPath(row.path), row.key, row.chapterValue);
		new Notice("storyForge: Codex fact updated");
		await this.forceRefresh();
	}

	private async handleAcknowledgeFact(row: FactCheckRow): Promise<void> {
		await acknowledgeCodexFactChange(
			this.app,
			row.path,
			this.factHeadingForPath(row.path),
			row.key,
			row.chapterValue,
		);
		new Notice("storyForge: fact change acknowledged");
		await this.forceRefresh();
	}

	private async createStub(name: string): Promise<void> {
		new CodexStubTypeModal(this.app, (type) => {
			if (!type) return;
			void this.finishStub(name, type);
		}).open();
	}

	private async finishStub(name: string, type: string): Promise<void> {
		const heading = this.plugin.getSettings().codexFactSectionByType[type] ?? "Facts";
		const seeds =
			this.report?.descriptions
				.filter((d) => d.names.some((n) => n.toLowerCase() === name.toLowerCase()) || d.text.includes(name))
				.flatMap((d) => d.attributes) ?? [];
		const bookId = this.bookFolderName ? getBookId(this.app, this.bookFolderName) : null;
		try {
			const file = await createCodexStub(this.app, {
				name,
				type,
				factsHeading: heading,
				factSeeds: seeds,
				bookId,
			});
			await this.app.workspace.getLeaf(false).openFile(file);
			new Notice(`storyForge: created Codex ${CODEX_TYPES.find((t) => t.type === type)?.label ?? type}`);
			await this.forceRefresh();
		} catch (err) {
			new Notice(`storyForge: could not create Codex note — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async openPath(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.chapterFilename = filename;
			this.bookFolderName = bookFolderName;
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}

export async function activateRecommendView(plugin: StoryForgePlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)[0] ?? null;
	if (!leaf) {
		leaf = workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: RECOMMEND_VIEW_TYPE, active: true });
	}
	if (leaf) {
		const split = workspace.rightSplit;
		if (typeof split.expand === "function") split.expand();
		const view = leaf.view;
		if (view instanceof RecommendationView) view.syncFromPluginSelection();
		await workspace.revealLeaf(leaf);
	}
}
