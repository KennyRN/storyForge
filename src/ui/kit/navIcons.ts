import { NAV_SHAPES, type NavIconName } from "./navIconShapes";

export type { NavIconName };

/** One of the navigator's five icons (Kenny's own, `navIconShapes.ts`), drawn filled in the current text colour at the given size (a CSS length). */
let maskCount = 0;

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
	if (shape.cut) {
		// The shape's strokes are part of its cut-out: knocked out of the fill together, not drawn over it.
		const id = `sf-navicon-cut-${++maskCount}`;
		const mask = document.createElementNS(ns, "mask");
		mask.setAttribute("id", id);
		mask.setAttribute("maskUnits", "userSpaceOnUse");
		for (const [k, v] of Object.entries({ x: "-2", y: "-2", width: "28", height: "28" })) mask.setAttribute(k, v);
		const all = document.createElementNS(ns, "rect");
		for (const [k, v] of Object.entries({ x: "-2", y: "-2", width: "28", height: "28", fill: "white" })) all.setAttribute(k, v);
		const group = document.createElementNS(ns, "g");
		group.setAttribute("transform", shape.cut.transform);
		for (const d of shape.cut.strokes) {
			const stroke = document.createElementNS(ns, "path");
			for (const [k, v] of Object.entries({ d, fill: "none", stroke: "black", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) stroke.setAttribute(k, v);
			group.append(stroke);
		}
		mask.append(all, group);
		svg.append(mask);
		path.setAttribute("mask", `url(#${id})`);
	}
	svg.append(path);
	return svg;
}
