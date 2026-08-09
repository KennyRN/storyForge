/**
 * Miniature storyForge chrome mocks for the interface formatting live preview.
 * Uses the same `sf-*` classes as the live panels so stylesheet + `--sf-*` vars apply.
 */
import { setIcon } from "obsidian";
import { ICON_FORGE } from "../icons";

const ICON_FILTER = "sf-filter";
const ICON_TIMELINE = "sf-timeline";
const ICON_UNPLACED = "sf-archive-drawer";
const ICON_PLUS_SQUARE = "sf-plus-square";
const ICON_CODEX = "sf-earth-fill";
const ICON_FOLDER_PLUS = "sf-folder-plus";
const ICON_PERSON = "sf-person-fill";
const ICON_MAP_PIN = "sf-map-pin";
const ICON_ARCHIVE = "sf-archive-drawer";

function listRow(list: HTMLElement, title: string, selected = false, subtitle?: string): HTMLElement {
	const row = list.createDiv({ cls: selected ? "sf-row sf-row-selected" : "sf-row" });
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");
	const wrap = row.createDiv({ cls: "sf-row-title-wrap" });
	wrap.createSpan({ cls: "sf-row-text", text: title });
	if (subtitle) wrap.createDiv({ cls: "sf-row-subtitle", text: subtitle });
	return row;
}

/** Mounts a compact library / unplaced / codex sample into `container`. */
export function mountUiStylePreviewSample(container: HTMLElement): void {
	container.empty();

	const view = container.createDiv({ cls: "storyforge-view sf-ui-preview-host" });

	const top = view.createDiv({ cls: "sf-top-panel" });

	const header = top.createDiv({ cls: "sf-top-header" });

	const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
	seriesLine.createSpan({ cls: "sf-header-text", text: "Lorem Series" });
	const seriesFilter = seriesLine.createSpan({
		cls: "sf-series-settings-btn",
		attr: { "aria-label": "Series settings" },
	});
	setIcon(seriesFilter, ICON_FILTER);

	const bookLine = header.createDiv({ cls: "sf-book-line" });
	const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
	const textWrap = titleRow.createDiv({ cls: "sf-book-text-wrap" });
	textWrap.createSpan({ cls: "sf-header-text", text: "Ipsum Liber" });
	const bookBtn = titleRow.createSpan({
		cls: "sf-book-filter-btn",
		attr: { "aria-label": "Synopsis and plot" },
	});
	setIcon(bookBtn, ICON_TIMELINE);
	bookLine.createDiv({ cls: "sf-book-subtitle-text", text: "Vol. I — Dolor Sit" });

	const body = top.createDiv({ cls: "sf-top-body" });
	const mainList = body.createDiv({ cls: "sf-top-list" });
	listRow(mainList, "I. Amet Consectetur");
	listRow(mainList, "II. Adipiscing Elit", true);
	listRow(mainList, "III. Sed Do Eiusmod");

	const unplacedZone = body.createDiv({ cls: "sf-unplaced-zone" });
	const unplacedHeader = unplacedZone.createDiv({ cls: "sf-unplaced-header" });
	setIcon(unplacedHeader.createSpan({ cls: "sf-icon" }), ICON_UNPLACED);
	unplacedHeader.createSpan({ cls: "sf-header-unplaced", text: "Unplaced Chapters" });
	const unplacedNew = unplacedHeader.createSpan({
		cls: "sf-unplaced-new-file",
		attr: { "aria-label": "New chapter" },
	});
	setIcon(unplacedNew, ICON_PLUS_SQUARE);
	const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
	listRow(unplacedList, "Tempor Incididunt");
	listRow(unplacedList, "Ut Labore", true);

	const bottom = view.createDiv({ cls: "sf-bottom-panel" });
	const bottomHeader = bottom.createDiv({ cls: "sf-bottom-header" });
	setIcon(bottomHeader.createSpan({ cls: "sf-icon" }), ICON_CODEX);
	bottomHeader.createSpan({ cls: "sf-header-codex", text: "Codex" });
	const newFileBtn = bottomHeader.createSpan({
		cls: "sf-codex-new-file-btn",
		attr: { "aria-label": "New file" },
	});
	setIcon(newFileBtn, ICON_PLUS_SQUARE);
	const newFolderBtn = bottomHeader.createSpan({
		cls: "sf-codex-new-folder-btn",
		attr: { "aria-label": "New folder" },
	});
	setIcon(newFolderBtn, ICON_FOLDER_PLUS);

	const tree = bottom.createDiv({ cls: "sf-codex-tree" });
	const folder = tree.createDiv({ cls: "sf-codex-folder" });
	folder.style.setProperty("--sf-codex-depth", "0");
	const folderHeader = folder.createDiv({ cls: "sf-codex-folder-header" });
	const folderContent = folderHeader.createDiv({ cls: "sf-codex-row-content" });
	folderContent.createSpan({ cls: "sf-codex-chevron" });
	folderContent.createSpan({ cls: "sf-codex-folder-name sf-styled-heading", text: "Magna Aliqua" });

	const children = folder.createDiv({ cls: "sf-codex-folder-children" });
	children.createDiv({ cls: "sf-codex-folder-indicator" });

	const noteA = children.createDiv({ cls: "sf-codex-file" });
	noteA.style.setProperty("--sf-codex-depth", "1");
	const noteAContent = noteA.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteAContent.createSpan({ cls: "sf-codex-file-name", text: "Ut Enim Ad Minim" });
	setIcon(noteAContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), ICON_PERSON);

	const noteB = children.createDiv({ cls: "sf-codex-file sf-row-selected" });
	noteB.style.setProperty("--sf-codex-depth", "1");
	const noteBContent = noteB.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteBContent.createSpan({ cls: "sf-codex-file-name", text: "Veniam Quis" });
	setIcon(noteBContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), ICON_MAP_PIN);

	const noteC = children.createDiv({ cls: "sf-codex-file" });
	noteC.style.setProperty("--sf-codex-depth", "1");
	const noteCContent = noteC.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteCContent.createSpan({ cls: "sf-codex-file-name", text: "Nostrud Exercitation" });
	setIcon(noteCContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), "circle-help");
}

/** Mounts Forge / Story Context / Archive chrome samples for the right-sidebar tab. */
export function mountRightSidebarPreviewSample(container: HTMLElement): void {
	container.empty();

	const rail = container.createDiv({ cls: "sf-right-rail-preview" });

	const forge = rail.createDiv({ cls: "sf-forge-view" });
	const companions = forge.createDiv({ cls: "sf-forge-view__companions" });
	const companionA = companions.createSpan({
		cls: "sf-forge-view__companion is-active",
		attr: { "aria-label": "nameForge" },
	});
	setIcon(companionA, ICON_PERSON);
	const companionB = companions.createSpan({
		cls: "sf-forge-view__companion",
		attr: { "aria-label": "Forge" },
	});
	setIcon(companionB, ICON_FORGE);
	forge.createDiv({ cls: "sf-forge-view__panel" });

	const recommend = rail.createDiv({ cls: "sf-recommend-view" });
	const recTabs = recommend.createDiv({ cls: "sf-recommend-tabs" });
	recTabs.createSpan({ cls: "sf-recommend-tab is-active", text: "Chapter" });
	recTabs.createSpan({ cls: "sf-recommend-tab", text: "Details" });
	recTabs.createSpan({ cls: "sf-recommend-tab", text: "Dossier" });
	recTabs.createSpan({ cls: "sf-recommend-tab sf-recommend-tab--archive", text: "Archive" });
	const archive = recommend.createDiv({ cls: "sf-archive-view sf-archive-embedded" });
	const archHeader = archive.createDiv({ cls: "sf-archive-embedded-header" });
	setIcon(archHeader.createSpan({ cls: "sf-icon" }), ICON_ARCHIVE);
	archHeader.createSpan({ cls: "sf-archive-view-title", text: "Archive" });
	const archTabs = archive.createDiv({ cls: "sf-archive-view-tabs sf-archive-embedded-tabs" });
	archTabs.createSpan({ cls: "sf-archive-view-tab is-active", text: "Codex" });
	archTabs.createSpan({ cls: "sf-archive-view-tab", text: "Novel" });
	const archList = archive.createDiv({ cls: "sf-archive-list" });
	listRow(archList, "Old Draft — Book I", true);
	listRow(archList, "Cut scenes");
	listRow(archList, "Research scrap");
}
