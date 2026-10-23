import { el } from "./dom";
import { icon, type IconName } from "./icons";
import { attachTooltip } from "./tooltip";

export interface ButtonOptions {
	label?: string;
	icon?: IconName;
	/** Required for an icon-only button: it is the tooltip and the accessible name. */
	tooltip?: string;
	kind?: "default" | "primary" | "quiet";
	disabled?: boolean;
	onClick: (e: MouseEvent) => void;
}

export function button(options: ButtonOptions): HTMLButtonElement {
	const b = el(
		"button",
		{ class: `sf-button sf-button--${options.kind ?? "default"}${options.label ? "" : " sf-button--icon"}`, attrs: { type: "button" }, on: { click: options.onClick } },
		options.icon ? icon(options.icon) : null,
		options.label ? el("span", { text: options.label }) : null,
	);
	if (options.disabled) b.disabled = true;
	if (options.tooltip) attachTooltip(b, options.tooltip);
	else if (!options.label) throw new Error("An icon-only button needs a tooltip");
	return b;
}
