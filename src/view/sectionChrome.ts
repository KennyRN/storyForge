import { setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import type { RecommendSectionChrome } from "../main";
import {
	ICON_LINE_HORIZONTAL,
	ICON_TEXT_12_FILLED,
	ICON_WINDOW_HEADER_HORIZONTAL,
} from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { persistAndRestyle } from "./styleModalHelpers";
import { refreshAlignedPreview } from "./rowAlignedPreview";

export { resolveTitleShadow } from "../titleShadow";

const SECTION_CHROME_OPTIONS: Array<{
	id: RecommendSectionChrome;
	icon: string;
	tooltip: string;
}> = [
	{ id: "box", icon: ICON_WINDOW_HEADER_HORIZONTAL, tooltip: "use boxes" },
	{ id: "pill", icon: ICON_LINE_HORIZONTAL, tooltip: "use header pill" },
	{ id: "text", icon: ICON_TEXT_12_FILLED, tooltip: "use title text" },
];

/** Heading, then picker, then the bordered group — picker is not inside the box. */
export function mountSectionChromePickerOutsideBox(
	group: { listEl: HTMLElement },
	plugin: StoryForgePlugin,
	options?: { compact?: boolean; restyle?: () => void },
): void {
	const listEl = group.listEl;
	const box = listEl.hasClass("setting-group") ? listEl : (listEl.parentElement ?? listEl);
	const parent = box.parentElement ?? listEl;
	const heading =
		box.querySelector(":scope > .setting-item-heading") ??
		(box !== listEl ? listEl.querySelector(":scope > .setting-item-heading") : null);
	const host = parent.createDiv();
	if (heading) parent.insertBefore(heading, box);
	parent.insertBefore(host, box);
	renderSectionChromePicker(host, plugin, options);
}

export function renderSectionChromePicker(
	host: HTMLElement,
	plugin: StoryForgePlugin,
	options?: { compact?: boolean; restyle?: () => void },
): void {
	host.empty();
	host.addClass("sf-section-chrome-picker");
	host.toggleClass("is-compact", !!options?.compact);
	const selected = plugin.getSettings().recommendSectionChrome ?? "box";
	for (const option of SECTION_CHROME_OPTIONS) {
		const active = selected === option.id;
		const el = host.createSpan({
			cls: `sf-ui-format-crumb-icon${active ? " is-active" : ""}${option.id === "text" ? " sf-ui-format-crumb-icon--text" : ""}`,
			attr: {
				"aria-label": option.tooltip,
				"aria-pressed": active ? "true" : "false",
			},
		});
		setIcon(el, option.icon);
		setTooltip(el, option.tooltip);
		const select = () => {
			void persistAndRestyle(plugin, "recommendSectionChrome", option.id, () => {
				options?.restyle?.();
				refreshAlignedPreview();
				renderSectionChromePicker(host, plugin, options);
			});
		};
		el.addEventListener("click", select);
		makeAccessibleActivatable(el, select);
	}
}
