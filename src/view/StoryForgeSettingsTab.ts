import { App, PluginSettingTab, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import { ArchiveModal } from "./ArchiveModal";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";

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

		new Setting(containerEl)
			.setName("Archived Chapters")
			.setDesc("View and unarchive chapters that have been archived.")
			.addButton((button) =>
				button
					.setButtonText("Archived Chapters")
					.setIcon("eye")
					.onClick(() => {
						const modal = new ArchiveModal(this.app, () => void this.plugin.activateView());
						modal.open();
					}),
			);

		this.renderFoldableSection(containerEl, "text-style", "h3", "Text Style", () => {});

		this.renderFoldableSection(containerEl, "ui-formatting", "h3", "storyForge Interface Formatting", (body) => {
			const highlightGroup = new SettingGroup(body);
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
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Highlight Colour")
						.setDesc("The colour used for the active chapter/item highlight.")
						.addText((text) => {
							text.setValue(settings.highlightColor);
							text.inputEl.type = "color";
							text.onChange(async (value) => {
								const v = value.trim();
								if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
									await this.plugin.updateSetting("highlightColor", v);
									this.plugin.applyHighlightStyle();
								}
							});
						}),
				)
				.addSetting((setting) =>
					setting
						.setName("Highlight Text Colour")
						.setDesc("colour used for the active chapter/item highlight text")
						.addText((text) => {
							text.setValue(settings.highlightTextColor);
							text.inputEl.type = "color";
							text.onChange(async (value) => {
								const v = value.trim();
								if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
									await this.plugin.updateSetting("highlightTextColor", v);
									this.plugin.applyHighlightStyle();
								}
							});
						}),
				);

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
							.addText((text) =>
								text.setValue(settings.unplacedColor).onChange(async (value) => {
									const v = value.trim();
									if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
										await this.plugin.updateSetting("unplacedColor", v);
										this.plugin.applyHeaderStyles();
									}
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
							.addText((text) => {
								text.setValue(settings.unplacedItemsColor);
								text.inputEl.type = "color";
								text.onChange(async (value) => {
									const v = value.trim();
									if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
										await this.plugin.updateSetting("unplacedItemsColor", v);
										this.plugin.applyHeaderStyles();
									}
								});
							}),
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
							.addText((text) =>
								text.setValue(settings.codexColor).onChange(async (value) => {
									const v = value.trim();
									if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
										await this.plugin.updateSetting("codexColor", v);
										this.plugin.applyHeaderStyles();
									}
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
							.addText((text) => {
								text.setValue(settings.codexFolderColor);
								text.inputEl.type = "color";
								text.onChange(async (value) => {
									const v = value.trim();
									if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
										await this.plugin.updateSetting("codexFolderColor", v);
										this.plugin.applyCodexFolderStyle();
									}
								});
							}),
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
							.addText((text) => {
								text.setValue(settings.codexNoteLabelColor);
								text.inputEl.type = "color";
								text.onChange(async (value) => {
									const v = value.trim();
									if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
										await this.plugin.updateSetting("codexNoteLabelColor", v);
										this.plugin.applyCodexNoteLabelStyle();
									}
								});
							}),
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
