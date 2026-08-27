import { Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import {
	LOREM_PHRASES,
	chromeCatalog,
	paintChromeTextPreview,
	paintPairedChromePreview,
	restyleForPrefix,
	type ChromeRow,
} from "./interfaceChromeCatalog";
import { markAlignedPreview } from "./rowAlignedPreview";
import { mountPlainScroll } from "./styleModalHelpers";

function bindSizeSlider(
	setting: Setting,
	plugin: StoryForgePlugin,
	row: ChromeRow,
	also?: ChromeRow,
): void {
	const restyle = restyleForPrefix(plugin, row.cssPrefix);
	setting.settingEl.addClass("sf-size-row");
	setting.addSlider((slider) =>
		slider
			.setLimits(0.5, 2, 0.1)
			.setValue(plugin.getSettings()[row.sizeKey] as number)
			.onChange((value) => {
				const partial = (
					also ? { [row.sizeKey]: value, [also.sizeKey]: value } : { [row.sizeKey]: value }
				) as Partial<StoryForgePluginSettings>;
				void plugin.updateSettings(partial).then(() => restyle());
			}),
	);
}

/** Size-only catalogue for the interface modal's Size tab. Font and colour are previewed, not picked. */
export function renderInterfaceSizesTab(body: HTMLElement, plugin: StoryForgePlugin): void {
	const scroll = mountPlainScroll(body);
	let sampleIndex = 0;
	for (const section of chromeCatalog(plugin)) {
		const group = new SettingGroup(scroll);
		group.setHeading(section.heading);
		for (const row of section.rows) {
			if (row.pair) {
				const leftSample = LOREM_PHRASES[sampleIndex % LOREM_PHRASES.length];
				sampleIndex += 1;
				const rightSample = LOREM_PHRASES[sampleIndex % LOREM_PHRASES.length];
				sampleIndex += 1;
				group.addSetting((setting) => {
					setting.setName(`${row.name}: ${row.pair!.name}`);
					bindSizeSlider(setting, plugin, row, row.pair);
					markAlignedPreview(setting.settingEl, (slot) =>
						paintPairedChromePreview(slot, plugin, row, row.pair!, leftSample, rightSample),
					);
				});
				continue;
			}
			const sample = LOREM_PHRASES[sampleIndex % LOREM_PHRASES.length];
			sampleIndex += 1;
			group.addSetting((setting) => {
				setting.setName(row.name);
				bindSizeSlider(setting, plugin, row);
				markAlignedPreview(setting.settingEl, (slot) => paintChromeTextPreview(slot, plugin, row, sample));
			});
		}
	}
}
