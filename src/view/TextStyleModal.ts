import { App, Modal, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import {
	bindColorSwatchButton,
	persistAndRestyle,
	renderCustomFontCard,
	renderTabbedBody,
	renderToggleWithRevealCard,
	wireCardToggle,
	type StyleModalTab,
} from "./styleModalHelpers";

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

		const tabs: StyleModalTab[] = [
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
						0.7,
						1.8,
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
						() => {
							emphasisLabelSetting?.setName(emphasisLabel());
						},
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
							card.addSetting((setting) => {
								setting
									.setName("Hide Heading 1 Links")
									.setDesc(
										"When on, links inside a note's H1 heading render as plain text — no link colour or underline — so the title looks like a normal heading.",
									)
									.addToggle((toggle) =>
										toggle.setValue(settings.hideHeading1Links).onChange((value) => this.persistHideHeading1Links(value)),
									);
							}),
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
					levelGroup.addSetting((setting) => {
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
						);
					});

					const before4 = body.children.length;
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading4OverrideSize", "heading4Size", 0.7, 1.8, restyle);
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
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading5OverrideSize", "heading5Size", 0.7, 1.8, restyle);
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
					this.renderSizeCard(body, settings, "Override theme's default header size", "Header size", "heading6OverrideSize", "heading6Size", 0.7, 1.8, restyle);
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

		renderTabbedBody(contentEl, tabs);
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
		renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey] as boolean,
			(value) => { void this.plugin.updateSetting(overrideKey, value); },
			(card) => {
				let sliderSetting!: Setting;
				card.addSetting((setting) => {
					sliderSetting = setting;
					setting.setName(sliderLabel).addSlider((slider) =>
						slider
							.setLimits(min, max, 0.1)
							.setValue(settings[sizeKey] as number)
							.onChange((value) => persistAndRestyle(this.plugin, sizeKey, value, restyle)),
					);
				});
				return sliderSetting;
			},
			restyle,
			extraRowBefore,
		);
	}

	private persistHideHeading1Links(value: boolean): void {
		void this.plugin.updateSetting("hideHeading1Links", value).then(() => this.plugin.applyHeading1LinkStyle());
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
		renderToggleWithRevealCard(
			body,
			label,
			settings[overrideKey] as boolean,
			(value) => {
				void this.plugin.updateSetting(overrideKey, value).then(() => onToggle?.(value));
			},
			(card) => {
				let colorSetting!: Setting;
				card.addSetting((setting) => {
					colorSetting = setting;
					setting.setName(swatchLabel).addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[colorKey] as string, (hex) => {
							void this.plugin.updateSetting(colorKey, hex).then(() => restyle());
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
				bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.bodyTextBoldColor, (hex) => {
					void this.plugin.updateSetting("bodyTextBoldColor", hex).then(() => restyle());
				}),
			);
		});

		let italicColorSetting!: Setting;
		card.addSetting((setting) => {
			italicColorSetting = setting;
			setting.setName("Italic colour").addButton((button) =>
				bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings.bodyTextItalicColor, (hex) => {
					void this.plugin.updateSetting("bodyTextItalicColor", hex).then(() => restyle());
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
		void this.plugin.updateSetting("bodyTextOverrideEmphasisColor", value).then(() => {
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
		if (!fontFamilyKey) return;
		renderCustomFontCard({
			plugin: this.plugin,
			body,
			settings,
			overrideFontKey,
			fontWeightKey,
			fontFamilyKey,
			smallCapsKey,
			restyle: () => this.plugin.applyTextStyleOverrides(),
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
		card.addSetting((setting) => {
			setting.setName("Divider line above header").addToggle((toggle) => {
				aboveToggle = toggle;
				toggle.setValue(settings[aboveKey] as boolean);
			});
		});
		let aboveThicknessSetting!: Setting;
		card.addSetting((setting) => {
			aboveThicknessSetting = setting;
			setting.setName("Thickness").addDropdown((dropdown) =>
				dropdown
					.addOption("thin", "Thin")
					.addOption("medium", "Medium")
					.addOption("thick", "Thick")
					.setValue(settings[aboveThicknessKey] as string)
					.onChange((value) => persistAndRestyle(this.plugin, aboveThicknessKey, value, restyle)),
			);
		});
		wireCardToggle(aboveToggle, aboveThicknessSetting, (value) => { void this.plugin.updateSetting(aboveKey, value); }, restyle);

		let belowToggle!: ToggleComponent;
		card.addSetting((setting) => {
			setting.setName("Divider line below header").addToggle((toggle) => {
				belowToggle = toggle;
				toggle.setValue(settings[belowKey] as boolean);
			});
		});
		let belowThicknessSetting!: Setting;
		card.addSetting((setting) => {
			belowThicknessSetting = setting;
			setting.setName("Thickness").addDropdown((dropdown) =>
				dropdown
					.addOption("thin", "Thin")
					.addOption("medium", "Medium")
					.addOption("thick", "Thick")
					.setValue(settings[belowThicknessKey] as string)
					.onChange((value) => persistAndRestyle(this.plugin, belowThicknessKey, value, restyle)),
			);
		});
		wireCardToggle(belowToggle, belowThicknessSetting, (value) => { void this.plugin.updateSetting(belowKey, value); }, restyle);
	}
}
