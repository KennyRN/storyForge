import { App, Modal, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { EditorScrollbarThickness, StoryForgePluginSettings } from "../main";
import {
	bindColorSwatchButton,
	persistAndRestyle,
	renderToggleWithRevealCard,
} from "./styleModalHelpers";
import {
	ensureLeafPath,
	isLeafNode,
	nodeAtPath,
	renderIconBreadcrumb,
	type BreadcrumbNode,
} from "./interfaceBreadcrumb";
import {
	ICON_BLOCKQUOTE,
	ICON_LINK2,
	ICON_LIST3_FILLED,
	ICON_PAGE_PORTRAIT,
	ICON_PAGE_TEXT,
	ICON_TEXT_HEADER_1,
	ICON_TEXT_HEADER_2,
	ICON_TEXT_HEADER_3,
	ICON_TEXT_HEADER_4,
	ICON_TEXT_HEADER_4_CARET,
	ICON_TEXT_HEADER_5,
	ICON_TEXT_HEADER_6,
	ICON_VERTICAL_SCROLL_POINT,
} from "../icons";

const EDITOR_SCROLLBAR_THICKNESS_ORDER: EditorScrollbarThickness[] = ["thin", "medium", "thick"];
const EDITOR_SCROLLBAR_THICKNESS_LABELS = ["Thin", "Medium", "Thick"];

/**
 * Editor body/heading/quote/link *size* and *colour* overrides plus the manuscript scrollbar —
 * colour here is storyForge-native (its own palette, see colorPalettes.ts), never formatForge's.
 * Font, small-caps, and dividers still live in formatForge only. This modal's one entry point
 * (StoryForgeSettingsTab.ts) is reachable only while formatForge is disconnected, so these
 * colour controls never contend with formatForge's own colour vars — no separate gating needed
 * here. When formatForge is connected, scrollbar lives in formatForge's Text styling Extras tab.
 */
export class TextStyleModal extends Modal {
	private plugin: StoryForgePlugin;
	private selectedOtherHeadingLevel: 4 | 5 | 6 = 4;
	private selectedBodyRegion = "text";

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

	private preferredChild = (parentId: string): string | undefined => {
		if (parentId === "body") return this.selectedBodyRegion;
		if (parentId === "other") return `h${this.selectedOtherHeadingLevel}`;
		return undefined;
	};

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-text-style-modal");

		const settings = this.plugin.getSettings();
		const restyle = () => this.plugin.applyTextStyleOverrides();

		const crumbRow = contentEl.createDiv({ cls: "sf-ui-format-crumb-row" });
		const crumbBody = contentEl.createDiv({ cls: "sf-ui-format-crumb-body" });
		const leafHost = crumbBody.createDiv({ cls: "sf-ui-format-crumb-leaf" });

		const headingLeaf = (n: 1 | 2 | 3 | 4 | 5 | 6, body: HTMLElement): void => {
			const sizeRange: [number, number] = n <= 3 ? [1, 2.5] : [0.7, 1.8];
			this.renderSizeCard(
				body,
				settings,
				"Override theme's default header size",
				"Header size",
				`heading${n}OverrideSize`,
				`heading${n}Size`,
				sizeRange[0],
				sizeRange[1],
				restyle,
			);
			this.renderColorCard(
				body,
				settings,
				"Override theme's default header colour",
				"Header colour",
				`heading${n}OverrideColor`,
				`heading${n}Color`,
				restyle,
			);
		};

		const tree: BreadcrumbNode[] = [
			{
				id: "body",
				label: "Body",
				icon: ICON_PAGE_TEXT,
				children: [
					{
						id: "text",
						label: "Text",
						icon: ICON_PAGE_PORTRAIT,
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
						id: "quote",
						label: "Quote",
						icon: ICON_BLOCKQUOTE,
						render: (body) => {
							this.renderSizeCard(
								body,
								settings,
								"Override theme's default font size",
								"Font size",
								"blockquoteOverrideSize",
								"blockquoteSize",
								0.7,
								1.8,
								restyle,
							);
							this.renderColorCard(
								body,
								settings,
								"Override theme's default text colour",
								"Text colour",
								"blockquoteOverrideColor",
								"blockquoteColor",
								restyle,
							);
							this.renderColorCard(
								body,
								settings,
								"Override theme's default background",
								"Background",
								"blockquoteOverrideBg",
								"blockquoteBgColor",
								restyle,
							);
							this.renderColorCard(
								body,
								settings,
								"Override theme's default side indicator",
								"Side indicator",
								"blockquoteOverrideBorder",
								"blockquoteBorderColor",
								restyle,
							);
						},
					},
					{
						id: "links",
						label: "Links and lists",
						icon: ICON_LINK2,
						icons: [ICON_LINK2, ICON_LIST3_FILLED],
						render: (body) => {
							this.renderColorCard(
								body,
								settings,
								"Override theme's default link colour",
								"Link colour",
								"bodyLinkOverrideColor",
								"bodyLinkColor",
								restyle,
							);
							this.renderColorCard(
								body,
								settings,
								"Override theme's default hovered-link colour",
								"Hovered link colour",
								"bodyLinkOverrideHoverColor",
								"bodyLinkHoverColor",
								restyle,
							);
							new SettingGroup(body).addSetting((setting) => {
								setting
									.setName("Remove link underline")
									.setDesc("When on, body links render without an underline.")
									.addToggle((toggle) =>
										toggle.setValue(settings.bodyLinkRemoveUnderline).onChange((value) => {
											void persistAndRestyle(this.plugin, "bodyLinkRemoveUnderline", value, restyle);
										}),
									);
							});
							this.renderColorCard(
								body,
								settings,
								"Override theme's default ordered-list marker",
								"Ordered list marker",
								"orderedListOverrideColor",
								"orderedListColor",
								restyle,
							);
							this.renderColorCard(
								body,
								settings,
								"Override theme's default unordered-list marker",
								"Unordered list marker",
								"unorderedListOverrideColor",
								"unorderedListColor",
								restyle,
							);
						},
					},
				],
			},
			{
				id: "h1",
				label: "H1",
				icon: ICON_TEXT_HEADER_1,
				render: (body) => headingLeaf(1, body),
			},
			{
				id: "h2",
				label: "H2",
				icon: ICON_TEXT_HEADER_2,
				render: (body) => headingLeaf(2, body),
			},
			{
				id: "h3",
				label: "H3",
				icon: ICON_TEXT_HEADER_3,
				render: (body) => headingLeaf(3, body),
			},
			{
				id: "other",
				label: "H4–6",
				icon: ICON_TEXT_HEADER_4_CARET,
				children: [
					{ id: "h4", label: "H4", icon: ICON_TEXT_HEADER_4, render: (body) => headingLeaf(4, body) },
					{ id: "h5", label: "H5", icon: ICON_TEXT_HEADER_5, render: (body) => headingLeaf(5, body) },
					{ id: "h6", label: "H6", icon: ICON_TEXT_HEADER_6, render: (body) => headingLeaf(6, body) },
				],
			},
			{
				id: "extras",
				label: "Extras",
				icon: ICON_VERTICAL_SCROLL_POINT,
				render: (body) => this.renderEditorScrollbarGroup(body, settings),
			},
		];

		let path: string[] = [];
		const applyPath = (next: string[]) => {
			const leafPath = ensureLeafPath(tree, next, this.preferredChild);
			const same = leafPath.length === path.length && leafPath.every((id, i) => id === path[i]);
			path = leafPath;
			if (path[0] === "body" && path[1]) this.selectedBodyRegion = path[1];
			if (path[0] === "other" && path[1]) {
				this.selectedOtherHeadingLevel = Number(path[1].slice(1)) as 4 | 5 | 6;
			}
			renderIconBreadcrumb(crumbRow, tree, path, applyPath);
			if (same && leafHost.childElementCount > 0) return;
			leafHost.empty();
			const leaf = nodeAtPath(tree, path);
			if (isLeafNode(leaf) && leaf.render) leaf.render(leafHost);
		};
		applyPath(["body", "text"]);
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
