import { App, Modal, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness, EditorScrollbarThickness, StoryForgePluginSettings } from "../main";
import { ConvertToSeriesModal } from "./ConvertToSeriesModal";
import {
	bindColorSwatchButton,
	bindExclusivePair,
	persistAndRestyle,
	renderCustomFontCard,
	renderCyclingGuideCard,
	renderTabbedBody,
	type StyleModalTab,
} from "./styleModalHelpers";
import { mountRightSidebarPreviewSample, mountStorytellingPreviewSample, mountUiStylePreviewSample } from "./uiStylePreviewSample";

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

		const layout = contentEl.createDiv({ cls: "sf-ui-format-layout" });
		const controls = layout.createDiv({ cls: "sf-ui-format-controls" });
		const previewPane = layout.createDiv({ cls: "sf-ui-format-preview-pane" });
		previewPane.createDiv({ cls: "sf-ui-format-preview-label", text: "Preview" });
		const preview = previewPane.createDiv({ cls: "sf-ui-format-preview" });
		const leftPreview = preview.createDiv();
		const rightPreview = preview.createDiv({ cls: "sf-settings-hidden" });
		mountRightSidebarPreviewSample(rightPreview);

		const panelTabs: StyleModalTab[] = [
			{
				id: "library",
				label: "Library",
				render: (body) => {
					// Highlight (active chapter/item) sits at the very top of Library — it's the first
					// thing you look for when styling the panel you're actually looking at, and Library
					// is the panel most storyForge users spend most of their time in.
					this.renderHighlightGroup(body, settings);
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "Series title",
						sizeKey: "librarySeriesTitleFontSize",
						colorKey: "librarySeriesTitleColor",
						smallCapsKey: "librarySeriesTitleSmallCaps",
						overrideFontKey: "librarySeriesTitleOverrideFont",
						fontFamilyKey: "librarySeriesTitleFontFamily",
						fontWeightKey: "librarySeriesTitleFontWeight",
					});
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "Book title",
						sizeKey: "libraryBookTitleFontSize",
						colorKey: "libraryBookTitleColor",
						smallCapsKey: "libraryBookTitleSmallCaps",
						overrideFontKey: "libraryBookTitleOverrideFont",
						fontFamilyKey: "libraryBookTitleFontFamily",
						fontWeightKey: "libraryBookTitleFontWeight",
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
				id: "storytelling",
				label: "storyTelling",
				render: (body) => {
					this.renderStorytellingPanelContent(body, settings);
				},
			},
		];

		const rightTabs: StyleModalTab[] = [
			{
				id: "forge",
				label: "Forge",
				render: (body) => this.renderForgePanelContent(body, settings),
			},
			{
				id: "story-context",
				label: "Context panel",
				render: (body) => this.renderRightRailPanelContent(body, settings, "recommend"),
			},
			{
				id: "archive",
				label: "Archive",
				render: (body) => this.renderRightRailPanelContent(body, settings, "archive"),
			},
		];

		const outerTabs: StyleModalTab[] = [
			{
				id: "storyforge-panel",
				label: "Left sidebar",
				render: (body) =>
					renderTabbedBody(body, panelTabs, {
						// Left sidebar's own preview mock swaps with its active second-tier tab —
						// storyTelling has its own independent item styling now (see
						// renderStorytellingPanelContent), so it needs its own mock rather than
						// reusing the storyLibrary one every other second-tier tab here shares.
						onActivate: (id) => (id === "storytelling" ? mountStorytellingPreviewSample(leftPreview) : mountUiStylePreviewSample(leftPreview)),
					}),
			},
			{
				id: "editor",
				label: "Editor",
				render: (body) => {
					// Own scrollable body (mirrors the two-tier tabs' inner .sf-text-style-tab-body-wrapper
					// — see that class's doc comment) so Editor's content can grow past the modal's fixed
					// height without the outer Left sidebar / Editor / Right sidebar tab row scrolling
					// away with it; that row is a sibling of this wrapper, not inside it, so it stays put.
					const scroll = body.createDiv({ cls: "sf-ui-format-editor-scroll" });
					renderCyclingGuideCard(this.app, this.plugin, scroll, settings);
					this.renderEditorScrollbarGroup(scroll, settings);
				},
			},
			{
				id: "right-sidebar",
				label: "Right sidebar",
				render: (body) => renderTabbedBody(body, rightTabs),
			},
		];

		renderTabbedBody(controls, outerTabs, {
			onActivate: (id) => {
				leftPreview.toggleClass("sf-settings-hidden", id !== "storyforge-panel");
				rightPreview.toggleClass("sf-settings-hidden", id !== "right-sidebar");
				previewPane.toggleClass("sf-settings-hidden", id === "editor");
			},
		});
	}

	private renderEditorScrollbarGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group.setHeading("Scrollbar");

		const restyleScrollbar = () => this.plugin.applyEditorScrollbarStyles();
		group.addSetting((setting) => {
			setting
				.setName("Scrollbar")
				.setDesc('Colour of the scrollbar thumb in the manuscript editor. Pick "Theme default" in the palette to use the current theme\'s own scrollbar colour instead.')
				.addButton((button) => {
					bindColorSwatchButton(
						this.app,
						this.plugin,
						button.buttonEl,
						settings.editorScrollbarThumbColor,
						(hex) => {
							void this.plugin.updateSetting("editorScrollbarUseThemeColor", false).then(async () => {
								await this.plugin.updateSetting("editorScrollbarThumbColor", hex);
								restyleScrollbar();
							});
						},
						{
							isActive: settings.editorScrollbarUseThemeColor,
							onSelect: () => persistAndRestyle(this.plugin, "editorScrollbarUseThemeColor", true, restyleScrollbar),
						},
					);
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

	/**
	 * Shared by Unplaced/Codex/Archive (which have a visible header to size and small-cap) and
	 * Story Context (which doesn't — its "header colour" survives only as the base colour the
	 * "use for all" toggle spreads to every other Story Context colour, so `sizeKey`/
	 * `smallCapsKey` are omitted there and the labels swap to `colorLabel`/`useForAllLabel`).
	 */
	private renderHeaderStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			sizeKey?: "unplacedFontSize" | "codexFontSize" | "archiveHeaderFontSize";
			colorKey: "unplacedColor" | "codexColor" | "recommendHeaderColor" | "archiveHeaderColor";
			mutedKey: "unplacedMuted" | "codexMuted" | "recommendHeaderMuted" | "archiveHeaderMuted";
			smallCapsKey?: "unplacedSmallCaps" | "codexSmallCaps" | "archiveHeaderSmallCaps";
			useHeaderColorForAllKey:
				| "unplacedUseHeaderColorForAll"
				| "codexUseHeaderColorForAll"
				| "recommendUseHeaderColorForAll"
				| "archiveUseHeaderColorForAll";
			/** Absent for Story Context, which has no visible header of its own to set a font on. */
			fontKeys?: {
				overrideFontKey: "unplacedOverrideFont" | "codexOverrideFont" | "archiveHeaderOverrideFont";
				fontFamilyKey: "unplacedFontFamily" | "codexFontFamily" | "archiveHeaderFontFamily";
				fontWeightKey: "unplacedFontWeight" | "codexFontWeight" | "archiveHeaderFontWeight";
			};
			colorLabel?: string;
			useForAllLabel?: string;
			restyle: () => void;
		},
	): ToggleComponent {
		const group = new SettingGroup(body);
		let useHeaderColorForAllToggle!: ToggleComponent;
		if (config.sizeKey) {
			const sizeKey = config.sizeKey;
			group.addSetting((setting) => {
				setting
					.setName("Header size")
					.setDesc("size of header label and icon")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.1)
							.setValue(settings[sizeKey])
							.onChange((value) => persistAndRestyle(this.plugin, sizeKey, value, config.restyle)),
					);
			});
		}
		if (config.fontKeys) {
			const { overrideFontKey, fontFamilyKey, fontWeightKey } = config.fontKeys;
			renderCustomFontCard(
				body,
				this.plugin,
				"Header font",
				overrideFontKey,
				fontFamilyKey,
				fontWeightKey,
				config.restyle,
				config.sizeKey ? settings[config.sizeKey] : 1,
			);
		}
		group
			.addSetting((setting) => {
				setting
					.setName(config.colorLabel ?? "Header colour")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.colorKey], (hex) => {
							void this.plugin.updateSetting(config.colorKey, hex).then(() => config.restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName(config.useForAllLabel ?? "Use header colour for all colour options")
					.setDesc(`Use the ${(config.colorLabel ?? "header colour").toLowerCase()} everywhere below instead of picking separate colours.`)
					.addToggle((toggle) => {
						useHeaderColorForAllToggle = toggle;
						toggle.setValue(settings[config.useHeaderColorForAllKey]);
					});
			})
			.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc(`override ${(config.colorLabel ?? "header colour").toLowerCase()} with muted colour`)
					.addToggle((toggle) =>
						toggle.setValue(settings[config.mutedKey]).onChange((value) => persistAndRestyle(this.plugin, config.mutedKey, value, config.restyle)),
					);
			});
		if (config.smallCapsKey) {
			const smallCapsKey = config.smallCapsKey;
			group.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[smallCapsKey]).onChange((value) => persistAndRestyle(this.plugin, smallCapsKey, value, config.restyle)),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		}
		return useHeaderColorForAllToggle;
	}

	private renderHighlightGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const highlightGroup = new SettingGroup(body);
		highlightGroup.addSetting((setting) => {
			setting
				.setName("Highlight active chapter/item")
				.setDesc(
					"highlights the currently selected chapter, or item, in the storyLibrary panel",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.highlightActiveChapter)
						.onChange((value) => persistAndRestyle(this.plugin, "highlightActiveChapter", value, () => this.plugin.refreshStoryForgeViews())),
				);
		});
	}

	private renderTitleStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			labelPrefix: string;
			sizeKey: "librarySeriesTitleFontSize" | "libraryBookTitleFontSize";
			colorKey: "librarySeriesTitleColor" | "libraryBookTitleColor";
			smallCapsKey: "librarySeriesTitleSmallCaps" | "libraryBookTitleSmallCaps";
			overrideFontKey: "librarySeriesTitleOverrideFont" | "libraryBookTitleOverrideFont";
			fontFamilyKey: "librarySeriesTitleFontFamily" | "libraryBookTitleFontFamily";
			fontWeightKey: "librarySeriesTitleFontWeight" | "libraryBookTitleFontWeight";
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
		renderCustomFontCard(
			body,
			this.plugin,
			`${config.labelPrefix} font`,
			config.overrideFontKey,
			config.fontFamilyKey,
			config.fontWeightKey,
			restyle,
			settings[config.sizeKey],
		);
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
		renderCustomFontCard(
			body,
			this.plugin,
			"Subtitle font",
			"libraryBookSubtitleOverrideFont",
			"libraryBookSubtitleFontFamily",
			"libraryBookSubtitleFontWeight",
			restyle,
			settings.libraryBookSubtitleFontSize,
		);
		group
			.addSetting((setting) => {
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

	private renderLibraryItemsGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group.setHeading("Books & chapters");
		const restyle = () => this.plugin.applyLibraryHeaderStyles();
		group.addSetting((setting) => {
			setting
				.setName("Library items")
				.setDesc("Text size of books and chapters in the Library list, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.libraryItemsFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "libraryItemsFontSize", value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"Library items font",
			"libraryItemsOverrideFont",
			"libraryItemsFontFamily",
			"libraryItemsFontWeight",
			restyle,
			settings.libraryItemsFontSize,
		);
		group
			.addSetting((setting) => {
				setting
					.setName("Library items colour")
					.setDesc("Normal text colour of books and chapters in the Library list (not the header titles).")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.libraryItemsColor, (hex) => {
							void this.plugin.updateSetting("libraryItemsColor", hex).then(() => restyle());
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
							.onChange((value) => persistAndRestyle(this.plugin, "libraryItemsMuted", value, restyle)),
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

	/**
	 * storyTelling panel's own chapter items — the same shape as renderLibraryItemsGroup +
	 * renderLibraryHighlightRows above (size, font, colour, muted, highlight), except colour AND
	 * highlight colour both get an extra "Link with Novel Library chapter colour" toggle (on by
	 * default) that hides all four pickers (items colour/muted, highlight colour/text) and mirrors
	 * `libraryItemsColor`/`highlightColor`/`highlightTextColor` instead — see
	 * StoryForgePluginSettings.storytellingItemsFontSize's doc comment. Codex isn't included here;
	 * it already has its own dedicated tab and stays shared between both panels.
	 */
	private renderStorytellingPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const itemsGroup = new SettingGroup(body);
		itemsGroup.setHeading("storyTelling items");
		const restyle = () => this.plugin.applyStorytellingItemsStyle();
		itemsGroup.addSetting((setting) => {
			setting
				.setName("storyTelling items")
				.setDesc("Text size of chapters in the storyTelling panel, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.storytellingItemsFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "storytellingItemsFontSize", value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"storyTelling items font",
			"storytellingItemsOverrideFont",
			"storytellingItemsFontFamily",
			"storytellingItemsFontWeight",
			restyle,
			settings.storytellingItemsFontSize,
		);

		let colourSetting!: Setting;
		let mutedSetting!: Setting;
		itemsGroup
			.addSetting((setting) => {
				setting
					.setName("Link with Novel Library chapter colour")
					.setDesc(
						'Use the storyLibrary panel\'s own "Library items colour" and highlight colours instead of picking separate ones here.',
					)
					.addToggle((toggle) =>
						toggle.setValue(settings.storytellingLinkItemsColorToLibrary).onChange((value) => {
							void this.plugin.updateSetting("storytellingLinkItemsColorToLibrary", value).then(() => {
								applyLinkVisibility(value);
								restyle();
								this.plugin.applyHighlightStyle();
							});
						}),
					);
			})
			.addSetting((setting) => {
				colourSetting = setting;
				setting
					.setName("storyTelling items colour")
					.setDesc("Normal text colour of chapters in the storyTelling panel.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.storytellingItemsColor, (hex) => {
							void this.plugin.updateSetting("storytellingItemsColor", hex).then(() => restyle());
						}),
					);
			})
			.addSetting((setting) => {
				mutedSetting = setting;
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.storytellingItemsMuted)
							.onChange((value) => persistAndRestyle(this.plugin, "storytellingItemsMuted", value, restyle)),
					);
			});

		const highlightGroup = new SettingGroup(body);
		let highlightColourSetting!: Setting;
		let highlightTextColourSetting!: Setting;
		highlightGroup
			.addSetting((setting) => {
				highlightColourSetting = setting;
				setting
					.setName("Highlight colour for storyTelling items")
					.setDesc("The colour used for the active chapter highlight in the storyTelling panel.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.storytellingHighlightColor, (hex) => {
							void this.plugin.updateSetting("storytellingHighlightColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			})
			.addSetting((setting) => {
				highlightTextColourSetting = setting;
				setting
					.setName("Highlight text colour for storyTelling items")
					.setDesc("colour used for the active chapter highlight text in the storyTelling panel")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.storytellingHighlightTextColor, (hex) => {
							void this.plugin.updateSetting("storytellingHighlightTextColor", hex).then(() => this.plugin.applyHighlightStyle());
						}),
					);
			});

		const applyLinkVisibility = (linked: boolean) => {
			colourSetting.settingEl.toggleClass("sf-settings-hidden", linked);
			mutedSetting.settingEl.toggleClass("sf-settings-hidden", linked);
			highlightColourSetting.settingEl.toggleClass("sf-settings-hidden", linked);
			highlightTextColourSetting.settingEl.toggleClass("sf-settings-hidden", linked);
		};
		applyLinkVisibility(settings.storytellingLinkItemsColorToLibrary);
	}

	private renderUnplacedPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "unplacedFontSize",
			colorKey: "unplacedColor",
			mutedKey: "unplacedMuted",
			smallCapsKey: "unplacedSmallCaps",
			useHeaderColorForAllKey: "unplacedUseHeaderColorForAll",
			fontKeys: {
				overrideFontKey: "unplacedOverrideFont",
				fontFamilyKey: "unplacedFontFamily",
				fontWeightKey: "unplacedFontWeight",
			},
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
			},
		});

		const unplacedItemsGroup = new SettingGroup(body);
		let itemsColourSetting!: Setting;
		const itemsRestyle = () => this.plugin.applyHeaderStyles();
		unplacedItemsGroup.addSetting((setting) => {
			setting
				.setName("Unplaced items")
				.setDesc("Text size of the items in the Unplaced pane, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.unplacedItemsFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "unplacedItemsFontSize", value, itemsRestyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"Unplaced items font",
			"unplacedItemsOverrideFont",
			"unplacedItemsFontFamily",
			"unplacedItemsFontWeight",
			itemsRestyle,
			settings.unplacedItemsFontSize,
		);
		unplacedItemsGroup
			.addSetting((setting) => {
				itemsColourSetting = setting;
				setting
					.setName("Unplaced items colour")
					.setDesc("colour of unplaced items")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.unplacedItemsColor, (hex) => {
							void this.plugin.updateSetting("unplacedItemsColor", hex).then(() => itemsRestyle());
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
							.onChange((value) => persistAndRestyle(this.plugin, "unplacedItemsMuted", value, itemsRestyle)),
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
						"highlights the currently selected chapter in the storyLibrary panel, only active if per panel highlighting is selected",
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
			colorKey: "codexColor",
			mutedKey: "codexMuted",
			smallCapsKey: "codexSmallCaps",
			useHeaderColorForAllKey: "codexUseHeaderColorForAll",
			fontKeys: {
				overrideFontKey: "codexOverrideFont",
				fontFamilyKey: "codexFontFamily",
				fontWeightKey: "codexFontWeight",
			},
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyCodexFolderStyle();
				this.plugin.applyCodexNoteLabelStyle();
				this.plugin.applyHighlightStyle();
			},
		});

		const codexFolderGroup = new SettingGroup(body);
		let folderColourSetting!: Setting;
		const codexFolderRestyle = () => this.plugin.applyCodexFolderStyle();
		codexFolderGroup.addSetting((setting) => {
			setting
				.setName("Folder size")
				.setDesc("Font size of the codex folder names and chevrons, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.codexFolderFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "codexFolderFontSize", value, codexFolderRestyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"Folder font",
			"codexFolderOverrideFont",
			"codexFolderFontFamily",
			"codexFolderFontWeight",
			codexFolderRestyle,
			settings.codexFolderFontSize,
		);
		codexFolderGroup
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
		const codexNoteLabelRestyle = () => this.plugin.applyCodexNoteLabelStyle();
		codexNoteLabelGroup.addSetting((setting) => {
			setting
				.setName("Codex note label size")
				.setDesc("Font size of the codex note (file) labels, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.codexNoteLabelFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "codexNoteLabelFontSize", value, codexNoteLabelRestyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"Codex note label font",
			"codexNoteLabelOverrideFont",
			"codexNoteLabelFontFamily",
			"codexNoteLabelFontWeight",
			codexNoteLabelRestyle,
			settings.codexNoteLabelFontSize,
		);
		codexNoteLabelGroup
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
			// Text colour has no useHeaderColorForAll interaction to gate on, so unlike the row above
			// it never needs its Setting captured for applyUseHeaderColorVisibility below.
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
			// Highlight *text* colour stays visible regardless — it never follows "use header colour
			// for all" (see applyHighlightStyle's codexHighlightTextColor comment), so hiding it here
			// would leave no way to adjust the one colour that still needs picking.
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

	private renderForgePanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group.addSetting((setting) => {
			setting
				.setName("Companion icon colour")
				.setDesc("Colour of companion icons in the Forge sidebar tab.")
				.addButton((button) => {
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.forgeCompanionIconColor, (hex) => {
						persistAndRestyle(this.plugin, "forgeCompanionIconColor", hex, () => this.plugin.applyRightRailPanelStyles());
					});
				});
		});
	}

	private renderRightRailPanelContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		panel: "recommend" | "archive",
	): void {
		const restyle = () => this.plugin.applyRightRailPanelStyles();
		const keys =
			panel === "recommend"
				? {
						sizeKey: undefined,
						colorKey: "recommendHeaderColor" as const,
						mutedKey: "recommendHeaderMuted" as const,
						smallCapsKey: undefined,
						useHeaderColorForAllKey: "recommendUseHeaderColorForAll" as const,
						fontKeys: undefined,
						colorLabel: "Base colour",
						useForAllLabel: "Use base colour for all colour options",
						itemsSizeKey: "recommendItemsFontSize" as const,
						itemsColorKey: "recommendItemsColor" as const,
						itemsMutedKey: "recommendItemsMuted" as const,
						itemsOverrideFontKey: "recommendItemsOverrideFont" as const,
						itemsFontFamilyKey: "recommendItemsFontFamily" as const,
						itemsFontWeightKey: "recommendItemsFontWeight" as const,
						highlightColorKey: "recommendHighlightColor" as const,
						highlightTextColorKey: "recommendHighlightTextColor" as const,
						itemsLabel: "Context panel items",
					}
				: {
						sizeKey: "archiveHeaderFontSize" as const,
						colorKey: "archiveHeaderColor" as const,
						mutedKey: "archiveHeaderMuted" as const,
						smallCapsKey: "archiveHeaderSmallCaps" as const,
						useHeaderColorForAllKey: "archiveUseHeaderColorForAll" as const,
						fontKeys: {
							overrideFontKey: "archiveHeaderOverrideFont" as const,
							fontFamilyKey: "archiveHeaderFontFamily" as const,
							fontWeightKey: "archiveHeaderFontWeight" as const,
						},
						colorLabel: undefined,
						useForAllLabel: undefined,
						itemsSizeKey: "archiveItemsFontSize" as const,
						itemsColorKey: "archiveItemsColor" as const,
						itemsMutedKey: "archiveItemsMuted" as const,
						itemsOverrideFontKey: "archiveItemsOverrideFont" as const,
						itemsFontFamilyKey: "archiveItemsFontFamily" as const,
						itemsFontWeightKey: "archiveItemsFontWeight" as const,
						highlightColorKey: "archiveHighlightColor" as const,
						highlightTextColorKey: "archiveHighlightTextColor" as const,
						itemsLabel: "Archive items",
					};

		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: keys.sizeKey,
			colorKey: keys.colorKey,
			mutedKey: keys.mutedKey,
			smallCapsKey: keys.smallCapsKey,
			fontKeys: keys.fontKeys,
			useHeaderColorForAllKey: keys.useHeaderColorForAllKey,
			colorLabel: keys.colorLabel,
			useForAllLabel: keys.useForAllLabel,
			restyle,
		});

		if (panel === "recommend") {
			const recommendSizeFields: Array<{
				name: string;
				desc: string;
				min: number;
				max: number;
				sizeKey: "recommendTabsFontSize" | "recommendChapterTitleFontSize" | "recommendNovelTitleFontSize" | "recommendNovelSubtitleFontSize" | "recommendPlotChapterFontSize" | "recommendDossierHeaderFontSize" | "recommendSectionTitleFontSize" | "recommendDetailsFontSize" | "recommendSynopsisFontSize";
				overrideFontKey: "recommendTabsOverrideFont" | "recommendChapterTitleOverrideFont" | "recommendNovelTitleOverrideFont" | "recommendNovelSubtitleOverrideFont" | "recommendPlotChapterOverrideFont" | "recommendDossierHeaderOverrideFont" | "recommendSectionTitleOverrideFont" | "recommendDetailsOverrideFont" | "recommendSynopsisOverrideFont";
				fontFamilyKey: "recommendTabsFontFamily" | "recommendChapterTitleFontFamily" | "recommendNovelTitleFontFamily" | "recommendNovelSubtitleFontFamily" | "recommendPlotChapterFontFamily" | "recommendDossierHeaderFontFamily" | "recommendSectionTitleFontFamily" | "recommendDetailsFontFamily" | "recommendSynopsisFontFamily";
				fontWeightKey: "recommendTabsFontWeight" | "recommendChapterTitleFontWeight" | "recommendNovelTitleFontWeight" | "recommendNovelSubtitleFontWeight" | "recommendPlotChapterFontWeight" | "recommendDossierHeaderFontWeight" | "recommendSectionTitleFontWeight" | "recommendDetailsFontWeight" | "recommendSynopsisFontWeight";
			}> = [
				{
					name: "Tabs size",
					desc: "Size of the Novel / Chapter / Dossier tab labels.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendTabsFontSize",
					overrideFontKey: "recommendTabsOverrideFont",
					fontFamilyKey: "recommendTabsFontFamily",
					fontWeightKey: "recommendTabsFontWeight",
				},
				{
					name: "Chapter title size",
					desc: "Size of the chapter heading under the panel header.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendChapterTitleFontSize",
					overrideFontKey: "recommendChapterTitleOverrideFont",
					fontFamilyKey: "recommendChapterTitleFontFamily",
					fontWeightKey: "recommendChapterTitleFontWeight",
				},
				{
					name: "Novel title size",
					desc: "Size of the novel title on the Novel tab.",
					min: 0.5,
					max: 2,
					sizeKey: "recommendNovelTitleFontSize",
					overrideFontKey: "recommendNovelTitleOverrideFont",
					fontFamilyKey: "recommendNovelTitleFontFamily",
					fontWeightKey: "recommendNovelTitleFontWeight",
				},
				{
					name: "Novel subtitle size",
					desc: "Size of the novel subtitle on the Novel tab.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendNovelSubtitleFontSize",
					overrideFontKey: "recommendNovelSubtitleOverrideFont",
					fontFamilyKey: "recommendNovelSubtitleFontFamily",
					fontWeightKey: "recommendNovelSubtitleFontWeight",
				},
				{
					name: "Plot chapter name size",
					desc: "Size of chapter names in the Novel tab's plot list.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendPlotChapterFontSize",
					overrideFontKey: "recommendPlotChapterOverrideFont",
					fontFamilyKey: "recommendPlotChapterFontFamily",
					fontWeightKey: "recommendPlotChapterFontWeight",
				},
				{
					name: "Dossier search size",
					desc: "Size of the Dossier search field (styled as a header).",
					min: 0.5,
					max: 2,
					sizeKey: "recommendDossierHeaderFontSize",
					overrideFontKey: "recommendDossierHeaderOverrideFont",
					fontFamilyKey: "recommendDossierHeaderFontFamily",
					fontWeightKey: "recommendDossierHeaderFontWeight",
				},
				{
					name: "Section title size",
					desc: "Size of section labels (Synopsis, Cast, entity group names, …).",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendSectionTitleFontSize",
					overrideFontKey: "recommendSectionTitleOverrideFont",
					fontFamilyKey: "recommendSectionTitleFontFamily",
					fontWeightKey: "recommendSectionTitleFontWeight",
				},
				{
					name: "Details size",
					desc: "Size of hit cards and detail text.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendDetailsFontSize",
					overrideFontKey: "recommendDetailsOverrideFont",
					fontFamilyKey: "recommendDetailsFontFamily",
					fontWeightKey: "recommendDetailsFontWeight",
				},
				{
					name: "Synopsis size",
					desc: "Size of the synopsis textarea.",
					min: 0.5,
					max: 1.5,
					sizeKey: "recommendSynopsisFontSize",
					overrideFontKey: "recommendSynopsisOverrideFont",
					fontFamilyKey: "recommendSynopsisFontFamily",
					fontWeightKey: "recommendSynopsisFontWeight",
				},
			];

			for (const field of recommendSizeFields) {
				const sizeKey = field.sizeKey;
				new SettingGroup(body).addSetting((setting) => {
					setting
						.setName(field.name)
						.setDesc(field.desc)
						.addSlider((slider) =>
							slider
								.setLimits(field.min, field.max, 0.1)
								.setValue(settings[sizeKey])
								.onChange((value) => persistAndRestyle(this.plugin, sizeKey, value, restyle)),
						);
				});
				renderCustomFontCard(
					body,
					this.plugin,
					`${field.name.replace(/ size$/, "")} font`,
					field.overrideFontKey,
					field.fontFamilyKey,
					field.fontWeightKey,
					restyle,
					settings[sizeKey],
				);
			}
		}

		const itemsGroup = new SettingGroup(body);
		let itemsColourSetting!: Setting;
		itemsGroup.addSetting((setting) => {
			setting
				.setName(keys.itemsLabel)
				.setDesc("Text size of list items, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings[keys.itemsSizeKey])
						.onChange((value) => persistAndRestyle(this.plugin, keys.itemsSizeKey, value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			`${keys.itemsLabel} font`,
			keys.itemsOverrideFontKey,
			keys.itemsFontFamilyKey,
			keys.itemsFontWeightKey,
			restyle,
			settings[keys.itemsSizeKey],
		);
		itemsGroup
			.addSetting((setting) => {
				itemsColourSetting = setting;
				setting
					.setName(`${keys.itemsLabel} colour`)
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[keys.itemsColorKey], (hex) => {
							void this.plugin.updateSetting(keys.itemsColorKey, hex).then(() => restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings[keys.itemsMutedKey])
							.onChange((value) => persistAndRestyle(this.plugin, keys.itemsMutedKey, value, restyle)),
					);
			});

		// Highlight colour pair — same shape as Library/Unplaced/Codex/storyTelling — for both
		// Story Context and Archive; used to only render for Archive, leaving Story Context with no
		// way to set its highlighted-item text colour despite recommendHighlightColor/
		// recommendHighlightTextColor already existing in settings and already being applied by
		// applyRightRailPanelStyles().
		let highlightColourSetting: Setting | null = null;
		const highlightGroup = new SettingGroup(body);
		highlightGroup
			.addSetting((setting) => {
				highlightColourSetting = setting;
				setting
					.setName("Highlight colour")
					.setDesc("Background colour for the selected item.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[keys.highlightColorKey], (hex) => {
							void this.plugin.updateSetting(keys.highlightColorKey, hex).then(() => restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Highlight text colour")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[keys.highlightTextColorKey], (hex) => {
							void this.plugin.updateSetting(keys.highlightTextColorKey, hex).then(() => restyle());
						}),
					);
			});

		const applyUseHeaderColorVisibility = (hidden: boolean) => {
			itemsColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			highlightColourSetting?.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		useHeaderColorToggle.onChange((value) => {
			void this.plugin.updateSetting(keys.useHeaderColorForAllKey, value).then(() => {
				applyUseHeaderColorVisibility(value);
				restyle();
			});
		});
		applyUseHeaderColorVisibility(settings[keys.useHeaderColorForAllKey]);
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
