import { App, DropdownComponent, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { CUSTOM_FONTS } from "../fonts";

/** Shared building blocks for TextStyleModal, UiFormattingModal, and
 * ProtectionsModal — free functions rather than a base class, matching the
 * codebase's existing preference, taking whatever app/plugin state they need
 * explicitly. */

export const FONT_WEIGHT_OPTIONS: [string, string][] = [
	["300", "Light"],
	["400", "Normal"],
	["500", "Medium"],
	["600", "Semi Bold"],
	["700", "Bold"],
	["800", "Extra Bold"],
	["900", "Black"],
];

/** Weight dropdown choices that fall within a custom font's native weightMin–weightMax range. */
export function fontWeightOptionsFor(weightMin: number, weightMax: number): [string, string][] {
	return FONT_WEIGHT_OPTIONS.filter(([val]) => {
		const n = Number(val);
		return n >= weightMin && n <= weightMax;
	});
}

/** Nearest allowed weight option for `weight`, or `weight` unchanged when already allowed / options empty. */
export function clampFontWeightToOptions(weight: string, options: [string, string][]): string {
	if (options.length === 0 || options.some(([val]) => val === weight)) return weight;
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

export function applyColorPick(hex: string, paint: (hex: string) => void, onPick: (hex: string) => void): void {
	paint(hex);
	onPick(hex);
}

export function openColorSwatchPicker(
	app: App,
	plugin: StoryForgePlugin,
	paint: (hex: string) => void,
	onPick: (hex: string) => void,
): void {
	const s = plugin.getSettings();
	void import("./PalettePickerModal").then(({ PalettePickerModal }) => {
		new PalettePickerModal(app, s.colorPaletteName, s.colorPaletteVariant, s.customPaletteColors, (hex) =>
			applyColorPick(hex, paint, onPick),
		).open();
	});
}

export function bindColorSwatchButton(
	app: App,
	plugin: StoryForgePlugin,
	buttonEl: HTMLElement,
	initialHex: string,
	onPick: (hex: string) => void,
): void {
	buttonEl.addClass("sf-color-swatch-btn");
	buttonEl.setAttr("aria-label", "Choose colour");
	const paint = (hex: string) => {
		buttonEl.style.backgroundColor = hex;
	};
	paint(initialHex);
	buttonEl.addEventListener("click", () => openColorSwatchPicker(app, plugin, paint, onPick));
}

export function applyFontWeightChange<W extends string>(
	v: W,
	applySelectedWeight: (v: W) => void,
	onChange: (value: W) => void,
): void {
	onChange(v);
	applySelectedWeight(v);
}

/** Clears and repopulates weight `<option>`s; does not (re)bind onChange. */
export function fillFontWeightOptions(
	dropdown: { selectEl: HTMLSelectElement; addOption: (value: string, display: string) => unknown; setValue: (value: string) => unknown },
	value: string,
	options: [string, string][] = FONT_WEIGHT_OPTIONS,
): void {
	dropdown.selectEl.replaceChildren();
	for (const [val, label] of options) {
		dropdown.addOption(val, label);
		const opt = dropdown.selectEl.options[dropdown.selectEl.options.length - 1];
		opt.style.fontWeight = val;
	}
	dropdown.setValue(value);
	dropdown.selectEl.style.fontWeight = value;
}

export function populateFontWeightDropdown<W extends string>(
	dropdown: {
		selectEl: HTMLSelectElement;
		addOption: (value: string, display: string) => unknown;
		setValue: (value: string) => unknown;
		onChange: (cb: (value: string) => void) => unknown;
	},
	value: W,
	onChange: (value: W) => void,
	options: [string, string][] = FONT_WEIGHT_OPTIONS,
): void {
	fillFontWeightOptions(dropdown, value, options);
	const applySelectedWeight = (v: W) => {
		dropdown.selectEl.style.fontWeight = v;
	};
	dropdown.onChange((v) => applyFontWeightChange(v as W, applySelectedWeight, onChange));
}

export function bindFontWeightDropdown<W extends string>(
	setting: Setting,
	value: W,
	onChange: (value: W) => void,
	options: [string, string][] = FONT_WEIGHT_OPTIONS,
): void {
	setting.addDropdown((dropdown) => {
		populateFontWeightDropdown(dropdown, value, onChange, options);
	});
}

export interface RenderCustomFontCardOptions {
	plugin: StoryForgePlugin;
	settings: StoryForgePluginSettings;
	overrideFontKey: keyof StoryForgePluginSettings;
	fontWeightKey: keyof StoryForgePluginSettings;
	fontFamilyKey: keyof StoryForgePluginSettings;
	smallCapsKey?: keyof StoryForgePluginSettings;
	restyle: () => void;
	/** Append into this group; otherwise a new SettingGroup is created on `body`. */
	group?: SettingGroup;
	body?: HTMLElement;
	/**
	 * When true (UI chrome), Font weight stays visible even if override is off.
	 * Text Style leaves this false so weight is gated with Pick font.
	 */
	keepWeightVisibleWhenOverrideOff?: boolean;
}

/** Override + Pick font + Font weight (+ optional Small caps), shared by Text Style and UI Formatting. */
export function renderCustomFontCard(opts: RenderCustomFontCardOptions): SettingGroup {
	const {
		plugin,
		settings,
		overrideFontKey,
		fontWeightKey,
		fontFamilyKey,
		smallCapsKey,
		restyle,
		keepWeightVisibleWhenOverrideOff = false,
	} = opts;
	const card = opts.group ?? new SettingGroup(opts.body!);

	let overrideToggle!: ToggleComponent;
	card.addSetting((setting) => {
		setting.setName("Override theme's default font").addToggle((toggle) => {
			overrideToggle = toggle;
			toggle.setValue(settings[overrideFontKey] as boolean);
		});
	});

	let selectedFontFamily: string = settings[fontFamilyKey] as string;
	const fontsByLabel = [...CUSTOM_FONTS].sort((a, b) => a.label.localeCompare(b.label));

	let pickFontSetting!: Setting;
	card.addSetting((setting) => {
		pickFontSetting = setting;
		setting.setName("Pick font");
		setting.addDropdown((dropdown) => {
			for (const font of fontsByLabel) dropdown.addOption(font.id, font.label);
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
				void plugin.updateSetting(fontFamilyKey, value).then(async () => {
					applySelectedFont(value);
					selectedFontFamily = value;
					const clampedWeight = syncWeightDropdown();
					const currentWeight = plugin.getSettings()[fontWeightKey] as string;
					if (clampedWeight !== currentWeight) {
						await plugin.updateSetting(fontWeightKey, clampedWeight);
					}
					applyVisibility(!overrideToggle.getValue());
					restyle();
				});
			});
		});
	});

	let fontWeightSetting!: Setting;
	let weightDropdown!: DropdownComponent;
	const weightOptionsForSelected = (overrideOn: boolean): [string, string][] => {
		if (!overrideOn) return FONT_WEIGHT_OPTIONS;
		const font = CUSTOM_FONTS.find((f) => f.id === selectedFontFamily);
		return font ? fontWeightOptionsFor(font.weightMin, font.weightMax) : FONT_WEIGHT_OPTIONS;
	};
	const onWeightChange = (value: string) => {
		void plugin.updateSetting(fontWeightKey, value).then(() => restyle());
	};
	const syncWeightDropdown = (): string => {
		const overrideOn = overrideToggle.getValue();
		const options = weightOptionsForSelected(overrideOn);
		const current = plugin.getSettings()[fontWeightKey] as string;
		const clamped = clampFontWeightToOptions(current, options);
		fillFontWeightOptions(weightDropdown, clamped, options);
		return clamped;
	};
	card.addSetting((setting) => {
		fontWeightSetting = setting;
		setting.setName("Font weight");
		setting.addDropdown((dropdown) => {
			weightDropdown = dropdown;
			const overrideOn = settings[overrideFontKey] as boolean;
			const options = weightOptionsForSelected(overrideOn);
			const initial = clampFontWeightToOptions(settings[fontWeightKey] as string, options);
			populateFontWeightDropdown(dropdown, initial, onWeightChange, options);
		});
	});

	let smallCapsSetting: Setting | undefined;
	if (smallCapsKey) {
		card.addSetting((setting) => {
			smallCapsSetting = setting;
			setting.setName("Small caps").addToggle((toggle) =>
				toggle.setValue(settings[smallCapsKey] as boolean).onChange((value) => persistAndRestyle(plugin, smallCapsKey, value, restyle)),
			);
			setting.nameEl.addClass("sf-small-caps-label");
		});
	}

	const isSelectedFontVariable = (): boolean => {
		const font = CUSTOM_FONTS.find((f) => f.id === selectedFontFamily);
		return font ? font.weightMin !== font.weightMax : true;
	};
	const applyVisibility = (overrideOff: boolean) => {
		pickFontSetting.settingEl.toggleClass("sf-settings-hidden", overrideOff);
		smallCapsSetting?.settingEl.toggleClass("sf-settings-hidden", overrideOff);
		const hideWeight = overrideOff
			? !keepWeightVisibleWhenOverrideOff
			: !isSelectedFontVariable();
		fontWeightSetting.settingEl.toggleClass("sf-settings-hidden", hideWeight);
		if (!hideWeight) syncWeightDropdown();
	};
	overrideToggle.onChange((value) => {
		void plugin.updateSetting(overrideFontKey, value).then(() => {
			applyVisibility(!value);
			restyle();
		});
	});
	applyVisibility(!(settings[overrideFontKey] as boolean));
	return card;
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

export interface StyleModalTab {
	id: string;
	label: string;
	render: (body: HTMLElement) => void;
}

/** Builds the tab bar + body-visibility wiring shared by TextStyleModal,
 * UiFormattingModal, and ProtectionsModal — identical in all three before
 * this extraction. */
export function renderTabbedBody(contentEl: HTMLElement, tabs: StyleModalTab[]): void {
	const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
	const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

	const tabBodies: HTMLElement[] = [];
	let activeTabId = tabs[0].id;

	tabs.forEach((tab) => {
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
