import { App, DropdownComponent, Modal, Notice, Setting, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	listSettingsExportsInBackups,
	readSettingsExportFromBackups,
	writePlotThreadsExportToBackups,
} from "../backup";
import {
	ICON_ARCHIVE_FILLED,
	ICON_CHECK_SQUARE,
	ICON_CLOSE_SQUARE_DUOTONE,
	ICON_COPY_DUOTONE,
	ICON_DOWNLOAD_DUOTONE,
	ICON_EDIT_PEN,
	ICON_FLOPPY_DUOTONE,
	ICON_MULTIPLY_SQUARE,
	ICON_SHARE_SQUARE_DUOTONE,
} from "../icons";
import {
	archiveNamedSettings,
	listNamedSettings,
	readNamedSettings,
	renameNamedSettings,
	saveNamedSettings,
	SettingsPresetExistsError,
} from "../settingsPresets";
import {
	applyPlotThreadsDocument,
	buildPlotThreadsExport,
	hasPlotThreadsSelection,
	isFullPlotThreadsImport,
	isPlotThreadsListPopulated,
	parsePlotThreadsExport,
	stringifyPlotThreadsExport,
	type PlotThreadsApplyMode,
	type PlotThreadsExportDocument,
	type PlotThreadsExportSelection,
} from "../plotThreadsExport";
import { readPlotThreads, type PlotThread } from "../plotThreads";
import { bookDisplayTitle, readSeriesFrontmatter } from "../series";
import {
	exportFilenameStem,
	formatDatedExportStem,
	listUserExportFiles,
	readUserExportFile,
	resolveExportItemName,
	userExportPath,
} from "../userExport";
import { EXPORT_ROOT } from "../paths";
import { enqueueBackstageWrite, writeExportText } from "../writeGuard";
import { makeAccessibleActivatable } from "./a11y";
import { confirmAction, promptReplaceOrAdd } from "./protectionsController";
import { renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";
import { resolvePlotThreadTextColor } from "./novelColor";

type ImportSource = {
	kind: "named" | "backup" | "paste";
	path: string;
	name: string;
};

type ThreadsEdit = { name: string; description: string };

function renderHoverIcon(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
	const iconEl = parent.createSpan({
		cls: "sf-types-tags-hover-icon",
		attr: { role: "button", "aria-label": label },
	});
	setIcon(iconEl, icon);
	iconEl.addEventListener("click", onClick);
	makeAccessibleActivatable(iconEl, onClick);
}

export function renderThreadsPreview(
	parent: HTMLElement,
	threads: PlotThread[],
	textColorFor: (thread: PlotThread) => string,
): void {
	const pane = parent.createDiv({ cls: "sf-threads-preview-pane" });
	if (threads.length === 0) {
		pane.createDiv({ cls: "sf-types-tags-preview-empty", text: "none" });
		return;
	}
	for (const thread of threads) {
		const chip = pane.createDiv({ cls: "sf-threads-preview-chip", text: thread.label });
		chip.setCssStyles({
			backgroundColor: thread.color,
			color: textColorFor(thread),
		});
	}
}

class EditThreadsModal extends Modal {
	private settled = false;
	private name: string;
	private description: string;

	constructor(
		app: App,
		initialName: string,
		initialDescription: string,
		private readonly resolve: (value: ThreadsEdit | null) => void,
	) {
		super(app);
		this.name = initialName;
		this.description = initialDescription;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-edit-types-tags-modal");
		this.titleEl.setText("edit threads");
		this.contentEl.addClass("sf-types-tags-edit-body");

		const fieldsBox = this.contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-fields" });
		new Setting(fieldsBox).setName("name").addText((text) =>
			text.setValue(this.name).onChange((value) => {
				this.name = value;
			}),
		);
		new Setting(fieldsBox).setName("description").addText((text) =>
			text.setValue(this.description).onChange((value) => {
				this.description = value;
			}),
		);

		const actionBox = this.contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(actionBox, ICON_EDIT_PEN, "save threads", () =>
			this.finish({ name: this.name, description: this.description }),
		);
		renderHoverIcon(actionBox, ICON_MULTIPLY_SQUARE, "cancel", () => this.finish(null));
	}

	onClose(): void {
		if (!this.settled) this.resolve(null);
	}

	private finish(value: ThreadsEdit | null): void {
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

class ExportNameModal extends Modal {
	private settled = false;
	private name: string;

	constructor(
		app: App,
		initialName: string,
		private readonly resolve: (value: string | null) => void,
	) {
		super(app);
		this.name = initialName;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-types-tags-export-name-modal");
		this.titleEl.remove();
		this.contentEl.addClass("sf-types-tags-edit-body");

		const fieldsBox = this.contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-export-filename-box" });
		new Setting(fieldsBox)
			.setName("filename")
			.setDesc(".json is added automatically")
			.addText((text) =>
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				}),
			);

		const actionBox = this.contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(actionBox, ICON_FLOPPY_DUOTONE, "export to export folder", () => this.finish(this.name));
		renderHoverIcon(actionBox, ICON_CLOSE_SQUARE_DUOTONE, "cancel", () => this.finish(null));
	}

	onClose(): void {
		if (!this.settled) this.resolve(null);
	}

	private finish(value: string | null): void {
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

function promptForExportName(app: App, initialName: string): Promise<string | null> {
	return new Promise((resolve) => {
		new ExportNameModal(app, initialName, resolve).open();
	});
}

function promptToEditThreads(
	app: App,
	initialName: string,
	initialDescription: string,
): Promise<ThreadsEdit | null> {
	return new Promise((resolve) => {
		new EditThreadsModal(app, initialName, initialDescription, resolve).open();
	});
}

class JsonViewModal extends Modal {
	constructor(
		app: App,
		private readonly json: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-types-tags-json-view-modal");
		this.titleEl.setText("json");
		const { contentEl } = this;
		contentEl.addClass("sf-types-tags-json-view-body");

		const pasteBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-paste" });
		const textarea = pasteBox.createEl("textarea", {
			cls: "sf-types-tags-import-text",
			attr: { readonly: "true", spellcheck: "false" },
		});
		textarea.value = this.json;

		const actionBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(actionBox, ICON_COPY_DUOTONE, "copy JSON", () => void this.copy());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async copy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(this.json);
			new Notice("storyForge: threads JSON copied");
		} catch {
			new Notice("storyForge: use your normal copy command");
		}
	}
}

class JsonImportModal extends Modal {
	private name = "";
	private description = "";
	private pasteJson = "";
	private folderJson = "";
	private folderDocument: PlotThreadsExportDocument | null = null;
	private folderPath = "";
	private closed = false;
	private renderToken = 0;
	private nameField: { setValue: (value: string) => unknown } | null = null;
	private descriptionField: { setValue: (value: string) => unknown } | null = null;

	constructor(
		app: App,
		private readonly plugin: StoryForgePlugin,
		private readonly onSave: (name: string, description: string, json: string) => Promise<boolean>,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-types-tags-json-import-modal");
		this.titleEl.remove();
		const { contentEl } = this;
		contentEl.addClass("sf-types-tags-json-import-modal");

		const fieldsBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-fields" });
		new Setting(fieldsBox).setName("name").addText((text) => {
			this.nameField = text;
			text.setPlaceholder("e.g. roman threads").onChange((value) => {
				this.name = value;
			});
		});
		new Setting(fieldsBox).setName("description").addText((text) => {
			this.descriptionField = text;
			text.setPlaceholder("e.g. plot threads for the roman series").onChange((value) => {
				this.description = value;
			});
		});

		const tabs: StyleModalTab[] = [
			{ id: "paste", label: "paste", render: (body) => this.renderPasteTab(body) },
			{
				id: "from-export-folder",
				label: "from export folder",
				render: (body) => this.renderFromExportFolderTab(body),
			},
		];
		renderTabbedBody(contentEl, tabs, { initialId: "paste" });
	}

	onClose(): void {
		this.closed = true;
		this.renderToken++;
		this.contentEl.empty();
	}

	private renderPasteTab(body: HTMLElement): void {
		const pasteBox = body.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-paste" });
		pasteBox.createEl("textarea", {
			cls: "sf-types-tags-import-text",
			attr: { placeholder: "paste plot threads JSON here…", spellcheck: "false" },
		}).addEventListener("input", (event) => {
			this.pasteJson = (event.target as HTMLTextAreaElement).value;
		});
		const saveBox = body.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save threads", () => void this.submit(this.pasteJson));
	}

	private renderFromExportFolderTab(body: HTMLElement): void {
		const token = ++this.renderToken;
		const pickerBox = body.createDiv({ cls: "sf-types-tags-box" });
		const previewBox = body.createDiv({
			cls: "sf-types-tags-box sf-types-tags-preview-box sf-types-tags-folder-preview",
		});
		this.renderFolderPreview(previewBox);

		new Setting(pickerBox).setName("choose a JSON file").addDropdown((dropdown) => {
			dropdown.addOption("", "choose a JSON file…");
			void this.listRelevantExportFiles()
				.then((files) => {
					if (this.closed || token !== this.renderToken) return;
					for (const file of files) dropdown.addOption(file.path, file.name);
					if (this.folderPath) dropdown.setValue(this.folderPath);
					if (files.length === 0) {
						dropdown.setDisabled(true);
						previewBox.empty();
						previewBox.createDiv({
							cls: "sf-types-tags-import-preview is-empty",
							text: "no plot threads JSON in the export folder",
						});
					}
				})
				.catch(() => {
					if (this.closed || token !== this.renderToken) return;
					dropdown.setDisabled(true);
				});
			dropdown.onChange((value) => {
				if (!value) return;
				void this.loadFolderFile(value, previewBox, token);
			});
		});

		const saveBox = body.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save threads", () => void this.submit(this.folderJson));
	}

	private renderFolderPreview(parent: HTMLElement): void {
		parent.empty();
		const document = this.folderDocument;
		if (!document) {
			parent.createDiv({
				cls: "sf-types-tags-import-preview is-empty",
				text: "choose a JSON file from the export folder to preview it.",
			});
			return;
		}
		renderThreadsPreview(parent, document.threads, (thread) =>
			resolvePlotThreadTextColor(this.plugin.getSettings(), thread),
		);
	}

	private async listRelevantExportFiles(): Promise<Array<{ path: string; name: string }>> {
		const files = await listUserExportFiles(this.app);
		const relevant: Array<{ path: string; name: string }> = [];
		for (const file of files) {
			try {
				parsePlotThreadsExport(await readUserExportFile(this.app, file.path));
				relevant.push(file);
			} catch {
				/* not a plot threads export */
			}
		}
		return relevant;
	}

	private async loadFolderFile(path: string, previewBox: HTMLElement, token: number): Promise<void> {
		try {
			const text = await readUserExportFile(this.app, path);
			if (this.closed || token !== this.renderToken) return;
			const document = parsePlotThreadsExport(text);
			this.folderPath = path;
			this.folderJson = text;
			this.folderDocument = document;
			this.name = exportFilenameStem(path.slice(path.lastIndexOf("/") + 1));
			this.description = document.description ?? "";
			this.nameField?.setValue(this.name);
			this.descriptionField?.setValue(this.description);
			this.renderFolderPreview(previewBox);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not read export — ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async submit(json: string): Promise<void> {
		if (!json.trim()) {
			new Notice("storyForge: paste or choose plot threads JSON");
			return;
		}
		const saved = await this.onSave(this.name, this.description, json);
		if (saved) this.close();
	}
}

export class ThreadsExportModal extends Modal {
	private readonly plugin: StoryForgePlugin;
	private presetName = "";
	private description = "";
	private archiveDatedCopy = false;
	private exportIncluded: PlotThreadsExportSelection = { colours: true, names: true };
	private selectedSource: ImportSource | null = null;
	private importDocument: PlotThreadsExportDocument | null = null;
	private activeTabId: "create" | "load" = "create";
	private renderToken = 0;
	private closed = false;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-threads-export-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.closed = true;
		this.renderToken++;
		this.contentEl.empty();
	}

	private currentDocument(): PlotThreadsExportDocument {
		return buildPlotThreadsExport(readPlotThreads(this.app), new Date(), {
			description: this.description,
			included: this.exportIncluded,
		});
	}

	private isCurrentRender(token: number): boolean {
		return !this.closed && token === this.renderToken;
	}

	private textColorFor(thread: PlotThread): string {
		return resolvePlotThreadTextColor(this.plugin.getSettings(), thread);
	}

	private render(): void {
		const { contentEl } = this;
		const token = ++this.renderToken;
		contentEl.empty();
		contentEl.addClass("sf-threads-export-modal");
		const tabs: StyleModalTab[] = [
			{ id: "create", label: "create", render: (body) => this.renderCreateTab(body) },
			{ id: "load", label: "load", render: (body) => this.renderLoadTab(body, token) },
		];
		renderTabbedBody(contentEl, tabs, {
			initialId: this.activeTabId,
			onActivate: (id) => {
				this.activeTabId = id === "load" ? "load" : "create";
			},
		});
	}

	private renderCreateTab(contentEl: HTMLElement): void {
		const document = this.currentDocument();
		const includeBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const toggleRow = includeBox.createDiv({ cls: "sf-types-tags-toggle-row" });
		new Setting(toggleRow).setName("colours").addToggle((toggle) =>
			toggle.setValue(this.exportIncluded.colours).onChange((value) => {
				this.exportIncluded.colours = value;
				this.render();
			}),
		);
		new Setting(toggleRow).setName("thread names").addToggle((toggle) =>
			toggle.setValue(this.exportIncluded.names).onChange((value) => {
				this.exportIncluded.names = value;
				this.render();
			}),
		);
		new Setting(toggleRow).setName("archive dated copy").addToggle((toggle) =>
			toggle.setValue(this.archiveDatedCopy).onChange((value) => {
				this.archiveDatedCopy = value;
			}),
		);

		const saveBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-save-box" });
		const fields = saveBox.createDiv({ cls: "sf-types-tags-save-fields" });
		new Setting(fields)
			.setName("name")
			.addText((text) =>
				text
					.setPlaceholder("e.g. roman threads")
					.setValue(this.presetName)
					.onChange((value) => {
						this.presetName = value;
					}),
			);
		new Setting(fields)
			.setName("description")
			.addText((text) =>
				text
					.setPlaceholder("e.g. plot threads for the roman series")
					.setValue(this.description)
					.onChange((value) => {
						this.description = value;
					}),
			);
		const saveAction = saveBox.createDiv({ cls: "sf-types-tags-save-action" });
		renderHoverIcon(saveAction, ICON_FLOPPY_DUOTONE, "save threads", () => void this.savePreset(false));

		const previewBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-preview-box" });
		renderThreadsPreview(previewBox, document.threads, (thread) => this.textColorFor(thread));

		const jsonBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const jsonSetting = new Setting(jsonBox).setName("export JSON file");
		renderHoverIcon(jsonSetting.controlEl, ICON_COPY_DUOTONE, "copy JSON", () => {
			if (!hasPlotThreadsSelection(this.exportIncluded)) {
				new Notice("storyForge: choose colours or thread names");
				return;
			}
			void this.copyText(stringifyPlotThreadsExport(this.currentDocument()));
		});
		renderHoverIcon(jsonSetting.controlEl, ICON_SHARE_SQUARE_DUOTONE, "export to export folder", () =>
			void this.exportToFolder(),
		);
	}

	private renderLoadTab(contentEl: HTMLElement, token: number): void {
		const pickerBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		this.renderSourcePicker(pickerBox, token);

		const previewBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-preview-box" });
		this.renderImportPreview(previewBox);

		const importBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const importSetting = new Setting(importBox).setName("JSON import");
		renderHoverIcon(importSetting.controlEl, ICON_DOWNLOAD_DUOTONE, "import JSON", () =>
			this.openJsonImportModal(),
		);
	}

	private renderSourcePicker(contentEl: HTMLElement, token: number): void {
		new Setting(contentEl).setName("choose threads").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"named",
				"choose threads…",
				listNamedSettings(this.app, "threads"),
				(path) => readNamedSettings(this.app, "threads", path),
			),
		);
		new Setting(contentEl).setName("load a backed up threads").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"backup",
				"load a backed up threads…",
				listSettingsExportsInBackups(this.app).then((files) =>
					files.filter((file) => file.name.toLowerCase().endsWith("plot threads settings.json")),
				),
				(path) => readSettingsExportFromBackups(this.app, path),
			),
		);
	}

	private bindSourceDropdown(
		dropdown: DropdownComponent,
		token: number,
		kind: "named" | "backup",
		placeholder: string,
		listPromise: Promise<Array<{ path: string; name: string }>>,
		read: (path: string) => Promise<string>,
	): void {
		dropdown.addOption("", placeholder);
		void listPromise
			.then((items) => {
				if (!this.isCurrentRender(token)) return;
				for (const item of items) dropdown.addOption(item.path, item.name);
				const selected = this.selectedSource;
				if (selected?.kind === kind) dropdown.setValue(selected.path);
				if (items.length === 0) dropdown.setDisabled(true);
			})
			.catch(() => {
				if (this.isCurrentRender(token)) dropdown.setDisabled(true);
			});
		dropdown.onChange((value) => {
			if (!value) return;
			void read(value)
				.then((text) => {
					if (!this.isCurrentRender(token)) return;
					this.loadImportText(text, {
						kind,
						path: value,
						name: value.slice(value.lastIndexOf("/") + 1).replace(/\.json$/i, ""),
					});
				})
				.catch((error: unknown) => {
					new Notice(
						`storyForge: could not read threads — ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				});
		});
	}

	private renderImportPreview(contentEl: HTMLElement): void {
		const document = this.importDocument;
		if (!document) {
			contentEl.createDiv({
				cls: "sf-types-tags-import-preview is-empty",
				text: "choose threads or a backed up copy to preview them before applying.",
			});
			return;
		}

		const copy = contentEl.createDiv({ cls: "sf-types-tags-preview-copy" });
		copy.createEl("strong", {
			cls: "sf-types-tags-preview-title",
			text: this.displayNameForSource(this.selectedSource),
		});
		copy.createDiv({
			cls: "sf-types-tags-preview-description",
			text: document.description ?? "",
		});
		contentEl.createDiv({
			cls: "sf-types-tags-import-meta",
			text: `saved: ${new Date(document.exportedAt).toLocaleString()}`,
		});
		renderThreadsPreview(contentEl, document.threads, (thread) => this.textColorFor(thread));

		const applyRow = contentEl.createDiv({ cls: "sf-types-tags-preview-apply" });
		const actions = applyRow.createDiv({ cls: "sf-types-tags-preview-actions" });
		renderHoverIcon(actions, ICON_CHECK_SQUARE, "apply threads", () => void this.applyImport());
		if (this.selectedSource?.kind === "named") {
			renderHoverIcon(actions, ICON_EDIT_PEN, "edit threads", () => void this.editPreset());
			renderHoverIcon(actions, ICON_ARCHIVE_FILLED, "archive threads", () => void this.archivePreset());
		}
	}

	private displayNameForSource(source: ImportSource | null): string {
		if (!source) return "threads";
		if (source.kind === "named") return source.name.replace(/^thrd-/i, "").replace(/^threads - /i, "");
		return source.name.replace(/\.json$/i, "");
	}

	private loadImportText(text: string, source: ImportSource): void {
		try {
			const document = parsePlotThreadsExport(text);
			this.importDocument = document;
			this.selectedSource = {
				...source,
				name: source.kind === "named" ? this.displayNameForSource(source) : source.name,
			};
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not preview threads — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private defaultExportStem(): string {
		const seriesTitle = readSeriesFrontmatter(this.app).seriesTitle;
		const novelFolder = this.plugin.getSettings().selectedNovel;
		const novelTitle = novelFolder ? bookDisplayTitle(this.app, novelFolder) : "";
		return formatDatedExportStem(
			resolveExportItemName(this.presetName, seriesTitle, novelTitle, "threads"),
		);
	}

	private async exportToFolder(): Promise<void> {
		if (!hasPlotThreadsSelection(this.exportIncluded)) {
			new Notice("storyForge: choose colours or thread names");
			return;
		}
		const chosen = await promptForExportName(this.app, this.defaultExportStem());
		if (chosen === null) return;
		let path: string;
		try {
			path = userExportPath(chosen);
		} catch (error: unknown) {
			new Notice(
				`storyForge: ${error instanceof Error ? error.message : String(error)}`.replace(
					"settings preset",
					"export filename",
				),
			);
			return;
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing) {
			const confirmed = await confirmAction(
				this.app,
				"replace export?",
				`"${path.slice(path.lastIndexOf("/") + 1)}" already exists in ${EXPORT_ROOT}/. replace it?`,
				"replace",
			);
			if (!confirmed) return;
		}
		const content = stringifyPlotThreadsExport(this.currentDocument());
		try {
			await enqueueBackstageWrite(path, () => writeExportText(this.app.vault, path, content));
			new Notice(`storyForge: exported to ${path}`);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not export — ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private openJsonImportModal(): void {
		new JsonImportModal(this.app, this.plugin, (name, description, json) =>
			this.importJsonAsPreset(name, description, json),
		).open();
	}

	private async importJsonAsPreset(
		name: string,
		description: string,
		json: string,
	): Promise<boolean> {
		let document: PlotThreadsExportDocument;
		try {
			document = parsePlotThreadsExport(json);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not import threads — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return false;
		}
		const trimmed = description.trim();
		const exportText = stringifyPlotThreadsExport(
			trimmed ? { ...document, description: trimmed } : document,
		);
		const file = await this.persistNamedPreset(name, exportText, false);
		if (!file) return false;
		this.loadImportText(exportText, { kind: "named", path: file.path, name: file.name });
		return true;
	}

	private async persistNamedPreset(
		name: string,
		exportText: string,
		overwrite: boolean,
	): Promise<{ path: string; name: string } | null> {
		try {
			return await saveNamedSettings(this.app, "threads", name, exportText, overwrite);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace threads?",
					`${message}. replace it with the imported settings?`,
					"replace",
				);
				if (confirmed) return this.persistNamedPreset(name, exportText, true);
				return null;
			}
			new Notice(`storyForge: could not save threads — ${message}`);
			return null;
		}
	}

	private async savePreset(overwrite: boolean): Promise<void> {
		if (!hasPlotThreadsSelection(this.exportIncluded)) {
			new Notice("storyForge: choose colours or thread names");
			return;
		}
		const exportText = stringifyPlotThreadsExport(this.currentDocument());
		try {
			const file = await saveNamedSettings(this.app, "threads", this.presetName, exportText, overwrite);
			if (this.archiveDatedCopy) {
				try {
					await writePlotThreadsExportToBackups(this.app, exportText);
					new Notice(`storyForge: threads "${file.name}" saved and archived`);
				} catch (archiveError: unknown) {
					new Notice(
						`storyForge: threads "${file.name}" saved, but archive failed — ${
							archiveError instanceof Error ? archiveError.message : String(archiveError)
						}`,
					);
				}
			} else {
				new Notice(`storyForge: threads "${file.name}" saved`);
			}
			this.presetName = file.name;
			this.render();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace threads?",
					`${message}. replace it with the current settings?`,
					"replace",
				);
				if (confirmed) await this.savePreset(true);
				return;
			}
			new Notice(`storyForge: could not save threads — ${message}`);
		}
	}

	private async editPreset(): Promise<void> {
		const source = this.selectedSource;
		const document = this.importDocument;
		if (source?.kind !== "named" || !document) return;
		const currentName = source.name;
		const edited = await promptToEditThreads(this.app, currentName, document.description ?? "");
		if (edited === null) return;
		const nextName = edited.name.trim();
		if (!nextName) {
			new Notice("storyForge: enter a name for these threads");
			return;
		}
		const trimmedDescription = edited.description.trim();
		const updated: PlotThreadsExportDocument = { ...document };
		if (trimmedDescription) updated.description = trimmedDescription;
		else delete updated.description;
		const exportText = stringifyPlotThreadsExport(updated);

		let name = currentName;
		if (nextName !== currentName) {
			try {
				const renamed = await renameNamedSettings(this.app, "threads", source.path, nextName, false);
				name = renamed.name;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("already exists")) {
					new Notice(`storyForge: could not edit threads — ${message}`);
					return;
				}
				const confirmed = await confirmAction(
					this.app,
					"replace threads?",
					`${message}. replace it during rename?`,
					"replace",
				);
				if (!confirmed) return;
				const renamed = await renameNamedSettings(this.app, "threads", source.path, nextName, true);
				name = renamed.name;
			}
		}

		try {
			const saved = await saveNamedSettings(this.app, "threads", name, exportText, true);
			this.loadImportText(exportText, { kind: "named", path: saved.path, name: saved.name });
			new Notice(`storyForge: threads "${saved.name}" updated`);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not edit threads — ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async archivePreset(): Promise<void> {
		const source = this.selectedSource;
		if (source?.kind !== "named") return;
		const confirmed = await confirmAction(
			this.app,
			"archive threads?",
			`move "${source.name}" to archived-settings?`,
			"archive",
		);
		if (!confirmed) return;
		try {
			await archiveNamedSettings(this.app, "threads", source.path);
			this.selectedSource = null;
			this.importDocument = null;
			new Notice(`storyForge: threads "${source.name}" archived`);
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not archive threads — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async applyImport(): Promise<void> {
		const document = this.importDocument;
		if (!document) return;
		const current = readPlotThreads(this.app);
		const populated = isPlotThreadsListPopulated(current);
		let mode: PlotThreadsApplyMode = "replace";
		if (populated) {
			const choice = await promptReplaceOrAdd(
				this.app,
				"apply threads",
				"this list already has plot threads. replace them, or add the imported threads afterwards?",
			);
			if (choice === null) return;
			mode = choice;
		}
		try {
			if (mode === "replace" && populated && isFullPlotThreadsImport(document.included)) {
				await writePlotThreadsExportToBackups(
					this.app,
					stringifyPlotThreadsExport(buildPlotThreadsExport(current)),
				);
			}
			await applyPlotThreadsDocument(this.app, document, mode);
			this.plugin.refreshStoryForgeViews();
			this.plugin.refreshNovelOverviewView();
			new Notice(
				mode === "add" ? "storyForge: plot threads added" : "storyForge: plot threads applied",
			);
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not apply threads — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async copyText(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("storyForge: threads JSON copied");
		} catch {
			new JsonViewModal(this.app, text).open();
			new Notice("storyForge: JSON shown — use your normal copy command");
		}
	}
}
