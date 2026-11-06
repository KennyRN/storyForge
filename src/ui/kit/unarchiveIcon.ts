/**
 * The Unarchive icon (round five): Tabler's filled `sunrise` (MIT; `Icon Licences.md`), supplied by Kenny, unchanged, replacing Lucide's archive-restore. A solid
 * shape on a 24 px grid in the current text colour; the button names it.
 */
const PATHS = [
	"M4 16a1 1 0 0 1 0 2h-1a1 1 0 0 1 0 -2z",
	"M12 12a5 5 0 0 1 5 5a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1a5 5 0 0 1 5 -5",
	"M21 16a1 1 0 0 1 0 2h-1a1 1 0 0 1 0 -2z",
	"M6.307 9.893l.7 .7a1 1 0 0 1 -1.414 1.414l-.7 -.7a1 1 0 0 1 1.414 -1.414",
	"M19.107 9.893a1 1 0 0 1 0 1.414l-.7 .7a1 1 0 0 1 -1.414 -1.414l.7 -.7a1 1 0 0 1 1.414 0",
	"M12.707 2.293l3 3a1 1 0 1 1 -1.414 1.414l-1.293 -1.292v3.585a1 1 0 0 1 -.883 .993l-.117 .007a1 1 0 0 1 -1 -1v-3.586l-1.293 1.293a1 1 0 0 1 -1.414 -1.414l2.958 -2.96a1 1 0 0 1 .15 -.135l.127 -.08l.068 -.033l.11 -.041l.12 -.029c.3 -.055 .627 .024 .881 .278",
	"M3 20h18a1 1 0 0 1 0 2h-18a1 1 0 0 1 0 -2",
	"M12 12a5 5 0 0 1 4.583 7.002h-9.166a5 5 0 0 1 4.583 -7.002",
];

export function unarchiveIcon(size = 16): SVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "currentColor");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.classList.add("sf-icon");
	for (const d of PATHS) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", d);
		svg.append(path);
	}
	return svg;
}
