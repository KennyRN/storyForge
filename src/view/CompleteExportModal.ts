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
	applyCompleteExport,
	completePreviewCounts,
	liveCompleteExport,
	parseCompleteExport,
	stringifyCompleteExport,
	type CompleteExportDocument,
} from "../completeExport";
import {
	buildPlotThreadsExport,
	isPlotThreadsListPopulated,
	stringifyPlotThreadsExport,
} from "../plotThreadsExport";
import { readPlotThreads } from "../plotThreads";
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
import { confirmAction } from "./protectionsController";
import { renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";

type ImportSource = {
	kind: "named" | "backup" | "paste";
	path: string;
	name: string;
};

type CompleteEdit = { name: string; description: string };

function renderHoverIcon(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
	const iconEl = parent.createSpan({
		cls: "sf-types-tags-hover-icon",
		attr: { role: "button", "aria-label": label },
	});
	setIcon(iconEl, icon);
	iconEl.addEventListener("click", onClick);
	makeAccessibleActivatable(iconEl, onClick);
}

export function renderCompletePreview(parent: HTMLElement, document: CompleteExportDocument): void {
	const pane = parent.createDiv({ cls: "sf-preferences-preview-pane" });
	for (const row of completePreviewCounts(document)) {
		const chip = pane.createDiv({ cls: "sf-preferences-preview-chip" });
		chip.createSpan({ text: row.label });
		chip.createSpan({ cls: "sf-preferences-preview-count", text: row.count });
	}
}

class EditCompleteModal extends Modal {
	private settled = false;
	private name: string;
	private description: string;

	constructor(
		app: App,
		initialName: string,
		initialDescription: string,
		private readonly resolve: (value: CompleteEdit | null) => void,
	) {
		super(app);
		this.name = initialName;
		this.description = initialDescription;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-edit-types-tags-modal");
		this.titleEl.setText("edit complete");
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
		renderHoverIcon(actionBox, ICON_EDIT_PEN, "save complete", () =>
			this.finish({ name: this.name, description: this.description }),
		);
		renderHoverIcon(actionBox, ICON_MULTIPLY_SQUARE, "cancel", () => this.finish(null));
	}

	onClose(): void {
		if (!this.settled) this.resolve(null);
	}

	private finish(value: CompleteEdit | null): void {
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

function promptToEditComplete(
	app: App,
	initialName: string,
	initialDescription: string,
): Promise<CompleteEdit | null> {
	return new Promise((resolve) => {
		new EditCompleteModal(app, initialName, initialDescription, resolve).open();
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
			new Notice("storyForge: complete JSON copied");
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
	private folderDocument: CompleteExportDocument | null = null;
	private folderPath = "";
	private closed = false;
	private renderToken = 0;
	private nameField: { setValue: (value: string) => unknown } | null = null;
	private descriptionField: { setValue: (value: string) => unknown } | null = null;

	constructor(
		app: App,
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
			text.setPlaceholder("e.g. roman complete").onChange((value) => {
				this.name = value;
			});
		});
		new Setting(fieldsBox).setName("description").addText((text) => {
			this.descriptionField = text;
			text.setPlaceholder("e.g. complete settings for the roman series").onChange((value) => {
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
			attr: { placeholder: "paste complete JSON here…", spellcheck: "false" },
		}).addEventListener("input", (event) => {
			this.pasteJson = (event.target as HTMLTextAreaElement).value;
		});
		const saveBox = body.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save complete", () => void this.submit(this.pasteJson));
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
							text: "no complete JSON in the export folder",
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
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save complete", () => void this.submit(this.folderJson));
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
		renderCompletePreview(parent, document);
	}

	private async listRelevantExportFiles(): Promise<Array<{ path: string; name: string }>> {
		const files = await listUserExportFiles(this.app);
		const relevant: Array<{ path: string; name: string }> = [];
		for (const file of files) {
			try {
				parseCompleteExport(await readUserExportFile(this.app, file.path));
				relevant.push(file);
			} catch {
				/* not a complete export */
			}
		}
		return relevant;
	}

	private async loadFolderFile(path: string, previewBox: HTMLElement, token: number): Promise<void> {
		try {
			const text = await readUserExportFile(this.app, path);
			if (this.closed || token !== this.renderToken) return;
			const document = parseCompleteExport(text);
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
			new Notice("storyForge: paste or choose complete JSON");
			return;
		}
		const saved = await this.onSave(this.name, this.description, json);
		if (saved) this.close();
	}
}

export class CompleteExportModal extends Modal {
	private readonly plugin: StoryForgePlugin;
	private presetName = "";
	private description = "";
	private template = false;
	private selectedSource: ImportSource | null = null;
	private importDocument: CompleteExportDocument | null = null;
	private activeTabId: "create" | "load" = "create";
	private renderToken = 0;
	private closed = false;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-complete-export-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.closed = true;
		this.renderToken++;
		this.contentEl.empty();
	}

	private currentDocument(): CompleteExportDocument {
		return liveCompleteExport(this.plugin, new Date(), {
			description: this.description,
			template: this.template,
		});
	}

	private isCurrentRender(token: number): boolean {
		return !this.closed && token === this.renderToken;
	}

	private render(): void {
		const { contentEl } = this;
		const token = ++this.renderToken;
		contentEl.empty();
		contentEl.addClass("sf-complete-export-modal");
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
		const saveBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-save-box" });
		const fields = saveBox.createDiv({ cls: "sf-types-tags-save-fields" });
		new Setting(fields)
			.setName("name")
			.addText((text) =>
				text
					.setPlaceholder("e.g. roman complete")
					.setValue(this.presetName)
					.onChange((value) => {
						this.presetName = value;
					}),
			);
		new Setting(fields)
			.setName("description")
			.addText((text) =>
				text
					.setPlaceholder("e.g. complete settings for the roman series")
					.setValue(this.description)
					.onChange((value) => {
						this.description = value;
					}),
			);
		new Setting(fields).setName("create a template").addToggle((toggle) =>
			toggle.setValue(this.template).onChange((value) => {
				this.template = value;
				this.render();
			}),
		);
		const saveAction = saveBox.createDiv({ cls: "sf-types-tags-save-action" });
		renderHoverIcon(saveAction, ICON_FLOPPY_DUOTONE, "save complete", () => void this.savePreset(false));

		const previewBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-preview-box" });
		renderCompletePreview(previewBox, document);

		const jsonBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const jsonSetting = new Setting(jsonBox).setName("export JSON file");
		renderHoverIcon(jsonSetting.controlEl, ICON_COPY_DUOTONE, "copy JSON", () =>
			void this.copyText(stringifyCompleteExport(this.currentDocument())),
		);
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
		new Setting(contentEl).setName("choose complete").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"named",
				"choose complete…",
				listNamedSettings(this.app, "complete"),
				(path) => readNamedSettings(this.app, "complete", path),
			),
		);
		new Setting(contentEl).setName("load a backed up complete").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"backup",
				"load a backed up complete…",
				listSettingsExportsInBackups(this.app).then((files) =>
					files.filter((file) => file.name.toLowerCase().endsWith("complete settings.json")),
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
						`storyForge: could not read complete — ${
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
				text: "choose complete or a backed up copy to preview it before applying.",
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
		renderCompletePreview(contentEl, document);
		const applyRow = contentEl.createDiv({ cls: "sf-types-tags-preview-apply" });
		const actions = applyRow.createDiv({ cls: "sf-types-tags-preview-actions" });
		renderHoverIcon(actions, ICON_CHECK_SQUARE, "apply complete", () => void this.applyImport());
		if (this.selectedSource?.kind === "named") {
			renderHoverIcon(actions, ICON_EDIT_PEN, "edit complete", () => void this.editPreset());
			renderHoverIcon(actions, ICON_ARCHIVE_FILLED, "archive complete", () => void this.archivePreset());
		}
	}

	private displayNameForSource(source: ImportSource | null): string {
		if (!source) return "complete";
		if (source.kind === "named") return source.name.replace(/^comp-/i, "").replace(/^complete - /i, "");
		return source.name.replace(/\.json$/i, "");
	}

	private loadImportText(text: string, source: ImportSource): void {
		try {
			const document = parseCompleteExport(text);
			this.importDocument = document;
			this.selectedSource = {
				...source,
				name: source.kind === "named" ? this.displayNameForSource(source) : source.name,
			};
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not preview complete — ${
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
			resolveExportItemName(this.presetName, seriesTitle, novelTitle, "complete"),
		);
	}

	private async exportToFolder(): Promise<void> {
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
		const content = stringifyCompleteExport(this.currentDocument());
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
		new JsonImportModal(this.app, (name, description, json) =>
			this.importJsonAsPreset(name, description, json),
		).open();
	}

	private async importJsonAsPreset(
		name: string,
		description: string,
		json: string,
	): Promise<boolean> {
		let document: CompleteExportDocument;
		try {
			document = parseCompleteExport(json);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not import complete — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return false;
		}
		const trimmed = description.trim();
		const exportText = stringifyCompleteExport(
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
			return await saveNamedSettings(this.app, "complete", name, exportText, overwrite);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace complete?",
					`${message}. replace it with the imported settings?`,
					"replace",
				);
				if (confirmed) return this.persistNamedPreset(name, exportText, true);
				return null;
			}
			new Notice(`storyForge: could not save complete — ${message}`);
			return null;
		}
	}

	private async savePreset(overwrite: boolean): Promise<void> {
		const exportText = stringifyCompleteExport(this.currentDocument());
		try {
			const file = await saveNamedSettings(this.app, "complete", this.presetName, exportText, overwrite);
			new Notice(`storyForge: complete "${file.name}" saved`);
			this.presetName = file.name;
			this.render();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace complete?",
					`${message}. replace it with the current settings?`,
					"replace",
				);
				if (confirmed) await this.savePreset(true);
				return;
			}
			new Notice(`storyForge: could not save complete — ${message}`);
		}
	}

	private async editPreset(): Promise<void> {
		const source = this.selectedSource;
		const document = this.importDocument;
		if (source?.kind !== "named" || !document) return;
		const currentName = source.name;
		const edited = await promptToEditComplete(this.app, currentName, document.description ?? "");
		if (edited === null) return;
		const nextName = edited.name.trim();
		if (!nextName) {
			new Notice("storyForge: enter a name for this complete set");
			return;
		}
		const trimmedDescription = edited.description.trim();
		const updated: CompleteExportDocument = { ...document };
		if (trimmedDescription) updated.description = trimmedDescription;
		else delete updated.description;
		const exportText = stringifyCompleteExport(updated);
		let name = currentName;
		if (nextName !== currentName) {
			try {
				const renamed = await renameNamedSettings(this.app, "complete", source.path, nextName, false);
				name = renamed.name;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("already exists")) {
					new Notice(`storyForge: could not edit complete — ${message}`);
					return;
				}
				const confirmed = await confirmAction(
					this.app,
					"replace complete?",
					`${message}. replace it during rename?`,
					"replace",
				);
				if (!confirmed) return;
				const renamed = await renameNamedSettings(this.app, "complete", source.path, nextName, true);
				name = renamed.name;
			}
		}
		try {
			const saved = await saveNamedSettings(this.app, "complete", name, exportText, true);
			this.loadImportText(exportText, { kind: "named", path: saved.path, name: saved.name });
			new Notice(`storyForge: complete "${saved.name}" updated`);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not edit complete — ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async archivePreset(): Promise<void> {
		const source = this.selectedSource;
		if (source?.kind !== "named") return;
		const confirmed = await confirmAction(
			this.app,
			"archive complete?",
			`move "${source.name}" to archived-settings?`,
			"archive",
		);
		if (!confirmed) return;
		try {
			await archiveNamedSettings(this.app, "complete", source.path);
			this.selectedSource = null;
			this.importDocument = null;
			new Notice(`storyForge: complete "${source.name}" archived`);
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not archive complete — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async applyImport(): Promise<void> {
		const document = this.importDocument;
		if (!document) return;
		const confirmed = await confirmAction(
			this.app,
			"replace complete?",
			"this replaces preferences, interface, types, tags, threads, and titleforge in this vault.",
			"replace",
		);
		if (!confirmed) return;
		const currentThreads = readPlotThreads(this.app);
		try {
			if (isPlotThreadsListPopulated(currentThreads)) {
				await writePlotThreadsExportToBackups(
					this.app,
					stringifyPlotThreadsExport(buildPlotThreadsExport(currentThreads)),
				);
			}
			await applyCompleteExport(this.plugin, document);
			new Notice("storyForge: complete settings applied");
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not apply complete — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async copyText(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("storyForge: complete JSON copied");
		} catch {
			new JsonViewModal(this.app, text).open();
			new Notice("storyForge: JSON shown — use your normal copy command");
		}
	}
}
