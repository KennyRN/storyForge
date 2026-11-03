import type { StatsCount } from "../../app/settings";

export type ClockKind = "idle" | "session" | "paused";

/**
 * The stats panel's icons (decision 68; the counts and clocks replaced in Brief 13 by Kenny's choice). Every one is Tabler's (MIT,
 * `Icon Licences.md`): the graph is the clipboard-data (filled, 24 px) and the rest are Tabler's outline icons (24 px grid, a 2 px
 * stroke) drawn at 16 px. They take the current text colour, so the page's purposes colour them.
 */
interface Shape {
	box: number;
	/** Outline icons are stroked (round caps and joins); the graph is filled. */
	stroke?: boolean;
	paths: string[];
}

const GRAPH: Shape = {
	box: 24,
	paths: ["M17.997 4.17a3 3 0 0 1 2.003 2.83v12a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 2.003 -2.83a4 4 0 0 0 3.997 3.83h4a4 4 0 0 0 3.98 -3.597zm-8.997 7.83a1 1 0 0 0 -1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0 -1 -1m3 3a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1l.117 -.007a1 1 0 0 0 .883 -.993v-1a1 1 0 0 0 -1 -1m3 -1a1 1 0 0 0 -1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0 -1 -1m-1 -12a2 2 0 1 1 0 4h-4a2 2 0 1 1 0 -4z"],
};

const ADD_CHAPTER: Shape = {
	box: 24,
	paths: ["M12 2l.324 .001l.318 .004l.616 .017l.299 .013l.579 .034l.553 .046c4.785 .464 6.732 2.411 7.196 7.196l.046 .553l.034 .579c.005 .098 .01 .198 .013 .299l.017 .616l.005 .642l-.005 .642l-.017 .616l-.013 .299l-.034 .579l-.046 .553c-.464 4.785 -2.411 6.732 -7.196 7.196l-.553 .046l-.579 .034c-.098 .005 -.198 .01 -.299 .013l-.616 .017l-.642 .005l-.642 -.005l-.616 -.017l-.299 -.013l-.579 -.034l-.553 -.046c-4.785 -.464 -6.732 -2.411 -7.196 -7.196l-.046 -.553l-.034 -.579a28.058 28.058 0 0 1 -.013 -.299l-.017 -.616c-.003 -.21 -.005 -.424 -.005 -.642l.001 -.324l.004 -.318l.017 -.616l.013 -.299l.034 -.579l.046 -.553c.464 -4.785 2.411 -6.732 7.196 -7.196l.553 -.046l.579 -.034c.098 -.005 .198 -.01 .299 -.013l.616 -.017c.21 -.003 .424 -.005 .642 -.005zm0 6a1 1 0 0 0 -1 1v2h-2l-.117 .007a1 1 0 0 0 .117 1.993h2v2l.007 .117a1 1 0 0 0 1.993 -.117v-2h2l.117 -.007a1 1 0 0 0 -.117 -1.993h-2v-2l-.007 -.117a1 1 0 0 0 -.993 -.883z"],
};

const outline = (...paths: string[]): Shape => ({ box: 24, stroke: true, paths });

const COUNTS: Record<StatsCount, Shape> = {
	// calendar-due: today
	day: outline("M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12", "M16 3v4", "M8 3v4", "M4 11h16", "M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"),
	// calendar-week: this week
	week: outline("M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12", "M16 3v4", "M8 3v4", "M4 11h16", "M7 14h.013", "M10.01 14h.005", "M13.01 14h.005", "M16.015 14h.005", "M13.015 17h.005", "M7.01 17h.005", "M10.01 17h.005"),
	// calendar-clock: this session
	session: outline("M10.5 21h-4.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3", "M16 3v4", "M8 3v4", "M4 11h10", "M14 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M18 16.5v1.5l.5 .5"),
	// file-text: this chapter
	chapter: outline("M14 3v4a1 1 0 0 0 1 1h4", "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2", "M9 9l1 0", "M9 13l6 0", "M9 17l6 0"),
	// book: this novel
	novel: outline("M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0", "M3 6l0 13", "M12 6l0 13", "M21 6l0 13"),
};

const CLOCKS: Record<ClockKind, Shape> = {
	// clock: no session
	idle: outline("M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 7v5l3 3"),
	// clock-edit: a session is ongoing
	session: outline("M21 12a9 9 0 1 0 -9.972 8.948c.32 .034 .644 .052 .972 .052", "M12 7v5l2 2", "M18.42 15.61a2.1 2.1 0 0 1 2.97 2.97l-3.39 3.42h-3v-3l3.42 -3.39"),
	// clock-pause: the session is paused (a minute with no edit)
	paused: outline("M20.942 13.018a9 9 0 1 0 -7.909 7.922", "M12 7v5l2 2", "M17 17v5", "M21 17v5"),
};

function draw(shape: Shape, size: number): SVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", `0 0 ${shape.box} ${shape.box}`);
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon");
	if (shape.stroke) {
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
	} else svg.setAttribute("fill", "currentColor");
	for (const d of shape.paths) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", d);
		svg.append(path);
	}
	return svg;
}

/** The history button's icon: 24 px. */
export const graphIcon = (): SVGElement => draw(GRAPH, 24);
/** The readout's clock: none ongoing, a session ongoing, or paused. 16 px, in the count icon's column. */
export const clockIcon = (kind: ClockKind): SVGElement => draw(CLOCKS[kind], 16);
/** The icon of the count on display, 16 px. */
export const countIcon = (count: StatsCount): SVGElement => draw(COUNTS[count], 16);
/** The chapter list's "add the next chapter" button: Tabler's square-rounded-plus (filled, MIT), 16 px, in the current text colour. */
export const addChapterIcon = (): SVGElement => draw(ADD_CHAPTER, 16);
