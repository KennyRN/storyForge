import { App, Modal, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type {
	CodexFolderIndicatorThickness,
	CyclingGuideInterval,
	EditorScrollbarThickness,
	HeadingDividerThickness,
	StoryForgePluginSettings,
} from "../main";
import { ConvertToSeriesModal } from "./ConvertToSeriesModal";
import { bindColorSwatchButton, bindExclusivePair, persistAndRestyle, renderCustomFontCard, renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";

const EDITOR_SCROLLBAR_THICKNESS_ORDER: EditorScrollbarThickness[] = ["thin", "medium", "thick"];
const EDITOR_SCROLLBAR_THICKNESS_LABELS = ["Thin", "Medium", "Thick"];

/** Shared shape for size + font + colour (+ optional muted) item rows across Library / Unplaced / Codex. */
interface ItemsStyleConfig {
	heading?: string;
	sizeName: string;
	sizeDesc: string;
	sizeKey: keyof StoryForgePluginSettings;
	overrideFontKey: keyof StoryForgePluginSettings;
	fontFamilyKey: keyof StoryForgePluginSettings;
	fontWeightKey: keyof StoryForgePluginSettings;
	colorName: string;
	colorDesc: string;
	colorKey: keyof StoryForgePluginSettings;
	/** When set, adds a muted override toggle after the colour swatch. */
	mutedKey?: keyof StoryForgePluginSettings;
	restyle: () => void;
	/** Extra rows appended after colour (and muted, if any). */
	afterColor?: (group: SettingGroup, colourSetting: Setting) => void;
}

export class UiFormattingModal extends Modal {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-ui-formatting-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-ui-formatting-modal");

		const settings = this.plugin.getSettings();

		const tabs: StyleModalTab[] = [
			{
				id: "guides",
				label: "Guides",
				render: (body) => {
					this.renderHighlightGroup(body, settings);
					this.renderCyclingGuideCard(body, settings);
				},
			},
			{
				id: "library",
				label: "Library",
				render: (body) => {
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "Series title",
						sizeKey: "librarySeriesTitleFontSize",
						overrideFontKey: "librarySeriesTitleOverrideFont",
						fontFamilyKey: "librarySeriesTitleFontFamily",
						fontWeightKey: "librarySeriesTitleFontWeight",
						colorKey: "librarySeriesTitleColor",
						smallCapsKey: "librarySeriesTitleSmallCaps",
					});
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "Book title",
						sizeKey: "libraryBookTitleFontSize",
						overrideFontKey: "libraryBookTitleOverrideFont",
						fontFamilyKey: "libraryBookTitleFontFamily",
						fontWeightKey: "libraryBookTitleFontWeight",
						colorKey: "libraryBookTitleColor",
						smallCapsKey: "libraryBookTitleSmallCaps",
					});
					this.renderSubtitleStyleGroup(body, settings);
					this.renderItemsStyleGroup(body, settings, {
						heading: "Books & chapters",
						sizeName: "Library items",
						sizeDesc: "Text size of books and chapters in the Library list, from 0.5em to 1.5em.",
						sizeKey: "libraryItemsFontSize",
						overrideFontKey: "libraryItemsOverrideFont",
						fontFamilyKey: "libraryItemsFontFamily",
						fontWeightKey: "libraryItemsFontWeight",
						colorName: "Library items colour",
						colorDesc: "Normal text colour of books and chapters in the Library list (not the header titles).",
						colorKey: "libraryItemsColor",
						mutedKey: "libraryItemsMuted",
						restyle: () => this.plugin.applyLibraryHeaderStyles(),
					});
					this.renderPanelHighlightRows(body, settings, {
						colorKey: "highlightColor",
						textColorKey: "highlightTextColor",
						colorName: "Highlight colour for library items",
						colorDesc: "The colour used for the active chapter/item highlight.",
						textColorName: "Highlight text colour for library items",
						textColorDesc: "colour used for the active chapter/item highlight text",
					});
					new SettingGroup(body).addSetting((setting) => {
						setting
							.setName("Divider below title")
							.setDesc("Adds a border below the series/book title, matching the border between storyForge's panes.")
							.addToggle((toggle) =>
								toggle
									.setValue(settings.libraryHeaderDividerBelow)
									.onChange((value) =>
										persistAndRestyle(this.plugin, "libraryHeaderDividerBelow", value, () => this.plugin.applyLibraryHeaderStyles()),
									),
							);
					});
					this.renderSeriesPaneContent(body, settings);
				},
			},
			{
				id: "unplaced",
				label: "Unplaced",
				render: (body) => {
					this.renderUnplacedPanelContent(body, settings);
				},
			},
			{
				id: "codex",
				label: "Codex",
				render: (body) => {
					this.renderCodexPanelContent(body, settings);
				},
			},
			{
				id: "editor",
				label: "Editor",
				render: (body) => {
					this.renderEditorScrollbarGroup(body, settings);
				},
			},
		];

		renderTabbedBody(contentEl, tabs);
	}

	private renderEditorScrollbarGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group.setHeading("Scrollbar");

		group.addSetting((setting) => {
			setting
				.setName("Scrollbar")
				.setDesc("Colour of the scrollbar thumb in the manuscript editor.")
				.addButton((button) => {
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.editorScrollbarThumbColor, (hex) => {
						persistAndRestyle(this.plugin, "editorScrollbarThumbColor", hex, () => this.plugin.applyEditorScrollbarStyles());
					});
				});
		});

		group.addSetting((setting) => {
			setting
				.setName("Scrollbar track")
				.setDesc("Colour of the scrollbar rail behind the thumb.")
				.addButton((button) => {
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.editorScrollbarTrackColor, (hex) => {
						persistAndRestyle(this.plugin, "editorScrollbarTrackColor", hex, () => this.plugin.applyEditorScrollbarStyles());
					});
				});
		});

		const thicknessIdx = Math.max(0, EDITOR_SCROLLBAR_THICKNESS_ORDER.indexOf(settings.editorScrollbarThickness));
		group.addSetting((setting) => {
			setting
				.setName("Thickness")
				.setDesc(`${EDITOR_SCROLLBAR_THICKNESS_LABELS[thicknessIdx]} — thin · medium · thick. Hover the editor to see the scrollbar.`)
				.addSlider((slider) =>
					slider
						.setLimits(0, 2, 1)
						.setValue(thicknessIdx)
						.onChange((value) => {
							const idx = Math.round(value);
							const thickness = EDITOR_SCROLLBAR_THICKNESS_ORDER[idx] ?? "thick";
							setting.setDesc(
								`${EDITOR_SCROLLBAR_THICKNESS_LABELS[idx] ?? "Thick"} — thin · medium · thick. Hover the editor to see the scrollbar.`,
							);
							persistAndRestyle(this.plugin, "editorScrollbarThickness", thickness, () => this.plugin.applyEditorScrollbarStyles());
						}),
				);
		});
	}

	private renderHeaderStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			sizeKey: "unplacedFontSize" | "codexFontSize";
			overrideFontKey: "unplacedOverrideFont" | "codexOverrideFont";
			fontFamilyKey: "unplacedFontFamily" | "codexFontFamily";
			fontWeightKey: "unplacedFontWeight" | "codexFontWeight";
			colorKey: "unplacedColor" | "codexColor";
			mutedKey: "unplacedMuted" | "codexMuted";
			smallCapsKey: "unplacedSmallCaps" | "codexSmallCaps";
			useHeaderColorForAllKey: "unplacedUseHeaderColorForAll" | "codexUseHeaderColorForAll";
			restyle: () => void;
		},
	): ToggleComponent {
		const group = new SettingGroup(body);
		let useHeaderColorForAllToggle!: ToggleComponent;
		group.addSetting((setting) => {
			setting
				.setName("Header size")
				.setDesc("size of header label and icon")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings[config.sizeKey])
						.onChange((value) => persistAndRestyle(this.plugin, config.sizeKey, value, config.restyle)),
				);
		});
		renderCustomFontCard({
			plugin: this.plugin,
			settings,
			group,
			overrideFontKey: config.overrideFontKey,
			fontFamilyKey: config.fontFamilyKey,
			fontWeightKey: config.fontWeightKey,
			restyle: config.restyle,
		});
		group
			.addSetting((setting) => {
				setting
					.setName("Header colour")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey], (hex) => {
							void this.plugin.updateSetting(config.colorKey, hex).then(() => config.restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Use header colour for all colour options")
					.setDesc("Use the header colour everywhere below instead of picking separate colours.")
					.addToggle((toggle) => {
						useHeaderColorForAllToggle = toggle;
						toggle.setValue(settings[config.useHeaderColorForAllKey]);
					});
			})
			.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc("override header colour with muted colour")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.mutedKey]).onChange((value) => persistAndRestyle(this.plugin, config.mutedKey, value, config.restyle)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey]).onChange((value) => persistAndRestyle(this.plugin, config.smallCapsKey, value, config.restyle)),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		return useHeaderColorForAllToggle;
	}

	/** Size → font → colour → optional muted → optional extras. Returns colour setting for "use header colour" hiding. */
	private renderItemsStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: ItemsStyleConfig,
	): { group: SettingGroup; colourSetting: Setting } {
		const group = new SettingGroup(body);
		if (config.heading) group.setHeading(config.heading);
		group.addSetting((setting) => {
			setting
				.setName(config.sizeName)
				.setDesc(config.sizeDesc)
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings[config.sizeKey] as number)
						.onChange((value) => persistAndRestyle(this.plugin, config.sizeKey, value, config.restyle)),
				);
		});
		renderCustomFontCard({
			plugin: this.plugin,
			settings,
			group,
			overrideFontKey: config.overrideFontKey,
			fontFamilyKey: config.fontFamilyKey,
			fontWeightKey: config.fontWeightKey,
			restyle: config.restyle,
		});
		let colourSetting!: Setting;
		group.addSetting((setting) => {
			colourSetting = setting;
			setting
				.setName(config.colorName)
				.setDesc(config.colorDesc)
				.addButton((button) =>
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey] as string, (hex) => {
						void this.plugin.updateSetting(config.colorKey, hex).then(() => config.restyle());
					}),
				);
		});
		if (config.mutedKey) {
			const mutedKey = config.mutedKey;
			group.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings[mutedKey] as boolean)
							.onChange((value) => persistAndRestyle(this.plugin, mutedKey, value, config.restyle)),
					);
			});
		}
		config.afterColor?.(group, colourSetting);
		return { group, colourSetting };
	}

	private renderPanelHighlightRows(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			colorKey: keyof StoryForgePluginSettings;
			textColorKey: keyof StoryForgePluginSettings;
			colorName: string;
			colorDesc: string;
			textColorName: string;
			textColorDesc?: string;
		},
	): Setting {
		const group = new SettingGroup(body);
		let colourSetting!: Setting;
		group
			.addSetting((setting) => {
				colourSetting = setting;
				const row = setting.setName(config.colorName).setDesc(config.colorDesc);
				row.addButton((button) =>
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey] as string, (hex) => {
						void this.plugin.updateSetting(config.colorKey, hex).then(() => this.plugin.applyHighlightStyle());
					}),
				);
			})
			.addSetting((setting) => {
				const row = setting.setName(config.textColorName);
				if (config.textColorDesc) row.setDesc(config.textColorDesc);
				row.addButton((button) =>
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.textColorKey] as string, (hex) => {
						void this.plugin.updateSetting(config.textColorKey, hex).then(() => this.plugin.applyHighlightStyle());
					}),
				);
			});
		return colourSetting;
	}

	private renderHighlightGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const highlightGroup = new SettingGroup(body);
		highlightGroup.addSetting((setting) => {
			setting
				.setName("Highlight active chapter/item")
				.setDesc("highlights the currently selected chapter, or item, in the storyForge panel")
				.addToggle((toggle) =>
					toggle
						.setValue(settings.highlightActiveChapter)
						.onChange((value) => persistAndRestyle(this.plugin, "highlightActiveChapter", value, () => this.plugin.refreshStoryForgeViews())),
				);
		});
	}

	private renderCyclingGuideCard(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const cyclingGuideGroup = new SettingGroup(body);

		let cyclingGuideToggle!: ToggleComponent;
		cyclingGuideGroup.addSetting((setting) => {
			setting
				.setName("Cycling guide")
				.setDesc("draws a floating guideline")
				.addToggle((toggle) => {
					cyclingGuideToggle = toggle;
					toggle.setValue(settings.cyclingGuideEnabled);
				});
		});

		let cyclingGuideThicknessSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideThicknessSetting = setting;
			setting.setName("Thickness").addDropdown((dropdown) =>
				dropdown
					.addOption("thin", "Thin")
					.addOption("medium", "Medium")
					.addOption("thick", "Thick")
					.addOption("extra-thick", "Extra thick")
					.setValue(settings.cyclingGuideThickness)
					.onChange((value) =>
						persistAndRestyle(this.plugin, "cyclingGuideThickness", value as HeadingDividerThickness, () => this.plugin.applyCyclingGuideStyle()),
					),
			);
		});

		let cyclingGuideFlagSizeSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideFlagSizeSetting = setting;
			setting.setName("Flag size").addDropdown((dropdown) =>
				dropdown
					.addOption("small", "Small")
					.addOption("medium", "Medium")
					.addOption("large", "Large")
					.setValue(settings.cyclingGuideFlagSize)
					.onChange((value) =>
						persistAndRestyle(this.plugin, "cyclingGuideFlagSize", value as "small" | "medium" | "large", () => this.plugin.applyCyclingGuideStyle()),
					),
			);
		});

		let cyclingGuideRoundedLinesSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideRoundedLinesSetting = setting;
			setting
				.setName("Rounded lines")
				.setDesc("Rounds the corners of the divider line, except the bottom-right where the flag sits.")
				.addToggle((toggle) =>
					toggle
						.setValue(settings.cyclingGuideRoundedLines)
						.onChange((value) => persistAndRestyle(this.plugin, "cyclingGuideRoundedLines", value, () => this.plugin.applyCyclingGuideStyle())),
				);
		});

		let cyclingGuideIntervalSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideIntervalSetting = setting;
			setting.setName("Cycle length").addDropdown((dropdown) =>
				dropdown
					.addOption("short", "Short")
					.addOption("medium", "Medium")
					.addOption("large", "Long")
					.setValue(settings.cyclingGuideInterval)
					.onChange((value) =>
						persistAndRestyle(this.plugin, "cyclingGuideInterval", value as CyclingGuideInterval, () => this.plugin.rebuildCyclingGuideExtension()),
					),
			);
		});

		let cyclingGuideColorSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideColorSetting = setting;
			setting.setName("Line colour").addButton((button) =>
				bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.cyclingGuideColor, (hex) => {
					void this.plugin.updateSetting("cyclingGuideColor", hex).then(() => this.plugin.applyCyclingGuideStyle());
				}),
			);
		});

		const applyCyclingGuideVisibility = (hidden: boolean) => {
			cyclingGuideThicknessSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			cyclingGuideFlagSizeSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			cyclingGuideRoundedLinesSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			cyclingGuideIntervalSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			cyclingGuideColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		cyclingGuideToggle.onChange((value) => this.applyCyclingGuideToggle(value, applyCyclingGuideVisibility));
		applyCyclingGuideVisibility(!cyclingGuideToggle.getValue());
	}

	private applyCyclingGuideToggle(value: boolean, applyCyclingGuideVisibility: (hidden: boolean) => void): void {
		void this.plugin.updateSetting("cyclingGuideEnabled", value).then(() => {
			this.plugin.setCyclingGuideEnabled(value);
			applyCyclingGuideVisibility(!value);
		});
	}

	private renderTitleStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			labelPrefix: string;
			sizeKey: "librarySeriesTitleFontSize" | "libraryBookTitleFontSize";
			overrideFontKey: "librarySeriesTitleOverrideFont" | "libraryBookTitleOverrideFont";
			fontFamilyKey: "librarySeriesTitleFontFamily" | "libraryBookTitleFontFamily";
			fontWeightKey: "librarySeriesTitleFontWeight" | "libraryBookTitleFontWeight";
			colorKey: "librarySeriesTitleColor" | "libraryBookTitleColor";
			smallCapsKey: "librarySeriesTitleSmallCaps" | "libraryBookTitleSmallCaps";
		},
	): void {
		const group = new SettingGroup(body);
		const restyle = () => this.plugin.applyLibraryHeaderStyles();
		group.addSetting((setting) => {
			setting
				.setName(`${config.labelPrefix} size`)
				.setDesc("Text size, from 0.5em to 2em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 2, 0.1)
						.setValue(settings[config.sizeKey])
						.onChange((value) => persistAndRestyle(this.plugin, config.sizeKey, value, restyle)),
				);
		});
		renderCustomFontCard({
			plugin: this.plugin,
			settings,
			group,
			overrideFontKey: config.overrideFontKey,
			fontFamilyKey: config.fontFamilyKey,
			fontWeightKey: config.fontWeightKey,
			restyle,
		});
		group
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} colour`)
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey], (hex) => {
							void this.plugin.updateSetting(config.colorKey, hex).then(() => restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} small caps`)
					.addToggle((toggle) =>
						toggle
							.setValue(settings[config.smallCapsKey])
							.onChange((value) => persistAndRestyle(this.plugin, config.smallCapsKey, value, restyle)),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	private renderSubtitleStyleGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		const restyle = () => this.plugin.applyLibraryHeaderStyles();
		group.addSetting((setting) => {
			setting
				.setName("Subtitle size")
				.setDesc("Text size, from 0.5em to 2em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 2, 0.1)
						.setValue(settings.libraryBookSubtitleFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "libraryBookSubtitleFontSize", value, restyle)),
				);
		});
		renderCustomFontCard({
			plugin: this.plugin,
			settings,
			group,
			overrideFontKey: "libraryBookSubtitleOverrideFont",
			fontFamilyKey: "libraryBookSubtitleFontFamily",
			fontWeightKey: "libraryBookSubtitleFontWeight",
			restyle,
		});
		group.addSetting((setting) => {
			setting
				.setName("Subtitle small caps")
				.addToggle((toggle) =>
					toggle
						.setValue(settings.libraryBookSubtitleSmallCaps)
						.onChange((value) => persistAndRestyle(this.plugin, "libraryBookSubtitleSmallCaps", value, restyle)),
				);
			setting.nameEl.addClass("sf-small-caps-label");
		});
	}

	private renderUnplacedPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const headerRestyle = () => {
			this.plugin.applyHeaderStyles();
			this.plugin.applyHighlightStyle();
		};
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "unplacedFontSize",
			overrideFontKey: "unplacedOverrideFont",
			fontFamilyKey: "unplacedFontFamily",
			fontWeightKey: "unplacedFontWeight",
			colorKey: "unplacedColor",
			mutedKey: "unplacedMuted",
			smallCapsKey: "unplacedSmallCaps",
			useHeaderColorForAllKey: "unplacedUseHeaderColorForAll",
			restyle: headerRestyle,
		});

		const { colourSetting: itemsColourSetting } = this.renderItemsStyleGroup(body, settings, {
			sizeName: "Unplaced items",
			sizeDesc: "Text size of the items in the Unplaced pane, from 0.5em to 1.5em.",
			sizeKey: "unplacedItemsFontSize",
			overrideFontKey: "unplacedItemsOverrideFont",
			fontFamilyKey: "unplacedItemsFontFamily",
			fontWeightKey: "unplacedItemsFontWeight",
			colorName: "Unplaced items colour",
			colorDesc: "colour of unplaced items",
			colorKey: "unplacedItemsColor",
			mutedKey: "unplacedItemsMuted",
			restyle: () => this.plugin.applyHeaderStyles(),
		});

		const highlightColourSetting = this.renderPanelHighlightRows(body, settings, {
			colorKey: "unplacedHighlightColor",
			textColorKey: "unplacedHighlightTextColor",
			colorName: "Highlight colour",
			colorDesc: "highlights the currently selected chapter in the storyForge panel, only active if per panel highlighting is selected",
			textColorName: "Highlight text colour",
		});

		this.bindUseHeaderColorForAll(
			useHeaderColorToggle,
			"unplacedUseHeaderColorForAll",
			settings.unplacedUseHeaderColorForAll,
			[itemsColourSetting, highlightColourSetting],
			headerRestyle,
		);
	}

	private renderCodexPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const headerRestyle = () => {
			this.plugin.applyHeaderStyles();
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyCodexNoteLabelStyle();
			this.plugin.applyHighlightStyle();
		};
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "codexFontSize",
			overrideFontKey: "codexOverrideFont",
			fontFamilyKey: "codexFontFamily",
			fontWeightKey: "codexFontWeight",
			colorKey: "codexColor",
			mutedKey: "codexMuted",
			smallCapsKey: "codexSmallCaps",
			useHeaderColorForAllKey: "codexUseHeaderColorForAll",
			restyle: headerRestyle,
		});

		const { colourSetting: folderColourSetting } = this.renderItemsStyleGroup(body, settings, {
			sizeName: "Folder size",
			sizeDesc: "Font size of the codex folder names and chevrons, from 0.5em to 1.5em.",
			sizeKey: "codexFolderFontSize",
			overrideFontKey: "codexFolderOverrideFont",
			fontFamilyKey: "codexFolderFontFamily",
			fontWeightKey: "codexFolderFontWeight",
			colorName: "Folder colour",
			colorDesc: "Colour of the codex folder names and chevrons.",
			colorKey: "codexFolderColor",
			restyle: () => this.plugin.applyCodexFolderStyle(),
			afterColor: (group) => {
				group.addSetting((setting) => {
					setting
						.setName("Folder indicator line")
						.setDesc("Vertical guide line showing what's nested inside a folder, coloured to match the folder colour.")
						.addDropdown((dropdown) =>
							dropdown
								.addOption("none", "None")
								.addOption("thin", "Thin")
								.addOption("medium", "Medium")
								.addOption("thick", "Thick")
								.setValue(settings.codexFolderIndicatorThickness)
								.onChange((value) => this.applyCodexFolderIndicatorThickness(value as CodexFolderIndicatorThickness)),
						);
				});
			},
		});

		let defaultToggle!: ToggleComponent;
		let folderToggle!: ToggleComponent;
		let defaultColourToggleSetting!: Setting;
		let folderColourToggleSetting!: Setting;
		const { colourSetting: noteLabelColourSetting } = this.renderItemsStyleGroup(body, settings, {
			sizeName: "Codex note label size",
			sizeDesc: "Font size of the codex note (file) labels, from 0.5em to 1.5em.",
			sizeKey: "codexNoteLabelFontSize",
			overrideFontKey: "codexNoteLabelOverrideFont",
			fontFamilyKey: "codexNoteLabelFontFamily",
			fontWeightKey: "codexNoteLabelFontWeight",
			colorName: "Codex note label colour",
			colorDesc: "Colour of the codex note (file) labels.",
			colorKey: "codexNoteLabelColor",
			restyle: () => this.plugin.applyCodexNoteLabelStyle(),
			afterColor: (group) => {
				group
					.addSetting((setting) => {
						defaultColourToggleSetting = setting;
						setting
							.setName("Use default colour for Codex note label")
							.setDesc("overrides the note colour and sets it the same as the body text")
							.addToggle((toggle) => {
								defaultToggle = toggle;
								toggle.setValue(settings.codexNoteLabelUseDefaultColor);
							});
					})
					.addSetting((setting) => {
						folderColourToggleSetting = setting;
						setting
							.setName("Use folder colour for Codex notes")
							.setDesc("overrides the note colour and sets it the same as the codex folder colour")
							.addToggle((toggle) => {
								folderToggle = toggle;
								toggle.setValue(settings.codexNoteLabelUseFolderColor);
							});
					});
			},
		});
		bindExclusivePair(
			defaultToggle,
			folderToggle,
			(value) => {
				void this.plugin.updateSetting("codexNoteLabelUseDefaultColor", value).then(() => this.plugin.applyCodexNoteLabelStyle());
			},
			(value) => {
				void this.plugin.updateSetting("codexNoteLabelUseFolderColor", value).then(() => this.plugin.applyCodexNoteLabelStyle());
			},
		);

		const codexHighlightColourSetting = this.renderPanelHighlightRows(body, settings, {
			colorKey: "codexHighlightColor",
			textColorKey: "codexHighlightTextColor",
			colorName: "Highlight colour",
			colorDesc: "highlights the currently selected note in the codex panel, only active if per panel highlighting is selected",
			textColorName: "Highlight text colour",
		});

		this.bindUseHeaderColorForAll(
			useHeaderColorToggle,
			"codexUseHeaderColorForAll",
			settings.codexUseHeaderColorForAll,
			[folderColourSetting, noteLabelColourSetting, defaultColourToggleSetting, folderColourToggleSetting, codexHighlightColourSetting],
			headerRestyle,
		);
	}

	private bindUseHeaderColorForAll(
		toggle: ToggleComponent,
		settingKey: "unplacedUseHeaderColorForAll" | "codexUseHeaderColorForAll",
		initialValue: boolean,
		colourSettings: Setting[],
		restyle: () => void,
	): void {
		const applyVisibility = (hidden: boolean) => {
			for (const setting of colourSettings) setting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		toggle.onChange((value) => {
			void this.plugin.updateSetting(settingKey, value).then(() => {
				applyVisibility(value);
				restyle();
			});
		});
		applyVisibility(initialValue);
	}

	private applyCodexFolderIndicatorThickness(value: CodexFolderIndicatorThickness): void {
		void this.plugin.updateSetting("codexFolderIndicatorThickness", value).then(() => {
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyHighlightStyle();
		});
	}

	private renderSeriesPaneContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const seriesGroup = new SettingGroup(body);
		seriesGroup.addSetting((setting) => {
			setting
				.setName("Hide series pane")
				.setDesc(
					"Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.hideSeriesPane)
						.onChange((value) => persistAndRestyle(this.plugin, "hideSeriesPane", value, () => this.plugin.refreshStoryForgeViews())),
				);
		});

		if (settings.hideSeriesPane) {
			new Setting(body)
				.setName("Convert to series")
				.setDesc("Turn this standalone book into the first book of a series — lets you add more books to it later.")
				.addButton((button) =>
					button
						.setButtonText("Convert to series")
						.setCta()
						.onClick(() => new ConvertToSeriesModal(this.app, this.plugin, () => this.render()).open()),
				);
		}
	}
}
