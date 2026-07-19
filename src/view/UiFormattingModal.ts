import { App, Modal, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness, CyclingGuideInterval, FontWeight, HeadingDividerThickness, StoryForgePluginSettings } from "../main";
import { CUSTOM_FONTS } from "../fonts";
import { ConvertToSeriesModal } from "./ConvertToSeriesModal";

const FONT_WEIGHT_OPTIONS: [string, string][] = [
	["300", "Light"],
	["400", "Normal"],
	["500", "Medium"],
	["600", "Semi Bold"],
	["700", "Bold"],
	["800", "Extra Bold"],
	["900", "Black"],
];

export class UiFormattingModal extends Modal {
	private plugin: StoryForgePlugin;
	private selectedOtherHeadingLevel: 4 | 5 | 6 = 4;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	private persistAndRestyle<K extends keyof StoryForgePluginSettings>(
		key: K,
		value: StoryForgePluginSettings[K],
		restyle: () => void,
	): void {
		this.plugin.updateSetting(key, value).then(() => restyle());
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

		const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
		const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

		const tabs: { id: string; label: string; render: (body: HTMLElement) => void }[] = [
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
					this.renderLibraryHighlightRows(body, settings);
					new SettingGroup(body).addSetting((setting) =>
						setting
							.setName("Divider below title")
							.setDesc("Adds a border below the series/book title, matching the border between storyForge's panes.")
							.addToggle((toggle) =>
								toggle
									.setValue(settings.libraryHeaderDividerBelow)
									.onChange((value) => this.persistAndRestyle("libraryHeaderDividerBelow", value, () => this.plugin.applyLibraryHeaderStyles())),
							),
					);
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
		];

		const tabBodies: HTMLElement[] = [];
		let activeTabId = tabs[0].id;

		tabs.forEach((tab) => {
			const tabBtn = tabBar.createEl("button", { cls: "sf-text-style-tab-btn", text: tab.label });
			if (tab.id === activeTabId) {
				tabBtn.addClass("is-active");
			}
			tabBtn.addEventListener("click", () => {
				activeTabId = tab.id;
				tabBar.querySelectorAll(".sf-text-style-tab-btn").forEach((btn) => btn.removeClass("is-active"));
				tabBtn.addClass("is-active");
				tabBodies.forEach((body, i) => {
					body.toggleClass("sf-settings-hidden", tabs[i].id !== activeTabId);
				});
			});

			const bodyEl = tabBodyWrapper.createDiv({ cls: "sf-text-style-tab-body" });
			if (tab.id !== activeTabId) {
				bodyEl.addClass("sf-settings-hidden");
			}
			tab.render(bodyEl);
			tabBodies.push(bodyEl);
		});
	}

	private bindColorSwatchButton(
		buttonEl: HTMLElement,
		initialHex: string,
		onPick: (hex: string) => void,
	): void {
		buttonEl.addClass("sf-color-swatch-btn");
		buttonEl.setAttr("aria-label", "Choose colour");
		const paint = (hex: string) => {
			buttonEl.style.backgroundColor = hex;
		};
		paint(initialHex);
		buttonEl.addEventListener("click", () => this.openColorSwatchPicker(paint, onPick));
	}

	private openColorSwatchPicker(paint: (hex: string) => void, onPick: (hex: string) => void): void {
		const s = this.plugin.getSettings();
		import("./PalettePickerModal").then(({ PalettePickerModal }) => {
			new PalettePickerModal(this.app, s.colorPaletteName, s.colorPaletteMode, s.customPaletteColors, (hex) =>
				this.applyColorPick(hex, paint, onPick),
			).open();
		});
	}

	private applyColorPick(hex: string, paint: (hex: string) => void, onPick: (hex: string) => void): void {
		paint(hex);
		onPick(hex);
	}

	private bindFontWeightDropdown(setting: Setting, value: FontWeight, onChange: (value: FontWeight) => void): void {
		setting.addDropdown((dropdown) => {
			for (const [val, label] of FONT_WEIGHT_OPTIONS) {
				dropdown.addOption(val, label);
				const opt = dropdown.selectEl.options[dropdown.selectEl.options.length - 1];
				opt.style.fontWeight = val;
			}
			const applySelectedWeight = (v: FontWeight) => {
				dropdown.selectEl.style.fontWeight = v;
			};
			dropdown.setValue(value);
			applySelectedWeight(value);
			dropdown.onChange((v) => this.applyFontWeightChange(v as FontWeight, applySelectedWeight, onChange));
		});
	}

	private applyFontWeightChange(
		v: FontWeight,
		applySelectedWeight: (v: FontWeight) => void,
		onChange: (value: FontWeight) => void,
	): void {
		onChange(v);
		applySelectedWeight(v);
	}

	private bindExclusivePair(
		toggleA: ToggleComponent,
		toggleB: ToggleComponent,
		persistA: (value: boolean) => void,
		persistB: (value: boolean) => void,
	): void {
		toggleA.onChange((value) => this.applyExclusiveToggle(value, toggleB, persistA, persistB));
		toggleB.onChange((value) => this.applyExclusiveToggle(value, toggleA, persistB, persistA));
	}

	private applyExclusiveToggle(
		value: boolean,
		other: ToggleComponent,
		persistSelf: (value: boolean) => void,
		persistOther: (value: boolean) => void,
	): void {
		if (value && other.getValue()) {
			other.setValue(false);
			persistOther(false);
		}
		persistSelf(value);
	}

	private renderToggleWithRevealCard(
		body: HTMLElement,
		toggleLabel: string,
		initialValue: boolean,
		persist: (value: boolean) => void,
		buildRevealRow: (card: SettingGroup) => Setting,
		restyle: () => void,
		extraRowBefore?: (card: SettingGroup) => void,
	): { toggle: ToggleComponent; card: SettingGroup } {
		const card = new SettingGroup(body);
		if (extraRowBefore) extraRowBefore(card);
		let toggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName(toggleLabel).addToggle((t) => {
				toggle = t;
				t.setValue(initialValue);
			}),
		);
		const revealRow = buildRevealRow(card);
		this.wireCardToggle(toggle, revealRow, persist, restyle);
		return { toggle, card };
	}

	private wireCardToggle(toggle: ToggleComponent, card: Setting, persist: (value: boolean) => void, restyle: () => void): void {
		const applyVisibility = (hidden: boolean) => card.settingEl.toggleClass("sf-settings-hidden", hidden);
		toggle.onChange((value) => this.applyCardToggle(value, persist, applyVisibility, restyle));
		applyVisibility(!toggle.getValue());
	}

	private applyCardToggle(
		value: boolean,
		persist: (value: boolean) => void,
		applyVisibility: (hidden: boolean) => void,
		restyle: () => void,
	): void {
		persist(value);
		applyVisibility(!value);
		restyle();
	}

	private renderSizeCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		label: string,
		sliderLabel: string,
		overrideKey: keyof StoryForgePluginSettings,
		sizeKey: keyof StoryForgePluginSettings,
		min: number,
		max: number,
		restyle: () => void,
		extraRowBefore?: (card: SettingGroup) => void,
	): void {
		this.renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey] as boolean,
			async (value) => { await this.plugin.updateSetting(overrideKey, value); },
			(card) => {
				let sliderSetting!: Setting;
				card.addSetting((setting) => {
					sliderSetting = setting;
					setting.setName(sliderLabel).addSlider((slider) =>
						slider
							.setLimits(min, max, 0.25)
							.setValue(settings[sizeKey] as number)
							.onChange((value) => this.persistAndRestyle(sizeKey, value, restyle)),
					);
				});
				return sliderSetting;
			},
			restyle,
			extraRowBefore,
		);
	}

	private renderColorOverrideCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		label: string,
		swatchLabel: string,
		overrideKey: keyof StoryForgePluginSettings,
		colorKey: keyof StoryForgePluginSettings,
		restyle: () => void,
		onToggle?: (value: boolean) => void,
	): void {
		this.renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey] as boolean,
			async (value) => {
				await this.plugin.updateSetting(overrideKey, value);
				onToggle?.(value);
			},
			(card) => {
				let colorSetting!: Setting;
				card.addSetting((setting) => {
					colorSetting = setting;
					setting.setName(swatchLabel).addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings[colorKey] as string, async (hex) => {
							await this.plugin.updateSetting(colorKey, hex);
							restyle();
						}),
					);
				});
				return colorSetting;
			},
			restyle,
		);
	}

	private renderEmphasisColorOverrideCard(body: HTMLElement, settings: StoryForgePluginSettings, label: string, restyle: () => void): Setting {
		const card = new SettingGroup(body);

		let toggle!: ToggleComponent;
		let toggleSetting!: Setting;
		card.addSetting((setting) => {
			toggleSetting = setting;
			setting.setName(label).addToggle((t) => {
				toggle = t;
				t.setValue(settings.bodyTextOverrideEmphasisColor);
			});
		});

		let boldColorSetting!: Setting;
		card.addSetting((setting) => {
			boldColorSetting = setting;
			setting.setName("Bold colour").addButton((button) =>
				this.bindColorSwatchButton(button.buttonEl, settings.bodyTextBoldColor, async (hex) => {
					await this.plugin.updateSetting("bodyTextBoldColor", hex);
					restyle();
				}),
			);
		});

		let italicColorSetting!: Setting;
		card.addSetting((setting) => {
			italicColorSetting = setting;
			setting.setName("Italic colour").addButton((button) =>
				this.bindColorSwatchButton(button.buttonEl, settings.bodyTextItalicColor, async (hex) => {
					await this.plugin.updateSetting("bodyTextItalicColor", hex);
					restyle();
				}),
			);
		});

		const applyVisibility = (hidden: boolean) => {
			boldColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			italicColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		toggle.onChange((value) => this.applyEmphasisColorToggle(value, applyVisibility, restyle));
		applyVisibility(!toggle.getValue());

		return toggleSetting;
	}

	private applyEmphasisColorToggle(value: boolean, applyVisibility: (hidden: boolean) => void, restyle: () => void): void {
		this.plugin.updateSetting("bodyTextOverrideEmphasisColor", value).then(() => {
			applyVisibility(!value);
			restyle();
		});
	}

	private renderFontCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		overrideFontKey: keyof StoryForgePluginSettings,
		fontWeightKey: keyof StoryForgePluginSettings,
		fontFamilyKey?: keyof StoryForgePluginSettings,
		smallCapsKey?: keyof StoryForgePluginSettings,
	): void {
		const restyle = () => this.plugin.applyTextStyleOverrides();
		const card = new SettingGroup(body);

		let overrideToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Override theme's default font").addToggle((toggle) => {
				overrideToggle = toggle;
				toggle.setValue(settings[overrideFontKey] as boolean);
			}),
		);

		let selectedFontFamily: string | undefined = fontFamilyKey ? (settings[fontFamilyKey] as string) : undefined;

		let pickFontSetting!: Setting;
		card.addSetting((setting) => {
			pickFontSetting = setting;
			setting.setName("Pick font");
			if (!fontFamilyKey) return;
			setting.addDropdown((dropdown) => {
				for (const font of CUSTOM_FONTS) dropdown.addOption(font.id, font.label);
				for (const opt of Array.from(dropdown.selectEl.options)) {
					const font = CUSTOM_FONTS.find((f) => f.id === opt.value);
					opt.style.fontFamily = font ? font.cssFontFamily : "";
				}
				const applySelectedFont = (value: string) => {
					const font = CUSTOM_FONTS.find((f) => f.id === value);
					dropdown.selectEl.style.fontFamily = font ? font.cssFontFamily : "";
				};
				dropdown.setValue(settings[fontFamilyKey] as string);
				applySelectedFont(settings[fontFamilyKey] as string);
				dropdown.onChange((value) =>
					this.applyFontFamilyPick(fontFamilyKey, value, applySelectedFont, (v) => (selectedFontFamily = v), () => applyVisibility(!overrideToggle.getValue()), restyle),
				);
			});
		});

		let fontWeightSetting!: Setting;
		card.addSetting((setting) => {
			fontWeightSetting = setting;
			setting.setName("Font weight");
			this.bindFontWeightDropdown(setting, settings[fontWeightKey] as FontWeight, async (value) => {
				await this.plugin.updateSetting(fontWeightKey, value);
				restyle();
			});
		});

		let smallCapsSetting: Setting | undefined;
		if (smallCapsKey) {
			card.addSetting((setting) => {
				smallCapsSetting = setting;
				setting.setName("Small caps").addToggle((toggle) =>
					toggle.setValue(settings[smallCapsKey] as boolean).onChange((value) => this.persistAndRestyle(smallCapsKey, value, restyle)),
				);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		}

		const isSelectedFontVariable = (): boolean => {
			if (!fontFamilyKey) return true;
			const font = CUSTOM_FONTS.find((f) => f.id === selectedFontFamily);
			return font ? font.weightMin !== font.weightMax : true;
		};
		const applyVisibility = (overrideOff: boolean) => {
			pickFontSetting.settingEl.toggleClass("sf-settings-hidden", overrideOff);
			smallCapsSetting?.settingEl.toggleClass("sf-settings-hidden", overrideOff);
			fontWeightSetting.settingEl.toggleClass("sf-settings-hidden", overrideOff || !isSelectedFontVariable());
		};
		overrideToggle.onChange((value) => this.applyFontOverrideToggle(overrideFontKey, value, applyVisibility, restyle));
		applyVisibility(!overrideToggle.getValue());
	}

	private applyFontOverrideToggle(
		overrideFontKey: keyof StoryForgePluginSettings,
		value: boolean,
		applyVisibility: (overrideOff: boolean) => void,
		restyle: () => void,
	): void {
		this.plugin.updateSetting(overrideFontKey, value).then(() => {
			applyVisibility(!value);
			restyle();
		});
	}

	private applyFontFamilyPick(
		fontFamilyKey: keyof StoryForgePluginSettings,
		value: string,
		applySelectedFont: (value: string) => void,
		setSelectedFontFamily: (value: string) => void,
		applyOverrideVisibility: () => void,
		restyle: () => void,
	): void {
		this.plugin.updateSetting(fontFamilyKey, value).then(() => {
			applySelectedFont(value);
			setSelectedFontFamily(value);
			applyOverrideVisibility();
			restyle();
		});
	}

	private renderDividerCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		aboveKey: keyof StoryForgePluginSettings,
		aboveThicknessKey: keyof StoryForgePluginSettings,
		belowKey: keyof StoryForgePluginSettings,
		belowThicknessKey: keyof StoryForgePluginSettings,
		restyle: () => void,
	): void {
		const card = new SettingGroup(body);

		let aboveToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Divider line above header").addToggle((toggle) => {
				aboveToggle = toggle;
				toggle.setValue(settings[aboveKey] as boolean);
			}),
		);
		let aboveThicknessSetting!: Setting;
		card.addSetting((setting) => {
			aboveThicknessSetting = setting;
			setting.setName("Thickness").addDropdown((dropdown) =>
				dropdown
					.addOption("thin", "Thin")
					.addOption("medium", "Medium")
					.addOption("thick", "Thick")
					.setValue(settings[aboveThicknessKey] as string)
					.onChange((value) => this.persistAndRestyle(aboveThicknessKey, value, restyle)),
			);
		});
		this.wireCardToggle(aboveToggle, aboveThicknessSetting, (value) => this.plugin.updateSetting(aboveKey, value), restyle);

		let belowToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Divider line below header").addToggle((toggle) => {
				belowToggle = toggle;
				toggle.setValue(settings[belowKey] as boolean);
			}),
		);
		let belowThicknessSetting!: Setting;
		card.addSetting((setting) => {
			belowThicknessSetting = setting;
			setting.setName("Thickness").addDropdown((dropdown) =>
				dropdown
					.addOption("thin", "Thin")
					.addOption("medium", "Medium")
					.addOption("thick", "Thick")
					.setValue(settings[belowThicknessKey] as string)
					.onChange((value) => this.persistAndRestyle(belowThicknessKey, value, restyle)),
			);
		});
		this.wireCardToggle(belowToggle, belowThicknessSetting, (value) => this.plugin.updateSetting(belowKey, value), restyle);
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
			.addSetting((setting) =>
				setting
					.setName("Header size")
					.setDesc("size of header label and icon")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings[config.sizeKey])
							.onChange((value) => this.persistAndRestyle(config.sizeKey, value, config.restyle)),
					),
			)
			.addSetting((setting) => {
				setting.setName("Header weight").setDesc("weight of header label");
				this.bindFontWeightDropdown(setting, settings[config.fontWeightKey], async (value) => {
					await this.plugin.updateSetting(config.fontWeightKey, value);
					config.restyle();
				});
			})
			.addSetting((setting) =>
				setting
					.setName("Header colour")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings[config.colorKey], async (hex) => {
							await this.plugin.updateSetting(config.colorKey, hex);
							config.restyle();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Use header colour for all colour options")
					.setDesc("Use the header colour everywhere below instead of picking separate colours.")
					.addToggle((toggle) => {
						useHeaderColorForAllToggle = toggle;
						toggle.setValue(settings[config.useHeaderColorForAllKey]);
					}),
			)
			.addSetting((setting) =>
				setting
					.setName("Muted")
					.setDesc("override header colour with muted colour")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.mutedKey]).onChange((value) => this.persistAndRestyle(config.mutedKey, value, config.restyle)),
					),
			)
			.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey]).onChange((value) => this.persistAndRestyle(config.smallCapsKey, value, config.restyle)),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		return useHeaderColorForAllToggle;
	}

	private renderHighlightGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const highlightGroup = new SettingGroup(body);
		highlightGroup.addSetting((setting) =>
			setting
				.setName("Highlight active chapter/item")
				.setDesc(
					"highlights the currently selected chapter, or item, in the storyForge panel",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.highlightActiveChapter)
						.onChange((value) => this.persistAndRestyle("highlightActiveChapter", value, () => this.plugin.refreshStoryForgeViews())),
				),
		);
	}

	private renderCyclingGuideCard(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const cyclingGuideGroup = new SettingGroup(body);

		let cyclingGuideToggle!: ToggleComponent;
		cyclingGuideGroup.addSetting((setting) =>
			setting
				.setName("Cycling guide")
				.setDesc("draws a floating guideline")
				.addToggle((toggle) => {
					cyclingGuideToggle = toggle;
					toggle.setValue(settings.cyclingGuideEnabled);
				}),
		);

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
						this.persistAndRestyle("cyclingGuideThickness", value as HeadingDividerThickness, () => this.plugin.applyCyclingGuideStyle()),
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
						this.persistAndRestyle("cyclingGuideFlagSize", value as "small" | "medium" | "large", () => this.plugin.applyCyclingGuideStyle()),
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
						.onChange((value) => this.persistAndRestyle("cyclingGuideRoundedLines", value, () => this.plugin.applyCyclingGuideStyle())),
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
						this.persistAndRestyle("cyclingGuideInterval", value as CyclingGuideInterval, () => this.plugin.rebuildCyclingGuideExtension()),
					),
			);
		});

		let cyclingGuideColorSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideColorSetting = setting;
			setting.setName("Line colour").addButton((button) =>
				this.bindColorSwatchButton(button.buttonEl, settings.cyclingGuideColor, async (hex) => {
					await this.plugin.updateSetting("cyclingGuideColor", hex);
					this.plugin.applyCyclingGuideStyle();
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
		this.plugin.updateSetting("cyclingGuideEnabled", value).then(() => {
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
			.addSetting((setting) =>
				setting
					.setName(`${config.labelPrefix} size`)
					.setDesc("Text size, from 0.5em to 2em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 2, 0.25)
							.setValue(settings[config.sizeKey])
							.onChange((value) => this.persistAndRestyle(config.sizeKey, value, () => this.plugin.applyLibraryHeaderStyles())),
					),
			)
			.addSetting((setting) => {
				setting.setName(`${config.labelPrefix} weight`);
				this.bindFontWeightDropdown(setting, settings[config.fontWeightKey], async (value) => {
					await this.plugin.updateSetting(config.fontWeightKey, value);
					this.plugin.applyLibraryHeaderStyles();
				});
			})
			.addSetting((setting) =>
				setting
					.setName(`${config.labelPrefix} colour`)
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings[config.colorKey], async (hex) => {
							await this.plugin.updateSetting(config.colorKey, hex);
							this.plugin.applyLibraryHeaderStyles();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} small caps`)
					.addToggle((toggle) =>
						toggle
							.setValue(settings[config.smallCapsKey])
							.onChange((value) => this.persistAndRestyle(config.smallCapsKey, value, () => this.plugin.applyLibraryHeaderStyles())),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	private renderSubtitleStyleGroup(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const group = new SettingGroup(body);
		group
			.addSetting((setting) =>
				setting
					.setName("Subtitle size")
					.setDesc("Text size, from 0.5em to 2em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 2, 0.25)
							.setValue(settings.libraryBookSubtitleFontSize)
							.onChange((value) => this.persistAndRestyle("libraryBookSubtitleFontSize", value, () => this.plugin.applyLibraryHeaderStyles())),
					),
			)
			.addSetting((setting) => {
				setting.setName("Subtitle weight");
				this.bindFontWeightDropdown(setting, settings.libraryBookSubtitleFontWeight, async (value) => {
					await this.plugin.updateSetting("libraryBookSubtitleFontWeight", value);
					this.plugin.applyLibraryHeaderStyles();
				});
			})
			.addSetting((setting) => {
				setting
					.setName("Subtitle small caps")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.libraryBookSubtitleSmallCaps)
							.onChange((value) => this.persistAndRestyle("libraryBookSubtitleSmallCaps", value, () => this.plugin.applyLibraryHeaderStyles())),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	private renderLibraryHighlightRows(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const libraryHighlightGroup = new SettingGroup(body);
		libraryHighlightGroup
			.addSetting((setting) =>
				setting
					.setName("Highlight colour for library items")
					.setDesc("The colour used for the active chapter/item highlight.")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.highlightColor, async (hex) => {
							await this.plugin.updateSetting("highlightColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Highlight text colour for library items")
					.setDesc("colour used for the active chapter/item highlight text")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.highlightTextColor, async (hex) => {
							await this.plugin.updateSetting("highlightTextColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					),
			);
	}

	private renderUnplacedPanelContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const useHeaderColorToggle = this.renderHeaderStyleGroup(body, settings, {
			sizeKey: "unplacedFontSize",
			fontWeightKey: "unplacedFontWeight",
			colorKey: "unplacedColor",
			mutedKey: "unplacedMuted",
			smallCapsKey: "unplacedSmallCaps",
			useHeaderColorForAllKey: "unplacedUseHeaderColorForAll",
			restyle: () => this.plugin.applyHeaderStyles(),
		});

		const unplacedItemsGroup = new SettingGroup(body);
		let itemsColourSetting!: Setting;
		unplacedItemsGroup
			.addSetting((setting) =>
				setting
					.setName("Unplaced items")
					.setDesc("Text size of the items in the Unplaced pane, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.unplacedItemsFontSize)
							.onChange((value) => this.persistAndRestyle("unplacedItemsFontSize", value, () => this.plugin.applyHeaderStyles())),
					),
			)
			.addSetting((setting) => {
				itemsColourSetting = setting;
				setting
					.setName("Unplaced items colour")
					.setDesc("colour of unplaced items")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.unplacedItemsColor, async (hex) => {
							await this.plugin.updateSetting("unplacedItemsColor", hex);
							this.plugin.applyHeaderStyles();
						}),
					);
			})
			.addSetting((setting) =>
				setting
					.setName("Muted")
					.setDesc("override colour with muted colour")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.unplacedItemsMuted)
							.onChange((value) => this.persistAndRestyle("unplacedItemsMuted", value, () => this.plugin.applyHeaderStyles())),
					),
			);

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
						this.bindColorSwatchButton(button.buttonEl, settings.unplacedHighlightColor, async (hex) => {
							await this.plugin.updateSetting("unplacedHighlightColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					);
			})
			.addSetting((setting) =>
				setting
					.setName("Highlight text colour")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.unplacedHighlightTextColor, async (hex) => {
							await this.plugin.updateSetting("unplacedHighlightTextColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					),
			);

		const applyUseHeaderColorVisibility = (hidden: boolean) => {
			itemsColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			highlightColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		useHeaderColorToggle.onChange((value) => this.applyUnplacedUseHeaderColorToggle(value, applyUseHeaderColorVisibility));
		applyUseHeaderColorVisibility(settings.unplacedUseHeaderColorForAll);
	}

	private applyUnplacedUseHeaderColorToggle(value: boolean, applyUseHeaderColorVisibility: (hidden: boolean) => void): void {
		this.plugin.updateSetting("unplacedUseHeaderColorForAll", value).then(() => {
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
			restyle: () => this.plugin.applyHeaderStyles(),
		});

		const codexFolderGroup = new SettingGroup(body);
		let folderColourSetting!: Setting;
		codexFolderGroup
			.addSetting((setting) =>
				setting
					.setName("Folder size")
					.setDesc("Font size of the codex folder names and chevrons, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.codexFolderFontSize)
							.onChange((value) => this.persistAndRestyle("codexFolderFontSize", value, () => this.plugin.applyCodexFolderStyle())),
					),
			)
			.addSetting((setting) => {
				setting.setName("Folder weight").setDesc("Font weight of the codex folder names.");
				this.bindFontWeightDropdown(setting, settings.codexFolderFontWeight, async (value) => {
					await this.plugin.updateSetting("codexFolderFontWeight", value);
					this.plugin.applyCodexFolderStyle();
				});
			})
			.addSetting((setting) => {
				folderColourSetting = setting;
				setting
					.setName("Folder colour")
					.setDesc("Colour of the codex folder names and chevrons.")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.codexFolderColor, async (hex) => {
							await this.plugin.updateSetting("codexFolderColor", hex);
							this.plugin.applyCodexFolderStyle();
						}),
					);
			})
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
							.onChange((value) => this.applyCodexFolderIndicatorThickness(value as CodexFolderIndicatorThickness)),
					),
			);

		const codexNoteLabelGroup = new SettingGroup(body);
		let defaultToggle!: ToggleComponent;
		let folderToggle!: ToggleComponent;
		let noteLabelColourSetting!: Setting;
		let defaultColourToggleSetting!: Setting;
		let folderColourToggleSetting!: Setting;
		codexNoteLabelGroup
			.addSetting((setting) =>
				setting
					.setName("Codex note label size")
					.setDesc("Font size of the codex note (file) labels, from 0.5em to 1.5em.")
					.addSlider((slider) =>
						slider
							.setLimits(0.5, 1.5, 0.25)
							.setValue(settings.codexNoteLabelFontSize)
							.onChange((value) => this.persistAndRestyle("codexNoteLabelFontSize", value, () => this.plugin.applyCodexNoteLabelStyle())),
					),
			)
			.addSetting((setting) => {
				setting.setName("Codex note label weight").setDesc("Font weight of the codex note (file) labels.");
				this.bindFontWeightDropdown(setting, settings.codexNoteLabelFontWeight, async (value) => {
					await this.plugin.updateSetting("codexNoteLabelFontWeight", value);
					this.plugin.applyCodexNoteLabelStyle();
				});
			})
			.addSetting((setting) => {
				noteLabelColourSetting = setting;
				setting
					.setName("Codex note label colour")
					.setDesc("Colour of the codex note (file) labels.")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.codexNoteLabelColor, async (hex) => {
							await this.plugin.updateSetting("codexNoteLabelColor", hex);
							this.plugin.applyCodexNoteLabelStyle();
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
						this.bindColorSwatchButton(button.buttonEl, settings.codexHighlightColor, async (hex) => {
							await this.plugin.updateSetting("codexHighlightColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					);
			})
			.addSetting((setting) =>
				setting
					.setName("Highlight text colour")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings.codexHighlightTextColor, async (hex) => {
							await this.plugin.updateSetting("codexHighlightTextColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					),
			);

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
		this.plugin.updateSetting("codexUseHeaderColorForAll", value).then(() => {
			applyUseHeaderColorVisibility(value);
			this.plugin.applyHeaderStyles();
			this.plugin.applyHighlightStyle();
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyCodexNoteLabelStyle();
		});
	}

	private applyCodexFolderIndicatorThickness(value: CodexFolderIndicatorThickness): void {
		this.plugin.updateSetting("codexFolderIndicatorThickness", value).then(() => {
			this.plugin.applyCodexFolderStyle();
			this.plugin.applyHighlightStyle();
		});
	}

	private renderSeriesPaneContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const seriesGroup = new SettingGroup(body);
		seriesGroup
			.addSetting((setting) =>
				setting
					.setName("Hide series pane")
					.setDesc("Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back.")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.hideSeriesPane)
							.onChange((value) => this.persistAndRestyle("hideSeriesPane", value, () => this.plugin.refreshStoryForgeViews())),
					),
			);

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