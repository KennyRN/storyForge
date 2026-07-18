import { App, Modal, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { CUSTOM_FONTS } from "../fonts";

const FONT_WEIGHT_OPTIONS: [string, string][] = [
	["300", "Light"],
	["400", "Normal"],
	["500", "Medium"],
	["600", "Semi Bold"],
	["700", "Bold"],
	["800", "Extra Bold"],
	["900", "Black"],
];

export class TextStyleModal extends Modal {
	private plugin: StoryForgePlugin;
	private selectedOtherHeadingLevel: 4 | 5 | 6 = 4;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-text-style-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-text-style-modal");

		const settings = this.plugin.getSettings();
		const restyle = () => this.plugin.applyTextStyleOverrides();

		const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
		const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

		const tabs: { id: string; label: string; render: (body: HTMLElement) => void }[] = [
			{
				id: "body",
				label: "Body",
				render: (body) => {
					this.renderSizeCard(
						body,
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
						body,
						settings,
						"Override theme's default font colour",
						"Font colour",
						"bodyTextOverrideColor",
						"bodyTextColor",
						restyle,
						() => emphasisLabelSetting?.setName(emphasisLabel()),
					);
					this.renderFontCard(body, settings, "bodyTextOverrideFont", "bodyTextFontWeight", "bodyTextFontFamily");
					emphasisLabelSetting = this.renderEmphasisColorOverrideCard(body, settings, emphasisLabel(), restyle);
				},
			},
			{
				id: "h1",
				label: "H1",
				render: (body) => {
					this.renderSizeCard(
						body,
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
										toggle.setValue(settings.hideHeading1Links).onChange((value) => {
											void (async () => {
												await this.plugin.updateSetting("hideHeading1Links", value);
												this.plugin.applyHeading1LinkStyle();
											})();
										}),
									),
							),
					);
					this.renderColorOverrideCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading1OverrideColor",
						"heading1Color",
						restyle,
					);
					this.renderFontCard(body, settings, "heading1OverrideFont", "heading1FontWeight", "heading1FontFamily", "heading1SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading1DividerAbove",
						"heading1DividerAboveThickness",
						"heading1DividerBelow",
						"heading1DividerBelowThickness",
						restyle,
					);
				},
			},
			{
				id: "h2",
				label: "H2",
				render: (body) => {
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading2OverrideSize", "heading2Size", 1, 2.5, restyle);
					this.renderColorOverrideCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading2OverrideColor",
						"heading2Color",
						restyle,
					);
					this.renderFontCard(body, settings, "heading2OverrideFont", "heading2FontWeight", "heading2FontFamily", "heading2SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading2DividerAbove",
						"heading2DividerAboveThickness",
						"heading2DividerBelow",
						"heading2DividerBelowThickness",
						restyle,
					);
				},
			},
			{
				id: "h3",
				label: "H3",
				render: (body) => {
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading3OverrideSize", "heading3Size", 1, 2.5, restyle);
					this.renderColorOverrideCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading3OverrideColor",
						"heading3Color",
						restyle,
					);
					this.renderFontCard(body, settings, "heading3OverrideFont", "heading3FontWeight", "heading3FontFamily", "heading3SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading3DividerAbove",
						"heading3DividerAboveThickness",
						"heading3DividerBelow",
						"heading3DividerBelowThickness",
						restyle,
					);
				},
			},
			{
				id: "other",
				label: "H4–6",
				render: (body) => {
					const levelGroup = new SettingGroup(body);
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

					const before4 = body.children.length;
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading4OverrideSize", "heading4Size", 0.75, 1.75, restyle);
					this.renderColorOverrideCard(body, settings, "Override theme's default header colour", "Header colour", "heading4OverrideColor", "heading4Color", restyle);
					this.renderFontCard(body, settings, "heading4OverrideFont", "heading4FontWeight", "heading4FontFamily", "heading4SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading4DividerAbove",
						"heading4DividerAboveThickness",
						"heading4DividerBelow",
						"heading4DividerBelowThickness",
						restyle,
					);
					levelElements[4] = Array.from(body.children).slice(before4) as HTMLElement[];

					const before5 = body.children.length;
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading5OverrideSize", "heading5Size", 0.75, 1.75, restyle);
					this.renderColorOverrideCard(body, settings, "Override theme's default header colour", "Header colour", "heading5OverrideColor", "heading5Color", restyle);
					this.renderFontCard(body, settings, "heading5OverrideFont", "heading5FontWeight", "heading5FontFamily", "heading5SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading5DividerAbove",
						"heading5DividerAboveThickness",
						"heading5DividerBelow",
						"heading5DividerBelowThickness",
						restyle,
					);
					levelElements[5] = Array.from(body.children).slice(before5) as HTMLElement[];

					const before6 = body.children.length;
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading6OverrideSize", "heading6Size", 0.75, 1.75, restyle);
					this.renderColorOverrideCard(body, settings, "Override theme's default header colour", "Header colour", "heading6OverrideColor", "heading6Color", restyle);
					this.renderFontCard(body, settings, "heading6OverrideFont", "heading6FontWeight", "heading6FontFamily", "heading6SmallCaps");
					this.renderDividerCard(
						body,
						settings,
						"heading6DividerAbove",
						"heading6DividerAboveThickness",
						"heading6DividerBelow",
						"heading6DividerBelowThickness",
						restyle,
					);
					levelElements[6] = Array.from(body.children).slice(before6) as HTMLElement[];

					applySelectedLevel(this.selectedOtherHeadingLevel);
				},
			},
		];

		const tabBodies: HTMLElement[] = [];
		let activeTabId = tabs[0].id;

		tabs.forEach((tab, index) => {
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
		onPick: (hex: string) => Promise<void>,
	): void {
		buttonEl.addClass("sf-color-swatch-btn");
		buttonEl.setAttr("aria-label", "Choose colour");
		const paint = (hex: string) => {
			buttonEl.style.backgroundColor = hex;
		};
		paint(initialHex);
		buttonEl.addEventListener("click", () => {
			void (async () => {
				const s = this.plugin.getSettings();
				const { PalettePickerModal } = await import("./PalettePickerModal");
				new PalettePickerModal(this.app, s.colorPaletteName, s.colorPaletteMode, s.customPaletteColors, async (hex) => {
					paint(hex);
					await onPick(hex);
				}).open();
			})();
		});
	}

	private bindFontWeightDropdown(setting: Setting, value: string, onChange: (value: string) => Promise<void>): void {
		setting.addDropdown((dropdown) => {
			for (const [val, label] of FONT_WEIGHT_OPTIONS) {
				dropdown.addOption(val, label);
				const opt = dropdown.selectEl.options[dropdown.selectEl.options.length - 1];
				opt.style.fontWeight = val;
			}
			const applySelectedWeight = (v: string) => {
				dropdown.selectEl.style.fontWeight = v;
			};
			dropdown.setValue(value);
			applySelectedWeight(value);
			dropdown.onChange((v) => {
				void (async () => {
					await onChange(v);
					applySelectedWeight(v);
				})();
			});
		});
	}

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
		toggle.onChange((value) => {
			void (async () => {
				await persist(value);
				applyVisibility(!value);
				restyle();
			})();
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
				dropdown.onChange((value) => {
					void (async () => {
						await this.plugin.updateSetting(fontFamilyKey, value);
						applySelectedFont(value);
						selectedFontFamily = value;
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
			this.bindFontWeightDropdown(setting, settings[fontWeightKey] as string, async (value) => {
				await this.plugin.updateSetting(fontWeightKey, value);
				restyle();
			});
		});

		let smallCapsSetting: Setting | undefined;
		if (smallCapsKey) {
			card.addSetting((setting) => {
				smallCapsSetting = setting;
				setting.setName("Small caps").addToggle((toggle) =>
					toggle.setValue(settings[smallCapsKey] as boolean).onChange((value) => {
						void (async () => {
							await this.plugin.updateSetting(smallCapsKey, value);
							restyle();
						})();
					}),
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
		overrideToggle.onChange((value) => {
			void (async () => {
				await this.plugin.updateSetting(overrideFontKey, value);
				applyVisibility(!value);
				restyle();
			})();
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
					.onChange((value) => {
						void (async () => {
							await this.plugin.updateSetting(aboveThicknessKey, value);
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
					.onChange((value) => {
						void (async () => {
							await this.plugin.updateSetting(belowThicknessKey, value);
							restyle();
						})();
					}),
			);
		});
		this.wireCardToggle(belowToggle, belowThicknessSetting, (value) => this.plugin.updateSetting(belowKey, value), restyle);
	}
}