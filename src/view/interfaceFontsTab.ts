import { SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import { mountPlainScroll, persistAndRestyle, renderCustomFontCard } from "./styleModalHelpers";
import {
	LOREM_PHRASES,
	chromeCatalog,
	paintChromeTextPreview,
	paintOptionSelecteeChromePreview,
	restyleForPrefix,
	type ChromeRow,
} from "./interfaceChromeCatalog";
import { markAlignedPreview } from "./rowAlignedPreview";

function bindSmallCapsCheckbox(cell: HTMLElement, plugin: StoryForgePlugin, row: ChromeRow): void {
	const key = row.smallCapsKey;
	if (!key) return;
	const restyle = restyleForPrefix(plugin, row.cssPrefix);
	const checkbox = cell.createEl("input", {
		type: "checkbox",
		cls: "sf-box-font-table-caps-check",
		attr: { "aria-label": `${row.name} small caps` },
	});
	checkbox.checked = plugin.getSettings()[key] as boolean;
	checkbox.addEventListener("change", () => {
		void persistAndRestyle(plugin, key, checkbox.checked, restyle);
	});
}

function renderFontTableRow(
	table: HTMLElement,
	scroll: HTMLElement,
	plugin: StoryForgePlugin,
	row: ChromeRow,
	sample: string,
): void {
	const rowEl = table.createDiv({ cls: "sf-box-font-table-row" });
	rowEl.createDiv({ cls: "sf-box-font-table-name", text: row.name });
	const fontCell = rowEl.createDiv({ cls: "sf-box-font-table-font" });
	renderCustomFontCard(
		scroll,
		plugin,
		"",
		row.overrideFontKey,
		row.fontFamilyKey,
		row.fontWeightKey,
		restyleForPrefix(plugin, row.cssPrefix),
		() => plugin.getSettings()[row.sizeKey] as number,
		undefined,
		undefined,
		{
			rowName: row.name,
			parent: fontCell,
			omitName: true,
		},
	);
	const capsCell = rowEl.createDiv({ cls: "sf-box-font-table-caps" });
	if (row.smallCapsKey) bindSmallCapsCheckbox(capsCell, plugin, row);
	if (row.skipPreview) return;
	if (row.previewKind === "option-selectee") {
		markAlignedPreview(rowEl, (slot) => paintOptionSelecteeChromePreview(slot, plugin));
	} else {
		markAlignedPreview(rowEl, (slot) => paintChromeTextPreview(slot, plugin, row, sample));
	}
}

/** Font-only catalogue for the interface modal's Text tab. Colours and size are previewed, not picked. */
export function renderInterfaceFontsTab(body: HTMLElement, plugin: StoryForgePlugin): void {
	const scroll = mountPlainScroll(body);
	let sampleIndex = 0;
	for (const section of chromeCatalog(plugin)) {
		const group = new SettingGroup(scroll);
		group.setHeading(section.heading);
		const table = group.listEl.createDiv({ cls: "sf-box-font-table" });
		const catalogRows: ChromeRow[] = [];
		for (const row of section.rows) {
			catalogRows.push(row);
			if (row.pair) catalogRows.push(row.pair);
		}
		if (catalogRows.some((row) => row.smallCapsKey)) {
			const headRow = table.createDiv({ cls: "sf-box-font-table-head" });
			headRow.createDiv();
			headRow.createDiv();
			const capsHead = headRow.createDiv({ cls: "sf-box-font-table-caps-head" });
			capsHead.createSpan({ text: "small caps", cls: "sf-small-caps-label sf-box-font-table-caps-label" });
		}
		for (const row of catalogRows) {
			const sample = LOREM_PHRASES[sampleIndex % LOREM_PHRASES.length];
			sampleIndex += 1;
			renderFontTableRow(table, scroll, plugin, row, sample);
		}
	}
}
