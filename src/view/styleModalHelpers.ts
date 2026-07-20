import { App, Setting, SettingGroup, ToggleComponent } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";

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
		new PalettePickerModal(app, s.colorPaletteName, s.colorPaletteMode, s.customPaletteColors, (hex) =>
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

export function bindFontWeightDropdown<W extends string>(setting: Setting, value: W, onChange: (value: W) => void): void {
	setting.addDropdown((dropdown) => {
		for (const [val, label] of FONT_WEIGHT_OPTIONS) {
			dropdown.addOption(val, label);
			const opt = dropdown.selectEl.options[dropdown.selectEl.options.length - 1];
			opt.style.fontWeight = val;
		}
		const applySelectedWeight = (v: W) => {
			dropdown.selectEl.style.fontWeight = v;
		};
		dropdown.setValue(value);
		applySelectedWeight(value);
		dropdown.onChange((v) => applyFontWeightChange(v as W, applySelectedWeight, onChange));
	});
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
