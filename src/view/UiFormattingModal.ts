import { App, Modal, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness, StoryForgePluginSettings } from "../main";
import {
	bindColorSwatchButton,
	persistAndRestyle,
	renderCustomFontCard,
	renderTabbedBody,
	type ColorSwatchMutedOption,
	type StyleModalTab,
} from "./styleModalHelpers";
import { resolveThemeMutedColor } from "./PalettePickerModal";
import { resolveMainThreadRowColor } from "./novelColor";
import { renderInterfaceFontsTab } from "./interfaceFontsTab";
import { renderInterfaceColoursTab } from "./interfaceColoursTab";
import { renderInterfaceSizesTab } from "./interfaceSizesTab";
import { mountAlignedPreviewColumn } from "./rowAlignedPreview";
import { mountRightSidebarPreviewSample, mountStorytellingPreviewSample, mountUiStylePreviewSample, type RightSidebarPreviewMode } from "./uiStylePreviewSample";

function mutedSwatch(
	plugin: StoryForgePlugin,
	key: keyof StoryForgePluginSettings,
	active: boolean,
	restyle: () => void,
): ColorSwatchMutedOption {
	return {
		isActive: active,
		onSelect: () => persistAndRestyle(plugin, key, true as StoryForgePluginSettings[typeof key], restyle),
		onClear: () => persistAndRestyle(plugin, key, false as StoryForgePluginSettings[typeof key], restyle),
	};
}

function previewMainThread(plugin: StoryForgePlugin): { color: string; text: string } {
	const row = resolveMainThreadRowColor(plugin.app, plugin.getSettings());
	return { color: row.background, text: row.text };
}

/** Innermost visible tab pane under a tabbed body (walks nested tab hosts). */
function leafTabBody(root: HTMLElement): HTMLElement | null {
	let node: HTMLElement = root;
	for (;;) {
		const next: HTMLElement | null = node.querySelector(
			":scope > .sf-text-style-tab-body-wrapper > .sf-text-style-tab-body:not(.sf-settings-hidden)",
		);
		if (!next) return node === root ? null : node;
		node = next;
	}
}

/** The single storyForge interface chrome modal. formatForge adds font pickers via
 * `renderCustomFontCard` when registered; it does not own a second copy of this UI. */
export class UiFormattingModal extends Modal {
	private plugin: StoryForgePlugin;
	private disposeRowPreview: (() => void) | null = null;

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
		this.disposeRowPreview?.();
		this.disposeRowPreview = null;
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
		const chromePreview = preview.createDiv({ cls: "sf-ui-format-preview-chrome" });
		const rowPreview = preview.createDiv({ cls: "sf-ui-format-preview-rows sf-settings-hidden" });
		const storyforgePreview = chromePreview.createDiv();
		const storytellingPreview = chromePreview.createDiv({ cls: "sf-settings-hidden" });
		const rightPreview = chromePreview.createDiv({ cls: "sf-settings-hidden" });
		mountUiStylePreviewSample(storyforgePreview);
		mountStorytellingPreviewSample(storytellingPreview);
		mountRightSidebarPreviewSample(rightPreview, "chrome", previewMainThread(this.plugin));

		const contextTabs: StyleModalTab[] = [
			{
				id: "novel",
				label: "Novel",
				render: (body) => this.renderContextNovelContent(body, settings),
			},
			{
				id: "box",
				label: "Chapter",
				render: (body) => this.renderContextBoxContent(body, settings),
			},
			{
				id: "details",
				label: "Dossier",
				render: (body) => this.renderContextDossierContent(body, settings),
			},
		];

		let contextTabId = "novel";
		let rightTabId = "chrome";
		let rightPreviewMode: RightSidebarPreviewMode = "chrome";
		const setRightPreviewMode = (mode: RightSidebarPreviewMode) => {
			rightPreviewMode = mode;
			if (!rightPreview.hasClass("sf-settings-hidden")) {
				mountRightSidebarPreviewSample(
					rightPreview,
					rightPreviewMode,
					previewMainThread(this.plugin),
				);
			}
		};

		const rightTabs: StyleModalTab[] = [
			{
				id: "chrome",
				label: "Navigation",
				render: (body) => this.renderPanelChromeContent(body, settings),
			},
			{
				id: "story-context",
				label: "Story Context",
				render: (body) =>
					renderTabbedBody(body, contextTabs, {
						onActivate: (id) => {
							contextTabId = id;
							if (rightTabId === "story-context") {
								setRightPreviewMode(id as RightSidebarPreviewMode);
							}
						},
					}),
			},
			{
				id: "archive",
				label: "Archive",
				render: (body) => this.renderRightRailPanelContent(body, settings),
			},
		];

		const panelTabs: StyleModalTab[] = [
			{
				id: "series",
				label: "Series",
				render: (body) => {
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "",
						sizeKey: "librarySeriesTitleFontSize",
						colorKey: "librarySeriesTitleColor",
						smallCapsKey: "librarySeriesTitleSmallCaps",
						overrideFontKey: "librarySeriesTitleOverrideFont",
						fontFamilyKey: "librarySeriesTitleFontFamily",
						fontWeightKey: "librarySeriesTitleFontWeight",
						restyle: () => this.plugin.applyLibraryHeaderStyles(),
						mergeFont: true,
					});
				},
			},
			{
				id: "library",
				label: "Library",
				render: (body) => {
					this.renderPanelColourGroup(body, settings, {
						colorKey: "libraryItemsColor",
						mutedKey: "libraryItemsMuted",
						highlightTextKey: "highlightTextColor",
						restyle: () => {
							this.plugin.applyLibraryHeaderStyles();
							this.plugin.applyHighlightStyle();
							this.plugin.applyStorytellingItemsStyle();
						},
					});
					this.renderTitleStyleGroup(body, settings, {
						labelPrefix: "novels",
						sizeKey: "libraryBookTitleFontSize",
						smallCapsKey: "libraryBookTitleSmallCaps",
						overrideFontKey: "libraryBookTitleOverrideFont",
						fontFamilyKey: "libraryBookTitleFontFamily",
						fontWeightKey: "libraryBookTitleFontWeight",
						restyle: () => this.plugin.applyLibraryHeaderStyles(),
						mergeFont: true,
					});
					this.renderSubtitleStyleGroup(body, settings);
					this.renderLibraryItemsGroup(body, settings);
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
		];

		const visualTabs: StyleModalTab[] = [
			{
				id: "storyforge",
				label: "storyforge",
				render: (body) => renderTabbedBody(body, panelTabs),
			},
			{
				id: "storytelling",
				label: "storytelling",
				render: (body) => {
					const scroll = body.createDiv({ cls: "sf-ui-format-plain-scroll" });
					this.renderStorytellingPanelContent(scroll, settings);
				},
			},
			{
				id: "story-context",
				label: "story context",
				render: (body) =>
					renderTabbedBody(body, rightTabs, {
						onActivate: (id) => {
							rightTabId = id;
							setRightPreviewMode(
								(id === "story-context" ? contextTabId : id) as RightSidebarPreviewMode,
							);
						},
					}),
			},
		];

		const listTabs: StyleModalTab[] = [
			{
				id: "text",
				label: "text",
				render: (body) => renderInterfaceFontsTab(body, this.plugin),
			},
			{
				id: "colours",
				label: "colours",
				render: (body) => renderInterfaceColoursTab(body, this.plugin),
			},
			{
				id: "size",
				label: "size",
				render: (body) => renderInterfaceSizesTab(body, this.plugin),
			},
		];

		let topId = "visual";
		let visualId = "storyforge";

		const showVisualPreview = () => {
			chromePreview.removeClass("sf-settings-hidden");
			rowPreview.addClass("sf-settings-hidden");
			preview.removeClass("is-row-aligned");
			this.disposeRowPreview?.();
			this.disposeRowPreview = null;
			storyforgePreview.toggleClass("sf-settings-hidden", visualId !== "storyforge");
			storytellingPreview.toggleClass("sf-settings-hidden", visualId !== "storytelling");
			rightPreview.toggleClass("sf-settings-hidden", visualId !== "story-context");
			if (visualId === "story-context") {
				mountRightSidebarPreviewSample(
					rightPreview,
					rightPreviewMode,
					previewMainThread(this.plugin),
				);
			}
		};

		const showListPreview = () => {
			chromePreview.addClass("sf-settings-hidden");
			rowPreview.removeClass("sf-settings-hidden");
			preview.addClass("is-row-aligned");
			this.disposeRowPreview?.();
			this.disposeRowPreview = null;
			const sourcesRoot = leafTabBody(controls);
			if (sourcesRoot) this.disposeRowPreview = mountAlignedPreviewColumn(rowPreview, sourcesRoot);
		};

		renderTabbedBody(
			controls,
			[
				{
					id: "visual",
					label: "visual interface editing",
					render: (body) =>
						renderTabbedBody(body, visualTabs, {
							onActivate: (id) => {
								visualId = id;
								if (topId === "visual") showVisualPreview();
							},
						}),
				},
				{
					id: "list",
					label: "list interface editing",
					render: (body) =>
						renderTabbedBody(body, listTabs, {
							onActivate: () => {
								if (topId === "list") showListPreview();
							},
						}),
				},
			],
			{
				onActivate: (id) => {
					topId = id;
					if (id === "list") showListPreview();
					else showVisualPreview();
				},
			},
		);
	}

	/**
	 * Shared by Unplaced/Codex/Archive: header size, font, and small caps.
	 * Panel colour lives on `renderPanelColourGroup` instead.
	 */
	private renderHeaderStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			sizeKey: "unplacedFontSize" | "codexFontSize" | "archiveHeaderFontSize";
			smallCapsKey: "unplacedSmallCaps" | "codexSmallCaps" | "archiveHeaderSmallCaps";
			fontKeys: {
				overrideFontKey: "unplacedOverrideFont" | "codexOverrideFont" | "archiveHeaderOverrideFont";
				fontFamilyKey: "unplacedFontFamily" | "codexFontFamily" | "archiveHeaderFontFamily";
				fontWeightKey: "unplacedFontWeight" | "codexFontWeight" | "archiveHeaderFontWeight";
			};
			restyle: () => void;
		},
	): void {
		const group = new SettingGroup(body);
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
		const { overrideFontKey, fontFamilyKey, fontWeightKey } = config.fontKeys;
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			overrideFontKey,
			fontFamilyKey,
			fontWeightKey,
			config.restyle,
			settings[config.sizeKey],
			group,
		);
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

	/**
	 * The single colour option for Library / Unplaced / Codex: one swatch (plus muted) and the
	 * highlight-text swatch that sits with it. Series title keeps its own colour; everything else
	 * in the panel (book titles, items, folders, notes, highlight background) follows this one.
	 */
	private renderPanelColourGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			heading?: string;
			colorKey: "libraryItemsColor" | "unplacedColor" | "codexColor" | "archiveHeaderColor";
			mutedKey: "libraryItemsMuted" | "unplacedMuted" | "codexMuted" | "archiveHeaderMuted";
			highlightTextKey: "highlightTextColor" | "unplacedHighlightTextColor" | "codexHighlightTextColor" | "archiveHighlightTextColor";
			restyle: () => void;
		},
	): void {
		const group = new SettingGroup(body);
		if (config.heading) group.setHeading(config.heading);
		group
			.addSetting((setting) => {
				setting.setName("Colour").addButton((button) =>
					bindColorSwatchButton(
						this.app,
						this.plugin,
						button.buttonEl,
						settings[config.colorKey],
						(hex) => {
							void this.plugin.updateSetting(config.colorKey, hex).then(() => config.restyle());
						},
						undefined,
						mutedSwatch(this.plugin, config.mutedKey, settings[config.mutedKey], config.restyle),
					),
				);
			})
			.addSetting((setting) => {
				setting.setName("Highlight text colour").addButton((button) =>
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[config.highlightTextKey], (hex) => {
						void this.plugin.updateSetting(config.highlightTextKey, hex).then(() => {
							this.plugin.applyHighlightStyle();
							config.restyle();
						});
					}),
				);
			});
	}

	private renderTitleStyleGroup(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		config: {
			labelPrefix: string;
			heading?: string;
			sizeDesc?: string;
			sizeKey: keyof StoryForgePluginSettings;
			colorKey?: keyof StoryForgePluginSettings;
			smallCapsKey?: keyof StoryForgePluginSettings;
			overrideFontKey: keyof StoryForgePluginSettings;
			fontFamilyKey: keyof StoryForgePluginSettings;
			fontWeightKey: keyof StoryForgePluginSettings;
			mutedKey?: keyof StoryForgePluginSettings;
			restyle: () => void;
			sizeMin?: number;
			sizeMax?: number;
			/** Put the font picker in this same group with no extra heading. */
			mergeFont?: boolean;
		},
	): { colorHideEl?: HTMLElement } {
		const group = new SettingGroup(body);
		if (config.heading) group.setHeading(config.heading);
		const sizeName = config.labelPrefix ? `${config.labelPrefix} size` : "Size";
		const smallCapsName = config.labelPrefix ? `${config.labelPrefix} small caps` : "Small caps";
		group.addSetting((setting) => {
			setting
				.setName(sizeName)
				.setDesc(config.sizeDesc ?? "Text size, from 0.5em to 2em.")
				.addSlider((slider) =>
					slider
						.setLimits(config.sizeMin ?? 0.5, config.sizeMax ?? 2, 0.1)
						.setValue(settings[config.sizeKey] as number)
						.onChange((value) => {
							void this.plugin.updateSetting(config.sizeKey as never, value as never).then(() => config.restyle());
						}),
				);
		});
		const colour = config.colorKey
			? {
					hex: settings[config.colorKey] as string,
					onPick: (hex: string) => {
						void this.plugin.updateSetting(config.colorKey as never, hex as never).then(() => config.restyle());
					},
					muted: config.mutedKey
						? mutedSwatch(this.plugin, config.mutedKey, settings[config.mutedKey] as boolean, config.restyle)
						: undefined,
				}
			: undefined;
		const { colorHideEl } = renderCustomFontCard(
			body,
			this.plugin,
			config.mergeFont ? "" : `${config.labelPrefix} font`,
			config.overrideFontKey,
			config.fontFamilyKey,
			config.fontWeightKey,
			config.restyle,
			() => this.plugin.getSettings()[config.sizeKey] as number,
			config.mergeFont ? group : undefined,
			colour,
		);
		if (config.smallCapsKey) {
			const smallCapsKey = config.smallCapsKey;
			group.addSetting((setting) => {
				setting
					.setName(smallCapsName)
					.addToggle((toggle) =>
						toggle.setValue(settings[smallCapsKey] as boolean).onChange((value) => {
							void this.plugin.updateSetting(smallCapsKey as never, value as never).then(() => config.restyle());
						}),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		}
		return { colorHideEl };
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
			"",
			"libraryBookSubtitleOverrideFont",
			"libraryBookSubtitleFontFamily",
			"libraryBookSubtitleFontWeight",
			restyle,
			settings.libraryBookSubtitleFontSize,
			group,
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
			"",
			"libraryItemsOverrideFont",
			"libraryItemsFontFamily",
			"libraryItemsFontWeight",
			restyle,
			() => this.plugin.getSettings().libraryItemsFontSize,
			group,
		);
	}

	/**
	 * storyTelling panel's own chapter items — size, font, colour, and highlight text on one card.
	 * Highlight background uses the items colour. "Chapter colour" in the palette picker mirrors
	 * the storyLibrary panel's chapter colour (and its highlight text); Codex stays on its own tab.
	 */
	private renderStorytellingPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const itemsGroup = new SettingGroup(body);
		const restyle = () => {
			this.plugin.applyStorytellingItemsStyle();
			this.plugin.applyHighlightStyle();
		};
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
		const chapterSwatchHex = settings.libraryItemsMuted ? resolveThemeMutedColor() : settings.libraryItemsColor;
		let highlightTextColourSetting!: Setting;
		const applyChapterColourVisibility = (useChapterColour: boolean) => {
			highlightTextColourSetting.settingEl.toggleClass("sf-settings-hidden", useChapterColour);
		};
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"storytellingItemsOverrideFont",
			"storytellingItemsFontFamily",
			"storytellingItemsFontWeight",
			restyle,
			settings.storytellingItemsFontSize,
			itemsGroup,
			{
				hex: settings.storytellingItemsColor,
				onPick: (hex) => {
					void this.plugin
						.updateSettings({
							storytellingItemsColor: hex,
							storytellingItemsMuted: false,
							storytellingLinkItemsColorToLibrary: false,
						})
						.then(() => {
							applyChapterColourVisibility(false);
							restyle();
						});
				},
				muted: {
					isActive: () => {
						const s = this.plugin.getSettings();
						return s.storytellingItemsMuted && !s.storytellingLinkItemsColorToLibrary;
					},
					onSelect: () =>
						this.plugin
							.updateSettings({
								storytellingItemsMuted: true,
								storytellingLinkItemsColorToLibrary: false,
							})
							.then(() => {
								applyChapterColourVisibility(false);
								restyle();
							}),
					onClear: () => persistAndRestyle(this.plugin, "storytellingItemsMuted", false, restyle),
				},
				leading: {
					isActive: () => this.plugin.getSettings().storytellingLinkItemsColorToLibrary,
					label: "Chapter colour",
					swatchHex: chapterSwatchHex,
					onSelect: () =>
						this.plugin
							.updateSettings({
								storytellingLinkItemsColorToLibrary: true,
								storytellingItemsMuted: false,
							})
							.then(() => {
								applyChapterColourVisibility(true);
								restyle();
							}),
					onClear: () =>
						this.plugin.updateSetting("storytellingLinkItemsColorToLibrary", false).then(() => {
							applyChapterColourVisibility(false);
							restyle();
						}),
				},
			},
		);

		itemsGroup.addSetting((setting) => {
			highlightTextColourSetting = setting;
			setting
				.setName("Highlight text colour")
				.setDesc("Colour of the active chapter's text in the storyTelling panel.")
				.addButton((button) =>
					bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.storytellingHighlightTextColor, (hex) => {
						void this.plugin.updateSetting("storytellingHighlightTextColor", hex).then(() => this.plugin.applyHighlightStyle());
					}),
				);
		});
		applyChapterColourVisibility(this.plugin.getSettings().storytellingLinkItemsColorToLibrary);
	}

	private renderUnplacedPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderPanelColourGroup(body, settings, {
			colorKey: "unplacedColor",
			mutedKey: "unplacedMuted",
			highlightTextKey: "unplacedHighlightTextColor",
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
			},
		});
		this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "unplacedFontSize",
			smallCapsKey: "unplacedSmallCaps",
			fontKeys: {
				overrideFontKey: "unplacedOverrideFont",
				fontFamilyKey: "unplacedFontFamily",
				fontWeightKey: "unplacedFontWeight",
			},
			restyle: () => this.plugin.applyHeaderStyles(),
		});

		const unplacedItemsGroup = new SettingGroup(body);
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
			"",
			"unplacedItemsOverrideFont",
			"unplacedItemsFontFamily",
			"unplacedItemsFontWeight",
			itemsRestyle,
			() => this.plugin.getSettings().unplacedItemsFontSize,
			unplacedItemsGroup,
		);
	}

	private renderCodexPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderPanelColourGroup(body, settings, {
			colorKey: "codexColor",
			mutedKey: "codexMuted",
			highlightTextKey: "codexHighlightTextColor",
			restyle: () => {
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
				this.plugin.applyCodexFolderStyle();
				this.plugin.applyCodexNoteLabelStyle();
			},
		});
		this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "codexFontSize",
			smallCapsKey: "codexSmallCaps",
			fontKeys: {
				overrideFontKey: "codexOverrideFont",
				fontFamilyKey: "codexFontFamily",
				fontWeightKey: "codexFontWeight",
			},
			restyle: () => this.plugin.applyHeaderStyles(),
		});

		const codexNoteGroup = new SettingGroup(body);
		const codexNoteRestyle = () => {
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyCodexNoteLabelStyle();
		};
		codexNoteGroup.addSetting((setting) => {
			setting
				.setName("Codex note size")
				.setDesc("Font size of folder names, chevrons, and note labels, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.codexNoteLabelFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "codexNoteLabelFontSize", value, codexNoteRestyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"codexNoteLabelOverrideFont",
			"codexNoteLabelFontFamily",
			"codexNoteLabelFontWeight",
			codexNoteRestyle,
			() => this.plugin.getSettings().codexNoteLabelFontSize,
			codexNoteGroup,
		);

		new SettingGroup(body).addSetting((setting) => {
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
	}

	private applyCodexFolderIndicatorThickness(value: CodexFolderIndicatorThickness): void {
		void this.plugin.updateSetting("codexFolderIndicatorThickness", value).then(() => {
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyHighlightStyle();
		});
	}

	private restyleRightRail(): void {
		this.plugin.applyRightRailPanelStyles();
	}

	/** Navigation colours for every Story Context icon tab, including Forge-family member icons. */
	private renderPanelChromeContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const restyle = () => this.restyleRightRail();
		const iconsGroup = new SettingGroup(body);
		iconsGroup
			.addSetting((setting) => {
				setting
					.setName("Active tab icons")
					.setDesc("Colour of the selected navigation icon.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.recommendTabsActiveColor, (hex) => {
							void this.plugin.updateSetting("recommendTabsActiveColor", hex).then(() => restyle());
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Inactive tab icons")
					.setDesc("Colour of unselected navigation icons. Hover uses the active tab colour.")
					.addButton((button) =>
						bindColorSwatchButton(
							this.app,
							this.plugin,
							button.buttonEl,
							settings.recommendTabsColor,
							(hex) => {
								void this.plugin.updateSetting("recommendTabsColor", hex).then(() => restyle());
							},
							undefined,
							mutedSwatch(this.plugin, "recommendTabsMuted", settings.recommendTabsMuted, restyle),
						),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Focus mode icon")
					.setDesc("Colour of the Forge family icon in Focus mode. There is no separate active or inactive colour.")
					.addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.recommendFocusModeIconColor, (hex) => {
							void this.plugin.updateSetting("recommendFocusModeIconColor", hex).then(() => restyle());
						}),
					);
			});
	}

	/** Synopsis — shared by Novel and Chapter plot notes; lives on Box with the chapter card. */
	private renderContextGeneralContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
	): void {
		const restyle = () => this.restyleRightRail();
		const synopsisGroup = new SettingGroup(body);
		synopsisGroup.setHeading("Synopsis");
		synopsisGroup.addSetting((setting) => {
			setting
				.setName("Size")
				.setDesc("Text size of the chapter summary, novel synopsis, and plot notes.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.recommendSynopsisFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "recommendSynopsisFontSize", value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"recommendSynopsisOverrideFont",
			"recommendSynopsisFontFamily",
			"recommendSynopsisFontWeight",
			restyle,
			() => this.plugin.getSettings().recommendSynopsisFontSize,
			synopsisGroup,
			{
				hex: settings.recommendSynopsisColor,
				onPick: (hex) => {
					void this.plugin.updateSetting("recommendSynopsisColor", hex).then(() => restyle());
				},
			},
		);
	}

	/** PoV / Location option and selectee — lives on Box with the chapter card. */
	private renderContextLabelsContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
	): void {
		const restyle = () => this.restyleRightRail();
		const metaGroup = new SettingGroup(body);
		metaGroup.addSetting((setting) => {
			setting
				.setName("Labels size")
				.setDesc("Text size of the reference label and the selected name.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.recommendMetaLabelFontSize)
						.onChange((value) => {
							void this.plugin.updateSetting("recommendMetaLabelFontSize", value).then(() =>
								this.plugin.updateSetting("recommendMetaControlFontSize", value).then(() => restyle()),
							);
						}),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"recommendMetaLabelOverrideFont",
			"recommendMetaLabelFontFamily",
			"recommendMetaLabelFontWeight",
			restyle,
			() => this.plugin.getSettings().recommendMetaLabelFontSize,
			metaGroup,
			{
				hex: settings.recommendMetaLabelColor,
				onPick: (hex) => {
					void this.plugin.updateSetting("recommendMetaLabelColor", hex).then(() => restyle());
				},
				muted: mutedSwatch(this.plugin, "recommendMetaLabelMuted", settings.recommendMetaLabelMuted, restyle),
			},
			{ rowName: "Option" },
		);
		metaGroup.addSetting((setting) => {
			setting
				.setName("Label small caps")
				.addToggle((toggle) =>
					toggle.setValue(settings.recommendMetaLabelSmallCaps).onChange((value) => persistAndRestyle(this.plugin, "recommendMetaLabelSmallCaps", value, restyle)),
				);
			setting.nameEl.addClass("sf-small-caps-label");
		});

		const selecteeGroup = new SettingGroup(body);
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"recommendMetaControlOverrideFont",
			"recommendMetaControlFontFamily",
			"recommendMetaControlFontWeight",
			restyle,
			() => this.plugin.getSettings().recommendMetaLabelFontSize,
			selecteeGroup,
			{
				hex: settings.recommendMetaControlColor,
				onPick: (hex) => {
					void this.plugin.updateSetting("recommendMetaControlColor", hex).then(() => restyle());
				},
				muted: mutedSwatch(this.plugin, "recommendMetaControlMuted", settings.recommendMetaControlMuted, restyle),
			},
			{ rowName: "Selectee" },
		);
	}

	/** Novel tab — cover title and subtitle. */
	private renderContextNovelContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
	): void {
		const restyle = () => this.restyleRightRail();
		this.renderTitleStyleGroup(body, settings, {
			labelPrefix: "Novel title",
			sizeKey: "recommendNovelTitleFontSize",
			overrideFontKey: "recommendNovelTitleOverrideFont",
			fontFamilyKey: "recommendNovelTitleFontFamily",
			fontWeightKey: "recommendNovelTitleFontWeight",
			colorKey: "recommendNovelTitleColor",
			smallCapsKey: "recommendNovelTitleSmallCaps",
			mutedKey: "recommendNovelTitleMuted",
			restyle,
			mergeFont: true,
		});

		this.renderTitleStyleGroup(body, settings, {
			labelPrefix: "Novel subtitle",
			sizeKey: "recommendNovelSubtitleFontSize",
			overrideFontKey: "recommendNovelSubtitleOverrideFont",
			fontFamilyKey: "recommendNovelSubtitleFontFamily",
			fontWeightKey: "recommendNovelSubtitleFontWeight",
			colorKey: "recommendNovelSubtitleColor",
			smallCapsKey: "recommendNovelSubtitleSmallCaps",
			mutedKey: "recommendNovelSubtitleMuted",
			restyle,
			mergeFont: true,
		});
	}

	/** Box tab — chapter card chrome, then section titles, reference type, and pill colours. */
	private renderContextBoxContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
	): void {
		const restyle = () => this.restyleRightRail();
		body.createEl("h3", { cls: "sf-settings-section-h4", text: "Chapter" });

		this.renderTitleStyleGroup(body, settings, {
			labelPrefix: "Chapter title",
			sizeKey: "recommendChapterTitleFontSize",
			overrideFontKey: "recommendChapterTitleOverrideFont",
			fontFamilyKey: "recommendChapterTitleFontFamily",
			fontWeightKey: "recommendChapterTitleFontWeight",
			smallCapsKey: "recommendChapterTitleSmallCaps",
			restyle,
			mergeFont: true,
		});

		this.renderContextLabelsContent(body, settings);
		this.renderContextGeneralContent(body, settings);

		body.createEl("h3", { cls: "sf-settings-section-h4", text: "Sections" });

		this.renderTitleStyleGroup(body, settings, {
			labelPrefix: "Labels",
			sizeKey: "recommendSectionTitleFontSize",
			overrideFontKey: "recommendSectionTitleOverrideFont",
			fontFamilyKey: "recommendSectionTitleFontFamily",
			fontWeightKey: "recommendSectionTitleFontWeight",
			colorKey: "recommendSectionTitleColor",
			mutedKey: "recommendSectionTitleMuted",
			restyle,
			mergeFont: true,
		});

		const itemsGroup = new SettingGroup(body);
		itemsGroup.addSetting((setting) => {
			setting
				.setName("Text size")
				.setDesc("Text size of Codex reference rows and of detail hits in the Details and Dossier panes.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.recommendItemsFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "recommendItemsFontSize", value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"recommendItemsOverrideFont",
			"recommendItemsFontFamily",
			"recommendItemsFontWeight",
			restyle,
			() => this.plugin.getSettings().recommendItemsFontSize,
			itemsGroup,
			{
				hex: settings.recommendItemsColor,
				onPick: (hex) => {
					void this.plugin.updateSetting("recommendItemsColor", hex).then(() => restyle());
				},
				muted: mutedSwatch(this.plugin, "recommendItemsMuted", settings.recommendItemsMuted, restyle),
			},
		);

		const unknownGroup = new SettingGroup(body);
		this.renderRecommendBoxColourTable(unknownGroup.listEl, settings, restyle);
	}

	private renderRecommendBoxColourTable(
		parent: HTMLElement,
		settings: StoryForgePluginSettings,
		restyle: () => void,
	): void {
		const table = parent.createEl("table", { cls: "sf-box-colour-table" });
		const headRow = table.createEl("thead").createEl("tr");
		headRow.createEl("th");
		headRow.createEl("th", { text: "box" });
		headRow.createEl("th", { text: "text" });
		const body = table.createEl("tbody");
		const rows: Array<{
			label: string;
			boxKey: keyof StoryForgePluginSettings;
			boxMuted: keyof StoryForgePluginSettings;
			textKey: keyof StoryForgePluginSettings;
			textMuted: keyof StoryForgePluginSettings;
		}> = [
			{
				label: "Named but not in Codex",
				boxKey: "recommendUnknownColor",
				boxMuted: "recommendUnknownMuted",
				textKey: "recommendUnknownHeaderColor",
				textMuted: "recommendUnknownHeaderMuted",
			},
			{
				label: "Details to capture",
				boxKey: "recommendCaptureColor",
				boxMuted: "recommendCaptureMuted",
				textKey: "recommendCaptureHeaderColor",
				textMuted: "recommendCaptureHeaderMuted",
			},
			{
				label: "Holding area",
				boxKey: "recommendHoldingColor",
				boxMuted: "recommendHoldingMuted",
				textKey: "recommendHoldingHeaderColor",
				textMuted: "recommendHoldingHeaderMuted",
			},
			{
				label: "Resolved",
				boxKey: "recommendResolvedColor",
				boxMuted: "recommendResolvedMuted",
				textKey: "recommendResolvedHeaderColor",
				textMuted: "recommendResolvedHeaderMuted",
			},
		];
		for (const row of rows) {
			const tr = body.createEl("tr");
			tr.createEl("th", { text: row.label, attr: { scope: "row" } });
			this.bindRecommendBoxColourSwatch(tr.createEl("td"), settings, restyle, row.label, "box", row.boxKey, row.boxMuted);
			this.bindRecommendBoxColourSwatch(tr.createEl("td"), settings, restyle, row.label, "text", row.textKey, row.textMuted);
		}
	}

	private bindRecommendBoxColourSwatch(
		cell: HTMLElement,
		settings: StoryForgePluginSettings,
		restyle: () => void,
		boxLabel: string,
		role: "box" | "text",
		colorKey: keyof StoryForgePluginSettings,
		mutedKey: keyof StoryForgePluginSettings,
	): void {
		const button = cell.createEl("button", { attr: { type: "button" } });
		bindColorSwatchButton(
			this.app,
			this.plugin,
			button,
			settings[colorKey] as string,
			(hex) => {
				void this.plugin.updateSetting(colorKey as never, hex as never).then(() => restyle());
			},
			undefined,
			mutedSwatch(this.plugin, mutedKey, settings[mutedKey] as boolean, restyle),
		);
		button.setAttr("aria-label", `${boxLabel} ${role} colour`);
	}

	/** Dossier search field — the typed entity name at the top of the Dossier pane. */
	private renderContextDossierContent(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
	): void {
		this.renderTitleStyleGroup(body, settings, {
			labelPrefix: "Dossier search",
			heading: "Dossier",
			sizeDesc:
				"The typed entity name in the Dossier search field. Hit cards use Text size; chapter names under the search use Title size (Box).",
			sizeKey: "recommendDossierHeaderFontSize",
			overrideFontKey: "recommendDossierHeaderOverrideFont",
			fontFamilyKey: "recommendDossierHeaderFontFamily",
			fontWeightKey: "recommendDossierHeaderFontWeight",
			colorKey: "recommendDossierHeaderColor",
			smallCapsKey: "recommendDossierHeaderSmallCaps",
			mutedKey: "recommendDossierHeaderMuted",
			restyle: () => this.restyleRightRail(),
			mergeFont: true,
		});
	}

	private renderRightRailPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const restyle = () => this.restyleRightRail();
		this.renderPanelColourGroup(body, settings, {
			colorKey: "archiveHeaderColor",
			mutedKey: "archiveHeaderMuted",
			highlightTextKey: "archiveHighlightTextColor",
			restyle,
		});
		this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "archiveHeaderFontSize",
			smallCapsKey: "archiveHeaderSmallCaps",
			fontKeys: {
				overrideFontKey: "archiveHeaderOverrideFont",
				fontFamilyKey: "archiveHeaderFontFamily",
				fontWeightKey: "archiveHeaderFontWeight",
			},
			restyle,
		});

		const itemsGroup = new SettingGroup(body);
		itemsGroup.addSetting((setting) => {
			setting
				.setName("Archive items")
				.setDesc("Text size of list items, from 0.5em to 1.5em.")
				.addSlider((slider) =>
					slider
						.setLimits(0.5, 1.5, 0.1)
						.setValue(settings.archiveItemsFontSize)
						.onChange((value) => persistAndRestyle(this.plugin, "archiveItemsFontSize", value, restyle)),
				);
		});
		renderCustomFontCard(
			body,
			this.plugin,
			"",
			"archiveItemsOverrideFont",
			"archiveItemsFontFamily",
			"archiveItemsFontWeight",
			restyle,
			() => this.plugin.getSettings().archiveItemsFontSize,
			itemsGroup,
		);
	}
}
