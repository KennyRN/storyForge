import { SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import { mountPlainScroll, renderCustomFontCard } from "./styleModalHelpers";
import {
	LOREM_PHRASES,
	chromeCatalog,
	paintChromeTextPreview,
	paintPairedChromePreview,
	restyleForPrefix,
	type ChromeRow,
} from "./interfaceChromeCatalog";
import { markAlignedPreview } from "./rowAlignedPreview";

function renderFontRow(
	scroll: HTMLElement,
	plugin: StoryForgePlugin,
	group: SettingGroup,
	row: ChromeRow,
	sample: string,
	parent?: HTMLElement,
): void {
	renderCustomFontCard(
		scroll,
		plugin,
		"",
		row.overrideFontKey,
		row.fontFamilyKey,
		row.fontWeightKey,
		restyleForPrefix(plugin, row.cssPrefix),
		() => plugin.getSettings()[row.sizeKey] as number,
		group,
		undefined,
		{
			rowName: row.name,
			parent,
			onSettingEl: parent
				? undefined
				: (settingEl) => {
						markAlignedPreview(settingEl, (slot) => paintChromeTextPreview(slot, plugin, row, sample));
					},
		},
	);
}

/** Font-only catalogue for the interface modal's Text tab. Colours and size are previewed, not picked. */
export function renderInterfaceFontsTab(body: HTMLElement, plugin: StoryForgePlugin): void {
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
				const pairEl = group.listEl.createDiv({ cls: "sf-meta-pair-row sf-meta-pair-row--fonts" });
				const leftHalf = pairEl.createDiv({ cls: "sf-meta-pair-half" });
				const rightHalf = pairEl.createDiv({ cls: "sf-meta-pair-half" });
				renderFontRow(scroll, plugin, group, row, leftSample, leftHalf);
				renderFontRow(scroll, plugin, group, row.pair, rightSample, rightHalf);
				markAlignedPreview(pairEl, (slot) =>
					paintPairedChromePreview(slot, plugin, row, row.pair!, leftSample, rightSample),
				);
				continue;
			}
			const sample = LOREM_PHRASES[sampleIndex % LOREM_PHRASES.length];
			sampleIndex += 1;
			renderFontRow(scroll, plugin, group, row, sample);
		}
	}
}
