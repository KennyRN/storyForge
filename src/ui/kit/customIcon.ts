import { CUSTOM_ICONS } from "../../core/icons";

const SVGS = new Map<string, string>(CUSTOM_ICONS);

/** One of the Codex catalogue's own icons (`codexTypeIcon` returns its id), in the current text colour; null if the id is unknown. */
export function customIcon(id: string, size = 16): SVGElement | null {
	const markup = SVGS.get(id);
	if (!markup) return null;
	const template = document.createElement("template");
	template.innerHTML = markup.trim();
	const svg = template.content.firstElementChild;
	if (!(svg instanceof SVGElement)) return null;
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon");
	return svg;
}
