import { App, Modal, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import {
	persistAndRestyle,
	renderTabbedBody,
	renderToggleWithRevealCard,
	type StyleModalTab,
} from "./styleModalHelpers";

/** Editor body/heading *size* overrides only — colours, fonts, and dividers live in formatForge. */
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
					);
				},
			},
			{
				id: "h2",
				label: "H2",
				render: (body) => {
					this.renderSizeCard(
						body,
						settings,
						"Override theme's default header size",
						"Header size",
						"heading2OverrideSize",
						"heading2Size",
						1,
						2.5,
						restyle,
					);
				},
			},
			{
				id: "h3",
				label: "H3",
				render: (body) => {
					this.renderSizeCard(
						body,
						settings,
						"Override theme's default header size",
						"Header size",
						"heading3OverrideSize",
						"heading3Size",
						1,
						2.5,
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
					this.renderSizeCard(
						body,
						settings,
						"Override theme's default header size",
						"Header size",
						"heading4OverrideSize",
						"heading4Size",
						0.7,
						1.8,
						restyle,
					);
					levelElements[4] = Array.from(body.children).slice(before4) as HTMLElement[];

					const before5 = body.children.length;
					this.renderSizeCard(
						body,
						settings,
						"Override theme's default header size",
						"Header size",
						"heading5OverrideSize",
						"heading5Size",
						0.7,
						1.8,
						restyle,
					);
					levelElements[5] = Array.from(body.children).slice(before5) as HTMLElement[];

					const before6 = body.children.length;
					this.renderSizeCard(
						body,
						settings,
						"Override theme's default header size",
						"Header size",
						"heading6OverrideSize",
						"heading6Size",
						0.7,
						1.8,
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
		);
	}
}
