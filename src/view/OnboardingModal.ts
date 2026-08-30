import { App, DropdownComponent, Modal, Notice, Setting, TFile, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { createBook, createChapter, getBookChapters, renameBookTitle, writeBookChapterOrder } from "../book";
import { getSeriesBooks, writeSeriesTitle } from "../series";
import { libraryChapterPath } from "../paths";
import { ensureWelcomeNote } from "../welcomeNote";
import { ICON_CHECK_SQUARE, ICON_DICE } from "../icons";
import {
	applyOnboardingConfig,
	listOnboardingConfigFiles,
	ONBOARDING_CONFIG_KIND_LABELS,
	onboardingConfigOptionLabel,
	type OnboardingConfigFile,
} from "../onboardingConfig";
import { makeAccessibleActivatable } from "./a11y";
import type { TitleForgeScope } from "../titleforge/settings";

/**
 * First-run onboarding. Create project writes the series/novel names, optional welcome
 * note, and any chosen config file.
 */
export class OnboardingModal extends Modal {
	private seriesName = "";
	private novelName = "";
	private standalone = false;
	private createWelcomeNote = false;
	private files: OnboardingConfigFile[] = [];
	private seriesHintEl: HTMLElement | null = null;
	private seriesNamedRow: HTMLElement | null = null;
	private seriesTitleForgeEl: HTMLElement | null = null;
	private selectedPath = "";
	private closed = false;
	private creating = false;

	constructor(
		app: App,
		private readonly plugin: StoryForgePlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-onboarding-modal");
		this.titleEl.remove();
		this.render();
		void this.loadConfigFiles();
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
	}

	private async loadConfigFiles(): Promise<void> {
		try {
			this.files = await listOnboardingConfigFiles(this.app);
		} catch {
			this.files = [];
		}
		if (!this.closed) this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-onboarding-modal");

		const fields = contentEl.createDiv({ cls: "sf-onboarding-fields" });
		const namesBox = fields.createDiv({ cls: "sf-types-tags-box sf-onboarding-box" });
		this.renderNamedField(
			namesBox,
			"series",
			"series name",
			this.seriesName,
			(value) => {
				this.seriesName = value;
			},
			{
				icon: ICON_DICE,
				scope: "series",
				tooltip: "generate a series name",
				inBoxHint: "can toggle on within storyforge settings",
			},
		);
		this.renderNamedField(
			namesBox,
			"novel",
			"novel name",
			this.novelName,
			(value) => {
				this.novelName = value;
			},
			{ icon: ICON_DICE, scope: "novels", tooltip: "generate a novel title" },
		);
		this.syncStandaloneSeriesVisibility();
		this.renderToggleRow(fields.createDiv({ cls: "sf-types-tags-box sf-onboarding-box" }));
		this.renderFromFiles(fields.createDiv({ cls: "sf-types-tags-box sf-onboarding-box" }));

		const actions = contentEl.createDiv({ cls: "sf-onboarding-actions" });
		const create = actions.createEl("button", {
			cls: "mod-cta",
			text: "create project with these settings",
			attr: { type: "button" },
		});
		create.addEventListener("click", () => void this.createProject());
	}

	private renderNamedField(
		parent: HTMLElement,
		label: string,
		placeholder: string,
		value: string,
		onChange: (value: string) => void,
		titleForge: {
			icon: string;
			scope: TitleForgeScope;
			tooltip: string;
			inBoxHint?: string;
		},
	): HTMLElement {
		const field = parent.createDiv({ cls: "sf-onboarding-field" });
		const row = field.createDiv({ cls: "sf-onboarding-named-row" });
		const wrap = row.createDiv({ cls: "sf-onboarding-input-wrap" });
		const input = wrap.createEl("input", {
			cls: "sf-modal-input",
			type: "text",
			attr: { placeholder },
		});
		input.value = value;
		input.addEventListener("input", () => onChange(input.value));
		if (titleForge.inBoxHint) {
			this.seriesNamedRow = row;
			this.seriesHintEl = wrap.createDiv({
				cls: "sf-onboarding-field-label sf-onboarding-series-inbox",
				text: titleForge.inBoxHint,
			});
		}
		const titleForgeEl = this.renderTitleForgeIcon(
			row,
			titleForge.icon,
			titleForge.scope,
			titleForge.tooltip,
			(title) => {
				onChange(title);
				input.value = title;
			},
		);
		if (titleForge.inBoxHint) this.seriesTitleForgeEl = titleForgeEl;
		field.createEl("div", { cls: "sf-onboarding-field-label", text: label });
		return field;
	}

	private renderTitleForgeIcon(
		parent: HTMLElement,
		icon: string,
		scope: TitleForgeScope,
		tooltip: string,
		onUse: (title: string) => void,
	): HTMLElement {
		const iconEl = parent.createSpan({
			cls: "sf-titleforge-dice sf-titleforge-dice--inline",
			attr: { "aria-label": tooltip },
		});
		setIcon(iconEl, icon);
		setTooltip(iconEl, tooltip);
		const openTitleForge = () => {
			if (iconEl.hasClass("is-muted")) return;
			this.plugin.titleForge.openModal({ scope, onUse });
		};
		iconEl.addEventListener("click", openTitleForge);
		makeAccessibleActivatable(iconEl, openTitleForge);
		return iconEl;
	}

	private syncStandaloneSeriesVisibility(): void {
		this.seriesNamedRow?.toggleClass("is-standalone-hint", this.standalone);
		this.seriesHintEl?.toggleClass("sf-settings-hidden", !this.standalone);
		this.seriesTitleForgeEl?.toggleClass("is-muted", this.standalone);
		this.seriesTitleForgeEl?.toggleAttribute("aria-disabled", this.standalone);
		const input = this.seriesNamedRow?.querySelector("input");
		if (input instanceof HTMLInputElement) input.disabled = this.standalone;
	}

	private renderToggleRow(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: "sf-onboarding-toggle-row" });
		new Setting(row).setName("standalone novel").addToggle((toggle) =>
			toggle.setValue(this.standalone).onChange((value) => {
				this.standalone = value;
				this.syncStandaloneSeriesVisibility();
			}),
		);
		new Setting(row).setName("create welcome note").addToggle((toggle) =>
			toggle.setValue(this.createWelcomeNote).onChange((value) => {
				this.createWelcomeNote = value;
			}),
		);
	}

	private renderFromFiles(parent: HTMLElement): void {
		const field = parent.createDiv({ cls: "sf-onboarding-field" });
		const control = field.createDiv({ cls: "sf-onboarding-from-files-control" });
		const previewBox = field.createDiv({ cls: "sf-onboarding-config-preview" });
		new Setting(control).addDropdown((dropdown) => this.bindFileDropdown(dropdown, previewBox));
		if (this.files.length > 0) {
			this.renderHoverIcon(control, ICON_CHECK_SQUARE, "use this file", () => void this.applySelected());
		}
		this.renderConfigPreview(previewBox);
	}

	private bindFileDropdown(dropdown: DropdownComponent, previewBox: HTMLElement): void {
		if (this.files.length === 0) {
			dropdown.addOption("", "no template or config files in the vault root or _export/");
			dropdown.setDisabled(true);
			return;
		}
		dropdown.addOption("", "choose a file…");
		for (const file of this.files) {
			dropdown.addOption(file.path, onboardingConfigOptionLabel(file));
		}
		dropdown.setValue(this.selectedPath);
		dropdown.onChange((value) => {
			this.selectedPath = value;
			this.renderConfigPreview(previewBox);
		});
	}

	private selectedFile(): OnboardingConfigFile | undefined {
		return this.files.find((file) => file.path === this.selectedPath);
	}

	private renderConfigPreview(parent: HTMLElement): void {
		parent.empty();
		const file = this.selectedFile();
		if (!file) return;
		const parts = [ONBOARDING_CONFIG_KIND_LABELS[file.kind]];
		if (file.description) parts.push(file.description);
		parent.createDiv({
			cls: "sf-onboarding-config-summary",
			text: parts.join(" · "),
		});
	}

	private async applySelected(): Promise<boolean> {
		const file = this.selectedFile();
		if (!file) {
			new Notice("storyForge: choose a template or config file");
			return false;
		}
		try {
			const kind = await applyOnboardingConfig(this.plugin, file.path);
			new Notice(`storyForge: ${ONBOARDING_CONFIG_KIND_LABELS[kind]} applied`);
			return true;
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not apply ${ONBOARDING_CONFIG_KIND_LABELS[file.kind]} — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return false;
		}
	}

	private async createProject(): Promise<void> {
		if (this.creating) return;
		this.creating = true;
		try {
			const series = this.seriesName.trim();
			const novel = this.novelName.trim();
			if (this.selectedFile() && !(await this.applySelected())) return;
			if (!this.standalone && series) await writeSeriesTitle(this.app, series);
			await this.plugin.updateSetting("hideSeriesPane", this.standalone);
			if (novel) await this.applyNovelName(novel);
			const chapter = await this.ensureFirstChapter();
			let landing: TFile | null = null;
			if (this.createWelcomeNote) {
				landing = await ensureWelcomeNote(this.app);
			} else if (chapter) {
				const file = this.app.vault.getAbstractFileByPath(
					libraryChapterPath(chapter.folderName, chapter.filename),
				);
				if (file instanceof TFile) landing = file;
			}
			this.close();
			if (chapter) {
				await this.plugin.updateSetting("selectedNovel", chapter.folderName);
				await this.plugin.updateSetting("selectedObject", this.createWelcomeNote ? null : chapter.filename);
				if (!this.createWelcomeNote) {
					this.plugin.focusStoryLibraryOnChapter(chapter.folderName, chapter.filename);
				}
			}
			if (landing) await this.openMainFile(landing);
			this.plugin.refreshStoryForgeViews();
			new Notice("storyForge: project created");
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not create project — ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			this.creating = false;
		}
	}

	/** Names the first novel when the vault only has the first-run seed; otherwise creates one. */
	private async applyNovelName(title: string): Promise<void> {
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const existing = [...ordered, ...unplaced];
		if (existing.length === 1) {
			await renameBookTitle(this.app, existing[0].name, title);
			return;
		}
		await createBook(this.app, title);
	}

	/** Chapter 1 of novel 1 (first placed novel, else first unplaced). Creates and places both if missing. */
	private async ensureFirstChapter(): Promise<{ folderName: string; filename: string }> {
		const { ordered, unplaced } = getSeriesBooks(this.app);
		let folderName = ordered[0]?.name ?? unplaced[0]?.name ?? null;
		if (!folderName) folderName = (await createBook(this.app)).folderName;
		const chapters = getBookChapters(this.app, folderName);
		let filename = chapters.ordered[0]?.name ?? null;
		if (!filename) {
			const created = await createChapter(this.app, folderName, { openFile: false });
			filename = created.filename;
			await writeBookChapterOrder(this.app, folderName, [filename]);
		}
		return { folderName, filename };
	}

	private async openMainFile(file: TFile): Promise<void> {
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.openFile(file, { active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private renderHoverIcon(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const iconEl = parent.createSpan({
			cls: "sf-types-tags-hover-icon",
			attr: { role: "button", "aria-label": label },
		});
		setIcon(iconEl, icon);
		iconEl.addEventListener("click", onClick);
		makeAccessibleActivatable(iconEl, onClick);
	}
}
