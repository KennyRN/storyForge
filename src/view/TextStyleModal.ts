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

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

function headingKey(level: HeadingLevel, suffix: string): keyof StoryForgePluginSettings {
	return `heading${level}${suffix}` as keyof StoryForgePluginSettings;
}

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
						settings.bodyTextOverrideColor
							? "Override body text's standard italic/bold colour"
							: "Override theme's default italic/bold colour";
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
				render: (body) =>
					this.renderHeadingLevel(body, settings, 1, restyle, (card) =>
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
					),
			},
			{
				id: "h2",
				label: "H2",
				render: (body) => this.renderHeadingLevel(body, settings, 2, restyle),
			},
			{
				id: "h3",
				label: "H3",
				render: (body) => this.renderHeadingLevel(body, settings, 3, restyle),
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

					for (const level of [4, 5, 6] as const) {
						const before = body.children.length;
						this.renderHeadingLevel(body, settings, level, restyle);
						levelElements[level] = Array.from(body.children).slice(before) as HTMLElement[];
					}
					applySelectedLevel(this.selectedOtherHeadingLevel);
				},
			},
		];

		renderTabbedBody(contentEl, tabs);
	}

	/** Size → colour → font → dividers for one heading level. H1–3 use a larger size range. */
	private renderHeadingLevel(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		level: HeadingLevel,
		restyle: () => void,
		extraSizeRow?: (card: SettingGroup) => void,
	): void {
		const sizeMin = level <= 3 ? 1 : 0.7;
		const sizeMax = level <= 3 ? 2.5 : 1.8;
		this.renderSizeCard(
			body,
			settings,
			"Override theme's default header size",
			"Header size",
			headingKey(level, "OverrideSize"),
			headingKey(level, "Size"),
			sizeMin,
			sizeMax,
			restyle,
			extraSizeRow,
		);
		this.renderColorOverrideCard(
			body,
			settings,
			"Override theme's default header colour",
			"Header colour",
			headingKey(level, "OverrideColor"),
			headingKey(level, "Color"),
			restyle,
		);
		this.renderFontCard(
			body,
			settings,
			headingKey(level, "OverrideFont"),
			headingKey(level, "FontWeight"),
			headingKey(level, "FontFamily"),
			headingKey(level, "SmallCaps"),
		);
		this.renderDividerCard(
			body,
			settings,
			headingKey(level, "DividerAbove"),
			headingKey(level, "DividerAboveThickness"),
			headingKey(level, "DividerBelow"),
			headingKey(level, "DividerBelowThickness"),
			restyle,
		);
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
			(value) => {
				void this.plugin.updateSetting(overrideKey, value);
			},
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
		wireCardToggle(aboveToggle, aboveThicknessSetting, (value) => {
			void this.plugin.updateSetting(aboveKey, value);
		}, restyle);

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
		wireCardToggle(belowToggle, belowThicknessSetting, (value) => {
			void this.plugin.updateSetting(belowKey, value);
		}, restyle);
	}
}
