import type { StatsCount } from "../../app/settings";

/**
 * The stats panel's icons (decision 68, Kenny's own choice). The graph is Tabler's clipboard-data (filled, 24 px grid, MIT);
 * the five counts are Heroicons' 16 px solid ("micro", MIT). Both are drawn solid in the current text colour:
 * the files' own fills are replaced by `currentColor`, so the colour comes from the page's purposes (Icon Licences.md).
 */
interface Solid {
	box: number;
	paths: { d: string; evenodd?: boolean }[];
}

const GRAPH: Solid = {
	box: 24,
	paths: [{ d: "M17.997 4.17a3 3 0 0 1 2.003 2.83v12a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 2.003 -2.83a4 4 0 0 0 3.997 3.83h4a4 4 0 0 0 3.98 -3.597zm-8.997 7.83a1 1 0 0 0 -1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0 -1 -1m3 3a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1l.117 -.007a1 1 0 0 0 .883 -.993v-1a1 1 0 0 0 -1 -1m3 -1a1 1 0 0 0 -1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0 -1 -1m-1 -12a2 2 0 1 1 0 4h-4a2 2 0 1 1 0 -4z" }],
};

const COUNTS: Record<StatsCount, Solid> = {
	// calendar-days
	day: {
		box: 16,
		paths: [
			{ d: "M5.75 7.5C5.33579 7.5 5 7.83579 5 8.25C5 8.66421 5.33579 9 5.75 9C6.16421 9 6.5 8.66421 6.5 8.25C6.5 7.83579 6.16421 7.5 5.75 7.5Z" },
			{ d: "M5 10.25C5 9.83579 5.33579 9.5 5.75 9.5C6.16421 9.5 6.5 9.83579 6.5 10.25C6.5 10.6642 6.16421 11 5.75 11C5.33579 11 5 10.6642 5 10.25Z" },
			{ d: "M10.25 7.5C9.83579 7.5 9.5 7.83579 9.5 8.25C9.5 8.66421 9.83579 9 10.25 9C10.6642 9 11 8.66421 11 8.25C11 7.83579 10.6642 7.5 10.25 7.5Z" },
			{ d: "M7.25 8.25C7.25 7.83579 7.58579 7.5 8 7.5C8.41421 7.5 8.75 7.83579 8.75 8.25C8.75 8.66421 8.41421 9 8 9C7.58579 9 7.25 8.66421 7.25 8.25Z" },
			{ d: "M8 9.5C7.58579 9.5 7.25 9.83579 7.25 10.25C7.25 10.6642 7.58579 11 8 11C8.41421 11 8.75 10.6642 8.75 10.25C8.75 9.83579 8.41421 9.5 8 9.5Z" },
			{ evenodd: true, d: "M4.75 1C4.33579 1 4 1.33579 4 1.75V3C2.89543 3 2 3.89543 2 5V12C2 13.1046 2.89543 14 4 14H12C13.1046 14 14 13.1046 14 12V5C14 3.89543 13.1046 3 12 3V1.75C12 1.33579 11.6642 1 11.25 1C10.8358 1 10.5 1.33579 10.5 1.75V3H5.5V1.75C5.5 1.33579 5.16421 1 4.75 1ZM3.5 7C3.5 6.44772 3.94772 6 4.5 6H11.5C12.0523 6 12.5 6.44772 12.5 7V11.5C12.5 12.0523 12.0523 12.5 11.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V7Z" },
		],
	},
	// calendar-date-range
	week: {
		box: 16,
		paths: [
			{ d: "M5.75 7.5C5.33579 7.5 5 7.83579 5 8.25C5 8.66421 5.33579 9 5.75 9C6.16421 9 6.5 8.66421 6.5 8.25C6.5 7.83579 6.16421 7.5 5.75 7.5Z" },
			{ d: "M7.25 8.25C7.25 7.83579 7.58579 7.5 8 7.5H10.25C10.6642 7.5 11 7.83579 11 8.25C11 8.66421 10.6642 9 10.25 9H8C7.58579 9 7.25 8.66421 7.25 8.25Z" },
			{ d: "M5.75 9.5C5.33579 9.5 5 9.83579 5 10.25C5 10.6642 5.33579 11 5.75 11H8C8.41421 11 8.75 10.6642 8.75 10.25C8.75 9.83579 8.41421 9.5 8 9.5H5.75Z" },
			{ evenodd: true, d: "M4.75 1C4.33579 1 4 1.33579 4 1.75V3C2.89543 3 2 3.89543 2 5V12C2 13.1046 2.89543 14 4 14H12C13.1046 14 14 13.1046 14 12V5C14 3.89543 13.1046 3 12 3V1.75C12 1.33579 11.6642 1 11.25 1C10.8358 1 10.5 1.33579 10.5 1.75V3H5.5V1.75C5.5 1.33579 5.16421 1 4.75 1ZM3.5 7C3.5 6.44772 3.94772 6 4.5 6H11.5C12.0523 6 12.5 6.44772 12.5 7V11.5C12.5 12.0523 12.0523 12.5 11.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V7Z" },
		],
	},
	// calendar
	session: {
		box: 16,
		paths: [{ evenodd: true, d: "M4 1.75C4 1.33579 4.33579 1 4.75 1C5.16421 1 5.5 1.33579 5.5 1.75V3H10.5V1.75C10.5 1.33579 10.8358 1 11.25 1C11.6642 1 12 1.33579 12 1.75V3C13.1046 3 14 3.89543 14 5V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V5C2 3.89543 2.89543 3 4 3V1.75ZM4.5 6C3.94772 6 3.5 6.44772 3.5 7V11.5C3.5 12.0523 3.94772 12.5 4.5 12.5H11.5C12.0523 12.5 12.5 12.0523 12.5 11.5V7C12.5 6.44772 12.0523 6 11.5 6H4.5Z" }],
	},
	// document
	chapter: {
		box: 16,
		paths: [{ d: "M2.5 3.5C2.5 2.67157 3.17157 2 4 2H8.87868C9.2765 2 9.65804 2.15804 9.93934 2.43934L13.0607 5.56066C13.342 5.84197 13.5 6.2235 13.5 6.62132V12.5C13.5 13.3284 12.8284 14 12 14H4C3.17157 14 2.5 13.3284 2.5 12.5V3.5Z" }],
	},
	// book-open
	novel: {
		box: 16,
		paths: [
			{ d: "M7.25 3.68772C6.25693 3.24568 5.15715 3 4 3C3.44413 3 2.9015 3.05669 2.37757 3.16462C2.15412 3.21064 2 3.4115 2 3.63964V11.6344C2 11.9794 2.34235 12.2215 2.67903 12.1459C3.10405 12.0504 3.54614 12 4 12C5.1977 12 6.31344 12.3509 7.25 12.9556V3.68772Z" },
			{ d: "M8.75 12.9556C9.68656 12.3509 10.8023 12 12 12C12.4539 12 12.8959 12.0504 13.321 12.1459C13.6577 12.2215 14 11.9794 14 11.6344V3.63964C14 3.4115 13.8459 3.21064 13.6224 3.16462C13.0985 3.05669 12.5559 3 12 3C10.8428 3 9.74308 3.24568 8.75 3.68772V12.9556Z" },
		],
	},
};

function draw(shape: Solid, size: number): SVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", `0 0 ${shape.box} ${shape.box}`);
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("fill", "currentColor");
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon");
	for (const p of shape.paths) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", p.d);
		if (p.evenodd) (path.setAttribute("fill-rule", "evenodd"), path.setAttribute("clip-rule", "evenodd"));
		svg.append(path);
	}
	return svg;
}

/** The history button's icon: 24 px. */
export const graphIcon = (): SVGElement => draw(GRAPH, 24);
/** The icon of the count on display, at its natural 16 px. */
export const countIcon = (count: StatsCount): SVGElement => draw(COUNTS[count], 16);
