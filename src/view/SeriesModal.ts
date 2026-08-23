import { App, Modal, Notice, Setting, SettingGroup, setIcon, TFolder } from "obsidian";
import type StoryForgePlugin from "../main";
import { getSeriesBooks, readSeriesFrontmatter, writeSeriesTitle } from "../series";
import { createBook, renameBookTitle, reorderSeriesBooks } from "../book";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import {
	ICON_BOOK_PLUS,
	ICON_ELEMENT2_FILLED,
	ICON_EYE_DUOTONE,
	ICON_FLOPPY_DUOTONE,
	ICON_SETTINGS_ALT,
	ICON_TEXT_INPUT_DUOTONE,
} from "../icons";
import {
	COLOR_PALETTES,
	defaultVariantName,
	PALETTE_NAMES,
	resolveForegroundBackground,
	resolvePaletteColors,
	type PaletteColor,
	type PaletteMode,
	type PresetPaletteName,
} from "../colorPalettes";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { TextStyleModal } from "./TextStyleModal";
import { UiFormattingModal } from "./UiFormattingModal";
import { HideUiModal } from "./HideUiModal";
import { renderCyclingGuideCard } from "./styleModalHelpers";
import { ProtectionsController } from "./protectionsController";
import { formatCompanionState } from "../formatCompanionActive";
import { TagRegistryModal } from "./TagRegistryModal";
import { TitleForgeSettingsModal } from "../titleforge/view/TitleForgeSettingsModal";
import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../numberingStyle";
import { refreshTabTitles } from "../tabTitles";

function isPresetPaletteName(name: string): name is PresetPaletteName {
	return name in COLOR_PALETTES;
}

/**
 * Builds the series-settings body (title, book list, reorder, add book) into `container`, clearing
 * it first. This is SeriesModal's own popup-dialog content only — the Series overview page
 * (SeriesOverviewView.ts) used to mirror this same function, but now has its own bespoke rendering
 * (fixed header + scrollable, filtered, synopsis-per-row list) that doesn't belong in a compact
 * popup, so the two have deliberately diverged. `bindTextCommit` below is still shared by both.
 */
export function renderSeriesSettingsBody(container: HTMLElement, app: App, onChange: () => void): void {
	container.empty();

	const titleRow = container.createDiv({ cls: "sf-modal-title-row" });
	const titleInput = titleRow.createEl("input", {
		cls: "sf-modal-input sf-modal-title-input",
		type: "text",
		attr: { placeholder: "Series Name" },
	});
	titleInput.value = readSeriesFrontmatter(app).seriesTitle;
	bindTextCommit(titleInput, async (value) => {
		await writeSeriesTitle(app, value);
		onChange();
	});

	const listHeader = container.createDiv({ cls: "sf-modal-list-header" });
	listHeader.createEl("h3", { text: "Books" });

	const hintRow = container.createDiv({ cls: "sf-modal-hint-row" });
	hintRow.createDiv({
		cls: "sf-modal-hint",
		text: "# inserts a counted number\n// breaks title into title and subtitle",
	});
	const addBookBtn = hintRow.createSpan({ cls: "sf-modal-add-book", attr: { "aria-label": "New book" } });
	setIcon(addBookBtn, ICON_BOOK_PLUS);
	const handleCreateBook = async () => {
		try {
			await createBook(app);
			onChange();
			renderSeriesSettingsBody(container, app, onChange);
		} catch (err) {
			new Notice(`storyForge: could not create book — ${(err as Error).message}`);
		}
	};
	addBookBtn.addEventListener("click", () => void handleCreateBook());
	makeAccessibleActivatable(addBookBtn, () => void handleCreateBook());

	const bookList = container.createDiv({ cls: "sf-modal-book-list" });
	const { ordered, unplaced } = getSeriesBooks(app);
	const books: TFolder[] = [...ordered, ...unplaced];
	for (const folder of books) {
		renderBookRow(bookList, app, folder, onChange);
	}
	if (books.length === 0) {
		bookList.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
	}

	const zones: DragZone[] = [{ key: "order", container: bookList }];
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void handleReorder(app, (zoneRowKeys.order ?? []).filter(Boolean), onChange, () =>
			renderSeriesSettingsBody(container, app, onChange),
		);
	});
}

function renderBookRow(bookList: HTMLElement, app: App, folder: TFolder, onChange: () => void): void {
	const row = bookList.createDiv({ cls: "sf-row" });
	row.dataset.key = folder.name;
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");

	const entry = readSeriesFrontmatter(app).books[folder.name];
	const input = row.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
	input.value = entry?.bookTitle ?? folder.name;
	bindTextCommit(input, async (value) => {
		await renameBookTitle(app, folder.name, value);
		onChange();
	});
}

/** Shared by SeriesModal.ts's own rows and SeriesOverviewView.ts's title/book-title fields — commits
 * the trimmed value on blur or Enter, once only per focus. */
export function bindTextCommit(input: HTMLInputElement, onCommit: (value: string) => Promise<void>): void {
	let settled = false;
	const commit = async () => {
		if (settled) return;
		settled = true;
		const value = input.value.trim();
		if (value) await onCommit(value);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		}
	});
	input.addEventListener("blur", () => void commit());
	input.addEventListener("pointerdown", (event) => event.stopPropagation());
}

async function handleReorder(app: App, newOrder: string[], onChange: () => void, rerender: () => void): Promise<void> {
	try {
		await reorderSeriesBooks(app, newOrder);
		onChange();
	} catch (err) {
		new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
		rerender();
	}
}

type SettingsTabId = "typesAndTags" | "general" | "formatting" | "obsidianElements" | "importExport" | "backup";

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
	{ id: "typesAndTags", label: "types, tags, & titles" },
	{ id: "general", label: "general" },
	{ id: "formatting", label: "formatting" },
	{ id: "obsidianElements", label: "obsidian elements" },
	{ id: "importExport", label: "import & export settings" },
	{ id: "backup", label: "backup" },
];

/**
 * Draft staging modal opened from the Series page's settings gear. Formerly this duplicated the
 * series-title/book-list editing that SeriesOverviewView now renders inline on the page itself
 * (see the doc comment on renderSeriesSettingsBody above), so that content has been cleared out.
 * In its place this is a tabbed reorganisation of every top-level row from both
 * StoryForgeSettingsTab and FormatForgeSettingsTab. Rows that open a sub-modal in the original
 * settings tabs still open those same modals; formatForge's own rows (under the "formatting" tab)
 * open formatForge's real modals directly via the openInterfaceModal/openFormattingModal companion
 * hooks (see formattingApi.ts, main.ts's openFormatForgeInterfaceModal/openFormatForgeFormattingModal)
 * rather than Obsidian's Settings window.
 */
export class SeriesModal extends Modal {
	private activeTab: SettingsTabId = "typesAndTags";
	/** Backs the general tab's Themes/Backup boxes — a stable instance (not recreated per render())
	 * so its transient state (typed-in theme name, import preview, …) survives re-renders. */
	private protectionsController: ProtectionsController;
	/** Deregisters this modal's re-render callback (see registerSeriesModalRefresh's doc comment
	 * in main.ts) — set in onOpen(), called in onClose(). */
	private unregisterCompanionRefresh: (() => void) | null = null;

	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private onChange: () => void,
	) {
		super(app);
		this.protectionsController = new ProtectionsController(app, plugin, () => this.render());
	}

	onOpen(): void {
		this.modalEl.addClass("sf-series-modal");
		this.titleEl.remove();
		this.unregisterCompanionRefresh = this.plugin.registerSeriesModalRefresh(() => this.render());
		this.render();
	}

	onClose(): void {
		this.unregisterCompanionRefresh?.();
		this.unregisterCompanionRefresh = null;
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-series-modal");

		const tabsEl = contentEl.createDiv({ cls: "sf-series-modal-tabs" });
		for (const tab of SETTINGS_TABS) {
			const tabEl = tabsEl.createSpan({
				cls: `sf-series-modal-tab${tab.id === this.activeTab ? " is-active" : ""}`,
				text: tab.label,
				attr: { role: "tab", tabindex: "0", "aria-selected": String(tab.id === this.activeTab) },
			});
			const selectTab = () => {
				this.activeTab = tab.id;
				this.render();
			};
			tabEl.addEventListener("click", selectTab);
			makeAccessibleActivatable(tabEl, selectTab);
		}

		const body = contentEl.createDiv({ cls: "sf-series-modal-tab-body" });
		switch (this.activeTab) {
			case "typesAndTags":
				this.renderTypesAndTagsTab(body);
				break;
			case "general":
				this.renderGeneralTab(body);
				break;
			case "formatting":
				this.renderFormattingTab(body);
				break;
			case "obsidianElements":
				this.renderObsidianElementsTab(body);
				break;
			case "importExport":
				this.renderImportExportTab(body);
				break;
			case "backup":
				this.renderBackupTab(body);
				break;
		}
	}

	/** Codex/tag management plus titleForge — the title & series generator. */
	private renderTypesAndTagsTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;

		new Setting(contentEl)
			.setName("Tags & Codex types")
			.setDesc("Manage Codex entry types, chapter tags, novel tags, and the icons they draw from.")
			.addButton((btn) =>
				btn.setButtonText("Open").onClick(() => new TagRegistryModal(this.app, () => this.render()).open()),
			);

		new Setting(contentEl)
			.setName("titleForge")
			.setDesc("Title & series generator settings — nine traditions, hand-editable word lists.")
			.addButton((btn) =>
				btn.setButtonText("Open").onClick(() => new TitleForgeSettingsModal(this.app, plugin.titleForge).open()),
			);
	}

	/**
	 * Everything that doesn't belong to types/tags/titles, formatting, or Obsidian's own chrome —
	 * plus the Themes/import-export box formerly behind the "Protections" button (ProtectionsModal),
	 * now rendered inline via the shared ProtectionsController, only when formatForge isn't the live
	 * companion (formatForge owns formatting themes while it's connected). The Backup box (also
	 * formerly on "Protections") has its own tab now — see renderBackupTab(). Series/chapter
	 * numbering style (see ../numberingStyle.ts) sits in its own boundary box at the top.
	 */
	private renderGeneralTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.getSettings();

		const numberingGroup = new SettingGroup(contentEl);
		numberingGroup.addSetting((setting) => {
			setting.setName("series numbering").addDropdown((dd) =>
				dd
					.addOptions(NUMBERING_STYLE_OPTIONS)
					.setValue(settings.seriesNumberingStyle)
					.onChange((value) => {
						void plugin.updateSetting("seriesNumberingStyle", value as NumberingStyle).then(() => {
							plugin.refreshStoryForgeViews();
							plugin.refreshSeriesOverviewView();
							plugin.refreshNovelOverviewView();
						});
					}),
			);
		});
		numberingGroup.addSetting((setting) => {
			setting.setName("chapter numbering").addDropdown((dd) =>
				dd
					.addOptions(NUMBERING_STYLE_OPTIONS)
					.setValue(settings.chapterNumberingStyle)
					.onChange((value) => {
						void plugin.updateSetting("chapterNumberingStyle", value as NumberingStyle).then(() => {
							plugin.refreshStoryForgeViews();
							plugin.refreshNovelOverviewView();
							refreshTabTitles(this.app, value as NumberingStyle);
						});
					}),
			);
		});

		renderCyclingGuideCard(this.app, plugin, contentEl, settings, true);

		const nameSuggestionsGroup = new SettingGroup(contentEl);
		nameSuggestionsGroup.setHeading("context panel");
		nameSuggestionsGroup.addSetting((setting) => {
			setting
				.setName("suggest unlisted, or unknown, names")
				.setDesc("list names found in the chapter which aren't in the codex")
				.addToggle((toggle) =>
					toggle
						.setValue(settings.recommendIncludeUnknownNames)
						.onChange((value) => void plugin.updateSetting("recommendIncludeUnknownNames", value)),
				);
		});

		const companionState = formatCompanionState(
			plugin.getFormatCompanion(),
			plugin.api?.formatting?.isCompanionActive() === true,
			this.app,
		);

		if (companionState !== "connected") {
			const themesGroup = new SettingGroup(contentEl);
			this.protectionsController.renderThemesSection(themesGroup.listEl, companionState);
		}
	}

	/**
	 * Two boxes, top to bottom: Palette, then Text styling + storyForge interface together. The
	 * palette box renders identically regardless of whether formatForge is installed — those fields
	 * live in storyForge's own settings either way (formatForge just proxies reads/writes through
	 * the companion API to these same fields when linked), so there's a single live copy, not two.
	 * Text styling / storyForge interface open formatForge's own modals directly (via the companion
	 * bridge, not Obsidian's Settings window) when formatForge is active, falling back to
	 * storyForge's own local modals when it isn't. Formatting themes (no local storyForge
	 * equivalent) lives in the import & export settings tab instead — see renderImportExportTab().
	 */
	private renderFormattingTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.getSettings();
		const companionActive = plugin.isFormatCompanionActive();

		const paletteGroup = new SettingGroup(contentEl);
		const paletteOptions = Object.fromEntries(PALETTE_NAMES.map((name) => [name, name]));
		paletteGroup.addSetting((setting) => {
			setting
				.setName("colour palette")
				.setDesc("palette used when picking colours for storyforge ui elements")
				.addDropdown((dd) =>
					dd
						.addOptions(paletteOptions)
						.setValue(settings.colorPaletteName)
						.onChange(async (name) => {
							await plugin.updateSetting("colorPaletteName", name as typeof settings.colorPaletteName);
							if (isPresetPaletteName(name)) {
								const appearance = document.body.classList.contains("theme-dark") ? "dark" : "light";
								await plugin.updateSetting(
									"colorPaletteVariant",
									defaultVariantName(COLOR_PALETTES[name], appearance),
								);
							}
							this.render();
						}),
				);
		});

		const selectedName = settings.colorPaletteName;
		if (isPresetPaletteName(selectedName) && COLOR_PALETTES[selectedName].length > 1) {
			const variantOptions = Object.fromEntries(COLOR_PALETTES[selectedName].map((v) => [v.name, v.name]));
			paletteGroup.addSetting((setting) => {
				setting
					.setName("palette variant")
					.setDesc("named variant of the selected palette")
					.addDropdown((dd) =>
						dd
							.addOptions(variantOptions)
							.setValue(settings.colorPaletteVariant)
							.onChange((value) => {
								void plugin.updateSetting("colorPaletteVariant", value);
								this.render();
							}),
					);
			});
		}

		// Live swatch preview of whatever's currently selected — see renderPaletteSwatchPreview().
		const appearance: PaletteMode = isPresetPaletteName(selectedName)
			? (COLOR_PALETTES[selectedName].find((v) => v.name === settings.colorPaletteVariant)?.appearance ??
				COLOR_PALETTES[selectedName][0].appearance)
			: document.body.classList.contains("theme-dark")
				? "dark"
				: "light";
		const activeColors = resolvePaletteColors(selectedName, settings.colorPaletteVariant, settings.customPaletteColors);
		this.renderPaletteSwatchPreview(paletteGroup.listEl, activeColors, appearance);

		if (selectedName === "Custom") {
			settings.customPaletteColors.forEach((color, i) => {
				paletteGroup.addSetting((setting) => {
					setting.setName(`custom colour ${i + 1} name`).addText((text) =>
						text.setPlaceholder("Name").setValue(color.name).onChange((value) => {
							const colors = settings.customPaletteColors.map((c) => ({ ...c }));
							colors[i] = { ...colors[i], name: value };
							void plugin.updateSetting("customPaletteColors", colors);
						}),
					);
				});
				paletteGroup.addSetting((setting) => {
					setting.setName(`custom colour ${i + 1}`).addColorPicker((picker) =>
						picker.setValue(color.hex).onChange((value) => {
							const colors = settings.customPaletteColors.map((c) => ({ ...c }));
							colors[i] = { ...colors[i], hex: value };
							void plugin.updateSetting("customPaletteColors", colors);
							this.render();
						}),
					);
				});
			});
		}

		const stylingGroup = new SettingGroup(contentEl);
		stylingGroup.addSetting((setting) => {
			setting.setName("text styling").setDesc("editor body text and heading font and colour options");
			this.renderHoverIcon(setting, ICON_TEXT_INPUT_DUOTONE, "Open text styling", () =>
				companionActive ? plugin.openFormatForgeTextStyleModal() : new TextStyleModal(this.app, plugin).open(),
			);
		});
		stylingGroup.addSetting((setting) => {
			setting.setName("storyforge interface").setDesc("interface and interface text colour, size, and font options");
			this.renderHoverIcon(setting, ICON_ELEMENT2_FILLED, "Open storyForge interface", () =>
				companionActive ? plugin.openFormatForgeInterfaceModal() : new UiFormattingModal(this.app, plugin).open(),
			);
		});
	}

	/**
	 * Swatch preview of the currently selected palette. The panel's own border (4px, "centred on
	 * line" — i.e. a plain CSS border, which is inherently centred on the box edge) is the resolved
	 * foreground colour; the panel's background is the resolved background colour. Every other
	 * colour in the palette gets its own square patch inside the panel, including the foreground
	 * colour (given its own patch in addition to being used for the border) — the background colour
	 * is the only one that doesn't, since it's already the panel's own fill.
	 */
	private renderPaletteSwatchPreview(container: HTMLElement, colors: PaletteColor[], appearance: PaletteMode): void {
		const resolved = resolveForegroundBackground(colors, appearance);
		if (!resolved) return;
		const { foreground, background } = resolved;

		const panel = container.createDiv({ cls: "sf-palette-swatch-panel" });
		panel.setCssStyles({ borderColor: foreground.hex, backgroundColor: background.hex });

		const backgroundIndex = colors.indexOf(background);
		colors.forEach((color, i) => {
			if (i === backgroundIndex) return;
			const swatch = panel.createDiv({
				cls: "sf-palette-swatch sf-palette-swatch-preview",
				attr: { "aria-label": color.name, title: color.name },
			});
			swatch.setCssStyles({ backgroundColor: color.hex });
		});

		// A real element, not a margin: the panel is the group's last child, so a plain
		// margin-bottom collapses through the (border/padding-less) listEl and disappears instead
		// of showing as a gap above the boundary box's own bottom edge.
		container.createDiv({ cls: "sf-palette-swatch-panel-spacer" });
	}

	/**
	 * Plain hover-highlight icon (matching .sf-modal-add-book's treatment elsewhere in this file)
	 * as a Setting row's control, in place of a button — the shared treatment every icon-as-action
	 * row in this modal uses, across every tab.
	 */
	private renderHoverIcon(setting: Setting, icon: string, label: string, onClick: () => void): void {
		const iconEl = setting.controlEl.createSpan({
			cls: "sf-series-modal-settings-icon",
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(iconEl, icon);
		iconEl.addEventListener("click", onClick);
		makeAccessibleActivatable(iconEl, onClick);
	}

	/** Obsidian's own chrome (settings-window icon, hiding Obsidian UI, tools panel) plus a second
	 * box of storyForge's panel-reopen shortcuts. Every row here already completes its action or
	 * opens its modal directly; none of these ever go through Obsidian's own Settings window
	 * except the substitute cog on its own line below, which opens it deliberately. */
	private renderObsidianElementsTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const settings = plugin.getSettings();

		const hideUiGroup = new SettingGroup(contentEl);
		hideUiGroup.addSetting((setting) => {
			setting.setName("hide, or show, obsidian's interface elements");
			this.renderHoverIcon(setting, ICON_EYE_DUOTONE, "Choose which Obsidian UI chrome to hide", () =>
				new HideUiModal(this.app, plugin).open(),
			);
		});

		const obsidianSettingsGroup = new SettingGroup(contentEl);

		obsidianSettingsGroup.addSetting((setting) => {
			setting
				.setName("hide obsidian's standard settings icon")
				.addToggle((toggle) =>
					toggle.setValue(settings.hideObsidianSettingsIcon).onChange((value) => {
						void plugin.updateSetting("hideObsidianSettingsIcon", value).then(() => plugin.applyVisibilityStyles());
						this.render();
					}),
				);
		});

		// Substitute way in once the native icon above is hidden — only shown while it's hidden,
		// since otherwise the native icon is right there already. A plain hover-highlight icon
		// (matching .sf-modal-add-book's treatment elsewhere in this file) rather than a button —
		// addExtraButton()/addButton() both read as buttons here, which isn't the affordance wanted.
		if (settings.hideObsidianSettingsIcon) {
			obsidianSettingsGroup.addSetting((setting) => {
				setting.setName("access obsidian's setting window");
				this.renderHoverIcon(setting, ICON_SETTINGS_ALT, "Open Obsidian's settings window", () =>
					plugin.openObsidianSettings(),
				);
			});
		}

		obsidianSettingsGroup.addSetting((setting) => {
			setting
				.setName("hide ribbon and use tools panel")
				.addToggle((toggle) =>
					toggle.setValue(settings.useToolsPanel).onChange(async (value) => {
						await plugin.updateSetting("useToolsPanel", value);
						plugin.applyVisibilityStyles();
						if (value) {
							void plugin.activateToolsView();
						} else {
							this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
						}
						this.render();
					}),
				);
		});

		// Only meaningful once the Tools panel is actually on — hides that view's own tab icon.
		if (settings.useToolsPanel) {
			obsidianSettingsGroup.addSetting((setting) => {
				setting
					.setName("hide the tools panel")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideToolsPanelIcon).onChange((value) => {
							void plugin.updateSetting("hideToolsPanelIcon", value).then(() => plugin.applyVisibilityStyles());
						}),
					);
			});
		}

		const reopenPanelsGroup = new SettingGroup(contentEl);
		reopenPanelsGroup.setHeading("reopen closed storyforge panels");

		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("story library panel")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateView()));
		});

		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("storytelling panel")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateStorytellingView()));
		});

		reopenPanelsGroup.addSetting((setting) => {
			setting
				.setName("tools panel")
				.addButton((btn) => btn.setButtonText("reopen").onClick(() => void plugin.activateToolsView()));
		});

		this.protectionsController.renderWelcomeNoteSection(contentEl);
	}

	/** "Formatting themes" — moved out of the formatting tab so it lives alongside the rest of
	 * storyForge's own import/export surfaces. Same install-nudge fallback as before when
	 * formatForge isn't the live companion (theme export/import is a formatForge-specific concept
	 * with no local storyForge equivalent). */
	private renderImportExportTab(contentEl: HTMLElement): void {
		const plugin = this.plugin;
		const companionActive = plugin.isFormatCompanionActive();

		if (companionActive) {
			const themesGroup = new SettingGroup(contentEl);
			themesGroup.addSetting((setting) => {
				setting.setName("formatting themes").setDesc("save, preview, and apply named themes, or share formatting as json");
				this.renderHoverIcon(setting, ICON_FLOPPY_DUOTONE, "Open formatting themes", () =>
					plugin.openFormatForgeThemesModal(),
				);
			});
		} else {
			new Setting(contentEl)
				.setName("formatting themes (formatforge)")
				.setDesc("install and enable formatforge to save, preview, and apply named themes, or share formatting as json");
		}
	}

	/** Backup box formerly on the general tab (and, before that, behind the "Protections" button) —
	 * now its own tab, after import & export settings. */
	private renderBackupTab(contentEl: HTMLElement): void {
		const companionState = formatCompanionState(
			this.plugin.getFormatCompanion(),
			this.plugin.api?.formatting?.isCompanionActive() === true,
			this.app,
		);
		this.protectionsController.renderBackupSection(contentEl, companionState);
	}
}
