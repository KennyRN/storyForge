import { App, Modal, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { EditorScrollbarThickness, StoryForgePluginSettings } from "../main";
import {
	bindColorSwatchButton,
	persistAndRestyle,
	renderTabbedBody,
	renderToggleWithRevealCard,
	type StyleModalTab,
} from "./styleModalHelpers";

const EDITOR_SCROLLBAR_THICKNESS_ORDER: EditorScrollbarThickness[] = ["thin", "medium", "thick"];
const EDITOR_SCROLLBAR_THICKNESS_LABELS = ["Thin", "Medium", "Thick"];

/**
 * Editor body/heading *size* and *colour* overrides plus the manuscript scrollbar — colour here
 * is storyForge-native (its own palette, see colorPalettes.ts), never formatForge's. Font,
 * small-caps, and dividers still live in formatForge only. This modal's one entry point
 * (StoryForgeSettingsTab.ts) is reachable only while formatForge is disconnected, so these
 * colour controls never contend with formatForge's own colour vars — no separate gating needed
 * here. When formatForge is connected, scrollbar lives in formatForge's Text styling Extras tab.
 */
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
					this.renderColorCard(
						body,
						settings,
						"Override theme's default text colour",
						"Text colour",
						"bodyTextOverrideColor",
						"bodyTextColor",
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
					this.renderColorCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading1OverrideColor",
						"heading1Color",
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
					this.renderColorCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading2OverrideColor",
						"heading2Color",
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
					this.renderColorCard(
						body,
						settings,
						"Override theme's default header colour",
						"Header colour",
						"heading3OverrideColor",
						"heading3Color",
						restyle,
					);
				},
			},
			{
				id: "other",
				label: "H4–6",
				render: (body) => {
					renderTabbedBody(
						body,
						([4, 5, 6] as const).map((n) => ({
							id: `h${n}`,
							label: `H${n}`,
							render: (levelBody) => {
								this.renderSizeCard(
									levelBody,
									settings,
									"Override theme's default header size",
									"Header size",
									`heading${n}OverrideSize`,
									`heading${n}Size`,
									0.7,
									1.8,
									restyle,
								);
								this.renderColorCard(
									levelBody,
									settings,
									"Override theme's default header colour",
									"Header colour",
									`heading${n}OverrideColor`,
									`heading${n}Color`,
									restyle,
								);
							},
						})),
						{
							initialId: `h${this.selectedOtherHeadingLevel}`,
							onActivate: (id) => {
								this.selectedOtherHeadingLevel = Number(id.slice(1)) as 4 | 5 | 6;
							},
						},
					);
				},
			},
			{
				id: "extras",
				label: "Extras",
				render: (body) => {
					this.renderEditorScrollbarGroup(body, settings);
				},
			},
		];

		renderTabbedBody(contentEl, tabs);
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
							void persistAndRestyle(this.plugin, "editorScrollbarThickness", thickness, () =>
								this.plugin.applyEditorScrollbarStyles(),
							);
						}),
				);
		});
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
							.onChange((value) => void persistAndRestyle(this.plugin, sizeKey, value, restyle)),
					);
				});
				return sliderSetting;
			},
			restyle,
		);
	}

	/** Same shape as renderSizeCard, but for a colour swatch — storyForge's own palette (see this file's header comment), not formatForge's. */
	private renderColorCard(
		body: HTMLElement,
		settings: StoryForgePluginSettings,
		label: string,
		swatchLabel: string,
		overrideKey: keyof StoryForgePluginSettings,
		colorKey: keyof StoryForgePluginSettings,
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
				let colorSetting!: Setting;
				card.addSetting((setting) => {
					colorSetting = setting;
					setting.setName(swatchLabel).addButton((button) =>
						bindColorSwatchButton(this.app, this.plugin, button.buttonEl, settings[colorKey] as string, (hex) =>
							void persistAndRestyle(this.plugin, colorKey, hex, restyle),
						),
					);
				});
				return colorSetting;
			},
			restyle,
		);
	}
}
