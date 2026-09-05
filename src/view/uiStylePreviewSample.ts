/**
 * Miniature storyForge chrome mocks for the interface formatting live preview.
 * Uses the same `sf-*` classes as the live panels so stylesheet + `--sf-*` vars apply.
 */
import { setIcon } from "obsidian";
import { MAIN_THREAD_FALLBACK_COLOR } from "../plotThreads";
import { resolveTitleShadow } from "../titleShadow";
import { renderStampedEmptyCross } from "./stampedCross";

const ICON_UNPLACED = "sf-archive-drawer";
const ICON_PLUS_SQUARE = "sf-plus-square";
const ICON_MINUS_SQUARE = "sf-minus-square";
const ICON_CHECK_SQUARE = "sf-check-square";
const ICON_FILTER_LIST = "sf-filter-list";
const ICON_FOLDER_PLUS = "sf-folder-plus";
const ICON_FOLDER = "sf-folder-fill";
const ICON_TRANSPORT_TO_START = "sf-transport-to-start";
const ICON_TRANSPORT_PREVIOUS = "sf-transport-previous";
const ICON_TRANSPORT_NEXT = "sf-transport-next";
const ICON_TRANSPORT_TO_END = "sf-transport-to-end";
const ICON_CONTINUOUS_MODE = "sf-continuous-mode";
const ICON_DASHBOARD_CHART = "sf-dashboard-chart";
const ICON_PERSON = "sf-person-fill";
const ICON_MEEPLE = "nameforge-meeple";
const ICON_MAP_PIN = "sf-map-pin";
const ICON_ARCHIVE = "sf-box";
const ICON_FORGE = "sf-hammer-anvil";
const ICON_TITLEFORGE = "sf-titleforge";
const ICON_BOOK_DUOTONE = "sf-book-duotone";
const ICON_CODEX = "sf-earth-fill";
const ICON_BOOK_OPEN_FILLED = "sf-book-open-filled";
const ICON_CLIPBOARD_LIST_DUOTONE = "sf-clipboard-list-duotone";
const ICON_NOTEBOOK_DUOTONE = "sf-notebook-duotone";
const ICON_TARGET_DUOTONE = "sf-target-duotone";
const ICON_ADD_CIRCLE = "sf-add-circle";

function listRow(list: HTMLElement, title: string, selected = false, subtitle?: string): HTMLElement {
	const row = list.createDiv({ cls: selected ? "sf-row sf-row-selected" : "sf-row" });
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");
	const wrap = row.createDiv({ cls: "sf-row-title-wrap" });
	wrap.createSpan({ cls: "sf-row-text", text: title });
	if (subtitle) wrap.createDiv({ cls: "sf-row-subtitle", text: subtitle });
	return row;
}

/** Shared by both the storyLibrary Chapter-layout mock and the storyTelling mock. No Codex
 * title/globe — the pane divider is the only chrome between library/navigator and the tree.
 * Filter / new-file / new-folder (and vault-tag filters) sit in a left rail. The types/tags
 * corner belongs to the full-pane Codex tab, which this preview does not mock. */
function mountCodexTreeSample(bottom: HTMLElement): void {
	const body = bottom.createDiv({ cls: "sf-codex-body" });
	const rail = body.createDiv({ cls: "sf-codex-side-actions" });
	setIcon(rail.createSpan({ cls: "sf-codex-new-folder-btn", attr: { "aria-label": "New folder" } }), ICON_FOLDER_PLUS);
	setIcon(rail.createSpan({ cls: "sf-codex-new-file-btn", attr: { "aria-label": "New file" } }), ICON_PLUS_SQUARE);
	setIcon(rail.createSpan({ cls: "sf-codex-filter-btn", attr: { "aria-label": "Filter by type" } }), ICON_FILTER_LIST);
	const vaultTags = rail.createDiv({ cls: "sf-codex-vault-tags" });
	setIcon(vaultTags.createSpan({ cls: "sf-codex-vault-tag-btn is-active", attr: { "aria-label": "Filter by #hero" } }), ICON_PERSON);
	setIcon(vaultTags.createSpan({ cls: "sf-codex-vault-tag-btn", attr: { "aria-label": "Filter by #place" } }), ICON_MAP_PIN);

	const tree = body.createDiv({ cls: "sf-codex-tree" });
	const folder = tree.createDiv({ cls: "sf-codex-folder" });
	folder.setCssProps({ "--sf-codex-depth": "0" });
	const folderHeader = folder.createDiv({ cls: "sf-codex-folder-header sf-codex-lore-folder sf-row-selected" });
	const folderContent = folderHeader.createDiv({ cls: "sf-codex-row-content" });
	folderContent.createSpan({ cls: "sf-codex-folder-name sf-styled-heading", text: "Magna Aliqua" });
	setIcon(folderContent.createSpan({ cls: "sf-icon sf-codex-type-icon sf-codex-folder-toggle" }), ICON_FOLDER);
	setIcon(folderContent.createSpan({ cls: "sf-icon sf-codex-type-icon" }), ICON_PERSON);

	folder.addClass("sf-codex-folder--with-indicator");
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

/** Series title row — text only, matching TopPanel.ts (the settings cog lives on the pane corner, not here). */
function mountSeriesLine(header: HTMLElement): void {
	const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
	seriesLine.createSpan({ cls: "sf-header-text", text: "Lorem Series" });
}

/** Shared book-line header — used by both mocks; storyTelling's own book-line reads the same `--sf-lib-*` vars as storyLibrary's, since only its chapter *items* split off into their own settings. */
function mountBookLine(header: HTMLElement): void {
	const bookLine = header.createDiv({ cls: "sf-book-line" });
	const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
	const textWrap = titleRow.createDiv({ cls: "sf-book-text-wrap" });
	textWrap.createSpan({ cls: "sf-header-text", text: "Ipsum Liber" });
	bookLine.createDiv({ cls: "sf-book-subtitle-text", text: "Vol. I — Dolor Sit" });
}

/** Mounts a compact library / unplaced / codex sample into `container`. */
export function mountUiStylePreviewSample(container: HTMLElement): void {
	container.empty();

	const view = container.createDiv({ cls: "storyforge-view sf-ui-preview-host" });

	const top = view.createDiv({ cls: "sf-top-panel sf-top-panel--above-codex" });

	const header = top.createDiv({ cls: "sf-top-header" });
	mountSeriesLine(header);
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
 * storytelling-mode mock: series + book header, compact three-chapter navigator (no Unplaced,
 * no drag handles), Codex, and Stats — the same composition StoryForgeView.ts's storytelling
 * face builds. Rooted under `.storyforge-storytelling-view` so the `--sf-storytelling-items-*` /
 * `--sf-storytelling-highlight-*` overrides in styles.css apply the same way they do live.
 */
export function mountStorytellingPreviewSample(container: HTMLElement): void {
	container.empty();

	const view = container.createDiv({ cls: "storyforge-storytelling-view sf-ui-preview-host" });

	const top = view.createDiv({ cls: "sf-top-panel sf-top-panel--above-codex" });
	const header = top.createDiv({ cls: "sf-top-header" });
	mountSeriesLine(header);
	mountBookLine(header);

	const body = top.createDiv({ cls: "sf-top-body" });
	mountNavigatorSample(body);

	mountCodexTreeSample(view.createDiv({ cls: "sf-bottom-panel" }));
	mountStatsSample(view);
}

/** Compact three-chapter navigator — same chrome as CodexFocusNavigator.ts / navigatorControls.ts. */
function mountNavigatorSample(body: HTMLElement): void {
	const wrap = body.createDiv({ cls: "sf-navigator" });
	const navBody = wrap.createDiv({ cls: "sf-navigator-body" });
	const leftCol = navBody.createDiv({ cls: "sf-navigator-transport-col" });
	const windowEl = navBody.createDiv({ cls: "sf-top-list sf-navigator-window" });
	const rightCol = navBody.createDiv({ cls: "sf-navigator-transport-col" });

	const tiles: Array<{ title: string; selected?: boolean }> = [
		{ title: "I. Amet Consectetur" },
		{ title: "II. Adipiscing Elit", selected: true },
		{ title: "III. Sed Do Eiusmod" },
	];
	for (const tile of tiles) {
		const row = windowEl.createDiv({ cls: tile.selected ? "sf-row sf-row-selected" : "sf-row" });
		row.createDiv({ cls: "sf-row-text", text: tile.title });
	}

	const transports: Array<{ icon: string; label: string }> = [
		{ icon: ICON_TRANSPORT_TO_START, label: "first chapter" },
		{ icon: ICON_TRANSPORT_PREVIOUS, label: "previous chapter" },
		{ icon: ICON_TRANSPORT_NEXT, label: "next chapter" },
		{ icon: ICON_TRANSPORT_TO_END, label: "last chapter" },
	];
	for (const transport of transports) {
		const btn = leftCol.createSpan({
			cls: "sf-navigator-transport-btn",
			attr: { "aria-label": transport.label },
		});
		setIcon(btn, transport.icon);
	}

	const toggle = rightCol.createSpan({
		cls: "sf-navigator-transport-btn sf-navigator-transport-toggle",
		attr: { "aria-label": "continuous reading mode" },
	});
	setIcon(toggle, ICON_CONTINUOUS_MODE);
}

function mountStatsSample(container: HTMLElement): void {
	const stats = container.createDiv({ cls: "sf-stats-panel" });
	const line = stats.createDiv({ cls: "sf-stats-line" });
	setIcon(line.createSpan({ cls: "sf-icon sf-stats-chart sf-stats-chart--button", attr: { "aria-label": "wordcount history" } }), ICON_DASHBOARD_CHART);
	line.createSpan({ cls: "sf-stats-value", text: "daily: 312" });
}

/** One Story Context tab's worth of representative body content, keyed by the same ids used in `mountRightSidebarPreviewSample`'s clickable tab row. */
type RecommendTabId = "novel" | "chapter";
export type RightSidebarPreviewMode = "chrome" | "novel" | "chapter" | "box" | "details" | "dossier" | "archive";
export type PreviewMainThread = { color: string; text: string };

const PREVIEW_MAIN_THREAD_FALLBACK: PreviewMainThread = {
	color: MAIN_THREAD_FALLBACK_COLOR,
	text: "#1c1917",
};

function mountRecommendMetaNames(meta: HTMLElement, label: string, names: string[]): void {
	const row = meta.createDiv({ cls: "sf-recommend-meta-row" });
	row.createSpan({ cls: "sf-recommend-meta-label", text: label });
	const values = row.createSpan({ cls: "sf-recommend-meta-values" });
	names.forEach((name, index) => {
		values.createSpan({
			cls: "sf-recommend-meta-value",
			text: index < names.length - 1 ? `${name},` : name,
		});
	});
}

function mountRecommendPillCard(
	parent: HTMLElement,
	variant: "capture" | "holding" | "resolved" | "unknown",
	title: string,
	fill: (section: HTMLElement) => void,
): void {
	const card = parent.createDiv({
		cls: `sf-recommend-plot-block sf-recommend-plot-block--plain ${
			variant === "unknown" ? "sf-recommend-unknown-card" : `sf-recommend-pill-card sf-recommend-pill-card--${variant}`
		}`,
	});
	const section = card.createDiv({ cls: "sf-recommend-section" });
	section.createDiv({ cls: "sf-recommend-section-title", text: title });
	fill(section);
}

function mountRecommendBoxBody(body: HTMLElement, mainThread: PreviewMainThread): void {
	body.addClass("sf-recommend-body--scroll");
	mountRecommendChapterCard(body, mainThread);
	mountRecommendPillCard(body, "capture", "Details to capture", (section) => {
		const entity = section.createDiv({ cls: "sf-recommend-entity-header" });
		entity.createSpan({ cls: "sf-recommend-entity-name", text: "Jane Protagonist" });
		mountRecommendHitCard(section, "solid", "The old locket felt heavier than it looked.");
	});
	mountRecommendPillCard(body, "holding", "Holding area", (section) => {
		const entity = section.createDiv({ cls: "sf-recommend-entity-header" });
		entity.createSpan({ cls: "sf-recommend-entity-name", text: "The Harbour" });
		mountRecommendHitCard(section, "ambiguous", "A storm was rolling in from the coast.");
	});
	mountRecommendPillCard(body, "resolved", "Resolved", (section) => {
		const entity = section.createDiv({ cls: "sf-recommend-entity-header" });
		entity.createSpan({ cls: "sf-recommend-entity-name", text: "Jane Protagonist" });
		mountRecommendHitCard(section, "solid", "Jane paused at the doorway.");
	});
}

function mountRecommendNovelBody(body: HTMLElement, mainThread: PreviewMainThread): void {
	const fixed = body.createDiv({ cls: "sf-recommend-fixed sf-recommend-novel-fixed" });
	fixed.createDiv({ cls: "sf-synopsis-cover sf-recommend-novel-cover" });
	fixed.createDiv({ cls: "sf-recommend-novel-title", text: "Ipsum Liber" });
	fixed.createDiv({ cls: "sf-recommend-novel-subtitle", text: "Vol. I — Dolor Sit" });
	const wrap = fixed.createDiv({ cls: "sf-recommend-novel-synopsis-wrap" });
	wrap.setCssStyles({
		marginLeft: "2px",
		width: "calc(100% - 2px)",
		backgroundColor: mainThread.color,
	});
	wrap.createDiv({ cls: "sf-recommend-novel-synopsis-thread-cap" }).setCssStyles({ backgroundColor: mainThread.color });
	wrap.createEl("textarea", {
		cls: "sf-recommend-synopsis sf-recommend-novel-synopsis sf-recommend-novel-synopsis--thread",
		text: "A brief synopsis of the novel goes here.",
		attr: { readonly: "true", rows: "3" },
	});

	const previewPlotThreads: Array<PreviewMainThread> = [
		mainThread,
		{ color: "#2563eb", text: "#f8fafc" },
	];
	const lineColors = previewPlotThreads.map((t) => t.color);
	const pitch = 4;
	const bundleWidth = (lineColors.length - 1) * pitch + 2;
	const lineOffsets = lineColors.map((_, i) => 2 + i * pitch);
	const gutter = {
		lineOffsets,
		cardShift: 2 + bundleWidth + 8,
		background: {
			backgroundImage: lineColors.map((c) => `linear-gradient(${c}, ${c})`).join(", "),
			backgroundSize: lineColors.map(() => "2px 100%").join(", "),
			backgroundPosition: lineOffsets.map((x) => `${x}px 0`).join(", "),
			backgroundRepeat: "no-repeat",
		},
	};

	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	scroll.setCssStyles({ ...gutter.background, backgroundAttachment: "local" });
	const chapters: Array<{ title: string; place: string; summary: string; line: number }> = [
		{ title: "I. Amet Consectetur", place: "The Harbour", summary: "Chapter summary goes here.", line: 0 },
		{ title: "II. Adipiscing Elit", place: "The Harbour", summary: "The next chapter begins at dusk.", line: 1 },
	];
	for (const chapter of chapters) {
		const thread = previewPlotThreads[chapter.line];
		const block = scroll.createDiv({ cls: "sf-recommend-plot-block sf-recommend-plot-block--plain" });
		const headerRow = block.createDiv({ cls: "sf-recommend-plot-header-row" });
		const nameEl = headerRow.createDiv({ cls: "sf-recommend-plot-chapter-name", text: chapter.title });
		headerRow.setCssStyles({ color: thread.text });
		nameEl.setCssStyles({ color: thread.text });
		block.style.setProperty("--sf-plot-card-header-bg", thread.color);
		block.style.setProperty("--sf-plot-card-header-fg", thread.text);
		block.style.setProperty("--sf-plot-card-outline", thread.color);
		const lineCenterX = gutter.lineOffsets[chapter.line] + 1;
		const cardPad = 16;
		const headerMarginLeft = lineCenterX - gutter.cardShift - cardPad;
		block.setCssStyles({
			marginLeft: `${gutter.cardShift}px`,
		});
		headerRow.setCssStyles({ marginLeft: `${headerMarginLeft}px` });
		headerRow.style.paddingLeft = `${cardPad + Math.max(0, -cardPad - headerMarginLeft)}px`;
		const plotMeta = block.createDiv({ cls: "sf-recommend-meta" });
		mountRecommendMetaNames(plotMeta, "PoV:", ["Jane Protagonist"]);
		mountRecommendMetaNames(plotMeta, "Location:", [chapter.place]);
		block.createDiv({ cls: "sf-recommend-plot-textarea-divider" });
		block.createEl("textarea", {
			cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
			text: chapter.summary,
			attr: { readonly: "true", rows: "2" },
		});
	}
}

function mountRecommendHitCard(scroll: HTMLElement, tier: string, sentence: string): void {
	const card = scroll.createDiv({ cls: `sf-recommend-hit sf-recommend-hit-${tier}` });
	const meta = card.createDiv({ cls: "sf-recommend-hit-meta" });
	meta.createSpan({ cls: `sf-recommend-tier sf-recommend-tier-${tier}`, text: tier });
	meta.createSpan({ cls: "sf-recommend-lens", text: "name" });
	card.createDiv({ cls: "sf-recommend-hit-span", text: sentence });
	const actions = card.createDiv({ cls: "sf-recommend-hit-actions" });
	if (tier === "ambiguous") {
		actions.createEl("button", { text: "Jane Protagonist" });
		actions.createEl("button", { text: "The Harbour" });
		return;
	}
	setIcon(actions.createSpan({ cls: "sf-recommend-icon-btn", attr: { "aria-label": "detail added/accepted" } }), ICON_CHECK_SQUARE);
	setIcon(actions.createSpan({ cls: "sf-recommend-icon-btn", attr: { "aria-label": "ignore this detail" } }), ICON_MINUS_SQUARE);
}

/** Chapter-tab card: header band, PoV/Location, synopsis, Codex rows, actions, unknown names. */
function mountRecommendChapterCard(body: HTMLElement, mainThread: PreviewMainThread): void {
	const card = body.createDiv({
		cls: "sf-recommend-plot-block sf-recommend-plot-block--plain sf-recommend-plot-block--chapter",
	});
	const titleShadow = resolveTitleShadow(body.ownerDocument, mainThread.text, mainThread.color);
	body.style.setProperty("--sf-plot-card-header-bg", mainThread.color);
	body.style.setProperty("--sf-plot-card-header-fg", mainThread.text);
	body.style.setProperty("--sf-plot-card-outline", mainThread.color);
	body.style.setProperty("--sf-plot-card-title-shadow", titleShadow);
	card.style.setProperty("--sf-plot-card-header-bg", mainThread.color);
	card.style.setProperty("--sf-plot-card-header-fg", mainThread.text);
	card.style.setProperty("--sf-plot-card-title-shadow", titleShadow);
	card.style.setProperty("--sf-plot-card-outline", mainThread.color);
	const header = card.createDiv({ cls: "sf-recommend-plot-header-row" });
	header.setCssStyles({ color: mainThread.text });
	const nameEl = header.createDiv({ cls: "sf-recommend-plot-chapter-name", text: "I. Amet Consectetur" });
	nameEl.setCssStyles({ color: mainThread.text });
	const meta = card.createDiv({ cls: "sf-recommend-meta" });
	mountRecommendMetaNames(meta, "PoV:", ["Jane Protagonist"]);
	mountRecommendMetaNames(meta, "Location:", ["The Harbour"]);
	card.createEl("textarea", {
		cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
		text: "Chapter summary goes here.",
		attr: { readonly: "true", rows: "2" },
	});

	const chars = card.createDiv({ cls: "sf-recommend-section" });
	chars.createDiv({ cls: "sf-recommend-section-title", text: "Characters in chapter" });
	const charList = chars.createDiv({ cls: "sf-recommend-match-list" });
	const jane = charList.createSpan({ cls: "sf-recommend-match-item" });
	setIcon(jane.createSpan({ cls: "sf-icon sf-recommend-match-icon" }), ICON_PERSON);
	jane.createSpan({ cls: "sf-recommend-match-label", text: "Jane Protagonist," });
	const alex = charList.createSpan({ cls: "sf-recommend-match-item" });
	setIcon(alex.createSpan({ cls: "sf-icon sf-recommend-match-icon" }), ICON_PERSON);
	alex.createSpan({ cls: "sf-recommend-match-label", text: "Alex" });

	const others = card.createDiv({ cls: "sf-recommend-section" });
	others.createDiv({ cls: "sf-recommend-section-title", text: "Other Codex references" });
	const otherList = others.createDiv({ cls: "sf-recommend-match-list" });
	const harbour = otherList.createSpan({ cls: "sf-recommend-match-item" });
	setIcon(harbour.createSpan({ cls: "sf-icon sf-recommend-match-icon" }), ICON_MAP_PIN);
	harbour.createSpan({ cls: "sf-recommend-match-label", text: "The Harbour" });

	const actions = body.createDiv({ cls: "sf-recommend-chapter-card-actions" });
	setIcon(actions.createSpan({ cls: "sf-recommend-icon-btn" }), ICON_TARGET_DUOTONE);
	setIcon(actions.createSpan({ cls: "sf-recommend-icon-btn" }), ICON_ADD_CIRCLE);
	const wordcount = actions.createDiv({ cls: "sf-recommend-chapter-wordcount" });
	setIcon(wordcount.createSpan({ cls: "sf-icon sf-recommend-chapter-wordcount-icon" }), ICON_DASHBOARD_CHART);
	wordcount.createSpan({ cls: "sf-recommend-chapter-wordcount-value", text: "1,234" });

	const unknown = body.createDiv({
		cls: "sf-recommend-plot-block sf-recommend-plot-block--plain sf-recommend-unknown-card",
	});
	const unknownSection = unknown.createDiv({ cls: "sf-recommend-section" });
	unknownSection.createDiv({ cls: "sf-recommend-section-title", text: "Named but not in Codex" });
	renderStampedEmptyCross(unknownSection, "None found.");
}

function mountRecommendChapterBody(body: HTMLElement, mainThread: PreviewMainThread): void {
	body.addClass("sf-recommend-body--scroll");
	mountRecommendChapterCard(body, mainThread);
}

function mountNotebookDossierPreview(body: HTMLElement): void {
	const split = body.createDiv({ cls: "sf-idea-shelf" });
	const rail = split.createDiv({ cls: "sf-codex-side-actions sf-notebook-source-rail" });
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn" }), ICON_NOTEBOOK_DUOTONE);
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn" }), ICON_CODEX);
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn is-active" }), ICON_CLIPBOARD_LIST_DUOTONE);
	const page = split.createDiv({ cls: "sf-notebook-page sf-dossier-page" });
	const scroll = page.createDiv({ cls: "sf-recommend-scroll" });
	const chSection = scroll.createDiv({ cls: "sf-recommend-section" });
	chSection.createDiv({ cls: "sf-recommend-section-title", text: "I. Amet Consectetur" });
	mountRecommendHitCard(chSection, "matched", "Jane paused at the doorway.");
	const index = split.createDiv({ cls: "sf-notebook-index sf-bottom-panel" });
	const tree = index.createDiv({ cls: "sf-codex-tree" });
	const selected = tree.createDiv({ cls: "sf-row sf-row-selected sf-codex-file" });
	selected.createSpan({ cls: "sf-row-text", text: "Jane Protagonist" });
}

function mountArchiveSplitPreview(body: HTMLElement): void {
	const split = body.createDiv({ cls: "sf-idea-shelf sf-archive-shelf" });
	const rail = split.createDiv({ cls: "sf-codex-side-actions sf-notebook-source-rail" });
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn is-active" }), ICON_CODEX);
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn" }), ICON_BOOK_DUOTONE);
	setIcon(rail.createSpan({ cls: "sf-notebook-source-btn" }), ICON_NOTEBOOK_DUOTONE);
	split.createDiv({ cls: "sf-notebook-page sf-archive-page" });
	const index = split.createDiv({ cls: "sf-notebook-index sf-bottom-panel" });
	const tree = index.createDiv({ cls: "sf-codex-tree" });
	const selected = tree.createDiv({ cls: "sf-codex-file sf-row-selected" });
	selected.createSpan({ cls: "sf-row-text", text: "Magna Aliqua" });
	const rest = tree.createDiv({ cls: "sf-codex-file" });
	rest.createSpan({ cls: "sf-row-text", text: "Ut Enim Ad Minim" });
}

/**
 * Mounts Story Context / Archive chrome samples for the right-sidebar tab. Navigation (`chrome`)
 * shows the tab strip, Forge-family member row, and Focus-mode icon. Chapter (`box`) shows the
 * chapter card (header, labels, synopsis, Codex rows) plus pill cards. Novel/Chapter remount that
 * tab's body. Dossier (`details` / `dossier`) shows Notebook with the Dossier rail icon active.
 * Story Context's own tab row is clickable, same as the real panel.
 */
export function mountRightSidebarPreviewSample(
	container: HTMLElement,
	mode: RightSidebarPreviewMode = "chrome",
	mainThread: PreviewMainThread = PREVIEW_MAIN_THREAD_FALLBACK,
): void {
	container.empty();

	const rail = container.createDiv({ cls: "sf-right-rail-preview" });

	const recommend = rail.createDiv({ cls: "sf-recommend-view" });
	const recTabs = recommend.createDiv({ cls: "sf-recommend-tabs" });
	const forgeRow = recommend.createDiv({ cls: "sf-recommend-view__forge-row sf-settings-hidden" });
	const recBody = recommend.createDiv({ cls: "sf-recommend-body" });
	const archive = recommend.createDiv({ cls: "sf-archive-embedded sf-settings-hidden" });
	const focusRow = recommend.createDiv({
		cls: "sf-recommend-view__forge-row sf-recommend-view__forge-row--focus sf-settings-hidden",
	});

	setIcon(forgeRow.createSpan({ cls: "sf-recommend-view__forge-icon is-active" }), ICON_TITLEFORGE);
	setIcon(forgeRow.createSpan({ cls: "sf-recommend-view__forge-icon" }), ICON_MEEPLE);
	const focusMembers = focusRow.createDiv({ cls: "sf-recommend-view__forge-members" });
	setIcon(focusMembers.createSpan({ cls: "sf-recommend-view__forge-icon is-active" }), ICON_TITLEFORGE);
	setIcon(focusMembers.createSpan({ cls: "sf-recommend-view__forge-icon" }), ICON_MEEPLE);
	const focusIcon = focusRow.createSpan({
		cls: "sf-recommend-view__forge-family",
		attr: { "aria-label": "Focus mode icon" },
	});
	setIcon(focusIcon, ICON_FORGE);

	const tabButtons: Partial<Record<RecommendTabId, HTMLElement>> = {};
	let archiveBtn!: HTMLElement;
	let forgeBtn!: HTMLElement;
	let ideasBtn!: HTMLElement;
	const hideOverlayRows = () => {
		forgeRow.addClass("sf-settings-hidden");
		focusRow.addClass("sf-settings-hidden");
		focusMembers.removeClass("is-expanded");
	};
	const showNotebookDossier = () => {
		for (const btn of Object.values(tabButtons)) btn?.removeClass("is-active");
		archiveBtn.removeClass("is-active");
		forgeBtn.removeClass("is-active");
		ideasBtn.addClass("is-active");
		hideOverlayRows();
		recBody.toggleClass("sf-settings-hidden", false);
		archive.addClass("sf-settings-hidden");
		recBody.empty();
		mountNotebookDossierPreview(recBody);
	};
	const showRecommendTab = (id: RecommendTabId) => {
		for (const [tabId, btn] of Object.entries(tabButtons)) btn?.toggleClass("is-active", tabId === id);
		archiveBtn.removeClass("is-active");
		forgeBtn.removeClass("is-active");
		ideasBtn.removeClass("is-active");
		hideOverlayRows();
		recBody.toggleClass("sf-settings-hidden", false);
		archive.addClass("sf-settings-hidden");
		recBody.empty();
		if (id === "novel") mountRecommendNovelBody(recBody, mainThread);
		else mountRecommendChapterBody(recBody, mainThread);
	};
	const showArchiveTab = () => {
		for (const btn of Object.values(tabButtons)) btn?.removeClass("is-active");
		forgeBtn.removeClass("is-active");
		ideasBtn.removeClass("is-active");
		hideOverlayRows();
		archiveBtn.addClass("is-active");
		recBody.toggleClass("sf-settings-hidden", false);
		archive.addClass("sf-settings-hidden");
		recBody.empty();
		mountArchiveSplitPreview(recBody);
	};
	const showForgeTab = () => {
		for (const btn of Object.values(tabButtons)) btn?.removeClass("is-active");
		archiveBtn.removeClass("is-active");
		ideasBtn.removeClass("is-active");
		forgeBtn.addClass("is-active");
		hideOverlayRows();
		forgeRow.removeClass("sf-settings-hidden");
		focusRow.removeClass("sf-settings-hidden");
		focusMembers.addClass("is-expanded");
		recBody.addClass("sf-settings-hidden");
		archive.addClass("sf-settings-hidden");
	};

	const tabIcons: Record<RecommendTabId, string> = {
		novel: ICON_BOOK_DUOTONE,
		chapter: ICON_BOOK_OPEN_FILLED,
	};
	(["novel", "chapter"] as RecommendTabId[]).forEach((id) => {
		const btn = recTabs.createSpan({ cls: "sf-recommend-tab" });
		setIcon(btn.createSpan({ cls: "sf-layout-tab-icon" }), tabIcons[id]);
		tabButtons[id] = btn;
		btn.addEventListener("click", () => showRecommendTab(id));
	});
	ideasBtn = recTabs.createSpan({ cls: "sf-recommend-tab" });
	setIcon(ideasBtn.createSpan({ cls: "sf-layout-tab-icon" }), ICON_NOTEBOOK_DUOTONE);
	ideasBtn.addEventListener("click", () => showNotebookDossier());
	forgeBtn = recTabs.createSpan({ cls: "sf-recommend-tab sf-recommend-tab--forge-family" });
	setIcon(forgeBtn.createSpan({ cls: "sf-layout-tab-icon" }), ICON_FORGE);
	forgeBtn.addEventListener("click", () => showForgeTab());
	archiveBtn = recTabs.createSpan({ cls: "sf-recommend-tab sf-recommend-tab--archive" });
	setIcon(archiveBtn.createSpan({ cls: "sf-layout-tab-icon" }), ICON_ARCHIVE);
	archiveBtn.addEventListener("click", () => showArchiveTab());

	const showCustomBody = (mount: (el: HTMLElement) => void) => {
		for (const btn of Object.values(tabButtons)) btn?.removeClass("is-active");
		archiveBtn.removeClass("is-active");
		forgeBtn.removeClass("is-active");
		ideasBtn.removeClass("is-active");
		hideOverlayRows();
		archive.addClass("sf-settings-hidden");
		recBody.toggleClass("sf-settings-hidden", false);
		recBody.empty();
		mount(recBody);
	};

	if (mode === "archive") showArchiveTab();
	else if (mode === "chrome") showForgeTab();
	else if (mode === "chapter" || mode === "novel") showRecommendTab(mode);
	else if (mode === "details" || mode === "dossier") showNotebookDossier();
	else if (mode === "box") {
		showCustomBody((el) => mountRecommendBoxBody(el, mainThread));
		tabButtons.chapter?.addClass("is-active");
	} else showRecommendTab("novel");
}
