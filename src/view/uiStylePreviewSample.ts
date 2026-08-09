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

/** Shared by both the storyLibrary and storyTelling mocks — same Codex tree either way (Codex chrome is one shared, non-panel-specific tab of its own). */
function mountCodexTreeSample(bottom: HTMLElement): void {
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
	folder.setCssProps({ "--sf-codex-depth": "0" });
	const folderHeader = folder.createDiv({ cls: "sf-codex-folder-header" });
	const folderContent = folderHeader.createDiv({ cls: "sf-codex-row-content" });
	folderContent.createSpan({ cls: "sf-codex-chevron" });
	folderContent.createSpan({ cls: "sf-codex-folder-name sf-styled-heading", text: "Magna Aliqua" });

	const children = folder.createDiv({ cls: "sf-codex-folder-children" });
	children.createDiv({ cls: "sf-codex-folder-indicator" });

	const noteA = children.createDiv({ cls: "sf-codex-file" });
	noteA.setCssProps({ "--sf-codex-depth": "1" });
	const noteAContent = noteA.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteAContent.createSpan({ cls: "sf-codex-file-name", text: "Ut Enim Ad Minim" });
	setIcon(noteAContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), ICON_PERSON);

	const noteB = children.createDiv({ cls: "sf-codex-file sf-row-selected" });
	noteB.setCssProps({ "--sf-codex-depth": "1" });
	const noteBContent = noteB.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteBContent.createSpan({ cls: "sf-codex-file-name", text: "Veniam Quis" });
	setIcon(noteBContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), ICON_MAP_PIN);

	const noteC = children.createDiv({ cls: "sf-codex-file" });
	noteC.setCssProps({ "--sf-codex-depth": "1" });
	const noteCContent = noteC.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
	noteCContent.createSpan({ cls: "sf-codex-file-name", text: "Nostrud Exercitation" });
	setIcon(noteCContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), "circle-help");
}

/** Shared book-line header (series/book title row) — used by both mocks; storyTelling's own book-line reads the same `--sf-lib-*` vars as storyLibrary's, since only its chapter *items* split off into their own settings (see uiStylePreviewSample.ts's header comment on the storyTelling mock). */
function mountBookLine(header: HTMLElement): void {
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

	mountBookLine(header);

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

	mountCodexTreeSample(view.createDiv({ cls: "sf-bottom-panel" }));
}

/**
 * Mounts a storyTelling-panel sample: same book-line header as storyLibrary (that part isn't
 * independently stylable — see StoryForgePluginSettings.storytellingItemsFontSize's doc comment),
 * but its own chapter list (no Unplaced section — storyTelling never shows one) rooted under
 * `.storyforge-storytelling-view`, the exact class StorytellingView.ts's real render() sets, so
 * the `--sf-storytelling-items-*`/`--sf-storytelling-highlight-*` overrides in styles.css apply
 * here the same way they do in the live panel.
 */
export function mountStorytellingPreviewSample(container: HTMLElement): void {
	container.empty();

	const view = container.createDiv({ cls: "storyforge-storytelling-view sf-ui-preview-host" });

	const top = view.createDiv({ cls: "sf-top-panel" });
	const header = top.createDiv({ cls: "sf-top-header" });
	mountBookLine(header);

	const body = top.createDiv({ cls: "sf-top-body" });
	const mainList = body.createDiv({ cls: "sf-top-list" });
	listRow(mainList, "I. Amet Consectetur");
	listRow(mainList, "II. Adipiscing Elit", true);
	listRow(mainList, "III. Sed Do Eiusmod");

	mountCodexTreeSample(view.createDiv({ cls: "sf-bottom-panel" }));
}

/** One Story Context tab's worth of representative body content, keyed by the same ids used in `mountRightSidebarPreviewSample`'s clickable tab row. */
type RecommendTabId = "novel" | "chapter" | "details" | "dossier";

function mountRecommendNovelBody(body: HTMLElement): void {
	const fixed = body.createDiv({ cls: "sf-recommend-fixed sf-recommend-novel-fixed" });
	fixed.createDiv({ cls: "sf-recommend-novel-title", text: "Ipsum Liber" });
	fixed.createDiv({ cls: "sf-recommend-novel-subtitle", text: "Vol. I — Dolor Sit" });
	fixed.createDiv({ cls: "sf-recommend-synopsis sf-recommend-novel-synopsis", text: "A brief synopsis of the novel goes here." });
	const povSection = fixed.createDiv({ cls: "sf-recommend-section" });
	const meta = povSection.createDiv({ cls: "sf-recommend-meta" });
	const row = meta.createDiv({ cls: "sf-recommend-meta-row" });
	row.createSpan({ cls: "sf-recommend-meta-label", text: "Default PoV:" });
	const control = row.createSpan({ cls: "sf-recommend-meta-control" });
	setIcon(control.createSpan({ cls: "sf-recommend-meta-icon" }), ICON_PERSON);
	control.createSpan({ cls: "sf-recommend-meta-value", text: "Jane Protagonist" });

	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	const block = scroll.createDiv({ cls: "sf-recommend-plot-block" });
	block.createDiv({ cls: "sf-recommend-plot-chapter-name", text: "I. Amet Consectetur" });
	block.createDiv({ cls: "sf-recommend-synopsis sf-recommend-plot-textarea", text: "Chapter summary goes here." });
}

function mountRecommendHitCard(scroll: HTMLElement, tier: string, sentence: string): void {
	const card = scroll.createDiv({ cls: `sf-recommend-hit sf-recommend-hit-${tier}` });
	const meta = card.createDiv({ cls: "sf-recommend-hit-meta" });
	meta.createSpan({ cls: `sf-recommend-tier sf-recommend-tier-${tier}`, text: tier });
	meta.createSpan({ cls: "sf-recommend-lens", text: "name" });
	card.createDiv({ cls: "sf-recommend-hit-span", text: sentence });
}

function mountRecommendChapterBody(body: HTMLElement): void {
	const fixed = body.createDiv({ cls: "sf-recommend-fixed" });
	const titleRow = fixed.createDiv({ cls: "sf-recommend-chapter-title-row" });
	titleRow.createSpan({ cls: "sf-recommend-chapter-title", text: "I. Amet Consectetur" });
	const synSection = fixed.createDiv({ cls: "sf-recommend-section" });
	synSection.createDiv({ cls: "sf-recommend-synopsis-row" }).createEl("textarea", { cls: "sf-recommend-synopsis", text: "Chapter summary goes here." });

	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	const section = scroll.createDiv({ cls: "sf-recommend-section" });
	section.createDiv({ cls: "sf-recommend-section-title", text: "Characters in chapter" });
	mountRecommendHitCard(section, "matched", "Jane walked into the room.");
}

function mountRecommendDetailsBody(body: HTMLElement): void {
	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	const section = scroll.createDiv({ cls: "sf-recommend-section" });
	section.createDiv({ cls: "sf-recommend-section-title", text: "Details to capture" });
	mountRecommendHitCard(section, "ambiguous", "The old locket felt heavier than it looked.");
	mountRecommendHitCard(section, "matched", "A storm was rolling in from the coast.");
}

function mountRecommendDossierBody(body: HTMLElement): void {
	const fixed = body.createDiv({ cls: "sf-recommend-fixed" });
	const combo = fixed.createDiv({ cls: "sf-recommend-dossier-combo" });
	combo.createEl("input", { cls: "sf-recommend-dossier-search", attr: { placeholder: "Search Codex…", value: "Jane" } });
	setIcon(combo.createSpan({ cls: "sf-recommend-icon-btn sf-recommend-dossier-drop" }), "chevron-down");

	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	const chSection = scroll.createDiv({ cls: "sf-recommend-section" });
	chSection.createDiv({ cls: "sf-recommend-section-title", text: "I. Amet Consectetur" });
	mountRecommendHitCard(chSection, "matched", "Jane paused at the doorway.");
}

const RECOMMEND_TAB_BODIES: Record<RecommendTabId, (body: HTMLElement) => void> = {
	novel: mountRecommendNovelBody,
	chapter: mountRecommendChapterBody,
	details: mountRecommendDetailsBody,
	dossier: mountRecommendDossierBody,
};

/**
 * Mounts Forge / Story Context / Archive chrome samples for the right-sidebar tab. Story
 * Context's own tab row is clickable, same as the real panel, so every settings group in that
 * tab (Novel/Chapter/Details/Dossier sizes, colours, fonts) has an actual live preview to check
 * against — not just the tab bar itself.
 */
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
	const recBody = recommend.createDiv({ cls: "sf-recommend-body" });
	const archive = recommend.createDiv({ cls: "sf-archive-view sf-archive-embedded sf-settings-hidden" });

	const tabButtons: Partial<Record<RecommendTabId, HTMLElement>> = {};
	let archiveBtn!: HTMLElement;
	const showRecommendTab = (id: RecommendTabId) => {
		for (const [tabId, btn] of Object.entries(tabButtons)) btn?.toggleClass("is-active", tabId === id);
		archiveBtn.removeClass("is-active");
		recBody.toggleClass("sf-settings-hidden", false);
		archive.addClass("sf-settings-hidden");
		recBody.empty();
		RECOMMEND_TAB_BODIES[id](recBody);
	};
	const showArchiveTab = () => {
		for (const btn of Object.values(tabButtons)) btn?.removeClass("is-active");
		archiveBtn.addClass("is-active");
		recBody.addClass("sf-settings-hidden");
		archive.removeClass("sf-settings-hidden");
	};

	(
		[
			["novel", "Novel"],
			["chapter", "Chapter"],
			["details", "Details"],
			["dossier", "Dossier"],
		] as [RecommendTabId, string][]
	).forEach(([id, label]) => {
		const btn = recTabs.createSpan({ cls: "sf-recommend-tab", text: label });
		tabButtons[id] = btn;
		btn.addEventListener("click", () => showRecommendTab(id));
	});
	archiveBtn = recTabs.createSpan({ cls: "sf-recommend-tab sf-recommend-tab--archive", text: "Archive" });
	archiveBtn.addEventListener("click", () => showArchiveTab());

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

	showRecommendTab("novel");
}
