import { App, ButtonComponent, PluginSettingTab, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness } from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES, PaletteMode, PaletteName } from "../colorPalettes";
import { PalettePickerModal } from "./PalettePickerModal";

export class StoryForgeSettingsTab extends PluginSettingTab {
	private plugin: StoryForgePlugin;
	private expandedSections = new Set<string>();

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private renderFoldableSection(
		parentEl: HTMLElement,
		key: string,
		level: "h3" | "h4",
		headingText: string,
		renderBody: (bodyEl: HTMLElement) => void,
	): void {
		const sectionEl = parentEl.createDiv({ cls: `sf-settings-section sf-settings-section-${level}` });
		const headerEl = sectionEl.createDiv({ cls: "sf-settings-section-header" });
		const chevronEl = headerEl.createSpan({ cls: "sf-settings-chevron" });
		headerEl.createEl(level, { text: headingText });
		const bodyEl = sectionEl.createDiv({ cls: "sf-settings-section-body" });

		const applyState = (collapsed: boolean) => {
			sectionEl.toggleClass("sf-settings-collapsed", collapsed);
			setIcon(chevronEl, collapsed ? "chevron-right" : "chevron-down");
		};
		applyState(!this.expandedSections.has(key));

		headerEl.addEventListener("click", () => {
			const isExpanded = this.expandedSections.has(key);
			if (isExpanded) {
				this.expandedSections.delete(key);
			} else {
				this.expandedSections.add(key);
			}
			applyState(isExpanded);
		});

		renderBody(bodyEl);
	}

	/** Wires a button to act as a colour swatch: shows `initialHex`, opens the palette picker on click. */
	private bindColorSwatchButton(
		button: ButtonComponent,
		initialHex: string,
		onPick: (hex: string) => Promise<void>,
	): void {
		button.buttonEl.addClass("sf-color-swatch-btn");
		button.buttonEl.setAttr("aria-label", "Choose colour");
		const paint = (hex: string) => {
			button.buttonEl.style.backgroundColor = hex;
		};
		paint(initialHex);
		button.onClick(() => {
			const s = this.plugin.getSettings();
			new PalettePickerModal(this.app, s.colorPaletteName, s.colorPaletteMode, s.customPaletteColors, async (hex) => {
				paint(hex);
				await onPick(hex);
			}).open();
		});
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sf-settings-tab");
		this.expandedSections = new Set();

		containerEl.createEl("h2", { text: "storyForge" });

		const settings = this.plugin.getSettings();

		new Setting(containerEl)
			.setName("Reopen storyForge panel")
			.setDesc("If you've closed the storyForge panel, click this button to bring it back.")
			.addButton((button) =>
				button
					.setButtonText("Reopen panel")
					.setCta()
					.onClick(() => void this.plugin.activateView()),
			);

		new Setting(containerEl)
			.setName("Use Tools Panel")
			.setDesc("ribbon is hidden and the ribbon icons can be found within the tools panel")
			.addToggle((toggle) =>
				toggle.setValue(settings.useToolsPanel).onChange(async (value) => {
					await this.plugin.updateSetting("useToolsPanel", value);
					this.plugin.applyVisibilityStyles();
					if (value) {
						void this.plugin.activateToolsView();
					} else {
						this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
					}
				}),
			)
			.addButton((button) =>
				button
					.setButtonText("Reopen Tools Panel")
					.setCta()
					.onClick(() => void this.plugin.activateToolsView()),
			);

		const paletteGroup = new SettingGroup(containerEl);
		paletteGroup.addSetting((setting) =>
			setting
				.setName("Colour Palette")
				.setDesc("Palette used when picking colours for storyForge's UI elements below.")
				.addDropdown((dropdown) => {
					for (const name of PALETTE_NAMES) dropdown.addOption(name, name);
					dropdown.setValue(settings.colorPaletteName).onChange(async (value) => {
						await this.plugin.updateSetting("colorPaletteName", value as PaletteName);
						this.display();
					});
				}),
		);
		if (settings.colorPaletteName !== "Custom") {
			paletteGroup.addSetting((setting) =>
				setting
					.setName("Palette Mode")
					.setDesc("Light or dark variant of the selected palette.")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("light", "Light")
							.addOption("dark", "Dark")
							.setValue(settings.colorPaletteMode)
							.onChange(async (value) => {
								await this.plugin.updateSetting("colorPaletteMode", value as PaletteMode);
							}),
					),
			);
		}

		if (settings.colorPaletteName === "Custom") {
			const customGroup = new SettingGroup(containerEl);
			settings.customPaletteColors.forEach((entry, i) => {
				customGroup.addSetting((setting) =>
					setting
						.setName(`Custom Colour ${i + 1}`)
						.addText((text) =>
							text.setValue(entry.name).setPlaceholder("Name").onChange(async (value) => {
								const colors = settings.customPaletteColors.slice();
								colors[i] = { ...colors[i], name: value };
								await this.plugin.updateSetting("customPaletteColors", colors);
							}),
						)
						.addText((text) => {
							text.setValue(entry.hex);
							text.inputEl.type = "color";
							text.onChange(async (value) => {
								const colors = settings.customPaletteColors.slice();
								colors[i] = { ...colors[i], hex: value };
								await this.plugin.updateSetting("customPaletteColors", colors);
							});
						}),
				);
			});
		}

		this.renderFoldableSection(containerEl, "text-style", "h3", "Text Style", (body) => {
			this.renderFoldableSection(body, "text-style-editor", "h4", "Editor Text", () => {});
			this.renderFoldableSection(body, "text-style-h1", "h4", "Heading 1", () => {});
			this.renderFoldableSection(body, "text-style-h2", "h4", "Heading 2", () => {});
			this.renderFoldableSection(body, "text-style-h3", "h4", "Heading 3", () => {});
			this.renderFoldableSection(body, "text-style-other-headers", "h4", "Other Headers", () => {});
		});

		this.renderFoldableSection(containerEl, "ui-formatting", "h3", "storyForge Interface Formatting", (body) => {
			const highlightGroup = new SettingGroup(body);
			let highlightColourSetting: Setting | null = null;
			let highlightTextColourSetting: Setting | null = null;
			const applyHighlightNames = (perPanel: boolean) => {
				highlightColourSetting?.setName(perPanel ? "Highlight Colour for Chapter/Book" : "Highlight Colour");
				highlightTextColourSetting?.setName(
					perPanel ? "Highlight Text Colour for Chapter/Book" : "Highlight Text Colour",
				);
			};
			highlightGroup
				.addSetting((setting) =>
					setting
						.setName("Highlight Active Chapter/Item")
						.setDesc(
							"highlights the currently selected chapter, or item, in the storyForge panel",
						)
						.addToggle((toggle) =>
							toggle.setValue(settings.highlightActiveChapter).onChange(async (value) => {
								await this.plugin.updateSetting("highlightActiveChapter", value);
								this.plugin.refreshStoryForgeViews();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Per Panel Highlighting")
						.setDesc(
							"Give the chapter/book list, Unplaced zone, and Codex panel their own highlight colours.",
						)
						.addToggle((toggle) =>
							toggle.setValue(settings.perPanelHighlighting).onChange(async (value) => {
								await this.plugin.updateSetting("perPanelHighlighting", value);
								applyHighlightNames(value);
								this.plugin.applyHighlightStyle();
							}),
						),
				)
				.addSetting((setting) => {
					highlightColourSetting = setting;
					setting
						.setDesc("The colour used for the active chapter/item highlight.")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.highlightColor, async (hex) => {
								await this.plugin.updateSetting("highlightColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						);
				})
				.addSetting((setting) => {
					highlightTextColourSetting = setting;
					setting
						.setDesc("colour used for the active chapter/item highlight text")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.highlightTextColor, async (hex) => {
								await this.plugin.updateSetting("highlightTextColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						);
				});
			applyHighlightNames(settings.perPanelHighlighting);

			this.renderFoldableSection(body, "unplaced", "h4", "Unplaced Panel", (unplacedBody) => {
				const unplacedHeaderGroup = new SettingGroup(unplacedBody);
				unplacedHeaderGroup
					.addSetting((setting) =>
						setting
							.setName("Header Size")
							.setDesc("size of header label and icon")
							.addSlider((slider) =>
								slider
									.setLimits(0.5, 1.5, 0.25)
									.setValue(settings.unplacedFontSize)
									.onChange(async (value) => {
										await this.plugin.updateSetting("unplacedFontSize", value);
										this.plugin.applyHeaderStyles();
									}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Header Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.unplacedColor, async (hex) => {
									await this.plugin.updateSetting("unplacedColor", hex);
									this.plugin.applyHeaderStyles();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Muted")
							.setDesc("override header colour with muted colour")
							.addToggle((toggle) =>
								toggle.setValue(settings.unplacedMuted).onChange(async (value) => {
									await this.plugin.updateSetting("unplacedMuted", value);
									this.plugin.applyHeaderStyles();
								}),
							),
					)
					.addSetting((setting) => {
						setting
							.setName("Small Caps")
							.addToggle((toggle) =>
								toggle.setValue(settings.unplacedSmallCaps).onChange(async (value) => {
									await this.plugin.updateSetting("unplacedSmallCaps", value);
									this.plugin.applyHeaderStyles();
								}),
							);
						setting.nameEl.style.fontVariant = "small-caps";
					});

				const unplacedItemsGroup = new SettingGroup(unplacedBody);
				let itemsMutedToggle: ToggleComponent | null = null;
				let itemsHeaderToggle: ToggleComponent | null = null;
				unplacedItemsGroup
					.addSetting((setting) =>
						setting
							.setName("Unplaced Items")
							.setDesc("Text size of the items in the Unplaced pane, from 0.5em to 1.5em.")
							.addSlider((slider) =>
								slider
									.setLimits(0.5, 1.5, 0.25)
									.setValue(settings.unplacedItemsFontSize)
									.onChange(async (value) => {
										await this.plugin.updateSetting("unplacedItemsFontSize", value);
										this.plugin.applyHeaderStyles();
									}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Unplaced Items Colour")
							.setDesc("colour of unplaced items")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.unplacedItemsColor, async (hex) => {
									await this.plugin.updateSetting("unplacedItemsColor", hex);
									this.plugin.applyHeaderStyles();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Muted")
							.setDesc("override colour with muted colour")
							.addToggle((toggle) => {
								itemsMutedToggle = toggle;
								toggle.setValue(settings.unplacedItemsMuted).onChange(async (value) => {
									if (value && itemsHeaderToggle?.getValue()) {
										await this.plugin.updateSetting("unplacedItemsUseHeaderColor", false);
										itemsHeaderToggle.setValue(false);
									}
									await this.plugin.updateSetting("unplacedItemsMuted", value);
									this.plugin.applyHeaderStyles();
								});
							}),
					)
					.addSetting((setting) =>
						setting
							.setName("Header Colour")
							.setDesc("override colour with header colour")
							.addToggle((toggle) => {
								itemsHeaderToggle = toggle;
								toggle.setValue(settings.unplacedItemsUseHeaderColor).onChange(async (value) => {
									if (value && itemsMutedToggle?.getValue()) {
										await this.plugin.updateSetting("unplacedItemsMuted", false);
										itemsMutedToggle.setValue(false);
									}
									await this.plugin.updateSetting("unplacedItemsUseHeaderColor", value);
									this.plugin.applyHeaderStyles();
								});
							}),
					);

				new Setting(unplacedBody).setDesc(
					"highlights the currently selected chapter in the storyForge panel, only active if per panel highlighting is selected",
				);
				const unplacedHighlightGroup = new SettingGroup(unplacedBody);
				unplacedHighlightGroup
					.addSetting((setting) =>
						setting
							.setName("Highlight Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.unplacedHighlightColor, async (hex) => {
									await this.plugin.updateSetting("unplacedHighlightColor", hex);
									this.plugin.applyHighlightStyle();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Highlight Text Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.unplacedHighlightTextColor, async (hex) => {
									await this.plugin.updateSetting("unplacedHighlightTextColor", hex);
									this.plugin.applyHighlightStyle();
								}),
							),
					);
			});

			this.renderFoldableSection(body, "codex", "h4", "Codex Panel", (codexBody) => {
				const codexGroup = new SettingGroup(codexBody);
				codexGroup
					.addSetting((setting) =>
						setting
							.setName("Header Size")
							.setDesc("size of header label and icon")
							.addSlider((slider) =>
								slider
									.setLimits(0.5, 1.5, 0.25)
									.setValue(settings.codexFontSize)
									.onChange(async (value) => {
										await this.plugin.updateSetting("codexFontSize", value);
										this.plugin.applyHeaderStyles();
									}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Header Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.codexColor, async (hex) => {
									await this.plugin.updateSetting("codexColor", hex);
									this.plugin.applyHeaderStyles();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Muted")
							.setDesc("override header colour with muted colour")
							.addToggle((toggle) =>
								toggle.setValue(settings.codexMuted).onChange(async (value) => {
									await this.plugin.updateSetting("codexMuted", value);
									this.plugin.applyHeaderStyles();
								}),
							),
					)
					.addSetting((setting) => {
						setting
							.setName("Small Caps")
							.addToggle((toggle) =>
								toggle.setValue(settings.codexSmallCaps).onChange(async (value) => {
									await this.plugin.updateSetting("codexSmallCaps", value);
									this.plugin.applyHeaderStyles();
								}),
							);
						setting.nameEl.style.fontVariant = "small-caps";
					});

				const codexFolderGroup = new SettingGroup(codexBody);
				codexFolderGroup
					.addSetting((setting) =>
						setting
							.setName("Folder Size")
							.setDesc("Font size of the codex folder names and chevrons, from 0.5em to 1.5em.")
							.addSlider((slider) =>
								slider
									.setLimits(0.5, 1.5, 0.25)
									.setValue(settings.codexFolderFontSize)
									.onChange(async (value) => {
										await this.plugin.updateSetting("codexFolderFontSize", value);
										this.plugin.applyCodexFolderStyle();
									}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Folder Colour")
							.setDesc("Colour of the codex folder names and chevrons.")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.codexFolderColor, async (hex) => {
									await this.plugin.updateSetting("codexFolderColor", hex);
									this.plugin.applyCodexFolderStyle();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Folder Indicator Line")
							.setDesc("Vertical guide line showing what's nested inside a folder, coloured to match the folder colour.")
							.addDropdown((dropdown) =>
								dropdown
									.addOption("none", "None")
									.addOption("thin", "Thin")
									.addOption("medium", "Medium")
									.addOption("thick", "Thick")
									.setValue(settings.codexFolderIndicatorThickness)
									.onChange(async (value) => {
										await this.plugin.updateSetting("codexFolderIndicatorThickness", value as CodexFolderIndicatorThickness);
										this.plugin.applyCodexFolderStyle();
										this.plugin.applyHighlightStyle();
									}),
							),
					);

				const codexNoteLabelGroup = new SettingGroup(codexBody);
				let defaultToggle: ToggleComponent | null = null;
				let folderToggle: ToggleComponent | null = null;
				codexNoteLabelGroup
					.addSetting((setting) =>
						setting
							.setName("Codex Note Label Size")
							.setDesc("Font size of the codex note (file) labels, from 0.5em to 1.5em.")
							.addSlider((slider) =>
								slider
									.setLimits(0.5, 1.5, 0.25)
									.setValue(settings.codexNoteLabelFontSize)
									.onChange(async (value) => {
										await this.plugin.updateSetting("codexNoteLabelFontSize", value);
										this.plugin.applyCodexNoteLabelStyle();
									}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Codex Note Label Colour")
							.setDesc("Colour of the codex note (file) labels.")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.codexNoteLabelColor, async (hex) => {
									await this.plugin.updateSetting("codexNoteLabelColor", hex);
									this.plugin.applyCodexNoteLabelStyle();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Use Default Colour for Codex Note Label")
							.setDesc("overrides the note colour and sets it the same as the body text")
							.addToggle((toggle) => {
								defaultToggle = toggle;
								toggle.setValue(settings.codexNoteLabelUseDefaultColor).onChange(async (value) => {
									if (value && folderToggle?.getValue()) {
										await this.plugin.updateSetting("codexNoteLabelUseFolderColor", false);
										folderToggle.setValue(false);
									}
									await this.plugin.updateSetting("codexNoteLabelUseDefaultColor", value);
									this.plugin.applyCodexNoteLabelStyle();
								});
							}),
					)
					.addSetting((setting) =>
						setting
							.setName("Use Folder Colour for Codex Notes")
							.setDesc("overrides the note colour and sets it the same as the codex folder colour")
							.addToggle((toggle) => {
								folderToggle = toggle;
								toggle.setValue(settings.codexNoteLabelUseFolderColor).onChange(async (value) => {
									if (value && defaultToggle?.getValue()) {
										await this.plugin.updateSetting("codexNoteLabelUseDefaultColor", false);
										defaultToggle.setValue(false);
									}
									await this.plugin.updateSetting("codexNoteLabelUseFolderColor", value);
									this.plugin.applyCodexNoteLabelStyle();
								});
							}),
					);

				new Setting(codexBody).setDesc(
					"highlights the currently selected note in the codex panel, only active if per panel highlighting is selected",
				);
				const codexHighlightGroup = new SettingGroup(codexBody);
				codexHighlightGroup
					.addSetting((setting) =>
						setting
							.setName("Highlight Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.codexHighlightColor, async (hex) => {
									await this.plugin.updateSetting("codexHighlightColor", hex);
									this.plugin.applyHighlightStyle();
								}),
							),
					)
					.addSetting((setting) =>
						setting
							.setName("Highlight Text Colour")
							.addButton((button) =>
								this.bindColorSwatchButton(button, settings.codexHighlightTextColor, async (hex) => {
									await this.plugin.updateSetting("codexHighlightTextColor", hex);
									this.plugin.applyHighlightStyle();
								}),
							),
					);
			});
		});

		this.renderFoldableSection(containerEl, "hide-ui", "h3", "Hide Obsidian Interface Elements", (body) => {
			new Setting(body)
				.setName("Hide Help Button")
				.setDesc(
					"Hides the help (?) button next to the vault picker.",
				)
				.addToggle((toggle) =>
					toggle.setValue(settings.hideHelp).onChange(async (value) => {
						await this.plugin.updateSetting("hideHelp", value);
						this.plugin.applyVisibilityStyles();
					}),
				);

			const hideSidebarGroup = new SettingGroup(body);
			hideSidebarGroup
				.addSetting((setting) =>
					setting
						.setName("Hide Search Panel")
						.setDesc("Hides the Search button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideSearch).onChange(async (value) => {
								await this.plugin.updateSetting("hideSearch", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide Bookmarks Panel")
						.setDesc("Hides the Bookmarks button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideBookmarks).onChange(async (value) => {
								await this.plugin.updateSetting("hideBookmarks", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide Files Panel")
						.setDesc("Hides the Files button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideFiles).onChange(async (value) => {
								await this.plugin.updateSetting("hideFiles", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				);

			const hidePanelsGroup = new SettingGroup(body);
			hidePanelsGroup
				.addSetting((setting) =>
					setting
						.setName("Hide Left Panel Button")
						.setDesc("Hides the left sidebar collapse/expand button.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideLeftPanel).onChange(async (value) => {
								await this.plugin.updateSetting("hideLeftPanel", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide Right Panel Button")
						.setDesc("Hides the right sidebar collapse/expand button.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideRightPanel).onChange(async (value) => {
								await this.plugin.updateSetting("hideRightPanel", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				);

			const hideMiscGroup = new SettingGroup(body);
			hideMiscGroup
				.addSetting((setting) =>
					setting
						.setName("Hide File Name Bar")
						.setDesc("Hides the large file name displayed at the top of the note content.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideFileNameBar).onChange(async (value) => {
								await this.plugin.updateSetting("hideFileNameBar", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide Navigation Row")
						.setDesc("Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideNavRow).onChange(async (value) => {
								await this.plugin.updateSetting("hideNavRow", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				);
		});
	}
}
