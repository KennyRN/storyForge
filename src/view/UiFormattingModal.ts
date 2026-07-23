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
import { bindColorSwatchButton, bindExclusivePair, bindFontWeightDropdown, persistAndRestyle, renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";

const EDITOR_SCROLLBAR_THICKNESS_ORDER: EditorScrollbarThickness[] = ["thin", "medium", "thick"];
const EDITOR_SCROLLBAR_THICKNESS_LABELS = ["Thin", "Medium", "Thick"];

export class UiFormattingModal extends Modal {
	private plugin: StoryForgePlugin;
	private selectedOtherHeadingLevel: 4 | 5 | 6 = 4;

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
						fontWeightKey: "librarySeriesTitleFontWeight",
						colorKey: "librarySeriesTitleColor",
						smallCapsKey: "librarySeriesTitleSmallCaps",
					});
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "Book title",
						sizeKey: "libraryBookTitleFontSize",
						fontWeightKey: "libraryBookTitleFontWeight",
						colorKey: "libraryBookTitleColor",
						smallCapsKey: "libraryBookTitleSmallCaps",
					});
					this.renderSubtitleStyleGroup(body, settings);
					this.renderLibraryItemsGroup(body, settings);
					this.renderLibraryHighlightRows(body, settings);
					new SettingGroup(body).addSetting((setting) => {
						setting
							.setName("Divider below title")
							.setDesc("Adds a border below the series/book title, matching the border between storyForge's panes.")
							.addToggle((toggle) =>
								toggle
									.setValue(settings.libraryHeaderDividerBelow)
									.onChange((value) => persistAndRestyle(this.plugin, "libraryHeaderDividerBelow", value, () => this.plugin.applyLibraryHeaderStyles())),
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
						.setDisplayFormat((value) => EDITOR_SCROLLBAR_THICKNESS_LABELS[Math.round(value)] ?? "Thick")
						.onChange((value) => {
							const idx = Math.round(value);
							const thickness = EDITOR_SCROLLBAR_THICKNESS_ORDER[idx] ?? "thick";
							setting.setDesc(
								`${EDITOR_SCROLLBAR_THICKNESS_LABELS[idx] ?? "Thick"} — thin · medium · thick. Hover the editor to see the scrollbar.`,
							);
							persistAndRestyle(this.plugin, "editorScrollbarThickness", thickness, () =>
								this.plugin.applyEditorScrollbarStyles(),
							);
						}),
				);
		});
	}

	private renderHeaderStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			sizeKey: "unplacedFontSize" | "codexFontSize";
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
		group
			.addSetting((setting) => {
				setting
					.setName("Header size")
					.setDesc("size of header label and icon")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings[config.sizeKey])
							.onChange((value) => persistAndRestyle(this.plugin, config.sizeKey, value, config.restyle)),
					);
			})
			.addSetting((setting) => {
				setting.setName("Header weight").setDesc("weight of header label");
				bindFontWeightDropdown(setting, settings[config.fontWeightKey], (value) => {
					void this.plugin.updateSetting(config.fontWeightKey, value).then(() => config.restyle());
				});
			})
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

	private renderHighlightGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const highlightGroup = new SettingGroup(body);
		highlightGroup.addSetting((setting) => {
			setting
				.setName("Highlight active chapter/item")
				.setDesc(
					"highlights the currently selected chapter, or item, in the storyForge panel",
				)
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
			fontWeightKey: "librarySeriesTitleFontWeight" | "libraryBookTitleFontWeight";
			colorKey: "librarySeriesTitleColor" | "libraryBookTitleColor";
			smallCapsKey: "librarySeriesTitleSmallCaps" | "libraryBookTitleSmallCaps";
		},
	): void {
		const group = new SettingGroup(body);
		group
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} size`)
					.setDesc("Text size, from 0.5em to 2em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 2, 0.25)
							.setValue(settings[config.sizeKey])
							.onChange((value) => persistAndRestyle(this.plugin, config.sizeKey, value, () => this.plugin.applyLibraryHeaderStyles())),
					);
			})
			.addSetting((setting) => {
				setting.setName(`${config.labelPrefix} weight`);
				bindFontWeightDropdown(setting, settings[config.fontWeightKey], (value) => {
					void this.plugin.updateSetting(config.fontWeightKey, value).then(() => this.plugin.applyLibraryHeaderStyles());
				});
			})
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} colour`)
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey], (hex) => {
							void this.plugin.updateSetting(config.colorKey, hex).then(() => this.plugin.applyLibraryHeaderStyles());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} small caps`)
					.addToggle((toggle) =>
						toggle
							.setValue(settings[config.smallCapsKey])
							.onChange((value) => persistAndRestyle(this.plugin, config.smallCapsKey, value, () => this.plugin.applyLibraryHeaderStyles())),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	private renderSubtitleStyleGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group
			.addSetting((setting) => {
				setting
					.setName("Subtitle size")
					.setDesc("Text size, from 0.5em to 2em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 2, 0.25)
							.setValue(settings.libraryBookSubtitleFontSize)
							.onChange((value) => persistAndRestyle(this.plugin, "libraryBookSubtitleFontSize", value, () => this.plugin.applyLibraryHeaderStyles())),
					);
			})
			.addSetting((setting) => {
				setting.setName("Subtitle weight");
				bindFontWeightDropdown(setting, settings.libraryBookSubtitleFontWeight, (value) => {
					void this.plugin.updateSetting("libraryBookSubtitleFontWeight", value).then(() => this.plugin.applyLibraryHeaderStyles());
				});
			})
			.addSetting((setting) => {
				setting
					.setName("Subtitle small caps")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.libraryBookSubtitleSmallCaps)
							.onChange((value) => persistAndRestyle(this.plugin, "libraryBookSubtitleSmallCaps", value, () => this.plugin.applyLibraryHeaderStyles())),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	private renderLibraryItemsGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group.setHeading("Books & chapters");
		group
			.addSetting((setting) => {
				setting
					.setName("Library items")
					.setDesc("Text size of books and chapters in the Library list, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.libraryItemsFontSize)
							.onChange((value) => persistAndRestyle(this.plugin, "libraryItemsFontSize", value, () => this.plugin.applyLibraryHeaderStyles())),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Library items colour")
					.setDesc("Normal text colour of books and chapters in the Library list (not the header titles).")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.libraryItemsColor, (hex) => {
							void this.plugin.updateSetting("libraryItemsColor", hex).then(() => this.plugin.applyLibraryHeaderStyles());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.libraryItemsMuted)
							.onChange((value) => persistAndRestyle(this.plugin, "libraryItemsMuted", value, () => this.plugin.applyLibraryHeaderStyles())),
					);
			});
	}

	private renderLibraryHighlightRows(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const libraryHighlightGroup = new SettingGroup(body);
		libraryHighlightGroup
			.addSetting((setting) => {
				setting
					.setName("Highlight colour for library items")
					.setDesc("The colour used for the active chapter/item highlight.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.highlightColor, (hex) => {
							void this.plugin.updateSetting("highlightColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Highlight text colour for library items")
					.setDesc("colour used for the active chapter/item highlight text")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.highlightTextColor, (hex) => {
							void this.plugin.updateSetting("highlightTextColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			});
	}

	private renderUnplacedPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "unplacedFontSize",
			fontWeightKey: "unplacedFontWeight",
			colorKey: "unplacedColor",
			mutedKey: "unplacedMuted",
			smallCapsKey: "unplacedSmallCaps",
			useHeaderColorForAllKey: "unplacedUseHeaderColorForAll",
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
			},
		});

		const unplacedItemsGroup = new SettingGroup(body);
		let itemsColourSetting!: Setting;
		unplacedItemsGroup
			.addSetting((setting) => {
				setting
					.setName("Unplaced items")
					.setDesc("Text size of the items in the Unplaced pane, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.unplacedItemsFontSize)
							.onChange((value) => persistAndRestyle(this.plugin, "unplacedItemsFontSize", value, () => this.plugin.applyHeaderStyles())),
					);
			})
			.addSetting((setting) => {
				itemsColourSetting = setting;
				setting
					.setName("Unplaced items colour")
					.setDesc("colour of unplaced items")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.unplacedItemsColor, (hex) => {
							void this.plugin.updateSetting("unplacedItemsColor", hex).then(() => this.plugin.applyHeaderStyles());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.unplacedItemsMuted)
							.onChange((value) => persistAndRestyle(this.plugin, "unplacedItemsMuted", value, () => this.plugin.applyHeaderStyles())),
					);
			});

		const unplacedHighlightGroup = new SettingGroup(body);
		let highlightColourSetting!: Setting;
		unplacedHighlightGroup
			.addSetting((setting) => {
				highlightColourSetting = setting;
				setting
					.setName("Highlight colour")
					.setDesc(
						"highlights the currently selected chapter in the storyForge panel, only active if per panel highlighting is selected",
					)
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.unplacedHighlightColor, (hex) => {
							void this.plugin.updateSetting("unplacedHighlightColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Highlight text colour")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.unplacedHighlightTextColor, (hex) => {
							void this.plugin.updateSetting("unplacedHighlightTextColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			});

		const applyUseHeaderColorVisibility = (hidden: boolean) => {
			itemsColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			highlightColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		useHeaderColorToggle.onChange((value) => this.applyUnplacedUseHeaderColorToggle(value, applyUseHeaderColorVisibility));
		applyUseHeaderColorVisibility(settings.unplacedUseHeaderColorForAll);
	}

	private applyUnplacedUseHeaderColorToggle(value: boolean, applyUseHeaderColorVisibility: (hidden: boolean) => void): void {
		void this.plugin.updateSetting("unplacedUseHeaderColorForAll", value).then(() => {
			applyUseHeaderColorVisibility(value);
			this.plugin.applyHeaderStyles();
			this.plugin.applyHighlightStyle();
		});
	}

	private renderCodexPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "codexFontSize",
			fontWeightKey: "codexFontWeight",
			colorKey: "codexColor",
			mutedKey: "codexMuted",
			smallCapsKey: "codexSmallCaps",
			useHeaderColorForAllKey: "codexUseHeaderColorForAll",
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyCodexFolderStyle();
				this.plugin.applyCodexNoteLabelStyle();
				this.plugin.applyHighlightStyle();
			},
		});

		const codexFolderGroup = new SettingGroup(body);
		let folderColourSetting!: Setting;
		codexFolderGroup
			.addSetting((setting) => {
				setting
					.setName("Folder size")
					.setDesc("Font size of the codex folder names and chevrons, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.codexFolderFontSize)
							.onChange((value) => persistAndRestyle(this.plugin, "codexFolderFontSize", value, () => this.plugin.applyCodexFolderStyle())),
					);
			})
			.addSetting((setting) => {
				setting.setName("Folder weight").setDesc("Font weight of the codex folder names.");
				bindFontWeightDropdown(setting, settings.codexFolderFontWeight, (value) => {
					void this.plugin.updateSetting("codexFolderFontWeight", value).then(() => this.plugin.applyCodexFolderStyle());
				});
			})
			.addSetting((setting) => {
				folderColourSetting = setting;
				setting
					.setName("Folder colour")
					.setDesc("Colour of the codex folder names and chevrons.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.codexFolderColor, (hex) => {
							void this.plugin.updateSetting("codexFolderColor", hex).then(() => this.plugin.applyCodexFolderStyle());
						}),
					);
			})
			.addSetting((setting) => {
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

		const codexNoteLabelGroup = new SettingGroup(body);
		let defaultToggle!: ToggleComponent;
		let folderToggle!: ToggleComponent;
		let noteLabelColourSetting!: Setting;
		let defaultColourToggleSetting!: Setting;
		let folderColourToggleSetting!: Setting;
		codexNoteLabelGroup
			.addSetting((setting) => {
				setting
					.setName("Codex note label size")
					.setDesc("Font size of the codex note (file) labels, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.codexNoteLabelFontSize)
							.onChange((value) => persistAndRestyle(this.plugin, "codexNoteLabelFontSize", value, () => this.plugin.applyCodexNoteLabelStyle())),
					);
			})
			.addSetting((setting) => {
				setting.setName("Codex note label weight").setDesc("Font weight of the codex note (file) labels.");
				bindFontWeightDropdown(setting, settings.codexNoteLabelFontWeight, (value) => {
					void this.plugin.updateSetting("codexNoteLabelFontWeight", value).then(() => this.plugin.applyCodexNoteLabelStyle());
				});
			})
			.addSetting((setting) => {
				noteLabelColourSetting = setting;
				setting
					.setName("Codex note label colour")
					.setDesc("Colour of the codex note (file) labels.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.codexNoteLabelColor, (hex) => {
							void this.plugin.updateSetting("codexNoteLabelColor", hex).then(() => this.plugin.applyCodexNoteLabelStyle());
						}),
					);
			})
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

		const codexHighlightGroup = new SettingGroup(body);
		let codexHighlightColourSetting!: Setting;
		codexHighlightGroup
			.addSetting((setting) => {
				codexHighlightColourSetting = setting;
				setting
					.setName("Highlight colour")
					.setDesc(
						"highlights the currently selected note in the codex panel, only active if per panel highlighting is selected",
					)
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.codexHighlightColor, (hex) => {
							void this.plugin.updateSetting("codexHighlightColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Highlight text colour")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.codexHighlightTextColor, (hex) => {
							void this.plugin.updateSetting("codexHighlightTextColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			});

		const applyUseHeaderColorVisibility = (hidden: boolean) => {
			folderColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			noteLabelColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			defaultColourToggleSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			folderColourToggleSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			codexHighlightColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		useHeaderColorToggle.onChange((value) => this.applyCodexUseHeaderColorToggle(value, applyUseHeaderColorVisibility));
		applyUseHeaderColorVisibility(settings.codexUseHeaderColorForAll);
	}

	private applyCodexUseHeaderColorToggle(value: boolean, applyUseHeaderColorVisibility: (hidden: boolean) => void): void {
		void this.plugin.updateSetting("codexUseHeaderColorForAll", value).then(() => {
			applyUseHeaderColorVisibility(value);
			this.plugin.applyHeaderStyles();
			this.plugin.applyHighlightStyle();
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyCodexNoteLabelStyle();
		});
	}

	private applyCodexFolderIndicatorThickness(value: CodexFolderIndicatorThickness): void {
		void this.plugin.updateSetting("codexFolderIndicatorThickness", value).then(() => {
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyHighlightStyle();
		});
	}

	private renderSeriesPaneContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const seriesGroup = new SettingGroup(body);
		seriesGroup
			.addSetting((setting) => {
				setting
					.setName("Hide series pane")
					.setDesc("Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back.")
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
