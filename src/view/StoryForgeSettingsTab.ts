import { App, ButtonComponent, PluginSettingTab, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CodexFolderIndicatorThickness, CustomFontFamily, FontWeight, HeadingDividerThickness, StoryForgePluginSettings } from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES, PaletteMode, PaletteName } from "../colorPalettes";
import { PalettePickerModal } from "./PalettePickerModal";
import { CUSTOM_FONTS } from "../fonts";
import { TextStyleModal } from "./TextStyleModal";
import { UiFormattingModal } from "./UiFormattingModal";
import { HideUiModal } from "./HideUiModal";
import { ProtectionsModal } from "./ProtectionsModal";
import { ICON_TEXT_STYLE, ICON_UI_FORMATTING, ICON_HIDE_UI, ICON_PROTECTIONS } from "../icons";

const FONT_WEIGHT_OPTIONS: [FontWeight, string][] = [
	["300", "Light"],
	["400", "Normal"],
	["500", "Medium"],
	["600", "Semi Bold"],
	["700", "Bold"],
	["800", "Extra Bold"],
	["900", "Black"],
];

export class StoryForgeSettingsTab extends PluginSettingTab {
	private plugin: StoryForgePlugin;
	private expandedSections = new Set<string>();
	private selectedOtherHeadingLevel: 4 | 5 | 6 = 4;

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

	/** Adds a font-weight dropdown (no "theme default" option) to `setting`, wired to persist and preview the selected weight. */
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
			dropdown.onChange((v) => {
				void (async () => {
				await onChange(v as FontWeight);
				applySelectedWeight(v as FontWeight);
							})();
			});
		});
	}

	/** Wires two toggles so turning one on forces the other off. `persistA`/`persistB` persist that side's setting (and restyle) once both toggles exist. */
	private bindExclusivePair(
		toggleA: ToggleComponent,
		toggleB: ToggleComponent,
		persistA: (value: boolean) => Promise<void>,
		persistB: (value: boolean) => Promise<void>,
	): void {
		toggleA.onChange((value) => {
			void (async () => {
			if (value && toggleB.getValue()) {
				toggleB.setValue(false);
				await persistB(false);
			}
			await persistA(value);
					})();
		});
		toggleB.onChange((value) => {
			void (async () => {
			if (value && toggleA.getValue()) {
				toggleA.setValue(false);
				await persistA(false);
			}
			await persistB(value);
					})();
		});
	}

	/** Renders the Header size/colour/Muted/Small caps group shared by the Unplaced and Codex panels. */
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
							.onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting(config.sizeKey, value);
								config.restyle();
															})();
							}),
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
						this.bindColorSwatchButton(button, settings[config.colorKey], async (hex) => {
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
						toggle.setValue(settings[config.mutedKey]).onChange((value) => {
							void (async () => {
							await this.plugin.updateSetting(config.mutedKey, value);
							config.restyle();
													})();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName("Small caps")
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey]).onChange((value) => {
							void (async () => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							config.restyle();
													})();
						}),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		return useHeaderColorForAllToggle;
	}

	private renderTopActions(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		const panelGroup = new SettingGroup(containerEl);
		panelGroup.addSetting((setting) =>
			setting
				.setName("storyForge panel")
				.setDesc("If you've closed the storyForge panel, click this button to bring it back.")
				.addButton((button) =>
					button
						.setButtonText("Reopen panel")
						.setCta()
						.onClick(() => void this.plugin.activateView()),
				),
		);
		panelGroup.addSetting((setting) =>
			setting
				.setName("Tools panel")
				.setDesc("ribbon is hidden and the ribbon icons can be found within the tools panel")
				.addToggle((toggle) =>
					toggle.setValue(settings.useToolsPanel).onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("useToolsPanel", value);
						this.plugin.applyVisibilityStyles();
						if (value) {
							void this.plugin.activateToolsView();
						} else {
							this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
						}
											})();
					}),
				)
				.addButton((button) =>
					button
						.setButtonText("Reopen Tools Panel")
						.setCta()
						.onClick(() => void this.plugin.activateToolsView()),
				),
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
					dropdown.setValue(settings.colorPaletteName).onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("colorPaletteName", value as PaletteName);
						this.display();
											})();
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
							.onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting("colorPaletteMode", value as PaletteMode);
															})();
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
							text.setValue(entry.name).setPlaceholder("Name").onChange((value) => {
								void (async () => {
								const colors = settings.customPaletteColors.slice();
								colors[i] = { ...colors[i], name: value };
								await this.plugin.updateSetting("customPaletteColors", colors);
															})();
							}),
						)
						.addText((text) => {
							text.setValue(entry.hex);
							text.inputEl.type = "color";
							text.onChange((value) => {
								void (async () => {
								const colors = settings.customPaletteColors.slice();
								colors[i] = { ...colors[i], hex: value };
								await this.plugin.updateSetting("customPaletteColors", colors);
															})();
							});
						}),
				);
			});
		}
	}

	/** Wires a toggle to persist `key`, hide/show `card` accordingly, and restyle - the shared pattern behind every conditional card in this file. */
	private wireCardToggle(toggle: ToggleComponent, card: Setting, persist: (value: boolean) => Promise<void>, restyle: () => void): void {
		const applyVisibility = (hidden: boolean) => card.settingEl.toggleClass("sf-settings-hidden", hidden);
		toggle.onChange((value) => {
			void (async () => {
			await persist(value);
			applyVisibility(!value);
			restyle();
					})();
		});
		applyVisibility(!toggle.getValue());
	}

	/**
	 * Renders a card whose first row is a toggle, followed by a caller-built "reveal" row shown only
	 * while the toggle is on. Returns the toggle and the card itself so callers can append further,
	 * always-visible rows below the reveal row (used by the font-override card for Font weight/Small caps).
	 */
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

	/** Renders the "Override theme's default [font/header] size" card with its slider revealed in the same card when on. */
	private renderSizeCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		label: string,
		sliderLabel: string,
		overrideKey:
			| "heading1OverrideSize"
			| "heading2OverrideSize"
			| "heading3OverrideSize"
			| "heading4OverrideSize"
			| "heading5OverrideSize"
			| "heading6OverrideSize"
			| "bodyTextOverrideSize",
		sizeKey: "heading1Size" | "heading2Size" | "heading3Size" | "heading4Size" | "heading5Size" | "heading6Size" | "bodyTextSize",
		min: number,
		max: number,
		restyle: () => void,
		extraRowBefore?: (card: SettingGroup) => void,
	): void {
		this.renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey],
			(value) => this.plugin.updateSetting(overrideKey, value),
			(card) => {
				let sliderSetting!: Setting;
				card.addSetting((setting) => {
					sliderSetting = setting;
					setting.setName(sliderLabel).addSlider((slider) =>
						slider
							.setLimits(min, max, 0.25)
							.setValue(settings[sizeKey])
							.onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting(sizeKey, value);
								restyle();
															})();
							}),
					);
				});
				return sliderSetting;
			},
			restyle,
			extraRowBefore,
		);
	}

	/** Renders the "Override theme's default [font/header] colour" card with its colour swatch revealed in the same card when on. */
	private renderColorOverrideCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		label: string,
		swatchLabel: string,
		overrideKey:
			| "heading1OverrideColor"
			| "heading2OverrideColor"
			| "heading3OverrideColor"
			| "heading4OverrideColor"
			| "heading5OverrideColor"
			| "heading6OverrideColor"
			| "bodyTextOverrideColor",
		colorKey: "heading1Color" | "heading2Color" | "heading3Color" | "heading4Color" | "heading5Color" | "heading6Color" | "bodyTextColor",
		restyle: () => void,
		onToggle?: (value: boolean) => void,
	): void {
		this.renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey],
			async (value) => {
				await this.plugin.updateSetting(overrideKey, value);
				onToggle?.(value);
			},
			(card) => {
				let colorSetting!: Setting;
				card.addSetting((setting) => {
					colorSetting = setting;
					setting.setName(swatchLabel).addButton((button) =>
						this.bindColorSwatchButton(button, settings[colorKey], async (hex) => {
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

	/**
	 * Renders body text's "Override theme's default/body text's standard italic/bold colour" card
	 * (label passed in by the caller, since it depends on whether body text's own font colour is
	 * already overridden). Reveals "Bold colour" and "Italic colour" swatches together when on.
	 * Uses the same manual multi-row visibility pattern as `renderFontCard` (two reveal rows, not
	 * the single-row `renderToggleWithRevealCard`/`wireCardToggle` helpers). Returns the toggle
	 * row's `Setting` so the caller can refresh its label later via `setName`.
	 */
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
				this.bindColorSwatchButton(button, settings.bodyTextBoldColor, async (hex) => {
					await this.plugin.updateSetting("bodyTextBoldColor", hex);
					restyle();
				}),
			);
		});

		let italicColorSetting!: Setting;
		card.addSetting((setting) => {
			italicColorSetting = setting;
			setting.setName("Italic colour").addButton((button) =>
				this.bindColorSwatchButton(button, settings.bodyTextItalicColor, async (hex) => {
					await this.plugin.updateSetting("bodyTextItalicColor", hex);
					restyle();
				}),
			);
		});

		const applyVisibility = (hidden: boolean) => {
			boldColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			italicColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		};
		toggle.onChange((value) => {
			void (async () => {
			await this.plugin.updateSetting("bodyTextOverrideEmphasisColor", value);
			applyVisibility(!value);
			restyle();
					})();
		});
		applyVisibility(!toggle.getValue());

		return toggleSetting;
	}

	/**
	 * Renders the "Override theme's default font" card: the toggle, plus "Pick font", "Font weight",
	 * and "Small caps" rows that are all shown/hidden together based on the toggle (not just "Pick
	 * font" — every row in this card is inert while the override is off).
	 */
	private renderFontCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		overrideFontKey:
			| "heading1OverrideFont"
			| "heading2OverrideFont"
			| "heading3OverrideFont"
			| "heading4OverrideFont"
			| "heading5OverrideFont"
			| "heading6OverrideFont"
			| "bodyTextOverrideFont",
		fontWeightKey:
			| "heading1FontWeight"
			| "heading2FontWeight"
			| "heading3FontWeight"
			| "heading4FontWeight"
			| "heading5FontWeight"
			| "heading6FontWeight"
			| "bodyTextFontWeight",
		fontFamilyKey?:
			| "heading1FontFamily"
			| "heading2FontFamily"
			| "heading3FontFamily"
			| "heading4FontFamily"
			| "heading5FontFamily"
			| "heading6FontFamily"
			| "bodyTextFontFamily",
		smallCapsKey?: "heading1SmallCaps" | "heading2SmallCaps" | "heading3SmallCaps" | "heading4SmallCaps" | "heading5SmallCaps" | "heading6SmallCaps",
	): void {
		const restyle = () => this.plugin.applyTextStyleOverrides();
		const card = new SettingGroup(body);

		let overrideToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Override theme's default font").addToggle((toggle) => {
				overrideToggle = toggle;
				toggle.setValue(settings[overrideFontKey]);
			}),
		);

		let selectedFontFamily: CustomFontFamily | undefined = fontFamilyKey ? settings[fontFamilyKey] : undefined;

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
				const applySelectedFont = (value: CustomFontFamily) => {
					const font = CUSTOM_FONTS.find((f) => f.id === value);
					dropdown.selectEl.style.fontFamily = font ? font.cssFontFamily : "";
				};
				dropdown.setValue(settings[fontFamilyKey]);
				applySelectedFont(settings[fontFamilyKey]);
				dropdown.onChange((value) => {
					void (async () => {
					await this.plugin.updateSetting(fontFamilyKey, value as CustomFontFamily);
					applySelectedFont(value as CustomFontFamily);
					selectedFontFamily = value as CustomFontFamily;
					applyVisibility(!overrideToggle.getValue());
					restyle();
									})();
				});
			});
		});

		let fontWeightSetting!: Setting;
		card.addSetting((setting) => {
			fontWeightSetting = setting;
			setting.setName("Font weight");
			this.bindFontWeightDropdown(setting, settings[fontWeightKey], async (value) => {
				await this.plugin.updateSetting(fontWeightKey, value);
				restyle();
			});
		});

		let smallCapsSetting: Setting | undefined;
		if (smallCapsKey) {
			card.addSetting((setting) => {
				smallCapsSetting = setting;
				setting.setName("Small caps").addToggle((toggle) =>
					toggle.setValue(settings[smallCapsKey]).onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting(smallCapsKey, value);
						restyle();
											})();
					}),
				);
				setting.nameEl.addClass("sf-small-caps-label");
			});
		}

		// A non-variable (single fixed-weight) font has no "wght" axis, so the weight picker has
		// nothing to do - only show it once a variable font is selected. Only meaningful when
		// fontFamilyKey is set (heading1 today); other heading levels apply weight to the theme's
		// own font, which is always variable in the sense that any weight is meaningful.
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
		overrideToggle.onChange((value) => {
			void (async () => {
			await this.plugin.updateSetting(overrideFontKey, value);
			applyVisibility(!value);
			restyle();
					})();
		});
		applyVisibility(!overrideToggle.getValue());
	}

	/** Renders the "Divider line above/below header" card: each side's toggle immediately followed by its own thickness dropdown, shown only while that side is on. */
	private renderDividerCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		aboveKey: "heading1DividerAbove" | "heading2DividerAbove" | "heading3DividerAbove" | "heading4DividerAbove" | "heading5DividerAbove" | "heading6DividerAbove",
		aboveThicknessKey:
			| "heading1DividerAboveThickness"
			| "heading2DividerAboveThickness"
			| "heading3DividerAboveThickness"
			| "heading4DividerAboveThickness"
			| "heading5DividerAboveThickness"
			| "heading6DividerAboveThickness",
		belowKey: "heading1DividerBelow" | "heading2DividerBelow" | "heading3DividerBelow" | "heading4DividerBelow" | "heading5DividerBelow" | "heading6DividerBelow",
		belowThicknessKey:
			| "heading1DividerBelowThickness"
			| "heading2DividerBelowThickness"
			| "heading3DividerBelowThickness"
			| "heading4DividerBelowThickness"
			| "heading5DividerBelowThickness"
			| "heading6DividerBelowThickness",
		restyle: () => void,
	): void {
		const card = new SettingGroup(body);

		let aboveToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Divider line above header").addToggle((toggle) => {
				aboveToggle = toggle;
				toggle.setValue(settings[aboveKey]);
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
					.setValue(settings[aboveThicknessKey])
					.onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting(aboveThicknessKey, value as HeadingDividerThickness);
						restyle();
											})();
					}),
			);
		});
		this.wireCardToggle(aboveToggle, aboveThicknessSetting, (value) => this.plugin.updateSetting(aboveKey, value), restyle);

		let belowToggle!: ToggleComponent;
		card.addSetting((setting) =>
			setting.setName("Divider line below header").addToggle((toggle) => {
				belowToggle = toggle;
				toggle.setValue(settings[belowKey]);
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
					.setValue(settings[belowThicknessKey])
					.onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting(belowThicknessKey, value as HeadingDividerThickness);
						restyle();
											})();
					}),
			);
		});
		this.wireCardToggle(belowToggle, belowThicknessSetting, (value) => this.plugin.updateSetting(belowKey, value), restyle);
	}

	private renderTextStyleButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_TEXT_STYLE);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Text styling" });
		buttonEl.addEventListener("click", () => {
			new TextStyleModal(this.app, this.plugin).open();
		});
	}

	private renderUiFormattingButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_UI_FORMATTING);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "storyForge interface" });
		buttonEl.addEventListener("click", () => {
			new UiFormattingModal(this.app, this.plugin).open();
		});
	}

	private renderHideUiButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_HIDE_UI);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Hide Obsidian interface elements" });
		buttonEl.addEventListener("click", () => {
			new HideUiModal(this.app, this.plugin).open();
		});
	}

	private renderProtectionsButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_PROTECTIONS);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Protections" });
		buttonEl.addEventListener("click", () => {
			new ProtectionsModal(this.app, this.plugin).open();
		});
	}

	private renderButtonRow(containerEl: HTMLElement): void {
		const row = containerEl.createDiv({ cls: "sf-settings-button-row" });
		this.renderTextStyleButton(row);
		this.renderUiFormattingButton(row);
		this.renderHideUiButton(row);
		this.renderProtectionsButton(row);
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
					toggle.setValue(settings.highlightActiveChapter).onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("highlightActiveChapter", value);
						this.plugin.refreshStoryForgeViews();
											})();
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
					.onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("cyclingGuideThickness", value as HeadingDividerThickness);
						this.plugin.applyCyclingGuideStyle();
											})();
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
					.setValue(settings.cyclingGuideFlagSize)
					.onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("cyclingGuideFlagSize", value as "small" | "medium" | "large");
						this.plugin.applyCyclingGuideStyle();
											})();
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
					toggle.setValue(settings.cyclingGuideRoundedLines).onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("cyclingGuideRoundedLines", value);
						this.plugin.applyCyclingGuideStyle();
											})();
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
					.setValue(settings.cyclingGuideInterval)
					.onChange((value) => {
						void (async () => {
						await this.plugin.updateSetting("cyclingGuideInterval", value as "short" | "medium" | "large");
						this.plugin.rebuildCyclingGuideExtension();
											})();
					}),
			);
		});

		let cyclingGuideColorSetting!: Setting;
		cyclingGuideGroup.addSetting((setting) => {
			cyclingGuideColorSetting = setting;
			setting.setName("Line colour").addButton((button) =>
				this.bindColorSwatchButton(button, settings.cyclingGuideColor, async (hex) => {
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
		cyclingGuideToggle.onChange((value) => {
			void (async () => {
			await this.plugin.updateSetting("cyclingGuideEnabled", value);
			this.plugin.setCyclingGuideEnabled(value);
			applyCyclingGuideVisibility(!value);
					})();
		});
		applyCyclingGuideVisibility(!cyclingGuideToggle.getValue());
	}

	/** Renders the "Highlight colour"/"Highlight text colour" rows for library items (chapter/book rows) under the Library pane section. */
	private renderLibraryHighlightRows(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const libraryHighlightGroup = new SettingGroup(body);
		libraryHighlightGroup
			.addSetting((setting) =>
				setting
					.setName("Highlight colour for library items")
					.setDesc("The colour used for the active chapter/item highlight.")
					.addButton((button) =>
						this.bindColorSwatchButton(button, settings.highlightColor, async (hex) => {
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
						this.bindColorSwatchButton(button, settings.highlightTextColor, async (hex) => {
							await this.plugin.updateSetting("highlightTextColor", hex);
							this.plugin.applyHighlightStyle();
						}),
					),
			);
	}

	/** Renders the Size/Weight/Colour/Small caps group shared by the Library pane's series title and book title sections. */
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
							.onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting(config.sizeKey, value);
								this.plugin.applyLibraryHeaderStyles();
															})();
							}),
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
						this.bindColorSwatchButton(button, settings[config.colorKey], async (hex) => {
							await this.plugin.updateSetting(config.colorKey, hex);
							this.plugin.applyLibraryHeaderStyles();
						}),
					),
			)
			.addSetting((setting) => {
				setting
					.setName(`${config.labelPrefix} small caps`)
					.addToggle((toggle) =>
						toggle.setValue(settings[config.smallCapsKey]).onChange((value) => {
							void (async () => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							this.plugin.applyLibraryHeaderStyles();
													})();
						}),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
	}

	/** Renders the book subtitle's Size/Weight/Small caps group — no colour swatch, since the subtitle always tracks the book title's colour. */
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
							.onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting("libraryBookSubtitleFontSize", value);
								this.plugin.applyLibraryHeaderStyles();
															})();
							}),
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
						toggle.setValue(settings.libraryBookSubtitleSmallCaps).onChange((value) => {
							void (async () => {
							await this.plugin.updateSetting("libraryBookSubtitleSmallCaps", value);
							this.plugin.applyLibraryHeaderStyles();
													})();
						}),
					);
				setting.nameEl.addClass("sf-small-caps-label");
			});
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
								.onChange((value) => {
									void (async () => {
									await this.plugin.updateSetting("unplacedItemsFontSize", value);
									this.plugin.applyHeaderStyles();
																	})();
								}),
						),
				)
				.addSetting((setting) => {
					itemsColourSetting = setting;
					setting
						.setName("Unplaced items colour")
						.setDesc("colour of unplaced items")
						.addButton((button) =>
							this.bindColorSwatchButton(button, settings.unplacedItemsColor, async (hex) => {
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
							toggle.setValue(settings.unplacedItemsMuted).onChange((value) => {
								void (async () => {
								await this.plugin.updateSetting("unplacedItemsMuted", value);
								this.plugin.applyHeaderStyles();
															})();
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
							this.bindColorSwatchButton(button, settings.unplacedHighlightColor, async (hex) => {
								await this.plugin.updateSetting("unplacedHighlightColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						);
				})
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

			const applyUseHeaderColorVisibility = (hidden: boolean) => {
				itemsColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
				highlightColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			};
			useHeaderColorToggle.onChange((value) => {
				void (async () => {
				await this.plugin.updateSetting("unplacedUseHeaderColorForAll", value);
				applyUseHeaderColorVisibility(value);
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
							})();
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
								.onChange((value) => {
									void (async () => {
									await this.plugin.updateSetting("codexFolderFontSize", value);
									this.plugin.applyCodexFolderStyle();
																	})();
								}),
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
							this.bindColorSwatchButton(button, settings.codexFolderColor, async (hex) => {
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
								.onChange((value) => {
									void (async () => {
									await this.plugin.updateSetting("codexFolderIndicatorThickness", value as CodexFolderIndicatorThickness);
									this.plugin.applyCodexFolderStyle();
									this.plugin.applyHighlightStyle();
																	})();
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
								.onChange((value) => {
									void (async () => {
									await this.plugin.updateSetting("codexNoteLabelFontSize", value);
									this.plugin.applyCodexNoteLabelStyle();
																	})();
								}),
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
							this.bindColorSwatchButton(button, settings.codexNoteLabelColor, async (hex) => {
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
							this.bindColorSwatchButton(button, settings.codexHighlightColor, async (hex) => {
								await this.plugin.updateSetting("codexHighlightColor", hex);
								this.plugin.applyHighlightStyle();
							}),
						);
				})
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

			const applyUseHeaderColorVisibility = (hidden: boolean) => {
				folderColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
				noteLabelColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
				defaultColourToggleSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
				folderColourToggleSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
				codexHighlightColourSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
			};
			useHeaderColorToggle.onChange((value) => {
				void (async () => {
				await this.plugin.updateSetting("codexUseHeaderColorForAll", value);
				applyUseHeaderColorVisibility(value);
				this.plugin.applyHeaderStyles();
				this.plugin.applyHighlightStyle();
				this.plugin.applyCodexFolderStyle();
				this.plugin.applyCodexNoteLabelStyle();
							})();
			});
			applyUseHeaderColorVisibility(settings.codexUseHeaderColorForAll);
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
		this.renderButtonRow(containerEl);
	}
}
