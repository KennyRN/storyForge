import {
	ICON_ARCHIVE,
	ICON_BOOK,
	ICON_BOOK_PLUS,
	ICON_CALENDAR,
	ICON_CODEX,
	ICON_DASHBOARD_CHART,
	ICON_EXCHANGE,
	ICON_FILTER,
	ICON_FOLDER_PLUS,
	ICON_PLUS_SQUARE,
	ICON_SERIES,
	ICON_TIMELINE,
	ICON_TOOLS,
	ICON_UNARCHIVE,
	ICON_UNPLACED,
} from "./icons";

export interface IconRegistryEntry {
	id: string;
	label: string;
	source: "custom" | "lucide";
	/** Where this icon is currently wired up, as "File.ts — what it is". Empty means nothing in the app renders it. */
	usedIn: string[];
}

/**
 * Hand-maintained inventory of every icon storyForge renders, custom or stock.
 * There's no way to determine "used or not" by inspecting the compiled plugin
 * at runtime, so this list is the source of truth — update it whenever an
 * icon is added, removed, or rewired to a different spot in the UI.
 */
export const ICON_REGISTRY: IconRegistryEntry[] = [
	// Custom (registered via addIcon in icons.ts)
	{ id: ICON_UNPLACED, label: "Unplaced", source: "custom", usedIn: ["TopPanel.ts — Unplaced section header (books & chapters)"] },
	{
		id: ICON_ARCHIVE,
		label: "Archive",
		source: "custom",
		usedIn: [
			"TopPanel.ts — archive button (chapters' Unplaced header)",
			"BottomPanel.ts — Codex archive button",
			"ArchiveModal.ts — modal header",
			"CodexArchiveModal.ts — modal header",
		],
	},
	{
		id: ICON_UNARCHIVE,
		label: "Unarchive",
		source: "custom",
		usedIn: ["ArchiveModal.ts — unarchive row button", "CodexArchiveModal.ts — unarchive row button"],
	},
	{ id: ICON_CODEX, label: "Codex", source: "custom", usedIn: ["BottomPanel.ts — Codex panel header"] },
	{ id: ICON_SERIES, label: "Series", source: "custom", usedIn: ["TopPanel.ts — series header line", "StoryForgeView.ts — view tab icon"] },
	{ id: ICON_BOOK, label: "Book", source: "custom", usedIn: ["TopPanel.ts — book header line"] },
	{ id: ICON_FILTER, label: "Settings", source: "custom", usedIn: ["TopPanel.ts — series settings button"] },
	{
		id: ICON_TIMELINE,
		label: "Synopsis and plot",
		source: "custom",
		usedIn: ["TopPanel.ts — book synopsis/plot settings button"],
	},
	{
		id: ICON_BOOK_PLUS,
		label: "New book",
		source: "custom",
		usedIn: ["TopPanel.ts — new book button (Unplaced header)", "SeriesModal.ts — add book button"],
	},
	{ id: ICON_DASHBOARD_CHART, label: "Stats dashboard", source: "custom", usedIn: ["StatsPanel.ts — stats header"] },
	{ id: ICON_EXCHANGE, label: "Cycle stats mode", source: "custom", usedIn: ["StatsPanel.ts — mode switch button"] },
	{ id: ICON_CALENDAR, label: "History", source: "custom", usedIn: ["StatsPanel.ts — history button"] },
	{ id: ICON_TOOLS, label: "Tools panel", source: "custom", usedIn: ["ToolsPanel.ts — view tab icon"] },
	{ id: ICON_FOLDER_PLUS, label: "New folder", source: "custom", usedIn: ["BottomPanel.ts — new Codex folder button"] },
	{
		id: ICON_PLUS_SQUARE,
		label: "New file",
		source: "custom",
		usedIn: ["TopPanel.ts — new chapter button (default)", "BottomPanel.ts — new Codex note button"],
	},

	// Stock (Lucide icons bundled with Obsidian, referenced by name)
	{
		id: "grip-vertical",
		label: "Drag handle",
		source: "lucide",
		usedIn: ["SeriesModal.ts — book row drag handle", "TopPanel.ts — row drag handle", "BottomPanel.ts — Codex row/folder drag handle"],
	},
	{
		id: "chevron-right",
		label: "Collapsed section",
		source: "lucide",
		usedIn: ["StoryForgeSettingsTab.ts — foldable section header", "BottomPanel.ts — Codex folder collapse chevron"],
	},
	{
		id: "chevron-down",
		label: "Expanded section",
		source: "lucide",
		usedIn: ["StoryForgeSettingsTab.ts — foldable section header", "BottomPanel.ts — Codex folder collapse chevron"],
	},
];
