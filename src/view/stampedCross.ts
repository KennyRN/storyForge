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
	filter.appendChild(svgEl("feOffset", { in: "SourceAlpha", dx: "1.19", dy: "1.19", result: "offDark" }));
	filter.appendChild(svgEl("feGaussianBlur", { in: "offDark", stdDeviation: "1.09", result: "blurDark" }));
	filter.appendChild(svgEl("feComposite", { in: "SourceAlpha", in2: "blurDark", operator: "out", result: "innerDark" }));
	filter.appendChild(svgEl("feFlood", { "flood-color": "#000", "flood-opacity": "0.52", result: "black" }));
	filter.appendChild(svgEl("feComposite", { in: "black", in2: "innerDark", operator: "in", result: "shadowDark" }));
	filter.appendChild(svgEl("feOffset", { in: "SourceAlpha", dx: "-0.95", dy: "-0.95", result: "offLight" }));
	filter.appendChild(svgEl("feGaussianBlur", { in: "offLight", stdDeviation: "0.81", result: "blurLight" }));
	filter.appendChild(svgEl("feComposite", { in: "SourceAlpha", in2: "blurLight", operator: "out", result: "innerLight" }));
	filter.appendChild(svgEl("feFlood", { "flood-color": "#fff", "flood-opacity": "0.30", result: "white" }));
	filter.appendChild(svgEl("feComposite", { in: "white", in2: "innerLight", operator: "in", result: "shadowLight" }));
	// Keep the original wall lighting, but punch a flat floor so the trough isn't a rounded U.
	filter.appendChild(svgEl("feMorphology", { in: "SourceAlpha", operator: "erode", radius: "1.09", result: "floor" }));
	filter.appendChild(svgEl("feComposite", { in: "shadowDark", in2: "floor", operator: "out", result: "wallDark" }));
	filter.appendChild(svgEl("feComposite", { in: "shadowLight", in2: "floor", operator: "out", result: "wallLight" }));
	const merge = svgEl("feMerge", {});
	merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
	merge.appendChild(svgEl("feMergeNode", { in: "wallDark" }));
	merge.appendChild(svgEl("feMergeNode", { in: "wallLight" }));
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

/** Full-pane empty index — same 72px stamped X as Archive. */
export function renderStampedIndexEmpty(parent: HTMLElement, label: string): HTMLElement {
	const empty = parent.createDiv({
		cls: "sf-archive-empty",
		attr: { "aria-label": label },
	});
	setIcon(empty, ICON_X);
	stampCrossIcon(empty);
	return empty;
}
