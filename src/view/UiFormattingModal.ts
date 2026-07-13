import { App, Modal, Notice, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
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

	onOpen(): void {
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

		this.renderHighlightGroup(contentEl, settings);
		this.renderCyclingGuideCard(contentEl, settings);
		this.renderFoldableSection(contentEl, "library-pane", "h3", "Library pane", (libraryBody) => {
			this.renderTitleStyleGroup(libraryBody, settings, {
				labelPrefix: "Series title",
				sizeKey: "librarySeriesTitleFontSize",
				fontWeightKey: "librarySeriesTitleFontWeight",
				colorKey: "librarySeriesTitleColor",
				smallCapsKey: "librarySeriesTitleSmallCaps",
			});
			this.renderTitleStyleGroup(libraryBody, settings, {
				labelPrefix: "Book title",
				sizeKey: "libraryBookTitleFontSize",
				fontWeightKey: "libraryBookTitleFontWeight",
				colorKey: "libraryBookTitleColor",
				smallCapsKey: "libraryBookTitleSmallCaps",
			});
			this.renderSubtitleStyleGroup(libraryBody, settings);
			this.renderLibraryHighlightRows(libraryBody, settings);
			new SettingGroup(libraryBody).addSetting((setting) =>
				setting
					.setName("Divider below title")
					.setDesc("Adds a border below the series/book title, matching the border between storyForge's panes.")
					.addToggle((toggle) =>
						toggle.setValue(settings.libraryHeaderDividerBelow).onChange(async (value) => {
							await this.plugin.updateSetting("libraryHeaderDividerBelow", value);
							this.plugin.applyLibraryHeaderStyles();
						}),
					),
			);
		});
		this.renderUnplacedPanel(contentEl, settings);
		this.renderCodexPanel(contentEl, settings);
		this.renderSeriesPaneSection(contentEl, settings);
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

		let collapsed = true;
		const applyState = () => {
			sectionEl.toggleClass("sf-settings-collapsed", collapsed);
			setIcon(chevronEl, collapsed ? "chevron-right" : "chevron-down");
		};
		applyState();

		headerEl.addEventListener("click", () => {
			collapsed = !collapsed;
			applyState();
		});

		renderBody(bodyEl);
	}

	private bindColorSwatchButton(
		buttonEl: HTMLElement,
		initialHex: string,
		onPick: (hex: string) => Promise<void>,
	): void {
		buttonEl.addClass("sf-color-swatch-btn");
		buttonEl.setAttr("aria-label", "Choose colour");
		const paint = (hex: string) => {
			buttonEl.style.backgroundColor = hex;
		};
		paint(initialHex);
		buttonEl.addEventListener("click", async () => {
			const s = this.plugin.getSettings();
			const { PalettePickerModal } = await import("./PalettePickerModal");
			new PalettePickerModal(this.app, s.colorPaletteName, s.colorPaletteMode, s.customPaletteColors, async (hex) => {
				paint(hex);
				await onPick(hex);
			}).open();
		});
	}

	private bindFontWeightDropdown(setting: Setting, value: FontWeight, onChange: (value: FontWeight) => Promise<void>): void {
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
			dropdown.onChange(async (v) => {
				await onChange(v as FontWeight);
				applySelectedWeight(v as FontWeight);
			});
		});
	}

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

	private renderToggleWithRevealCard(
		body: HTMLElement,
		toggleLabel: string,
		initialValue: boolean,
		persist: (value: boolean) => Promise<void>,
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

	private wireCardToggle(toggle: ToggleComponent, card: Setting, persist: (value: boolean) => Promise<void>, restyle: () => void): void {
		const applyVisibility = (hidden: boolean) => card.settingEl.toggleClass("sf-settings-hidden", hidden);
		toggle.onChange(async (value) => {
			await persist(value);
			applyVisibility(!value);
			restyle();
		});
		applyVisibility(!toggle.getValue());
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
							.onChange(async (value) => {
								await this.plugin.updateSetting(sizeKey, value);
								restyle();
							}),
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
		toggle.onChange(async (value) => {
			await this.plugin.updateSetting("bodyTextOverrideEmphasisColor", value);
			applyVisibility(!value);
			restyle();
		});
		applyVisibility(!toggle.getValue());

		return toggleSetting;
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
				dropdown.onChange(async (value) => {
					await this.plugin.updateSetting(fontFamilyKey, value as string);
					applySelectedFont(value);
					selectedFontFamily = value;
					applyVisibility(!overrideToggle.getValue());
					restyle();
				});
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
					toggle.setValue(settings[smallCapsKey] as boolean).onChange(async (value) => {
						await this.plugin.updateSetting(smallCapsKey, value);
						restyle();
					}),
				);
				setting.nameEl.style.fontVariant = "small-caps";
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
		overrideToggle.onChange(async (value) => {
			await this.plugin.updateSetting(overrideFontKey, value);
			applyVisibility(!value);
			restyle();
		});
		applyVisibility(!overrideToggle.getValue());
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
					.onChange(async (value) => {
						await this.plugin.updateSetting(aboveThicknessKey, value as string);
						restyle();
					}),
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
					.onChange(async (value) => {
						await this.plugin.updateSetting(belowThicknessKey, value as string);
						restyle();
					}),
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
							.onChange(async (value) => {
								await this.plugin.updateSetting(config.sizeKey, value);
								config.restyle();
							}),
					),
			)
			.addSetting((setting) => {
				setting.setName("Header weight").setDesc("weight of header label");
				this.bindFontWeightDropdown(setting, settings[config.fontWeightKey] as FontWeight, async (value) => {
					await this.plugin.updateSetting(config.fontWeightKey, value);
					config.restyle();
				});
			})
			.addSetting((setting) =>
				setting
					.setName("Header colour")
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings[config.colorKey] as string, async (hex) => {
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
						toggle.setValue(settings[config.mutedKey] as boolean).onChange(async (value) => {
							await this.plugin.updateSetting(config.mutedKey, value);
							config.restyle();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey] as boolean).onChange(async (value) => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							config.restyle();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
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
					toggle.setValue(settings.highlightActiveChapter).onChange(async (value) => {
						await this.plugin.updateSetting("highlightActiveChapter", value);
						this.plugin.refreshStoryForgeViews();
					}),
				),
		);
	}

	private renderCyclingGuideCard(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const cyclingGuideGroup = new SettingGroup(body);

		let cyclingGuideToggle!: ToggleComponent;
		cyclingGuideGroup.addSetting((setting) =>
			setting
				.setName("Cycling guide")
				.setDesc("Draws a floating divider line in the editor after every 500 words, without shifting your text.")
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
					.setValue(settings.cyclingGuideThickness as HeadingDividerThickness)
					.onChange(async (value) => {
						await this.plugin.updateSetting("cyclingGuideThickness", value as HeadingDividerThickness);
						this.plugin.applyCyclingGuideStyle();
					}),
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
					.setValue(settings.cyclingGuideFlagSize as "small" | "medium" | "large")
					.onChange(async (value) => {
						await this.plugin.updateSetting("cyclingGuideFlagSize", value as "small" | "medium" | "large");
						this.plugin.applyCyclingGuideStyle();
					}),
			);
		});

		let cyclingGuideRoundedLinesSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideRoundedLinesSetting = setting;
			setting
				.setName("Rounded lines")
				.setDesc("Rounds the corners of the divider line, except the bottom-right where the flag sits.")
				.addToggle((toggle) =>
					toggle.setValue(settings.cyclingGuideRoundedLines).onChange(async (value) => {
						await this.plugin.updateSetting("cyclingGuideRoundedLines", value);
						this.plugin.applyCyclingGuideStyle();
					}),
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
					.setValue(settings.cyclingGuideInterval as CyclingGuideInterval)
					.onChange(async (value) => {
						await this.plugin.updateSetting("cyclingGuideInterval", value as CyclingGuideInterval);
						this.plugin.rebuildCyclingGuideExtension();
					}),
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
		cyclingGuideToggle.onChange(async (value) => {
			await this.plugin.updateSetting("cyclingGuideEnabled", value);
			this.plugin.setCyclingGuideEnabled(value);
			applyCyclingGuideVisibility(!value);
		});
		applyCyclingGuideVisibility(!cyclingGuideToggle.getValue());
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
							.onChange(async (value) => {
								await this.plugin.updateSetting(config.sizeKey, value);
								this.plugin.applyLibraryHeaderStyles();
							}),
					),
			)
			.addSetting((setting) => {
				setting.setName(`${config.labelPrefix} weight`);
				this.bindFontWeightDropdown(setting, settings[config.fontWeightKey] as FontWeight, async (value) => {
					await this.plugin.updateSetting(config.fontWeightKey, value);
					this.plugin.applyLibraryHeaderStyles();
				});
			})
			.addSetting((setting) =>
				setting
					.setName(`${config.labelPrefix} colour`)
					.addButton((button) =>
						this.bindColorSwatchButton(button.buttonEl, settings[config.colorKey] as string, async (hex) => {
							await this.plugin.updateSetting(config.colorKey, hex);
							this.plugin.applyLibraryHeaderStyles();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} small caps`)
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey] as boolean).onChange(async (value) => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							this.plugin.applyLibraryHeaderStyles();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
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
							.onChange(async (value) => {
								await this.plugin.updateSetting("libraryBookSubtitleFontSize", value);
								this.plugin.applyLibraryHeaderStyles();
							}),
					),
			)
			.addSetting((setting) => {
				setting.setName("Subtitle weight");
				this.bindFontWeightDropdown(setting, settings.libraryBookSubtitleFontWeight as FontWeight, async (value) => {
					await this.plugin.updateSetting("libraryBookSubtitleFontWeight", value);
					this.plugin.applyLibraryHeaderStyles();
				});
			})
			.addSetting((setting) => {
				setting
					.setName("Subtitle small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings.libraryBookSubtitleSmallCaps as boolean).onChange(async (value) => {
							await this.plugin.updateSetting("libraryBookSubtitleSmallCaps", value);
							this.plugin.applyLibraryHeaderStyles();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
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

	private renderUnplacedPanel(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(body, "unplaced", "h4", "Unplaced pane", (unplacedBody) => {
			const useHeaderColorToggle = this.renderHeaderStyleGroup(unplacedBody, settings, {
				sizeKey: "unplacedFontSize",
				fontWeightKey: "unplacedFontWeight",
				colorKey: "unplacedColor",
				mutedKey: "unplacedMuted",
				smallCapsKey: "unplacedSmallCaps",
				useHeaderColorForAllKey: "unplacedUseHeaderColorForAll",
				restyle: () => this.plugin.applyHeaderStyles(),
			});

			const unplacedItemsGroup = new SettingGroup(unplacedBody);
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
								.onChange(async (value) => {
									await this.plugin.updateSetting("unplacedItemsFontSize", value);
									this.plugin.applyHeaderStyles();
								}),
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
							toggle.setValue(settings.unplacedItemsMuted as boolean).onChange(async (value) => {
								await this.plugin.updateSetting("unplacedItemsMuted", value);
								this.plugin.applyHeaderStyles();
							}),
						),
				);

			const unplacedHighlightGroup = new SettingGroup(unplacedBody);
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
			useHeaderColorToggle.onChange(async (value) => {
				await this.plugin.updateSetting("unplacedUseHeaderColorForAll", value);
				applyUseHeaderColorVisibility(value);
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
			});
			applyUseHeaderColorVisibility(settings.unplacedUseHeaderColorForAll);
		});
	}

	private renderCodexPanel(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(body, "codex", "h4", "Codex pane", (codexBody) => {
			const useHeaderColorToggle = this.renderHeaderStyleGroup(codexBody, settings, {
				sizeKey: "codexFontSize",
				fontWeightKey: "codexFontWeight",
				colorKey: "codexColor",
				mutedKey: "codexMuted",
				smallCapsKey: "codexSmallCaps",
				useHeaderColorForAllKey: "codexUseHeaderColorForAll",
				restyle: () => this.plugin.applyHeaderStyles(),
			});

			const codexFolderGroup = new SettingGroup(codexBody);
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
								.onChange(async (value) => {
									await this.plugin.updateSetting("codexFolderFontSize", value);
									this.plugin.applyCodexFolderStyle();
								}),
						),
				)
				.addSetting((setting) => {
					setting.setName("Folder weight").setDesc("Font weight of the codex folder names.");
					this.bindFontWeightDropdown(setting, settings.codexFolderFontWeight as FontWeight, async (value) => {
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
								.setValue(settings.codexFolderIndicatorThickness as CodexFolderIndicatorThickness)
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
								.onChange(async (value) => {
									await this.plugin.updateSetting("codexNoteLabelFontSize", value);
									this.plugin.applyCodexNoteLabelStyle();
								}),
						),
				)
				.addSetting((setting) => {
					setting.setName("Codex note label weight").setDesc("Font weight of the codex note (file) labels.");
					this.bindFontWeightDropdown(setting, settings.codexNoteLabelFontWeight as FontWeight, async (value) => {
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

			const codexHighlightGroup = new SettingGroup(codexBody);
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
			useHeaderColorToggle.onChange(async (value) => {
				await this.plugin.updateSetting("codexUseHeaderColorForAll", value);
				applyUseHeaderColorVisibility(value);
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
				this.plugin.applyCodexFolderStyle();
				this.plugin.applyCodexNoteLabelStyle();
			});
			applyUseHeaderColorVisibility(settings.codexUseHeaderColorForAll);
		});
	}

	private renderSeriesPaneSection(body: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(body, "series-pane", "h3", "Series pane", (seriesBody) => {
			const seriesGroup = new SettingGroup(seriesBody);
			seriesGroup
				.addSetting((setting) =>
					setting
						.setName("Hide series pane")
						.setDesc("Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideSeriesPane).onChange(async (value) => {
								await this.plugin.updateSetting("hideSeriesPane", value);
								this.plugin.refreshStoryForgeViews();
							}),
						),
				);

			if (settings.hideSeriesPane) {
				new Setting(seriesBody)
					.setName("Convert to series")
					.setDesc("Turn this standalone book into the first book of a series — lets you add more books to it later.")
					.addButton((button) =>
						button
							.setButtonText("Convert to series")
							.setCta()
							.onClick(() => new ConvertToSeriesModal(this.app, this.plugin, () => this.render()).open()),
					);
			}
		});
	}
}