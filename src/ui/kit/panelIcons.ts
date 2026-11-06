/**
 * The two column icons of the panel-width settings (round five): a left sidebar and a right sidebar, Tabler's filled `layout-sidebar` and `layout-sidebar-right`
 * (MIT; `Icon Licences.md`), solid on a 24 px grid, in the current text colour. They mark the left panel's and the right (context) panel's widths, with no text.
 */
const PATHS = {
	left: "M6 21a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3zm12 -16h-8v14h8a1 1 0 0 0 1 -1v-12a1 1 0 0 0 -1 -1",
	right: "M6 21a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3zm8 -16h-8a1 1 0 0 0 -1 1v12a1 1 0 0 0 1 1h8z",
} as const;

export function panelIcon(side: keyof typeof PATHS, size = "24px"): SVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "currentColor");
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon", "sf-panelicon");
	svg.style.width = size;
	svg.style.height = size;
	const path = document.createElementNS(ns, "path");
	path.setAttribute("d", PATHS[side]);
	svg.append(path);
	return svg;
}
