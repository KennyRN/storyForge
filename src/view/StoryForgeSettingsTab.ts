import { App, ButtonComponent, PluginSettingTab, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness, StoryForgePluginSettings } from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES, PaletteMode, PaletteName } from "../colorPalettes";
import { PalettePickerModal } from "./PalettePickerModal";
import { IconAuditModal } from "./IconAuditModal";

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

	/** Wires two toggles so turning one on forces the other off. `persistA`/`persistB` persist that side's setting (and restyle) once both toggles exist. */
	private bindExclusivePair(
		toggleA: ToggleComponent,
		toggleB: ToggleComponent,
		persistA: (value: boolean) => Promise<void>,
		persistB: (value: boolean) => Promise<void>,
	): void {
		toggleA.onChange(async (value) => {
			if (value && toggleB.getValue()) {
				toggleB.setValue(false);
				await persistB(false);
			}
			await persistA(value);
		});
		toggleB.onChange(async (value) => {
			if (value && toggleA.getValue()) {
				toggleA.setValue(false);
				await persistA(false);
			}
			await persistB(value);
		});
	}

	/** Renders the Header size/colour/Muted/Small caps group shared by the Unplaced and Codex panels. */
	private renderHeaderStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			sizeKey: "unplacedFontSize" | "codexFontSize";
			colorKey: "unplacedColor" | "codexColor";
			mutedKey: "unplacedMuted" | "codexMuted";
			smallCapsKey: "unplacedSmallCaps" | "codexSmallCaps";
			restyle: () => void;
		},
	): void {
		const group = new SettingGroup(body);
		group
			.addSetting((setting) =>
				setting
					.setName("Header size")
					.setDesc("size of header label and icon")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings[config.sizeKey])
							.onChange(async (value) => {
								await this.plugin.updateSetting(config.sizeKey, value);
								config.restyle();
							}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Header colour")
					.addButton((button) =>
						this.bindColorSwatchButton(button, settings[config.colorKey], async (hex) => {
							await this.plugin.updateSetting(config.colorKey, hex);
							config.restyle();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Muted")
					.setDesc("override header colour with muted colour")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.mutedKey]).onChange(async (value) => {
							await this.plugin.updateSetting(config.mutedKey, value);
							config.restyle();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey]).onChange(async (value) => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							config.restyle();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
			});
	}

	private renderTopActions(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
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
			.setName("Icon usage")
			.setDesc("See every icon storyForge uses, custom and stock, and where each one is wired up.")
			.addButton((button) =>
				button.setButtonText("View icons").onClick(() => new IconAuditModal(this.app).open()),
			);

		new Setting(containerEl)
			.setName("Use tools panel")
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
	}

	private renderPaletteSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		const paletteGroup = new SettingGroup(containerEl);
		paletteGroup.addSetting((setting) =>
			setting
				.setName("Colour palette")
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
					.setName("Palette mode")
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
						.setName(`Custom colour ${i + 1}`)
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
	}

	private renderTextStyleSection(containerEl: HTMLElement): void {
		this.renderFoldableSection(containerEl, "text-style", "h3", "Text style", (body) => {
			this.renderFoldableSection(body, "text-style-editor", "h4", "Editor text", () => {});
			this.renderFoldableSection(body, "text-style-h1", "h4", "Heading 1", () => {});
			this.renderFoldableSection(body, "text-style-h2", "h4", "Heading 2", () => {});
			this.renderFoldableSection(body, "text-style-h3", "h4", "Heading 3", () => {});
			this.renderFoldableSection(body, "text-style-other-headers", "h4", "Other headers", () => {});
		});
	}

	private renderHighlightGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const highlightGroup = new SettingGroup(body);
		let highlightColourSetting: Setting | null = null;
		let highlightTextColourSetting: Setting | null = null;
		const applyHighlightNames = (perPanel: boolean) => {
			highlightColourSetting?.setName(perPanel ? "Highlight colour for chapter/book" : "Highlight colour");
			highlightTextColourSetting?.setName(
				perPanel ? "Highlight text colour for chapter/book" : "Highlight text colour",
			);
		};
		highlightGroup
			.addSetting((setting) =>
				setting
					.setName("Highlight active chapter/item")
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
					.setName("Per panel highlighting")
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
	}

	private renderUnplacedPanel(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(body, "unplaced", "h4", "Unplaced panel", (unplacedBody) => {
			this.renderHeaderStyleGroup(unplacedBody, settings, {
				sizeKey: "unplacedFontSize",
				colorKey: "unplacedColor",
				mutedKey: "unplacedMuted",
				smallCapsKey: "unplacedSmallCaps",
				restyle: () => this.plugin.applyHeaderStyles(),
			});

			const unplacedItemsGroup = new SettingGroup(unplacedBody);
			let itemsMutedToggle!: ToggleComponent;
			let itemsHeaderToggle!: ToggleComponent;
			unplacedItemsGroup
				.addSetting((setting) =>
					setting
						.setName("Unplaced items")
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
						.setName("Unplaced items colour")
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
							toggle.setValue(settings.unplacedItemsMuted);
						}),
				)
				.addSetting((setting) =>
					setting
						.setName("Header colour")
						.setDesc("override colour with header colour")
						.addToggle((toggle) => {
							itemsHeaderToggle = toggle;
							toggle.setValue(settings.unplacedItemsUseHeaderColor);
						}),
				);
			this.bindExclusivePair(
				itemsMutedToggle,
				itemsHeaderToggle,
				async (value) => {
					await this.plugin.updateSetting("unplacedItemsMuted", value);
					this.plugin.applyHeaderStyles();
				},
				async (value) => {
					await this.plugin.updateSetting("unplacedItemsUseHeaderColor", value);
					this.plugin.applyHeaderStyles();
				},
			);

			new Setting(unplacedBody).setDesc(
				"highlights the currently selected chapter in the storyForge panel, only active if per panel highlighting is selected",
			);
			const unplacedHighlightGroup = new SettingGroup(unplacedBody);
			unplacedHighlightGroup
				.addSetting((setting) =>
					setting
						.setName("Highlight colour")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.unplacedHighlightColor, async (hex) => {
								await this.plugin.updateSetting("unplacedHighlightColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Highlight text colour")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.unplacedHighlightTextColor, async (hex) => {
								await this.plugin.updateSetting("unplacedHighlightTextColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						),
				);
		});
	}

	private renderCodexPanel(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(body, "codex", "h4", "Codex panel", (codexBody) => {
			this.renderHeaderStyleGroup(codexBody, settings, {
				sizeKey: "codexFontSize",
				colorKey: "codexColor",
				mutedKey: "codexMuted",
				smallCapsKey: "codexSmallCaps",
				restyle: () => this.plugin.applyHeaderStyles(),
			});

			const codexFolderGroup = new SettingGroup(codexBody);
			codexFolderGroup
				.addSetting((setting) =>
					setting
						.setName("Folder size")
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
						.setName("Folder colour")
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
						.setName("Folder indicator line")
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
			let defaultToggle!: ToggleComponent;
			let folderToggle!: ToggleComponent;
			codexNoteLabelGroup
				.addSetting((setting) =>
					setting
						.setName("Codex note label size")
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
						.setName("Codex note label colour")
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
						.setName("Use default colour for Codex note label")
						.setDesc("overrides the note colour and sets it the same as the body text")
						.addToggle((toggle) => {
							defaultToggle = toggle;
							toggle.setValue(settings.codexNoteLabelUseDefaultColor);
						}),
				)
				.addSetting((setting) =>
					setting
						.setName("Use folder colour for Codex notes")
						.setDesc("overrides the note colour and sets it the same as the codex folder colour")
						.addToggle((toggle) => {
							folderToggle = toggle;
							toggle.setValue(settings.codexNoteLabelUseFolderColor);
						}),
				);
			this.bindExclusivePair(
				defaultToggle,
				folderToggle,
				async (value) => {
					await this.plugin.updateSetting("codexNoteLabelUseDefaultColor", value);
					this.plugin.applyCodexNoteLabelStyle();
				},
				async (value) => {
					await this.plugin.updateSetting("codexNoteLabelUseFolderColor", value);
					this.plugin.applyCodexNoteLabelStyle();
				},
			);

			new Setting(codexBody).setDesc(
				"highlights the currently selected note in the codex panel, only active if per panel highlighting is selected",
			);
			const codexHighlightGroup = new SettingGroup(codexBody);
			codexHighlightGroup
				.addSetting((setting) =>
					setting
						.setName("Highlight colour")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.codexHighlightColor, async (hex) => {
								await this.plugin.updateSetting("codexHighlightColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Highlight text colour")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.codexHighlightTextColor, async (hex) => {
								await this.plugin.updateSetting("codexHighlightTextColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						),
				);
		});
	}

	private renderUiFormattingSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "ui-formatting", "h3", "storyForge interface formatting", (body) => {
			this.renderHighlightGroup(body, settings);
			this.renderUnplacedPanel(body, settings);
			this.renderCodexPanel(body, settings);
		});
	}

	private renderHideUiSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "hide-ui", "h3", "Hide Obsidian interface elements", (body) => {
			new Setting(body)
				.setName("Hide help button")
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
						.setName("Hide search panel")
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
						.setName("Hide bookmarks panel")
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
						.setName("Hide files panel")
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
						.setName("Hide left panel button")
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
						.setName("Hide right panel button")
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
						.setName("Hide file name bar")
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
						.setName("Hide navigation row")
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sf-settings-tab");
		this.expandedSections = new Set();

		const settings = this.plugin.getSettings();

		this.renderTopActions(containerEl, settings);
		this.renderPaletteSection(containerEl, settings);
		this.renderTextStyleSection(containerEl);
		this.renderUiFormattingSection(containerEl, settings);
		this.renderHideUiSection(containerEl, settings);
	}
}
