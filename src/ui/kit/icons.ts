import {
	Archive,
	ArchiveRestore,
	ArrowLeftRight,
	BookOpen,
	Check,
	ChevronDown,
	ChevronRight,
	createElement,
	File,
	Folder,
	FolderOpen,
	Globe,
	GripVertical,
	Info,
	Library,
	PanelRight,
	Pencil,
	Plus,
	Settings,
	TriangleAlert,
	X,
	type IconNode,
} from "lucide";

/** Tabler Icons (MIT; Icon Licences.md; the New Note button's is Tabler's square-rounded-plus-2, kept under the name file-plus), drawn on the same 24-unit grid and 2-unit stroke as Lucide's, so they sit with them. */
const FOLDER_PLUS: IconNode = [
	["path", { d: "M12 19h-7a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v3.5" }],
	["path", { d: "M16 19h6" }],
	["path", { d: "M19 16v6" }],
];
const FILE_PLUS: IconNode = [
	["path", { d: "M12.54 20.996c-.176 .004 -.356 .004 -.54 .004c-7.2 0 -9 -1.8 -9 -9s1.8 -9 9 -9s9 1.8 9 9c0 .185 -.001 .366 -.004 .544" }],
	["path", { d: "M16 19h6" }],
	["path", { d: "M19 16v6" }],
];
/** The filled folder: the Codex list's folder icon (solid, drawn with fill and no stroke). */
const FOLDER_FILLED: IconNode = [
	["path", { d: "M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z" }],
];

/** The Lucide icons the interface uses (ISC; see Icon Licences.md). Importing only these keeps the bundle to them. */
const ICONS = {
	archive: Archive,
	"archive-restore": ArchiveRestore,
	switch: ArrowLeftRight,
	book: BookOpen,
	check: Check,
	"chevron-down": ChevronDown,
	"chevron-right": ChevronRight,
	file: File,
	"file-plus": FILE_PLUS,
	folder: Folder,
	"folder-open": FolderOpen,
	"folder-plus": FOLDER_PLUS,
	"folder-filled": FOLDER_FILLED,
	globe: Globe,
	grip: GripVertical,
	info: Info,
	library: Library,
	"panel-right": PanelRight,
	pencil: Pencil,
	plus: Plus,
	settings: Settings,
	warning: TriangleAlert,
	close: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** An inline SVG icon in the current text colour. Decorative: the control it sits in carries the label. */
export function icon(name: IconName, size = 16): SVGElement {
	const svg = createElement(ICONS[name], name === "folder-filled" ? { fill: "currentColor", stroke: "none" } : {});
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon");
	return svg;
}
