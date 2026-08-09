import { App, DropdownComponent, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import type { FontCatalogEntry } from "../formattingApi";

/** Shared building blocks for TextStyleModal, UiFormattingModal, and
 * ProtectionsModal — free functions rather than a base class, matching the
 * codebase's existing preference, taking whatever app/plugin state they need
 * explicitly. */

/** A swatch button/picker with this wired in gets a "Theme default" choice alongside its real colours. */
export interface ColorSwatchThemeDefaultOption {
	isActive: boolean;
	onSelect: () => void | Promise<void>;
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
): void {
	const s = plugin.getSettings();
	void import("./PalettePickerModal").then(({ PalettePickerModal }) => {
		new PalettePickerModal(
			app,
			s.colorPaletteName,
			s.colorPaletteVariant,
			s.customPaletteColors,
			(hex) => applyColorPick(hex, paint, onPick),
			themeDefault && {
				isActive: themeDefault.isActive,
				onSelect: () => {
					paint(null);
					return themeDefault.onSelect();
				},
			},
		).open();
	});
}

/**
 * Binds a colour swatch button to open the palette picker on click. When `themeDefault` is
 * passed, the picker's list gets a "Theme default" entry after every real colour (replacing a
 * separate "Theme default" toggle next to the swatch), and the button itself paints a dashed
 * placeholder instead of a hex while that option is active.
 */
export function bindColorSwatchButton(
	app: App,
	plugin: StoryForgePlugin,
	buttonEl: HTMLElement,
	initialHex: string,
	onPick: (hex: string) => void,
	themeDefault?: ColorSwatchThemeDefaultOption,
): void {
	buttonEl.addClass("sf-color-swatch-btn");
	buttonEl.setAttr("aria-label", "Choose colour");
	const paint = (hex: string | null) => {
		buttonEl.toggleClass("sf-color-swatch-btn--theme-default", hex === null);
		buttonEl.style.backgroundColor = hex ?? "";
	};
	paint(themeDefault?.isActive ? null : initialHex);
	buttonEl.addEventListener("click", () => openColorSwatchPicker(app, plugin, paint, onPick, themeDefault));
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
): void {
	void plugin.updateSetting(key, value).then(() => restyle());
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
 * "Font" row (pick-font button delegating to formatForge's own FontPickerModal via the companion
 * bridge) + a weight dropdown clamped to that font's own weightMin–weightMax, hidden while at
 * theme default. `label` becomes this card's heading, so a field keeps its own identity when
 * several of these stack in one tab.
 *
 * No separate "Override theme's default font" toggle — current formatForge exposes a "Theme
 * default" row directly inside its own font picker (see `OpenFontPickerOptions.isThemeDefault`/
 * `onPickThemeDefault`); the on/off control lives there now instead of duplicating it here.
 * Silently renders nothing when the companion is absent or predates `listFonts`/`openFontPicker`
 * — see FormatCompanionRegistration's doc comment.
 */
export function renderCustomFontCard(
	body: HTMLElement,
	plugin: StoryForgePlugin,
	label: string,
	overrideFontKey: keyof StoryForgePluginSettings,
	fontFamilyKey: keyof StoryForgePluginSettings,
	fontWeightKey: keyof StoryForgePluginSettings,
	restyle: () => void,
	previewFontSizeEm: number | (() => number) = 1,
): void {
	const companion = plugin.getFormatCompanion();
	if (!companion?.listFonts || !companion.openFontPicker) return;
	const listFonts = companion.listFonts;
	const openFontPicker = companion.openFontPicker;

	let isOverriding = plugin.getSettings()[overrideFontKey] as boolean;
	const currentFont = (): FontCatalogEntry | undefined => {
		const id = plugin.getSettings()[fontFamilyKey] as string;
		return listFonts().find((f) => f.id === id);
	};

	const card = new SettingGroup(body);
	card.setHeading(label);

	let pickButtonEl!: HTMLElement;
	const syncPickLabel = () => pickButtonEl.setText(isOverriding ? (currentFont()?.label ?? "Pick font") : "Theme default");

	let fontWeightSetting!: Setting;
	let weightDropdown!: DropdownComponent;
	const syncWeightDropdown = (): string => {
		const font = currentFont();
		const options = font ? fontWeightOptionsFor(font.weightMin, font.weightMax) : FONT_WEIGHT_OPTIONS;
		const current = plugin.getSettings()[fontWeightKey] as string;
		const clamped = clampFontWeightToOptions(current, options);
		fillFontWeightOptions(weightDropdown, clamped, options);
		return clamped;
	};
	const applyVisibility = () => fontWeightSetting.settingEl.toggleClass("sf-settings-hidden", !isOverriding);

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

	card.addSetting((setting) => {
		setting.setName("Font");
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
	});
	card.addSetting((setting) => {
		fontWeightSetting = setting;
		setting.setName("Font weight");
		setting.addDropdown((dropdown) => {
			weightDropdown = dropdown;
			syncWeightDropdown();
			dropdown.onChange((value) => void plugin.updateSetting(fontWeightKey, value).then(() => restyle()));
		});
	});
	applyVisibility();
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
	options?: { onActivate?: (id: string) => void },
): void {
	const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
	const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

	const tabBodies: HTMLElement[] = [];
	let activeTabId = tabs[0].id;

	const activate = (id: string) => {
		activeTabId = id;
		tabBar.querySelectorAll(".sf-text-style-tab-btn").forEach((btn) => btn.removeClass("is-active"));
		tabBodies.forEach((body, i) => {
			const isActive = tabs[i].id === activeTabId;
			body.toggleClass("sf-settings-hidden", !isActive);
			if (isActive) {
				const btn = tabBar.children[i] as HTMLElement | undefined;
				btn?.addClass("is-active");
			}
		});
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
		tabBodies.push(bodyEl);
	});

	options?.onActivate?.(activeTabId);
}
