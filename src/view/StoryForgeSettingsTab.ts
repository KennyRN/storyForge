import { App, ButtonComponent, Notice, Platform, PluginSettingTab, Setting, SettingGroup, ToggleComponent, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency, CodexFolderIndicatorThickness, CustomFontFamily, FontWeight, HeadingDividerThickness, StatusBarView, StoryForgePluginSettings } from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES, PaletteMode, PaletteName } from "../colorPalettes";
import { PalettePickerModal } from "./PalettePickerModal";
import { IconAuditModal } from "./IconAuditModal";
import { CUSTOM_FONTS } from "../fonts";
import { runFullBackup } from "../backup";
import { ensureWelcomeNote } from "../welcomeNote";
import { ConvertToSeriesModal } from "./ConvertToSeriesModal";

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
			dropdown.onChange(async (v) => {
				await onChange(v as FontWeight);
				applySelectedWeight(v as FontWeight);
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
		return useHeaderColorForAllToggle;
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
			.setName("Recreate welcome note")
			.setDesc("Restores storyForge Welcome.md in your Codex if you've deleted it. If it still exists, this just opens it.")
			.addButton((button) =>
				button.setButtonText("Recreate welcome note").onClick(async () => {
					try {
						const file = await ensureWelcomeNote(this.app);
						await this.app.workspace.getLeaf(false).openFile(file);
					} catch (err) {
						new Notice(`storyForge: could not recreate welcome note — ${(err as Error).message}`);
					}
				}),
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

		new Setting(containerEl)
			.setName("Hide series pane")
			.setDesc("Hides the series header and locks storyForge to book view — for standalone/non-series projects. Your series data isn't deleted; toggle this off anytime to bring it back.")
			.addToggle((toggle) =>
				toggle.setValue(settings.hideSeriesPane).onChange(async (value) => {
					await this.plugin.updateSetting("hideSeriesPane", value);
					this.plugin.refreshStoryForgeViews();
				}),
			);

		if (settings.hideSeriesPane) {
			new Setting(containerEl)
				.setName("Convert to series")
				.setDesc("Turn this standalone book into the first book of a series — lets you add more books to it later.")
				.addButton((button) =>
					button
						.setButtonText("Convert to series")
						.setCta()
						.onClick(() => new ConvertToSeriesModal(this.app, this.plugin, () => this.display()).open()),
				);
		}
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

	/** Wires a toggle to persist `key`, hide/show `card` accordingly, and restyle - the shared pattern behind every conditional card in this file. */
	private wireCardToggle(toggle: ToggleComponent, card: Setting, persist: (value: boolean) => Promise<void>, restyle: () => void): void {
		const applyVisibility = (hidden: boolean) => card.settingEl.toggleClass("sf-settings-hidden", hidden);
		toggle.onChange(async (value) => {
			await persist(value);
			applyVisibility(!value);
			restyle();
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
		toggle.onChange(async (value) => {
			await this.plugin.updateSetting("bodyTextOverrideEmphasisColor", value);
			applyVisibility(!value);
			restyle();
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
				dropdown.onChange(async (value) => {
					await this.plugin.updateSetting(fontFamilyKey, value as CustomFontFamily);
					applySelectedFont(value as CustomFontFamily);
					selectedFontFamily = value as CustomFontFamily;
					applyVisibility(!overrideToggle.getValue());
					restyle();
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
					toggle.setValue(settings[smallCapsKey]).onChange(async (value) => {
						await this.plugin.updateSetting(smallCapsKey, value);
						restyle();
					}),
				);
				setting.nameEl.style.fontVariant = "small-caps";
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
		overrideToggle.onChange(async (value) => {
			await this.plugin.updateSetting(overrideFontKey, value);
			applyVisibility(!value);
			restyle();
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
					.onChange(async (value) => {
						await this.plugin.updateSetting(aboveThicknessKey, value as HeadingDividerThickness);
						restyle();
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
					.onChange(async (value) => {
						await this.plugin.updateSetting(belowThicknessKey, value as HeadingDividerThickness);
						restyle();
					}),
			);
		});
		this.wireCardToggle(belowToggle, belowThicknessSetting, (value) => this.plugin.updateSetting(belowKey, value), restyle);
	}

	private renderTextStyleSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "text-style", "h3", "Text style", (body) => {
			const restyle = () => this.plugin.applyTextStyleOverrides();
			this.renderFoldableSection(body, "text-style-editor", "h4", "Body text", (bodyTextBody) => {
				this.renderSizeCard(
					bodyTextBody,
					settings,
					"Override theme's default font size",
					"Font size",
					"bodyTextOverrideSize",
					"bodyTextSize",
					0.75,
					1.75,
					restyle,
				);
				let emphasisLabelSetting: Setting | undefined;
				const emphasisLabel = () =>
					settings.bodyTextOverrideColor ? "Override body text's standard italic/bold colour" : "Override theme's default italic/bold colour";
				this.renderColorOverrideCard(
					bodyTextBody,
					settings,
					"Override theme's default font colour",
					"Font colour",
					"bodyTextOverrideColor",
					"bodyTextColor",
					restyle,
					() => emphasisLabelSetting?.setName(emphasisLabel()),
				);
				this.renderFontCard(bodyTextBody, settings, "bodyTextOverrideFont", "bodyTextFontWeight", "bodyTextFontFamily");
				emphasisLabelSetting = this.renderEmphasisColorOverrideCard(bodyTextBody, settings, emphasisLabel(), restyle);
			});
			this.renderFoldableSection(body, "text-style-h1", "h4", "Heading 1", (h1Body) => {
				this.renderSizeCard(
					h1Body,
					settings,
					"Override theme's default header size",
					"Header size",
					"heading1OverrideSize",
					"heading1Size",
					1,
					2.5,
					restyle,
					(card) =>
						card.addSetting((setting) =>
							setting
								.setName("Hide Heading 1 Links")
								.setDesc(
									"When on, links inside a note's H1 heading render as plain text — no link colour or underline — so the title looks like a normal heading.",
								)
								.addToggle((toggle) =>
									toggle.setValue(settings.hideHeading1Links).onChange(async (value) => {
										await this.plugin.updateSetting("hideHeading1Links", value);
										this.plugin.applyHeading1LinkStyle();
									}),
								),
						),
				);
				this.renderColorOverrideCard(
					h1Body,
					settings,
					"Override theme's default header colour",
					"Header colour",
					"heading1OverrideColor",
					"heading1Color",
					restyle,
				);
				this.renderFontCard(h1Body, settings, "heading1OverrideFont", "heading1FontWeight", "heading1FontFamily", "heading1SmallCaps");
				this.renderDividerCard(
					h1Body,
					settings,
					"heading1DividerAbove",
					"heading1DividerAboveThickness",
					"heading1DividerBelow",
					"heading1DividerBelowThickness",
					restyle,
				);
			});
			this.renderFoldableSection(body, "text-style-h2", "h4", "Heading 2", (h2Body) => {
				this.renderSizeCard(h2Body, settings, "Override theme's default header size", "Header size", "heading2OverrideSize", "heading2Size", 1, 2.5, restyle);
				this.renderColorOverrideCard(
					h2Body,
					settings,
					"Override theme's default header colour",
					"Header colour",
					"heading2OverrideColor",
					"heading2Color",
					restyle,
				);
				this.renderFontCard(h2Body, settings, "heading2OverrideFont", "heading2FontWeight", "heading2FontFamily", "heading2SmallCaps");
				this.renderDividerCard(
					h2Body,
					settings,
					"heading2DividerAbove",
					"heading2DividerAboveThickness",
					"heading2DividerBelow",
					"heading2DividerBelowThickness",
					restyle,
				);
			});
			this.renderFoldableSection(body, "text-style-h3", "h4", "Heading 3", (h3Body) => {
				this.renderSizeCard(h3Body, settings, "Override theme's default header size", "Header size", "heading3OverrideSize", "heading3Size", 1, 2.5, restyle);
				this.renderColorOverrideCard(
					h3Body,
					settings,
					"Override theme's default header colour",
					"Header colour",
					"heading3OverrideColor",
					"heading3Color",
					restyle,
				);
				this.renderFontCard(h3Body, settings, "heading3OverrideFont", "heading3FontWeight", "heading3FontFamily", "heading3SmallCaps");
				this.renderDividerCard(
					h3Body,
					settings,
					"heading3DividerAbove",
					"heading3DividerAboveThickness",
					"heading3DividerBelow",
					"heading3DividerBelowThickness",
					restyle,
				);
			});
			this.renderFoldableSection(body, "text-style-other-headers", "h4", "Headings 4 thru 6", (otherBody) => {
				const levelGroup = new SettingGroup(otherBody);
				const levelElements: Record<4 | 5 | 6, HTMLElement[]> = { 4: [], 5: [], 6: [] };
				const applySelectedLevel = (level: 4 | 5 | 6) => {
					for (const [key, els] of Object.entries(levelElements)) {
						const hidden = Number(key) !== level;
						for (const el of els) el.toggleClass("sf-settings-hidden", hidden);
					}
				};
				levelGroup.addSetting((setting) =>
					setting.setName("Choose heading level").addDropdown((dropdown) =>
						dropdown
							.addOption("4", "Heading 4")
							.addOption("5", "Heading 5")
							.addOption("6", "Heading 6")
							.setValue(String(this.selectedOtherHeadingLevel))
							.onChange((value) => {
								this.selectedOtherHeadingLevel = Number(value) as 4 | 5 | 6;
								applySelectedLevel(this.selectedOtherHeadingLevel);
							}),
					),
				);

				// Cards render flat under `otherBody` (matching Heading 1-3) so Obsidian's own
				// sibling-based `.setting-group` spacing applies; the elements newly added per level
				// are captured afterward so the level selector can show/hide just that level's cards.
				const before4 = otherBody.children.length;
				this.renderSizeCard(otherBody, settings, "Override theme's default header size", "Header size", "heading4OverrideSize", "heading4Size", 0.75, 1.75, restyle);
				this.renderColorOverrideCard(otherBody, settings, "Override theme's default header colour", "Header colour", "heading4OverrideColor", "heading4Color", restyle);
				this.renderFontCard(otherBody, settings, "heading4OverrideFont", "heading4FontWeight", "heading4FontFamily", "heading4SmallCaps");
				this.renderDividerCard(
					otherBody,
					settings,
					"heading4DividerAbove",
					"heading4DividerAboveThickness",
					"heading4DividerBelow",
					"heading4DividerBelowThickness",
					restyle,
				);
				levelElements[4] = Array.from(otherBody.children).slice(before4) as HTMLElement[];

				const before5 = otherBody.children.length;
				this.renderSizeCard(otherBody, settings, "Override theme's default header size", "Header size", "heading5OverrideSize", "heading5Size", 0.75, 1.75, restyle);
				this.renderColorOverrideCard(otherBody, settings, "Override theme's default header colour", "Header colour", "heading5OverrideColor", "heading5Color", restyle);
				this.renderFontCard(otherBody, settings, "heading5OverrideFont", "heading5FontWeight", "heading5FontFamily", "heading5SmallCaps");
				this.renderDividerCard(
					otherBody,
					settings,
					"heading5DividerAbove",
					"heading5DividerAboveThickness",
					"heading5DividerBelow",
					"heading5DividerBelowThickness",
					restyle,
				);
				levelElements[5] = Array.from(otherBody.children).slice(before5) as HTMLElement[];

				const before6 = otherBody.children.length;
				this.renderSizeCard(otherBody, settings, "Override theme's default header size", "Header size", "heading6OverrideSize", "heading6Size", 0.75, 1.75, restyle);
				this.renderColorOverrideCard(otherBody, settings, "Override theme's default header colour", "Header colour", "heading6OverrideColor", "heading6Color", restyle);
				this.renderFontCard(otherBody, settings, "heading6OverrideFont", "heading6FontWeight", "heading6FontFamily", "heading6SmallCaps");
				this.renderDividerCard(
					otherBody,
					settings,
					"heading6DividerAbove",
					"heading6DividerAboveThickness",
					"heading6DividerBelow",
					"heading6DividerBelowThickness",
					restyle,
				);
				levelElements[6] = Array.from(otherBody.children).slice(before6) as HTMLElement[];

				applySelectedLevel(this.selectedOtherHeadingLevel);
			});
		});
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
					.setValue(settings.cyclingGuideThickness)
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
					.setValue(settings.cyclingGuideFlagSize)
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
					.setValue(settings.cyclingGuideInterval)
					.onChange(async (value) => {
						await this.plugin.updateSetting("cyclingGuideInterval", value as "short" | "medium" | "large");
						this.plugin.rebuildCyclingGuideExtension();
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
		cyclingGuideToggle.onChange(async (value) => {
			await this.plugin.updateSetting("cyclingGuideEnabled", value);
			this.plugin.setCyclingGuideEnabled(value);
			applyCyclingGuideVisibility(!value);
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
							.onChange(async (value) => {
								await this.plugin.updateSetting(config.sizeKey, value);
								this.plugin.applyLibraryHeaderStyles();
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
						toggle.setValue(settings[config.smallCapsKey]).onChange(async (value) => {
							await this.plugin.updateSetting(config.smallCapsKey, value);
							this.plugin.applyLibraryHeaderStyles();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
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
							.onChange(async (value) => {
								await this.plugin.updateSetting("libraryBookSubtitleFontSize", value);
								this.plugin.applyLibraryHeaderStyles();
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
						toggle.setValue(settings.libraryBookSubtitleSmallCaps).onChange(async (value) => {
							await this.plugin.updateSetting("libraryBookSubtitleSmallCaps", value);
							this.plugin.applyLibraryHeaderStyles();
						}),
					);
				setting.nameEl.style.fontVariant = "small-caps";
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
							toggle.setValue(settings.unplacedItemsMuted).onChange(async (value) => {
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

	private renderUiFormattingSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "ui-formatting", "h3", "storyForge interface", (body) => {
			this.renderHighlightGroup(body, settings);
			this.renderCyclingGuideCard(body, settings);
			this.renderFoldableSection(body, "library-pane", "h4", "Library pane", (libraryBody) => {
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
				)
				.addSetting((setting) =>
					setting
						.setName("Status bar view")
						.setDesc("Controls what's shown in Obsidian's bottom status bar.")
						.addDropdown((dropdown) =>
							dropdown
								.addOption("hidden", "Hide status bar")
								.addOption("sync-only", "Show only the Obsidian Sync icon")
								.addOption("all", "Show all of the status bar")
								.setValue(settings.statusBarView)
								.onChange(async (value) => {
									await this.plugin.updateSetting("statusBarView", value as StatusBarView);
									this.plugin.applyVisibilityStyles();
								}),
						),
				);
		});
	}

	private renderImportExportSection(containerEl: HTMLElement): void {
		this.renderFoldableSection(containerEl, "import-export", "h3", "Import & export storyForge settings", (body) => {
			new Setting(body)
				.setName("Export settings")
				.setDesc("Saves all storyForge settings to a JSON file.")
				.addButton((button) =>
					button.setButtonText("Export").onClick(() => {
						const json = JSON.stringify(this.plugin.getSettings(), null, 2);
						const blob = new Blob([json], { type: "application/json" });
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = "storyforge-settings.json";
						a.click();
						URL.revokeObjectURL(url);
					}),
				);

			new Setting(body)
				.setName("Import settings")
				.setDesc("Restores storyForge settings from a previously exported JSON file. This overwrites your current settings.")
				.addButton((button) =>
					button.setButtonText("Import").onClick(() => {
						const input = document.createElement("input");
						input.type = "file";
						input.accept = "application/json";
						input.addEventListener("change", () => {
							const file = input.files?.[0];
							if (!file) return;
							void (async () => {
								try {
									const text = await file.text();
									const parsed = JSON.parse(text);
									await this.plugin.importSettings(parsed);
									this.display();
								} catch (err) {
									new Notice(`storyForge: could not import settings — ${(err as Error).message}`);
								}
							})();
						});
						input.click();
					}),
				);
		});
	}

	private renderAutomaticBackupSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "automatic-backup", "h3", "Automatic backup", (body) => {
			if (!Platform.isDesktopApp) {
				new Setting(body).setName("Automatic backup").setDesc("Automatic backup is only available on desktop.");
				return;
			}

			const card = new SettingGroup(body);
			let folderValue = settings.automaticBackupFolder;
			let frequencyRow!: Setting;

			card.addSetting((setting) =>
				setting
					.setName("Automatic backup")
					.setDesc("Automatically zip your vault's notes and attachments on a schedule.")
					.addToggle((toggle) =>
						toggle.setValue(settings.automaticBackupEnabled).onChange(async (value) => {
							await this.plugin.updateSetting("automaticBackupEnabled", value);
							frequencyRow.settingEl.toggleClass("sf-settings-hidden", !value);
						}),
					),
			);

			card.addSetting((setting) =>
				setting
					.setName("Backup folder")
					.setDesc("Absolute folder path on this computer where backup zip files are saved. Required for both automatic and manual backups.")
					.addText((text) =>
						text
							.setPlaceholder("/Users/you/Backups/storyForge")
							.setValue(settings.automaticBackupFolder)
							.onChange(async (value) => {
								folderValue = value;
								await this.plugin.updateSetting("automaticBackupFolder", value);
							}),
					),
			);

			card.addSetting((setting) => {
				frequencyRow = setting.setName("Backup frequency").addDropdown((dropdown) =>
					dropdown
						.addOption("every-open", "Every time vault is opened")
						.addOption("daily", "Once daily")
						.addOption("weekly", "Once weekly")
						.setValue(settings.automaticBackupFrequency)
						.onChange(async (value) => {
							await this.plugin.updateSetting("automaticBackupFrequency", value as AutomaticBackupFrequency);
						}),
				);
				frequencyRow.settingEl.toggleClass("sf-settings-hidden", !settings.automaticBackupEnabled);
			});

			card.addSetting((setting) =>
				setting
					.setName("Back up now")
					.setDesc("Creates a full backup zip immediately, including your .obsidian settings folder — saved to the backup folder above.")
					.addButton((button) =>
						button.setButtonText("Back up now").onClick(() => {
							if (!folderValue) {
								new Notice("storyForge: set a backup folder before backing up.");
								return;
							}
							void (async () => {
								try {
									const path = await runFullBackup(this.app, folderValue);
									new Notice(`storyForge: backup saved to ${path}`);
								} catch (err) {
									new Notice(`storyForge: backup failed — ${(err as Error).message}`);
								}
							})();
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
		this.renderTextStyleSection(containerEl, settings);
		this.renderUiFormattingSection(containerEl, settings);
		this.renderHideUiSection(containerEl, settings);
		this.renderImportExportSection(containerEl);
		this.renderAutomaticBackupSection(containerEl, settings);
	}
}
