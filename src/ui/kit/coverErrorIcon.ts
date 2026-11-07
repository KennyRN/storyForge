import { noticePath } from "./noticeIcons";

/**
 * The icon of a cover that can't be shown (Tweaks 1, §1.8): the warning notice's "!" rounded square, drawn the way the no-cover icon is (half the cover
 * box's width, centred, a cut-out in the colour of the background the box sits on), on a `bg_red` box. The colour is the signal and this icon is secondary
 * (Kenny's deliberate exception to decision 130, ruling 6's pairing of red with the triangle). Its name for the screen reader says the cover couldn't be shown.
 */
export function coverErrorIcon(size: number | string = "50%"): SVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	if (typeof size === "number") {
		svg.setAttribute("width", String(size));
		svg.setAttribute("height", String(size));
	} else {
		svg.style.width = size;
		svg.style.height = "auto";
		svg.style.aspectRatio = "1";
	}
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", "The cover could not be shown");
	svg.classList.add("sf-icon");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", noticePath("warning"));
	path.setAttribute("fill", "currentColor");
	svg.append(path);
	return svg;
}
