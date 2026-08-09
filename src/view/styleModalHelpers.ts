import { App, DropdownComponent, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import type { FontCatalogEntry } from "../formattingApi";

/** Shared building blocks for TextStyleModal, UiFormattingModal, and
 * ProtectionsModal — free functions rather than a base class, matching the
 * codebase's existing preference, taking whatever app/plugin state they need
 * explicitly. */

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
 * "Override theme's default font" toggle + a "Font" row (pick-font button delegating to
 * formatForge's own FontPickerModal via the companion bridge, plus a weight dropdown clamped to
 * that font's own weightMin–weightMax). Silently renders nothing when the companion is absent or
 * predates `listFonts`/`openFontPicker` — see FormatCompanionRegistration's doc comment.
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

	const currentFont = (): FontCatalogEntry | undefined => {
		const id = plugin.getSettings()[fontFamilyKey] as string;
		return listFonts().find((f) => f.id === id);
	};

	renderToggleWithRevealCard(
		body,
		label,
		plugin.getSettings()[overrideFontKey] as boolean,
		(value) => void plugin.updateSetting(overrideFontKey, value),
		(card) => {
			let fontSetting!: Setting;
			let pickButtonEl!: HTMLElement;
			let weightDropdown!: DropdownComponent;
			const syncPickLabel = () => pickButtonEl.setText(currentFont()?.label ?? "Pick font");
			const syncWeightDropdown = (): string => {
				const font = currentFont();
				const options = font ? fontWeightOptionsFor(font.weightMin, font.weightMax) : FONT_WEIGHT_OPTIONS;
				const current = plugin.getSettings()[fontWeightKey] as string;
				const clamped = clampFontWeightToOptions(current, options);
				fillFontWeightOptions(weightDropdown, clamped, options);
				return clamped;
			};
			card.addSetting((setting) => {
				fontSetting = setting;
				setting.setName("Font");
				setting.addButton((button) => {
					pickButtonEl = button.buttonEl;
					syncPickLabel();
					button.onClick(() => {
						openFontPicker({
							currentFamilyId: plugin.getSettings()[fontFamilyKey] as string,
							previewFontSizeEm: typeof previewFontSizeEm === "function" ? previewFontSizeEm() : previewFontSizeEm,
							onPick: (id) => {
								void plugin.updateSetting(fontFamilyKey, id).then(async () => {
									syncPickLabel();
									const clamped = syncWeightDropdown();
									if (clamped !== plugin.getSettings()[fontWeightKey]) {
										await plugin.updateSetting(fontWeightKey, clamped);
									}
									restyle();
								});
							},
						});
					});
				});
				setting.addDropdown((dropdown) => {
					weightDropdown = dropdown;
					syncWeightDropdown();
					dropdown.onChange((value) => void plugin.updateSetting(fontWeightKey, value).then(() => restyle()));
				});
			});
			return fontSetting;
		},
		restyle,
	);
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
