import { App, DropdownComponent, Modal, Notice, Setting, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	listSettingsExportsInBackups,
	readSettingsExportFromBackups,
	writeTypesTagsExportToBackups,
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
import { readTagRegistry, resolveIconAlias, type TagDefinition, type TagListKind } from "../tagRegistry";
import {
	applyTypesTagsDocument,
	buildTypesTagsExport,
	hasTypesTagsSelection,
	parseTypesTagsExport,
	stringifyTypesTagsExport,
	type TypesTagsExportDocument,
	type TypesTagsExportSelection,
} from "../typesTagsExport";
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

type TypesTagsEdit = { name: string; description: string };

class EditTypesTagsModal extends Modal {
	private settled = false;
	private name: string;
	private description: string;

	constructor(
		app: App,
		initialName: string,
		initialDescription: string,
		private readonly resolve: (value: TypesTagsEdit | null) => void,
	) {
		super(app);
		this.name = initialName;
		this.description = initialDescription;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-edit-types-tags-modal");
		this.titleEl.setText("edit types & tags");
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
		renderHoverIcon(actionBox, ICON_EDIT_PEN, "save types & tags", () =>
			this.finish({ name: this.name, description: this.description }),
		);
		renderHoverIcon(actionBox, ICON_MULTIPLY_SQUARE, "cancel", () => this.finish(null));
	}

	onClose(): void {
		if (!this.settled) this.resolve(null);
	}

	private finish(value: TypesTagsEdit | null): void {
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
			new Notice("storyForge: types & tags JSON copied");
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
	private folderDocument: TypesTagsExportDocument | null = null;
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
		new Setting(fieldsBox)
			.setName("name")
			.addText((text) => {
				this.nameField = text;
				text.setPlaceholder("e.g. roman cast").onChange((value) => {
					this.name = value;
				});
			});
		new Setting(fieldsBox)
			.setName("description")
			.addText((text) => {
				this.descriptionField = text;
				text.setPlaceholder("e.g. types and tags for the roman series").onChange((value) => {
					this.description = value;
				});
			});

		const tabs: StyleModalTab[] = [
			{
				id: "paste",
				label: "paste",
				render: (body) => this.renderPasteTab(body),
			},
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
			attr: {
				placeholder: "paste types & tags JSON here…",
				spellcheck: "false",
			},
		}).addEventListener("input", (event) => {
			this.pasteJson = (event.target as HTMLTextAreaElement).value;
		});

		const saveBox = body.createDiv({ cls: "sf-types-tags-box sf-types-tags-json-save" });
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save types & tags", () =>
			void this.submit(this.pasteJson),
		);
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
							text: "no types & tags JSON in the export folder",
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
		renderHoverIcon(saveBox, ICON_FLOPPY_DUOTONE, "save types & tags", () =>
			void this.submit(this.folderJson),
		);
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
		renderTypesTagsPreviewPanes(parent, document.types, document.chapterTags, document.novelTags);
	}

	private async listRelevantExportFiles(): Promise<Array<{ path: string; name: string }>> {
		const files = await listUserExportFiles(this.app);
		const relevant: Array<{ path: string; name: string }> = [];
		for (const file of files) {
			try {
				parseTypesTagsExport(await readUserExportFile(this.app, file.path));
				relevant.push(file);
			} catch {
				/* not a types & tags export */
			}
		}
		return relevant;
	}

	private async loadFolderFile(path: string, previewBox: HTMLElement, token: number): Promise<void> {
		try {
			const text = await readUserExportFile(this.app, path);
			if (this.closed || token !== this.renderToken) return;
			const document = parseTypesTagsExport(text);
			this.folderPath = path;
			this.folderJson = text;
			this.folderDocument = document;
			this.setName(exportFilenameStem(path.slice(path.lastIndexOf("/") + 1)));
			this.setDescription(document.description ?? "");
			this.renderFolderPreview(previewBox);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not read export — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private setName(value: string): void {
		this.name = value;
		this.nameField?.setValue(value);
	}

	private setDescription(value: string): void {
		this.description = value;
		this.descriptionField?.setValue(value);
	}

	private async submit(json: string): Promise<void> {
		if (!json.trim()) {
			new Notice("storyForge: paste or choose types & tags JSON");
			return;
		}
		const saved = await this.onSave(this.name, this.description, json);
		if (saved) this.close();
	}
}

function promptToEditTypesTags(
	app: App,
	initialName: string,
	initialDescription: string,
): Promise<TypesTagsEdit | null> {
	return new Promise((resolve) => {
		new EditTypesTagsModal(app, initialName, initialDescription, resolve).open();
	});
}

function renderHoverIcon(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
	const iconEl = parent.createSpan({
		cls: "sf-types-tags-hover-icon",
		attr: { role: "button", "aria-label": label },
	});
	setIcon(iconEl, icon);
	iconEl.addEventListener("click", onClick);
	makeAccessibleActivatable(iconEl, onClick);
}

function renderPreviewRow(parent: HTMLElement, list: TagListKind, entry: TagDefinition): void {
	const row = parent.createDiv({ cls: "sf-types-tags-preview-row" });
	const iconEl = row.createSpan({ cls: "sf-types-tags-preview-icon" });
	setIcon(iconEl, resolveIconAlias(list, entry.iconAlias));
	row.createSpan({ cls: "sf-types-tags-preview-label", text: entry.label });
}

function renderTypePreview(pane: HTMLElement, types: TagDefinition[] | null): void {
	pane.createDiv({ cls: "sf-types-tags-preview-pane-title", text: "types" });
	if (!types) {
		pane.createDiv({ cls: "sf-types-tags-preview-empty", text: "not included" });
		return;
	}
	if (types.length === 0) {
		pane.createDiv({ cls: "sf-types-tags-preview-empty", text: "none" });
		return;
	}
	const childrenByParent = new Map<string, TagDefinition[]>();
	const roots: TagDefinition[] = [];
	const ids = new Set(types.map((entry) => entry.id));
	for (const entry of types) {
		if (entry.parentId && ids.has(entry.parentId)) {
			const list = childrenByParent.get(entry.parentId) ?? [];
			list.push(entry);
			childrenByParent.set(entry.parentId, list);
		} else {
			roots.push(entry);
		}
	}
	for (const entry of roots) {
		renderPreviewRow(pane, "codexTypes", entry);
		const children = childrenByParent.get(entry.id);
		if (!children?.length) continue;
		const nested = pane.createDiv({ cls: "sf-types-tags-preview-children" });
		for (const child of children) renderPreviewRow(nested, "codexTypes", child);
	}
}

function renderFlatListPreview(
	pane: HTMLElement,
	title: string,
	list: TagListKind,
	entries: TagDefinition[] | null,
): void {
	pane.createDiv({ cls: "sf-types-tags-preview-pane-title", text: title });
	if (!entries) {
		pane.createDiv({ cls: "sf-types-tags-preview-empty", text: "not included" });
		return;
	}
	if (entries.length === 0) {
		pane.createDiv({ cls: "sf-types-tags-preview-empty", text: "none" });
		return;
	}
	for (const entry of entries) renderPreviewRow(pane, list, entry);
}

export function renderTypesTagsPreviewPanes(
	parent: HTMLElement,
	types: TagDefinition[] | null,
	chapterTags: TagDefinition[] | null,
	novelTags: TagDefinition[] | null,
): void {
	const row = parent.createDiv({ cls: "sf-types-tags-preview-panes" });
	renderTypePreview(row.createDiv({ cls: "sf-types-tags-preview-pane" }), types);
	renderFlatListPreview(
		row.createDiv({ cls: "sf-types-tags-preview-pane" }),
		"chapter tags",
		"chapterTags",
		chapterTags,
	);
	renderFlatListPreview(
		row.createDiv({ cls: "sf-types-tags-preview-pane" }),
		"novel tags",
		"novelTags",
		novelTags,
	);
}

export class TypesTagsExportModal extends Modal {
	private readonly plugin: StoryForgePlugin;
	private presetName = "";
	private description = "";
	private exportIncluded: TypesTagsExportSelection = { types: true, chapterTags: true, novelTags: true };
	private archiveDatedCopy = false;
	private selectedSource: ImportSource | null = null;
	private importDocument: TypesTagsExportDocument | null = null;
	private importIncluded: TypesTagsExportSelection = { types: true, chapterTags: true, novelTags: true };
	private activeTabId: "create" | "load" = "create";
	private renderToken = 0;
	private closed = false;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-types-tags-export-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.closed = true;
		this.renderToken++;
		this.contentEl.empty();
	}

	private currentDocument(): TypesTagsExportDocument {
		return buildTypesTagsExport(readTagRegistry(this.app), new Date(), {
			description: this.description,
			included: this.exportIncluded,
		});
	}

	private isCurrentRender(token: number): boolean {
		return !this.closed && token === this.renderToken;
	}

	private render(): void {
		const { contentEl } = this;
		const token = ++this.renderToken;
		contentEl.empty();
		contentEl.addClass("sf-types-tags-export-modal");
		const tabs: StyleModalTab[] = [
			{
				id: "create",
				label: "create",
				render: (body) => this.renderCreateTab(body),
			},
			{
				id: "load",
				label: "load",
				render: (body) => this.renderLoadTab(body, token),
			},
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
		this.renderSectionToggles(includeBox, {
			types: {
				value: this.exportIncluded.types,
				onChange: (value) => {
					this.exportIncluded.types = value;
					this.render();
				},
			},
			chapterTags: {
				value: this.exportIncluded.chapterTags,
				onChange: (value) => {
					this.exportIncluded.chapterTags = value;
					this.render();
				},
			},
			novelTags: {
				value: this.exportIncluded.novelTags,
				onChange: (value) => {
					this.exportIncluded.novelTags = value;
					this.render();
				},
			},
			archive: {
				value: this.archiveDatedCopy,
				onChange: (value) => {
					this.archiveDatedCopy = value;
				},
			},
		});

		const saveBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-save-box" });
		const fields = saveBox.createDiv({ cls: "sf-types-tags-save-fields" });
		new Setting(fields)
			.setName("name")
			.addText((text) =>
				text
					.setPlaceholder("e.g. roman cast")
					.setValue(this.presetName)
					.onChange((value) => {
						this.presetName = value;
					}),
			);
		new Setting(fields)
			.setName("description")
			.addText((text) =>
				text
					.setPlaceholder("e.g. types and tags for the roman series")
					.setValue(this.description)
					.onChange((value) => {
						this.description = value;
					}),
			);
		const saveAction = saveBox.createDiv({ cls: "sf-types-tags-save-action" });
		renderHoverIcon(saveAction, ICON_FLOPPY_DUOTONE, "save types & tags", () => void this.savePreset(false));

		const previewBox = contentEl.createDiv({ cls: "sf-types-tags-box sf-types-tags-preview-box" });
		renderTypesTagsPreviewPanes(
			previewBox,
			document.types,
			document.chapterTags,
			document.novelTags,
		);

		const jsonBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const jsonSetting = new Setting(jsonBox).setName("export JSON file");
		renderHoverIcon(jsonSetting.controlEl, ICON_COPY_DUOTONE, "copy JSON", () =>
			void this.copyText(stringifyTypesTagsExport(this.currentDocument())),
		);
		renderHoverIcon(jsonSetting.controlEl, ICON_SHARE_SQUARE_DUOTONE, "export to export folder", () =>
			void this.exportToFolder(),
		);
	}

	private renderLoadTab(contentEl: HTMLElement, token: number): void {
		const pickerBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		this.renderSourcePicker(pickerBox, token);

		const previewBox = contentEl.createDiv({
			cls: "sf-types-tags-box sf-types-tags-preview-box",
		});
		this.renderImportPreview(previewBox);

		const importBox = contentEl.createDiv({ cls: "sf-types-tags-box" });
		const importSetting = new Setting(importBox).setName("JSON import");
		renderHoverIcon(importSetting.controlEl, ICON_DOWNLOAD_DUOTONE, "import JSON", () =>
			this.openJsonImportModal(),
		);
	}

	private renderSectionToggles(
		parent: HTMLElement,
		toggles: {
			types: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void };
			chapterTags: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void };
			novelTags: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void };
			archive?: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void };
		},
	): void {
		const row = parent.createDiv({ cls: "sf-types-tags-toggle-row" });
		const cells: Array<{
			name: string;
			spec: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void };
		}> = [
			{ name: "types", spec: toggles.types },
			{ name: "chapter tags", spec: toggles.chapterTags },
			{ name: "novel tags", spec: toggles.novelTags },
		];
		if (toggles.archive) cells.push({ name: "archive dated copy", spec: toggles.archive });
		for (const cell of cells) {
			new Setting(row).setName(cell.name).addToggle((toggle) =>
				toggle
					.setValue(cell.spec.value)
					.setDisabled(cell.spec.disabled ?? false)
					.onChange(cell.spec.onChange),
			);
		}
	}

	private renderSourcePicker(contentEl: HTMLElement, token: number): void {
		new Setting(contentEl).setName("choose types & tags").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"named",
				"choose types & tags…",
				listNamedSettings(this.app, "types-tags"),
				(path) => readNamedSettings(this.app, "types-tags", path),
			),
		);
		new Setting(contentEl).setName("load a backed up types & tags").addDropdown((dropdown) =>
			this.bindSourceDropdown(
				dropdown,
				token,
				"backup",
				"load a backed up types & tags…",
				listSettingsExportsInBackups(this.app).then((files) =>
					files.filter((file) => file.name.toLowerCase().endsWith("types & tags settings.json")),
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
						`storyForge: could not read types & tags — ${
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
				text: "choose types & tags or a backed up copy to preview them before applying.",
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

		const controls = contentEl.createDiv({ cls: "sf-types-tags-preview-controls" });
		controls.createDiv({
			cls: "sf-types-tags-import-meta",
			text: `saved: ${new Date(document.exportedAt).toLocaleString()}`,
		});
		this.renderSectionToggles(controls, {
			types: {
				value: this.importIncluded.types,
				disabled: document.types === null,
				onChange: (value) => {
					this.importIncluded.types = value;
					this.render();
				},
			},
			chapterTags: {
				value: this.importIncluded.chapterTags,
				disabled: document.chapterTags === null,
				onChange: (value) => {
					this.importIncluded.chapterTags = value;
					this.render();
				},
			},
			novelTags: {
				value: this.importIncluded.novelTags,
				disabled: document.novelTags === null,
				onChange: (value) => {
					this.importIncluded.novelTags = value;
					this.render();
				},
			},
		});

		renderTypesTagsPreviewPanes(
			contentEl,
			this.importIncluded.types ? document.types : null,
			this.importIncluded.chapterTags ? document.chapterTags : null,
			this.importIncluded.novelTags ? document.novelTags : null,
		);

		const applyRow = contentEl.createDiv({ cls: "sf-types-tags-preview-apply" });
		const actions = applyRow.createDiv({ cls: "sf-types-tags-preview-actions" });
		renderHoverIcon(actions, ICON_CHECK_SQUARE, "apply types & tags", () => void this.applyImport());
		if (this.selectedSource?.kind === "named") {
			renderHoverIcon(actions, ICON_EDIT_PEN, "edit types & tags", () => void this.editPreset());
			renderHoverIcon(actions, ICON_ARCHIVE_FILLED, "archive types & tags", () => void this.archivePreset());
		}
	}

	private displayNameForSource(source: ImportSource | null): string {
		if (!source) return "types & tags";
		if (source.kind === "named") return source.name.replace(/^tytg-/i, "").replace(/^types & tags - /i, "");
		return source.name.replace(/\.json$/i, "");
	}

	private loadImportText(text: string, source: ImportSource): void {
		try {
			const document = parseTypesTagsExport(text);
			this.importDocument = document;
			this.selectedSource = {
				...source,
				name: source.kind === "named" ? this.displayNameForSource(source) : source.name,
			};
			this.importIncluded = {
				types: document.types !== null,
				chapterTags: document.chapterTags !== null,
				novelTags: document.novelTags !== null,
			};
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not preview types & tags — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private openJsonViewModal(json: string): void {
		new JsonViewModal(this.app, json).open();
	}

	private defaultExportStem(): string {
		const seriesTitle = readSeriesFrontmatter(this.app).seriesTitle;
		const novelFolder = this.plugin.getSettings().selectedNovel;
		const novelTitle = novelFolder ? bookDisplayTitle(this.app, novelFolder) : "";
		return formatDatedExportStem(resolveExportItemName(this.presetName, seriesTitle, novelTitle));
	}

	private async exportToFolder(): Promise<void> {
		if (!hasTypesTagsSelection(this.exportIncluded)) {
			new Notice("storyForge: choose types, chapter tags, or novel tags");
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
		const content = stringifyTypesTagsExport(this.currentDocument());
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
		let document: TypesTagsExportDocument;
		try {
			document = parseTypesTagsExport(json);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not import types & tags — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return false;
		}
		const trimmed = description.trim();
		const exportText = stringifyTypesTagsExport(
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
			return await saveNamedSettings(this.app, "types-tags", name, exportText, overwrite);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace types & tags?",
					`${message}. replace it with the imported settings?`,
					"replace",
				);
				if (confirmed) return this.persistNamedPreset(name, exportText, true);
				return null;
			}
			new Notice(`storyForge: could not save types & tags — ${message}`);
			return null;
		}
	}

	private async savePreset(overwrite: boolean): Promise<void> {
		if (!hasTypesTagsSelection(this.exportIncluded)) {
			new Notice("storyForge: choose types, chapter tags, or novel tags");
			return;
		}
		const exportText = stringifyTypesTagsExport(this.currentDocument());
		try {
			const file = await saveNamedSettings(this.app, "types-tags", this.presetName, exportText, overwrite);
			if (this.archiveDatedCopy) {
				try {
					await writeTypesTagsExportToBackups(this.app, exportText);
					new Notice(`storyForge: types & tags "${file.name}" saved and archived`);
				} catch (archiveError: unknown) {
					new Notice(
						`storyForge: types & tags "${file.name}" saved, but archive failed — ${
							archiveError instanceof Error ? archiveError.message : String(archiveError)
						}`,
					);
				}
			} else {
				new Notice(`storyForge: types & tags "${file.name}" saved`);
			}
			this.presetName = file.name;
			this.render();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && (error instanceof SettingsPresetExistsError || message.includes("already exists"))) {
				const confirmed = await confirmAction(
					this.app,
					"replace types & tags?",
					`${message}. replace it with the current settings?`,
					"replace",
				);
				if (confirmed) await this.savePreset(true);
				return;
			}
			new Notice(`storyForge: could not save types & tags — ${message}`);
		}
	}

	private async editPreset(): Promise<void> {
		const source = this.selectedSource;
		const document = this.importDocument;
		if (source?.kind !== "named" || !document) return;
		const currentName = source.name;
		const edited = await promptToEditTypesTags(this.app, currentName, document.description ?? "");
		if (edited === null) return;
		const nextName = edited.name.trim();
		if (!nextName) {
			new Notice("storyForge: enter a name for these types & tags");
			return;
		}
		const trimmedDescription = edited.description.trim();
		const updated: TypesTagsExportDocument = { ...document };
		if (trimmedDescription) updated.description = trimmedDescription;
		else delete updated.description;
		const exportText = stringifyTypesTagsExport(updated);

		let name = currentName;
		if (nextName !== currentName) {
			try {
				const renamed = await renameNamedSettings(this.app, "types-tags", source.path, nextName, false);
				name = renamed.name;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("already exists")) {
					new Notice(`storyForge: could not edit types & tags — ${message}`);
					return;
				}
				const confirmed = await confirmAction(
					this.app,
					"replace types & tags?",
					`${message}. replace it during rename?`,
					"replace",
				);
				if (!confirmed) return;
				const renamed = await renameNamedSettings(this.app, "types-tags", source.path, nextName, true);
				name = renamed.name;
			}
		}

		try {
			const saved = await saveNamedSettings(this.app, "types-tags", name, exportText, true);
			this.loadImportText(exportText, { kind: "named", path: saved.path, name: saved.name });
			new Notice(`storyForge: types & tags "${saved.name}" updated`);
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not edit types & tags — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async archivePreset(): Promise<void> {
		const source = this.selectedSource;
		if (source?.kind !== "named") return;
		const confirmed = await confirmAction(
			this.app,
			"archive types & tags?",
			`move "${source.name}" to archived-settings?`,
			"archive",
		);
		if (!confirmed) return;
		try {
			await archiveNamedSettings(this.app, "types-tags", source.path);
			this.selectedSource = null;
			this.importDocument = null;
			new Notice(`storyForge: types & tags "${source.name}" archived`);
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not archive types & tags — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async applyImport(): Promise<void> {
		const document = this.importDocument;
		if (!document) return;
		if (!hasTypesTagsSelection(this.importIncluded)) {
			new Notice("storyForge: choose types, chapter tags, or novel tags");
			return;
		}
		try {
			await applyTypesTagsDocument(this.app, document, this.importIncluded);
			this.plugin.refreshStoryForgeViews();
			this.plugin.refreshNovelOverviewView();
			new Notice("storyForge: selected types & tags applied");
			this.render();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not apply types & tags — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async copyText(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("storyForge: types & tags JSON copied");
		} catch {
			this.openJsonViewModal(text);
			new Notice("storyForge: JSON shown — use your normal copy command");
		}
	}
}
