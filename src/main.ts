import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureAllChapterEntries, getBookChapterFiles, syncAllBookReferenceFields } from "./book";
import { migrateVaultSchema } from "./migration";
import { registerReconciliationEvents, reconcileBookOnLoad } from "./reconciliation";
import { isLibraryChapterPath, bookFolderNameFromChapterPath } from "./paths";
import { sumWordCounts } from "./wordCount";
import { upsertTodayTotal } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { ICON_SERIES, registerCustomIcons } from "./icons";

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();

	async onload(): Promise<void> {
		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));

		this.addRibbonIcon(ICON_SERIES, "Open storyForge", () => void this.activateView());
		this.addCommand({
			id: "open-storyforge-view",
			name: "Open storyForge panel",
			callback: () => void this.activateView(),
		});

		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => void this.initializeVaultState());
	}

	private async initializeVaultState(): Promise<void> {
		await ensureSeriesFile(this.app);
		await migrateVaultSchema(this.app);
		const books = await ensureAllSeriesBookEntries(this.app);
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
			await reconcileBookOnLoad(this.app, folder.name);
		}
	}

	private scheduleRecompute(chapterPath: string): void {
		const bookFolderName = bookFolderNameFromChapterPath(chapterPath);
		if (!bookFolderName) return;
		let debounced = this.recomputeDebouncers.get(chapterPath);
		if (!debounced) {
			debounced = debounce(() => void this.recomputeChapter(bookFolderName, chapterPath), 1500);
			this.recomputeDebouncers.set(chapterPath, debounced);
		}
		debounced();
	}

	private async recomputeChapter(bookFolderName: string, chapterPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(chapterPath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const fingerprint = extractFingerprint(raw);
		await updateChapterFingerprint(this.app, bookFolderName, file.name, fingerprint);

		const chapterFiles = getBookChapterFiles(this.app, bookFolderName);
		const contents = await Promise.all(chapterFiles.map((f) => this.app.vault.read(f)));
		const total = sumWordCounts(contents);
		await upsertTodayTotal(this.app, bookFolderName, total);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: STORYFORGE_VIEW_TYPE, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}
}
