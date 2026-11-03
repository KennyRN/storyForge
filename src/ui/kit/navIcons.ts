import { NAV_SHAPES, type NavIconName } from "./navIconShapes";

export type { NavIconName };

/** One of the navigator's five icons (Kenny's own, `navIconShapes.ts`), drawn filled in the current text colour at the given size (a CSS length). */
export function navIcon(name: NavIconName, size = "1em"): SVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	const shape = NAV_SHAPES[name];
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "currentColor");
	svg.setAttribute("fill-rule", "evenodd");
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon", "sf-navicon");
	svg.style.width = size;
	svg.style.height = size;
	const path = document.createElementNS(ns, "path");
	path.setAttribute("d", shape.d);
	if (shape.transform) path.setAttribute("transform", shape.transform);
	svg.append(path);
	return svg;
}
