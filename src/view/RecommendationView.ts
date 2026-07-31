import {
	ConfirmationModal,
	ItemView,
	MarkdownView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
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
	CODEX_ROOT,
	isLibraryChapterPath,
	libraryChapterPath,
} from "../paths";
import { getBookId } from "../series";
import { groupHitsByChapter, lensLabel } from "../recommend/continuity";
import {
	markResolved,
	readAttributionStore,
	upsertAttributionDecision,
} from "../recommend/decisions";
import { ensureNlp } from "../recommend/nlp";
import { loadOrRecomputeChapterRecommend, recomputeChapterRecommend } from "../recommend/recompute";
import { scanEntityAcrossChapters } from "../recommend/engine";
import { loadHydratedCodexInventory } from "../recommend/inventory";
import { createCodexStub } from "../recommend/stubs";
import type { CastMember, ChapterRecommendReport, DetailHit, UnknownNameHint } from "../recommend/types";
import { makeAccessibleActivatable } from "./a11y";
import { activateRightRailView } from "./activateRightRailView";
import { CodexStubTypeModal } from "./CodexStubTypeModal";

export const RECOMMEND_VIEW_TYPE = "storyforge-recommend-view";

type RecommendMode = "chapter" | "dossier";

export class RecommendationView extends ItemView {
	private bookFolderName: string | null = null;
	private chapterFilename: string | null = null;
	private mode: RecommendMode = "chapter";
	private report: ChapterRecommendReport | null = null;
	private synopsisDraft = "";
	private closed = false;
	private nlpReady = false;
	private loading = false;

	/** Dossier tab state */
	private dossierQuery = "";
	private dossierEntity: CastMember | null = null;
	private dossierHits: DetailHit[] = [];
	private dossierBuilding = false;
	private castCache: CastMember[] = [];

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
				const codexPrefix = `${CODEX_ROOT}/`;
				if (
					isLibraryChapterPath(file.path) ||
					file.path.startsWith(codexPrefix) ||
					file.path.endsWith("codex.md")
				) {
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

	/** First panel open loads winkNLP; subsequent opens are free. */
	private async ensureEngine(): Promise<void> {
		if (this.nlpReady) return;
		this.loading = true;
		this.render();
		await ensureNlp();
		this.nlpReady = true;
		this.loading = false;
	}

	private async reload(): Promise<void> {
		if (this.closed) return;
		await this.ensureEngine();
		if (this.closed) return;

		if (this.mode === "dossier") {
			await this.refreshCast();
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
		await this.ensureEngine();
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
		if (this.mode === "dossier" && this.dossierEntity) {
			await this.runDossierSearch(this.dossierEntity);
		}
		this.render();
	}

	private async refreshCast(): Promise<void> {
		if (!this.bookFolderName) {
			this.castCache = [];
			return;
		}
		const bookId = getBookId(this.app, this.bookFolderName);
		this.castCache = await loadHydratedCodexInventory(
			this.app,
			bookId,
			this.recommendSettings().codexFactSectionByType,
		);
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
			attr: { role: "tab", tabindex: "0", "aria-selected": String(this.mode === "chapter") },
		});
		const dossierTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.mode === "dossier" ? " is-active" : ""}`,
			text: "Dossier",
			attr: { role: "tab", tabindex: "0", "aria-selected": String(this.mode === "dossier") },
		});
		chapterTab.addEventListener("click", () => {
			this.mode = "chapter";
			void this.reload();
		});
		dossierTab.addEventListener("click", () => {
			this.mode = "dossier";
			void this.reload();
		});
		makeAccessibleActivatable(chapterTab, () => {
			this.mode = "chapter";
			void this.reload();
		});
		makeAccessibleActivatable(dossierTab, () => {
			this.mode = "dossier";
			void this.reload();
		});

		const refreshBtn = header.createSpan({
			cls: "sf-recommend-refresh",
			attr: { "aria-label": "Refresh story context", tabindex: "0", role: "button" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.forceRefresh();
		});
		makeAccessibleActivatable(refreshBtn, () => void this.forceRefresh());

		if (this.loading) {
			el.createDiv({ cls: "sf-empty", text: "Loading language model…" });
			return;
		}

		if (this.mode === "dossier") {
			this.renderDossier(el);
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
		this.renderUnknownList(el, report);
		this.renderMatchList(el, "Other Codex references", others);
		this.renderDetailHits(el, report);
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

	private renderUnknownList(el: HTMLElement, report: ChapterRecommendReport): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Named but not in Codex" });
		const hints: UnknownNameHint[] =
			report.unknownNameHints.length > 0
				? report.unknownNameHints
				: report.unknownNames.map((name) => ({ name }));
		if (hints.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None found." });
			return;
		}
		for (const hint of hints) {
			const row = section.createDiv({ cls: "sf-recommend-row" });
			const label = hint.nerType ? `${hint.name} (${hint.nerType})` : hint.name;
			row.createSpan({ cls: "sf-recommend-row-label", text: label });
			const btn = row.createEl("button", {
				cls: "sf-recommend-stub-btn",
				text: "Create in Codex",
			});
			btn.addEventListener("click", () => void this.createStub(hint.name, hint.nerType));
		}
	}

	private renderDetailHits(el: HTMLElement, report: ChapterRecommendReport): void {
		const open = report.hits.filter((h) => !h.resolved && h.tier !== "ambiguous");
		const holding = report.hits.filter((h) => !h.resolved && h.tier === "ambiguous");
		const done = report.hits.filter((h) => h.resolved);

		this.renderHitSection(el, "Details to capture", open, { showResolve: true });
		this.renderHitSection(el, "Holding area", holding, { showResolve: true, holding: true });
		if (done.length > 0) {
			this.renderHitSection(el, "Resolved", done, { showResolve: false });
		}
	}

	private renderHitSection(
		el: HTMLElement,
		title: string,
		hits: DetailHit[],
		opts: { showResolve: boolean; holding?: boolean },
	): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: title });
		if (hits.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None." });
			return;
		}

		// Group by entity
		const byEntity = new Map<string, DetailHit[]>();
		for (const hit of hits) {
			const key = hit.entityPath ?? hit.entityName;
			let list = byEntity.get(key);
			if (!list) {
				list = [];
				byEntity.set(key, list);
			}
			list.push(hit);
		}

		for (const [, entityHits] of byEntity) {
			const first = entityHits[0];
			const entityHeader = section.createDiv({ cls: "sf-recommend-entity-header" });
			entityHeader.createSpan({
				cls: "sf-recommend-entity-name",
				text: first.entityName,
			});
			if (first.entityPath) {
				entityHeader.addEventListener("click", () => void this.openPath(first.entityPath!));
				makeAccessibleActivatable(entityHeader, () => void this.openPath(first.entityPath!));
			}

			for (const hit of entityHits) {
				this.renderHitCard(section, hit, opts);
			}
		}
	}

	private renderHitCard(
		parent: HTMLElement,
		hit: DetailHit,
		opts: { showResolve: boolean; holding?: boolean },
	): void {
		const card = parent.createDiv({
			cls: `sf-recommend-hit sf-recommend-hit-${hit.tier}${hit.resolved ? " is-resolved" : ""}${hit.negated ? " is-negated" : ""}`,
		});

		const meta = card.createDiv({ cls: "sf-recommend-hit-meta" });
		meta.createSpan({
			cls: `sf-recommend-tier sf-recommend-tier-${hit.tier}`,
			text: hit.tier,
		});
		meta.createSpan({ cls: "sf-recommend-lens", text: lensLabel(hit.lens) });
		if (hit.trait) {
			meta.createSpan({ cls: "sf-recommend-trait", text: hit.trait });
		}
		if (hit.negated) {
			meta.createSpan({ cls: "sf-recommend-negated", text: "negated" });
		}

		const spanEl = card.createDiv({ cls: "sf-recommend-hit-span", text: hit.sentence });
		spanEl.addEventListener("click", () => void this.jumpToHit(hit));
		makeAccessibleActivatable(spanEl, () => void this.jumpToHit(hit));

		if (hit.currentCodexFact) {
			card.createDiv({
				cls: "sf-recommend-codex-fact",
				text: `Codex · ${hit.currentCodexFact.key}: ${hit.currentCodexFact.value}`,
			});
		} else {
			card.createDiv({
				cls: "sf-recommend-codex-fact is-missing",
				text: "Codex · (no matching fact yet)",
			});
		}

		if (opts.holding && hit.competingNames.length > 0) {
			card.createDiv({
				cls: "sf-recommend-competing",
				text: `Could be: ${hit.competingNames.join(", ")}`,
			});
		}

		if (!opts.showResolve || hit.resolved) return;

		const actions = card.createDiv({ cls: "sf-recommend-hit-actions" });

		if (hit.tier === "solid") {
			const doneBtn = actions.createEl("button", { text: "Done" });
			doneBtn.addEventListener("click", () => void this.resolveHit(hit));
			const openBtn = actions.createEl("button", { text: "Open Codex" });
			openBtn.addEventListener("click", () => {
				if (hit.entityPath) void this.openPath(hit.entityPath);
			});
		} else if (hit.tier === "grey") {
			const confirmBtn = actions.createEl("button", { text: "Confirm" });
			confirmBtn.addEventListener("click", () => void this.confirmAndResolve(hit));
			const rejectBtn = actions.createEl("button", { text: "Not this entity" });
			rejectBtn.addEventListener("click", () => void this.rejectHit(hit));
		} else if (hit.tier === "ambiguous") {
			for (const name of hit.competingNames) {
				const btn = actions.createEl("button", { text: name });
				btn.addEventListener("click", () => void this.assignAmbiguous(hit, name));
			}
		}
	}

	private renderDossier(el: HTMLElement): void {
		if (!this.bookFolderName) {
			el.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}

		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Search Codex entity" });
		const input = section.createEl("input", {
			cls: "sf-recommend-dossier-search",
			attr: {
				type: "search",
				placeholder: "Character, place, or other Codex name…",
				value: this.dossierQuery,
			},
		});
		input.value = this.dossierQuery;
		input.addEventListener("input", () => {
			this.dossierQuery = input.value;
			this.renderDossierSuggestions(suggestBox);
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());

		const suggestBox = section.createDiv({ cls: "sf-recommend-dossier-suggest" });
		this.renderDossierSuggestions(suggestBox);

		if (this.dossierBuilding) {
			el.createDiv({ cls: "sf-empty", text: "Scanning book…" });
			return;
		}

		if (!this.dossierEntity) {
			el.createDiv({
				cls: "sf-empty",
				text: "Pick a Codex entity to read everything the book says about them, in chapter order.",
			});
			return;
		}

		const heading = el.createDiv({ cls: "sf-recommend-chapter-title" });
		heading.setText(this.dossierEntity.name);
		if (this.dossierEntity.path) {
			heading.addEventListener("click", () => void this.openPath(this.dossierEntity!.path));
			makeAccessibleActivatable(heading, () => void this.openPath(this.dossierEntity!.path));
		}

		if (this.dossierHits.length === 0) {
			el.createDiv({ cls: "sf-empty", text: "No located details for this entity yet." });
			return;
		}

		const chapters = getBookChapters(this.app, this.bookFolderName);
		const ordered = chapters.ordered.map((f) => ({
			filename: f.name,
			label: numberedChapterTitle(this.app, this.bookFolderName!, f.name),
		}));
		const groups = groupHitsByChapter(ordered, this.dossierHits);

		for (const group of groups) {
			const chSection = el.createDiv({ cls: "sf-recommend-section" });
			const chTitle = chSection.createDiv({
				cls: "sf-recommend-section-title",
				text: group.chapter.label,
			});
			chTitle.addEventListener("click", () => {
				if (!this.bookFolderName) return;
				void this.openChapter(this.bookFolderName, group.chapter.filename);
			});
			makeAccessibleActivatable(chTitle, () => {
				if (!this.bookFolderName) return;
				void this.openChapter(this.bookFolderName, group.chapter.filename);
			});

			for (const hit of group.hits) {
				this.renderHitCard(chSection, { ...hit, resolved: false }, { showResolve: false });
			}
		}
	}

	private renderDossierSuggestions(box: HTMLElement): void {
		box.empty();
		const q = this.dossierQuery.trim().toLowerCase();
		if (!q) return;
		const matches = this.castCache
			.filter(
				(c) =>
					c.name.toLowerCase().includes(q) ||
					c.aliases.some((a) => a.toLowerCase().includes(q)),
			)
			.slice(0, 12);
		for (const m of matches) {
			const row = box.createDiv({ cls: "sf-recommend-row" });
			const iconId = codexTypeIcon(m.type);
			if (iconId) setIcon(row.createSpan({ cls: "sf-icon" }), iconId);
			const label = row.createSpan({ cls: "sf-recommend-row-label", text: m.name });
			label.addEventListener("click", () => void this.selectDossierEntity(m));
			makeAccessibleActivatable(label, () => void this.selectDossierEntity(m));
		}
	}

	private async selectDossierEntity(entity: CastMember): Promise<void> {
		this.dossierEntity = entity;
		this.dossierQuery = entity.name;
		await this.runDossierSearch(entity);
		this.render();
	}

	private async runDossierSearch(entity: CastMember): Promise<void> {
		if (!this.bookFolderName) return;
		this.dossierBuilding = true;
		this.render();
		await this.refreshCast();
		const attribution = await readAttributionStore(this.app, this.bookFolderName);
		const chapters = getBookChapters(this.app, this.bookFolderName);
		const files: Array<{ filename: string; raw: string }> = [];
		for (const f of chapters.ordered) {
			const path = libraryChapterPath(this.bookFolderName, f.name);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				files.push({ filename: f.name, raw: await this.app.vault.cachedRead(file) });
			}
		}
		this.dossierHits = await scanEntityAcrossChapters(
			files,
			entity,
			this.castCache,
			attribution.decisions,
		);
		this.dossierBuilding = false;
	}

	private async resolveHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		hit.resolved = true;
		this.render();
	}

	private async confirmAndResolve(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename || !hit.entityPath) return;
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: hit.entityPath,
			sentence: hit.sentence,
			action: "confirmed",
		});
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		hit.attribution = "confirmed";
		hit.tier = "solid";
		hit.resolved = true;
		this.render();
	}

	private async rejectHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !hit.entityPath) return;
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: hit.entityPath,
			sentence: hit.sentence,
			action: "rejected",
		});
		await this.forceRefresh();
	}

	private async assignAmbiguous(hit: DetailHit, chosenName: string): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const chosen = (this.report?.matched.find((m) => m.name === chosenName) ?? null);
		const cast = await loadHydratedCodexInventory(
			this.app,
			getBookId(this.app, this.bookFolderName),
			this.recommendSettings().codexFactSectionByType,
		);
		const entry = cast.find((c) => c.name === chosenName) ?? null;
		const path = chosen?.path ?? entry?.path;
		if (!path) return;

		// Confirm for chosen; reject prior guess if different
		if (hit.entityPath && hit.entityPath !== path) {
			await upsertAttributionDecision(this.app, this.bookFolderName, {
				entityPath: hit.entityPath,
				sentence: hit.sentence,
				action: "rejected",
				reroutePath: path,
			});
		}
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: path,
			sentence: hit.sentence,
			action: "confirmed",
		});
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		await this.forceRefresh();
	}

	/**
	 * Transient reveal: scroll to and flash-select the source line(s).
	 * Not an editor decoration — respects "nothing shown in the editor window."
	 */
	private async jumpToHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName) return;
		const path = libraryChapterPath(this.bookFolderName, hit.chapterFilename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const editor = view.editor;
		const line = Math.max(0, hit.line - 1);
		const lineText = editor.getLine(line) ?? "";
		editor.setSelection({ line, ch: 0 }, { line, ch: lineText.length });
		editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: lineText.length } }, true);
		window.setTimeout(() => {
			const cursor = editor.getCursor();
			editor.setSelection(cursor, cursor);
		}, 1200);
	}

	private async sendSynopsis(): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const draft = this.synopsisDraft;
		const existing = await readChapterPlot(this.app, bookFolderName, chapterFilename);
		if (existing.trim() && existing.trim() !== draft.trim()) {
			const modal = new ConfirmationModal(this.app);
			modal.setTitle("Replace chapter plot?");
			modal.contentEl.createEl("p", {
				text: "Replace the existing chapter plot notes with this synopsis?",
			});
			modal.addButton((btn) =>
				btn
					.setButtonText("Replace")
					.setCta()
					.onClick(async () => {
						await writeChapterPlot(this.app, bookFolderName, chapterFilename, draft);
						new Notice("storyForge: synopsis sent to chapter plot");
					}),
			);
			modal.addCancelButton();
			modal.open();
			return;
		}
		await writeChapterPlot(this.app, bookFolderName, chapterFilename, draft);
		new Notice("storyForge: synopsis sent to chapter plot");
	}

	private async createStub(name: string, nerType?: string): Promise<void> {
		new CodexStubTypeModal(this.app, (type) => {
			if (!type) return;
			void this.finishStub(name, type);
		}, nerTypeHintToCodexType(nerType)).open();
	}

	private async finishStub(name: string, type: string): Promise<void> {
		const heading = this.plugin.getSettings().codexFactSectionByType[type] ?? "Facts";
		const bookId = this.bookFolderName ? getBookId(this.app, this.bookFolderName) : null;
		try {
			const file = await createCodexStub(this.app, {
				name,
				type,
				factsHeading: heading,
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

/** Opportunistic NER → Codex type pre-fill; never required. */
function nerTypeHintToCodexType(nerType?: string): string | undefined {
	if (!nerType) return undefined;
	const t = nerType.toUpperCase();
	if (t.includes("PERSON") || t === "PER") return "person";
	if (t.includes("LOC") || t.includes("GPE") || t.includes("PLACE")) return "place";
	return undefined;
}

export async function activateRecommendView(plugin: StoryForgePlugin): Promise<void> {
	await activateRightRailView(plugin, RECOMMEND_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof RecommendationView) view.syncFromPluginSelection();
	});
}
