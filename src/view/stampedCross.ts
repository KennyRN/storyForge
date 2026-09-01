import { setIcon } from "obsidian";
import { ICON_X } from "../icons";

const SVG_NS = "http://www.w3.org/2000/svg";
let stampSeq = 0;

/** Inner-shadow a mounted ICON_X so it reads as stamped into the page (fill matches the pane). */
export function stampCrossIcon(host: HTMLElement): void {
	const svg = host.querySelector("svg");
	if (!svg) return;
	const doc = host.ownerDocument;
	const svgEl = (name: string, attrs: Record<string, string>): SVGElement => {
		const node = doc.createElementNS(SVG_NS, name);
		for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
		return node;
	};
	const filterId = `sf-cross-stamp-${++stampSeq}`;
	const defs = svgEl("defs", {});
	const filter = svgEl("filter", {
		id: filterId,
		x: "-50%",
		y: "-50%",
		width: "200%",
		height: "200%",
		"color-interpolation-filters": "sRGB",
	});
	filter.appendChild(svgEl("feOffset", { in: "SourceAlpha", dx: "1.25", dy: "1.25", result: "offDark" }));
	filter.appendChild(svgEl("feGaussianBlur", { in: "offDark", stdDeviation: "1.15", result: "blurDark" }));
	filter.appendChild(svgEl("feComposite", { in: "SourceAlpha", in2: "blurDark", operator: "out", result: "innerDark" }));
	filter.appendChild(svgEl("feFlood", { "flood-color": "#000", "flood-opacity": "0.55", result: "black" }));
	filter.appendChild(svgEl("feComposite", { in: "black", in2: "innerDark", operator: "in", result: "shadowDark" }));
	filter.appendChild(svgEl("feOffset", { in: "SourceAlpha", dx: "-1", dy: "-1", result: "offLight" }));
	filter.appendChild(svgEl("feGaussianBlur", { in: "offLight", stdDeviation: "0.85", result: "blurLight" }));
	filter.appendChild(svgEl("feComposite", { in: "SourceAlpha", in2: "blurLight", operator: "out", result: "innerLight" }));
	filter.appendChild(svgEl("feFlood", { "flood-color": "#fff", "flood-opacity": "0.32", result: "white" }));
	filter.appendChild(svgEl("feComposite", { in: "white", in2: "innerLight", operator: "in", result: "shadowLight" }));
	const merge = svgEl("feMerge", {});
	merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
	merge.appendChild(svgEl("feMergeNode", { in: "shadowDark" }));
	merge.appendChild(svgEl("feMergeNode", { in: "shadowLight" }));
	filter.appendChild(merge);
	defs.appendChild(filter);
	svg.insertBefore(defs, svg.firstChild);
	for (const path of svg.querySelectorAll("path")) {
		if (path.getAttribute("fill") === "none") continue;
		path.setAttribute("filter", `url(#${filterId})`);
	}
}

/** Empty-state cross under a chapter/section header — sized to the card body, centred. */
export function renderStampedEmptyCross(parent: HTMLElement, label: string): HTMLElement {
	const empty = parent.createDiv({
		cls: "sf-empty sf-empty-cross",
		attr: { "aria-label": label },
	});
	setIcon(empty, ICON_X);
	stampCrossIcon(empty);
	return empty;
}
