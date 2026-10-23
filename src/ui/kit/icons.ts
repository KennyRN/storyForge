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
	FilePlus,
	Folder,
	FolderOpen,
	FolderPlus,
	Globe,
	GripVertical,
	Info,
	Layers,
	Library,
	PanelRight,
	Pencil,
	Plus,
	Settings,
	TriangleAlert,
	X,
	type IconNode,
} from "lucide";

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
	"file-plus": FilePlus,
	folder: Folder,
	"folder-open": FolderOpen,
	"folder-plus": FolderPlus,
	globe: Globe,
	grip: GripVertical,
	info: Info,
	layers: Layers,
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
	const svg = createElement(ICONS[name]);
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("sf-icon");
	return svg;
}
