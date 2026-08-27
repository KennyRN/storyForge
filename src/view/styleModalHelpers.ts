import { App, DropdownComponent, Setting, SettingGroup, setIcon, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { CyclingGuideInterval, HeadingDividerThickness, StoryForgePluginSettings } from "../main";
import type { FontCatalogEntry } from "../formattingApi";
import { ICON_CYCLE_ALT } from "../icons";

/** Shared building blocks for TextStyleModal, UiFormattingModal, and
 * ProtectionsModal — free functions rather than a base class, matching the
 * codebase's existing preference, taking whatever app/plugin state they need
 * explicitly. */

/** A swatch button/picker with this wired in gets a "Theme default" choice alongside its real colours. */
export interface ColorSwatchThemeDefaultOption {
	isActive: boolean;
	onSelect: () => void | Promise<void>;
}

/** A swatch button/picker with this wired in gets a "Muted" choice above the palette colours. */
export interface ColorSwatchMutedOption {
	isActive: boolean | (() => boolean);
	onSelect: () => void | Promise<void>;
	onClear: () => void | Promise<void>;
}

/** A swatch button/picker with this wired in gets a labelled choice at the top of the palette. */
export interface ColorSwatchLeadingOption {
	isActive: boolean | (() => boolean);
	label: string;
	swatchHex: string;
	onSelect: () => void | Promise<void>;
	onClear: () => void | Promise<void>;
}

function flagIsActive(value: boolean | (() => boolean) | undefined): boolean {
	return typeof value === "function" ? value() : !!value;
}

export function applyColorPick(hex: string, paint: (hex: string | null) => void, onPick: (hex: string) => void): void {
	paint(hex);
	onPick(hex);
}

export function openColorSwatchPicker(
	app: App,
	plugin: StoryForgePlugin,
	paint: (hex: string | null) => void,
	onPick: (hex: string) => void,
	themeDefault?: ColorSwatchThemeDefaultOption,
	muted?: ColorSwatchMutedOption,
	leading?: ColorSwatchLeadingOption,
): void {
	const s = plugin.getSettings();
	void import("./PalettePickerModal").then(({ PalettePickerModal, resolveThemeMutedColor }) => {
		new PalettePickerModal(
			app,
			s.colorPaletteName,
			s.colorPaletteVariant,
			s.customPaletteColors,
			(hex) => {
				void (async () => {
					await leading?.onClear();
					await muted?.onClear();
					applyColorPick(hex, paint, onPick);
				})();
			},
			themeDefault && {
				isActive: themeDefault.isActive,
				onSelect: () => {
					paint(null);
					return themeDefault.onSelect();
				},
			},
			muted && {
				isActive: flagIsActive(muted.isActive),
				onSelect: () => {
					void (async () => {
						await leading?.onClear();
						paint(resolveThemeMutedColor());
						await muted.onSelect();
					})();
				},
			},
			leading && {
				isActive: flagIsActive(leading.isActive),
				label: leading.label,
				swatchHex: leading.swatchHex,
				onSelect: () => {
					void (async () => {
						await muted?.onClear();
						paint(leading.swatchHex);
						await leading.onSelect();
					})();
				},
			},
		).open();
	});
}

/**
 * Binds a colour swatch button to open the palette picker on click. When `themeDefault` is
 * passed, the picker's list gets a "Theme default" entry after every real colour. When `muted`
 * is passed, the picker's list gets a "Muted" entry above the palette colours (replacing a
 * separate muted toggle), and the button paints the live muted colour while that option is active.
 * When `leading` is passed, that labelled colour sits at the top of the picker, separated by a gap.
 */
export function bindColorSwatchButton(
	app: App,
	plugin: StoryForgePlugin,
	buttonEl: HTMLElement,
	initialHex: string,
	onPick: (hex: string) => void,
	themeDefault?: ColorSwatchThemeDefaultOption,
	muted?: ColorSwatchMutedOption,
	leading?: ColorSwatchLeadingOption,
): void {
	buttonEl.addClass("sf-color-swatch-btn");
	buttonEl.setAttr("aria-label", "Choose colour");
	const paint = (hex: string | null) => {
		buttonEl.toggleClass("sf-color-swatch-btn--theme-default", hex === null);
		buttonEl.setCssStyles({ backgroundColor: hex ?? "" });
	};
	if (flagIsActive(leading?.isActive)) {
		paint(leading!.swatchHex);
	} else if (flagIsActive(muted?.isActive)) {
		void import("./PalettePickerModal").then(({ resolveThemeMutedColor }) => {
			paint(resolveThemeMutedColor());
		});
	} else {
		paint(themeDefault?.isActive ? null : initialHex);
	}
	buttonEl.addEventListener("click", () => openColorSwatchPicker(app, plugin, paint, onPick, themeDefault, muted, leading));
}

export function applyExclusiveToggle(
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

export function bindExclusivePair(
	toggleA: ToggleComponent,
	toggleB: ToggleComponent,
	persistA: (value: boolean) => void,
	persistB: (value: boolean) => void,
): void {
	toggleA.onChange((value) => applyExclusiveToggle(value, toggleB, persistA, persistB));
	toggleB.onChange((value) => applyExclusiveToggle(value, toggleA, persistB, persistA));
}

export function applyCardToggle(
	value: boolean,
	persist: (value: boolean) => void,
	applyVisibility: (hidden: boolean) => void,
	restyle: () => void,
): void {
	persist(value);
	applyVisibility(!value);
	restyle();
}

export function wireCardToggle(toggle: ToggleComponent, card: Setting, persist: (value: boolean) => void, restyle: () => void): void {
	const applyVisibility = (hidden: boolean) => card.settingEl.toggleClass("sf-settings-hidden", hidden);
	toggle.onChange((value) => applyCardToggle(value, persist, applyVisibility, restyle));
	applyVisibility(!toggle.getValue());
}

export function renderToggleWithRevealCard(
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
	card.addSetting((setting) => {
		setting.setName(toggleLabel).addToggle((t) => {
			toggle = t;
			t.setValue(initialValue);
		});
	});
	const revealRow = buildRevealRow(card);
	wireCardToggle(toggle, revealRow, persist, restyle);
	return { toggle, card };
}

export function persistAndRestyle<K extends keyof StoryForgePluginSettings>(
	plugin: StoryForgePlugin,
	key: K,
	value: StoryForgePluginSettings[K],
	restyle: () => void,
): Promise<void> {
	return plugin.updateSetting(key, value).then(() => restyle());
}

const FONT_WEIGHT_OPTIONS: [string, string][] = [
	["300", "Light"],
	["400", "Normal"],
	["500", "Medium"],
	["600", "Semi Bold"],
	["700", "Bold"],
	["800", "Extra Bold"],
	["900", "Black"],
];

/** Weight dropdown choices that fall within a custom font's native weightMin–weightMax range. */
function fontWeightOptionsFor(weightMin: number, weightMax: number): [string, string][] {
	const options = FONT_WEIGHT_OPTIONS.filter(([val]) => {
		const n = Number(val);
		return n >= weightMin && n <= weightMax;
	});
	return options.length > 0 ? options : FONT_WEIGHT_OPTIONS;
}

/** Nearest allowed weight option for `weight`, or `weight` unchanged when already allowed. */
function clampFontWeightToOptions(weight: string, options: [string, string][]): string {
	if (options.some(([val]) => val === weight)) return weight;
	const n = Number(weight);
	let best = options[0][0];
	let bestDist = Infinity;
	for (const [val] of options) {
		const d = Math.abs(Number(val) - n);
		if (d < bestDist) {
			bestDist = d;
			best = val;
		}
	}
	return best;
}

/** Clears and repopulates weight `<option>`s. */
function fillFontWeightOptions(dropdown: DropdownComponent, value: string, options: [string, string][]): void {
	dropdown.selectEl.replaceChildren();
	for (const [val, label] of options) {
		dropdown.addOption(val, label);
		dropdown.selectEl.options[dropdown.selectEl.options.length - 1].setCssStyles({ fontWeight: val });
	}
	dropdown.setValue(value);
	dropdown.selectEl.setCssStyles({ fontWeight: value });
}

/**
 * "Font" row: pick-font button (delegating to formatForge's FontPickerModal via the companion
 * bridge) and a weight dropdown on the same row, clamped to that font's own weightMin–weightMax.
 * The weight control is hidden while at theme default. `label` becomes this card's heading when
 * non-empty, so a field keeps its own identity when several of these stack in one tab. Pass `""`
 * to omit the heading. Pass `group` to append into an existing SettingGroup instead of creating
 * a new card.
 *
 * When `colour` is passed, the palette swatch sits on the same row and the row is labelled
 * "Text". If the companion is absent, only that swatch is shown, labelled "Text colour".
 *
 * No separate "Override theme's default font" toggle — current formatForge exposes a "Theme
 * default" row directly inside its own font picker (see `OpenFontPickerOptions.isThemeDefault`/
 * `onPickThemeDefault`); the on/off control lives there now instead of duplicating it here.
 * Silently renders nothing when the companion is absent or predates `listFonts`/`openFontPicker`
 * — see FormatCompanionRegistration's doc comment — unless `colour` is passed.
 */
export interface FontCardColourOptions {
	hex: string;
	onPick: (hex: string) => void;
	muted?: ColorSwatchMutedOption;
	themeDefault?: ColorSwatchThemeDefaultOption;
	leading?: ColorSwatchLeadingOption;
}

export interface FontCardExtras {
	rowName?: string;
	onSettingEl?: (settingEl: HTMLElement) => void;
	/** Render the setting into this node instead of a SettingGroup (e.g. half of a split row). */
	parent?: HTMLElement;
}

export function renderCustomFontCard(
	body: HTMLElement,
	plugin: StoryForgePlugin,
	label: string,
	overrideFontKey: keyof StoryForgePluginSettings,
	fontFamilyKey: keyof StoryForgePluginSettings,
	fontWeightKey: keyof StoryForgePluginSettings,
	restyle: () => void,
	previewFontSizeEm: number | (() => number) = 1,
	group?: SettingGroup,
	colour?: FontCardColourOptions,
	extras?: FontCardExtras,
): { colorHideEl?: HTMLElement } {
	const companion = plugin.getFormatCompanion();
	const listFonts = companion?.listFonts;
	const openFontPicker = companion?.openFontPicker;
	if ((!listFonts || !openFontPicker) && !colour && !extras?.onSettingEl && !extras?.parent) return {};

	const card = extras?.parent ? undefined : (group ?? new SettingGroup(body));
	if (label && card) card.setHeading(label);
	const rowName = extras?.rowName ?? (colour ? "Text" : "Font");
	const addSetting = (configure: (setting: Setting) => void) => {
		if (extras?.parent) configure(new Setting(extras.parent));
		else card!.addSetting(configure);
	};

	const bindColour = (setting: Setting): HTMLElement => {
		let swatchEl!: HTMLElement;
		setting.addButton((button) => {
			swatchEl = button.buttonEl;
			bindColorSwatchButton(
				plugin.app,
				plugin,
				button.buttonEl,
				colour!.hex,
				colour!.onPick,
				colour!.themeDefault,
				colour!.muted,
				colour!.leading,
			);
			button.buttonEl.setAttr("aria-label", "Text colour");
		});
		return swatchEl;
	};

	if (!listFonts || !openFontPicker) {
		let colorHideEl: HTMLElement | undefined;
		addSetting((setting) => {
			setting.settingEl.addClass("sf-font-row");
			setting.setName(colour ? "Text colour" : rowName);
			if (colour) {
				colorHideEl = setting.settingEl;
				bindColour(setting);
			}
			extras?.onSettingEl?.(setting.settingEl);
		});
		return { colorHideEl };
	}

	let isOverriding = plugin.getSettings()[overrideFontKey] as boolean;
	const currentFont = (): FontCatalogEntry | undefined => {
		const id = plugin.getSettings()[fontFamilyKey] as string;
		return listFonts().find((f) => f.id === id);
	};

	let pickButtonEl!: HTMLElement;
	const syncPickLabel = () => pickButtonEl.setText(isOverriding ? (currentFont()?.label ?? "Pick font") : "Theme default");

	let weightDropdown!: DropdownComponent;
	const syncWeightDropdown = (): string => {
		const font = currentFont();
		const options = font ? fontWeightOptionsFor(font.weightMin, font.weightMax) : FONT_WEIGHT_OPTIONS;
		const current = plugin.getSettings()[fontWeightKey] as string;
		const clamped = clampFontWeightToOptions(current, options);
		fillFontWeightOptions(weightDropdown, clamped, options);
		return clamped;
	};
	const applyVisibility = () => weightDropdown.selectEl.toggleClass("sf-settings-hidden", !isOverriding);

	const applySelectedFont = async (id: string) => {
		isOverriding = true;
		await plugin.updateSetting(overrideFontKey, true);
		await plugin.updateSetting(fontFamilyKey, id);
		syncPickLabel();
		const clamped = syncWeightDropdown();
		if (clamped !== plugin.getSettings()[fontWeightKey]) {
			await plugin.updateSetting(fontWeightKey, clamped);
		}
		applyVisibility();
		restyle();
	};
	const applyThemeDefault = async () => {
		isOverriding = false;
		await plugin.updateSetting(overrideFontKey, false);
		syncPickLabel();
		applyVisibility();
		restyle();
	};

	let colorHideEl: HTMLElement | undefined;
	addSetting((setting) => {
		setting.settingEl.addClass("sf-font-row");
		setting.setName(rowName);
		setting.addButton((button) => {
			pickButtonEl = button.buttonEl;
			syncPickLabel();
			button.onClick(() => {
				openFontPicker({
					currentFamilyId: plugin.getSettings()[fontFamilyKey] as string,
					previewFontSizeEm: typeof previewFontSizeEm === "function" ? previewFontSizeEm() : previewFontSizeEm,
					onPick: (id) => void applySelectedFont(id),
					isThemeDefault: !isOverriding,
					onPickThemeDefault: () => void applyThemeDefault(),
				});
			});
		});
		setting.addDropdown((dropdown) => {
			weightDropdown = dropdown;
			dropdown.selectEl.addClass("sf-font-weight-dropdown");
			dropdown.selectEl.setAttr("aria-label", "Font weight");
			syncWeightDropdown();
			dropdown.onChange((value) => void plugin.updateSetting(fontWeightKey, value).then(() => restyle()));
		});
		if (colour) colorHideEl = bindColour(setting);
		extras?.onSettingEl?.(setting.settingEl);
	});
	applyVisibility();
	return { colorHideEl };
}

/** Leaf tab body that scrolls its own catalogue instead of hosting nested tabs.
 * Tags the body and its wrapper so styles.css can pin the flex/overflow split without `:has()`. */
export function mountPlainScroll(body: HTMLElement): HTMLElement {
	body.addClass("sf-ui-format-plain-scroll-host");
	body.parentElement?.addClass("sf-ui-format-plain-scroll-wrap");
	return body.createDiv({ cls: "sf-ui-format-plain-scroll" });
}

export interface StyleModalTab {
	id: string;
	label: string;
	render: (body: HTMLElement) => void;
}

/** Builds the tab bar + body-visibility wiring shared by TextStyleModal,
 * UiFormattingModal, and ProtectionsModal — identical in all three before
 * this extraction. */
export function renderTabbedBody(
	contentEl: HTMLElement,
	tabs: StyleModalTab[],
	options?: { onActivate?: (id: string) => void; initialId?: string },
): void {
	const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
	const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

	const tabBodies: HTMLElement[] = [];
	const initialId = options?.initialId;
	let activeTabId = initialId && tabs.some((tab) => tab.id === initialId) ? initialId : tabs[0].id;

	const activate = (id: string) => {
		activeTabId = id;
		tabBar.querySelectorAll(".sf-text-style-tab-btn").forEach((btn) => btn.removeClass("is-active"));
		let activeHostsTabs = false;
		tabBodies.forEach((body, i) => {
			const isActive = tabs[i].id === activeTabId;
			body.toggleClass("sf-settings-hidden", !isActive);
			if (isActive) {
				const btn = tabBar.children[i] as HTMLElement | undefined;
				btn?.addClass("is-active");
				activeHostsTabs = body.hasClass("is-tab-host");
			}
		});
		tabBodyWrapper.toggleClass("is-tab-host", activeHostsTabs);
		options?.onActivate?.(id);
	};

	tabs.forEach((tab) => {
		const tabBtn = tabBar.createEl("button", { cls: "sf-text-style-tab-btn", text: tab.label });
		if (tab.id === activeTabId) {
			tabBtn.addClass("is-active");
		}
		tabBtn.addEventListener("click", () => activate(tab.id));

		const bodyEl = tabBodyWrapper.createDiv({ cls: "sf-text-style-tab-body" });
		if (tab.id !== activeTabId) {
			bodyEl.addClass("sf-settings-hidden");
		}
		tab.render(bodyEl);
		if (bodyEl.firstElementChild?.hasClass("sf-text-style-tab-bar")) {
			bodyEl.addClass("is-tab-host");
		}
		tabBodies.push(bodyEl);
	});

	const empty = tabBodies.map((body) => body.childElementCount === 0);
	empty.forEach((isEmpty, i) => {
		if (isEmpty) (tabBar.children[i] as HTMLElement).addClass("sf-settings-hidden");
	});
	const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
	if (activeIndex < 0 || empty[activeIndex]) {
		const fallback = tabs.find((_, i) => !empty[i]);
		if (fallback) activate(fallback.id);
		else activate(activeTabId);
	} else {
		activate(activeTabId);
	}
}

/**
 * Fragment of a manuscript page (same classic Lorem Ipsum used by formatForge's own editor-page
 * preview) — the tail two lines of one paragraph, then the lead two lines of the next, with the
 * cycling-guide divider sitting between them exactly as it would land at a real paragraph break.
 * Reuses storyForge's own `.sf-cycling-guide-line`/`.sf-cycling-guide-badge*` classes, so it picks
 * up the live `--sf-cg-*` vars `applyCyclingGuideStyle()` already writes to the document body —
 * no separate wiring needed for Thickness/Flag size/Rounded lines/Line colour to show up here.
 * The guide classes/badge are applied directly to the first `<p>` itself (matching the real CM6
 * behaviour in cyclingGuide.ts, where `sf-cycling-guide-line` lands on the actual `.cm-line` and
 * the badge is a widget inserted inline at that line's end) so the divider sits flush against the
 * paragraph's own last line, not floating below it with an artificial gap.
 */
function mountCyclingGuidePreview(container: HTMLElement): HTMLElement {
	const preview = container.createDiv({ cls: "sf-cg-preview" });
	const paragraphEnd = preview.createEl("p", { cls: "sf-cg-preview-strip sf-cycling-guide-line" });
	paragraphEnd.appendText(
		"…ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
	);
	const badge = paragraphEnd.createSpan({ cls: "sf-cycling-guide-badge" });
	const badgeIcon = badge.createSpan({ cls: "sf-cycling-guide-badge-icon" });
	setIcon(badgeIcon, ICON_CYCLE_ALT);
	preview.createEl("p", {
		text: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium…",
	});
	return preview;
}

/**
 * "Cycling guide" toggle plus its five dependent options (Cycle length, Line colour, Thickness,
 * Flag size, Rounded lines), all in one boundary box. Used by CyclingGuideModal (opened from
 * SeriesModal's general tab) — a free function (not a method) since it only ever needs
 * app/plugin/settings, matching this file's existing pattern.
 */

export function renderCyclingGuideCard(
	app: App,
	plugin: StoryForgePlugin,
	body: HTMLElement,
	settings: StoryForgePluginSettings,
	showPreview = false,
): void {
	const cyclingGuideGroup = new SettingGroup(body);

	let cyclingGuideToggle!: ToggleComponent;
	cyclingGuideGroup.addSetting((setting) => {
		setting
			.setName("cycling guide")
			.setDesc("draws a floating guideline")
			.addToggle((toggle) => {
				cyclingGuideToggle = toggle;
				toggle.setValue(settings.cyclingGuideEnabled);
			});
	});

	let cyclingGuideIntervalSetting!: Setting;
	cyclingGuideGroup.addSetting((setting) => {
		cyclingGuideIntervalSetting = setting;
		setting.setName("cycle length").addDropdown((dropdown) =>
			dropdown
				.addOption("short", "short")
				.addOption("medium", "medium")
				.addOption("large", "long")
				.setValue(settings.cyclingGuideInterval)
				.onChange((value) =>
					persistAndRestyle(plugin, "cyclingGuideInterval", value as CyclingGuideInterval, () => plugin.rebuildCyclingGuideExtension()),
				),
		);
	});

	let cyclingGuideColorSetting!: Setting;
	cyclingGuideGroup.addSetting((setting) => {
		cyclingGuideColorSetting = setting;
		setting.setName("line colour").addButton((button) =>
			bindColorSwatchButton(app, plugin, button.buttonEl, settings.cyclingGuideColor, (hex) => {
				void plugin.updateSetting("cyclingGuideColor", hex).then(() => plugin.applyCyclingGuideStyle());
			}),
		);
	});

	let cyclingGuideThicknessSetting!: Setting;
	cyclingGuideGroup.addSetting((setting) => {
		cyclingGuideThicknessSetting = setting;
		setting.setName("thickness").addDropdown((dropdown) =>
			dropdown
				.addOption("thin", "thin")
				.addOption("medium", "medium")
				.addOption("thick", "thick")
				.addOption("extra-thick", "extra thick")
				.setValue(settings.cyclingGuideThickness)
				.onChange((value) =>
					persistAndRestyle(plugin, "cyclingGuideThickness", value as HeadingDividerThickness, () => plugin.applyCyclingGuideStyle()),
				),
		);
	});

	let cyclingGuideFlagSizeSetting!: Setting;
	cyclingGuideGroup.addSetting((setting) => {
		cyclingGuideFlagSizeSetting = setting;
		setting.setName("flag size").addDropdown((dropdown) =>
			dropdown
				.addOption("small", "small")
				.addOption("medium", "medium")
				.addOption("large", "large")
				.setValue(settings.cyclingGuideFlagSize)
				.onChange((value) =>
					persistAndRestyle(plugin, "cyclingGuideFlagSize", value as "small" | "medium" | "large", () => plugin.applyCyclingGuideStyle()),
				),
		);
	});

	let cyclingGuideRoundedLinesSetting!: Setting;
	cyclingGuideGroup.addSetting((setting) => {
		cyclingGuideRoundedLinesSetting = setting;
		setting
			.setName("rounded lines")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.cyclingGuideRoundedLines)
					.onChange((value) => persistAndRestyle(plugin, "cyclingGuideRoundedLines", value, () => plugin.applyCyclingGuideStyle())),
			);
	});

	const cyclingGuidePreviewEl = showPreview ? mountCyclingGuidePreview(cyclingGuideGroup.listEl) : undefined;

	const applyCyclingGuideVisibility = (hidden: boolean) => {
		cyclingGuideThicknessSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		cyclingGuideFlagSizeSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		cyclingGuideRoundedLinesSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		cyclingGuideIntervalSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		cyclingGuideColorSetting.settingEl.toggleClass("sf-settings-hidden", hidden);
		cyclingGuidePreviewEl?.toggleClass("sf-settings-hidden", hidden);
	};
	cyclingGuideToggle.onChange((value) => {
		void plugin.updateSetting("cyclingGuideEnabled", value).then(() => {
			plugin.setCyclingGuideEnabled(value);
			applyCyclingGuideVisibility(!value);
		});
	});
	applyCyclingGuideVisibility(!cyclingGuideToggle.getValue());
}
