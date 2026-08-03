/**
 * Versioned host API for xForge siblings (timelineForge, formatForge, …).
 * Access: `app.plugins.getPlugin("storyforge")?.api` — guard `version >= N`.
 *
 * Codex frontmatter create/edit is only for plugins that call
 * `registerCodexWriteException`, and only for essential owned fields.
 * nameForge should not register. languageForge: deferred — do not pre-grant.
 * See docs/xforge-sibling-writes.md.
 *
 * Formatting handoff (version >= 2): see `formattingApi.ts` / `api.formatting`.
 */

import type { App, ViewCreator } from "obsidian";
import {
	collectCodexNotes,
	createCodexNote,
	ensureVirtualFolder,
	getCodexView,
	partitionCodexNotes,
	readCodexFrontmatter,
	registerCodexType as registerCodexTypeInternal,
	setCodexEntryType,
	type CodexTypeOption,
} from "./codex";
import { BACKSTAGE_ROOT, CODEX_ROOT, LIBRARY_ROOT, isCodexNotePath, isLibraryChapterPath } from "./paths";
import { getBookId } from "./series";
import type StoryForgePlugin from "./main";
import {
	type FormatCompanionRegistration,
	type SfLinkedFormattingKey,
	type StoryForgeFormattingApi,
} from "./formattingApi";
import type { PaletteColor, PaletteName } from "./colorPalettes";

/** Bumped to 2 when `formatting` was added for formatForge. */
export const STORYFORGE_API_VERSION = 2 as const;

export interface CodexWriteException {
	pluginId: string;
	types: string[];
	allowFrontmatter: boolean;
	allowBody: boolean;
}

export interface RightRailRegistration {
	viewType: string;
	orderHint: number;
	displayName: string;
	icon: string;
	/** Sibling must already have called `plugin.registerView`; retained for API clarity. */
	factory?: () => ViewCreator;
}

export interface StoryForgeViewContribution {
	slot: string;
	orderHint: number;
	render: (containerEl: HTMLElement) => () => void;
}

export interface StoryForgeHostApi {
	version: typeof STORYFORGE_API_VERSION;
	paths: {
		CODEX_ROOT: typeof CODEX_ROOT;
		LIBRARY_ROOT: typeof LIBRARY_ROOT;
		BACKSTAGE_ROOT: typeof BACKSTAGE_ROOT;
		isCodexNotePath: (path: string) => boolean;
		isLibraryChapterPath: (path: string) => boolean;
	};
	/** formatForge typography / formatting handoff (always present at version 2). */
	formatting: StoryForgeFormattingApi;
	registerCodexWriteException(opt: {
		pluginId: string;
		types: string[];
		allowFrontmatter: boolean;
		allowBody?: boolean;
	}): void;
	mayEditCodexFrontmatter(pluginId: string, type: string): boolean;
	mayEditCodexBody(pluginId: string, type: string): boolean;
	registerCodexType(opt: CodexTypeOption): void;
	ensureVirtualFolder(opt: {
		id: string;
		name: string;
		parentId?: string | null;
	}): Promise<string>;
	createNote(opt: {
		name: string;
		type?: string;
		parentFolderId?: string | null;
		bookId?: string | null;
		content?: string;
	}): Promise<{ path: string }>;
	setType(path: string, type: string): Promise<void>;
	listByType(
		type: string,
		bookId?: string | null,
	): Promise<Array<{ path: string; name: string; bookIds: string[] }>>;
	getCodexView(bookId?: string | null): unknown;
	getActiveBook(): { folderName: string; bookId: string } | null;
	onActiveBookChange(cb: (book: { folderName: string; bookId: string } | null) => void): () => void;
	registerRightRailView(opt: {
		viewType: string;
		factory?: () => ViewCreator;
		orderHint: number;
		displayName: string;
		icon: string;
	}): void;
}

function uniqueCodexFilename(app: App, baseName: string): string {
	const safe = baseName.trim().replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, " ");
	const stem = safe.length > 0 ? safe : "New Note";
	let candidate = `${stem}.md`;
	if (!app.vault.getAbstractFileByPath(`${CODEX_ROOT}/${candidate}`)) return candidate;
	let n = 2;
	while (app.vault.getAbstractFileByPath(`${CODEX_ROOT}/${stem} ${n}.md`)) n++;
	return `${stem} ${n}.md`;
}

const LINKED_FORMATTING_KEYS: SfLinkedFormattingKey[] = [
	"colorPaletteName",
	"colorPaletteVariant",
	"customPaletteColors",
	"highlightActiveChapter",
	"highlightColor",
	"highlightTextColor",
	"librarySeriesTitleFontSize",
	"librarySeriesTitleOverrideFont",
	"librarySeriesTitleFontFamily",
	"librarySeriesTitleFontWeight",
	"librarySeriesTitleColor",
	"librarySeriesTitleSmallCaps",
	"libraryBookTitleFontSize",
	"libraryBookTitleOverrideFont",
	"libraryBookTitleFontFamily",
	"libraryBookTitleFontWeight",
	"libraryBookTitleColor",
	"libraryBookTitleSmallCaps",
	"libraryBookSubtitleFontSize",
	"libraryBookSubtitleOverrideFont",
	"libraryBookSubtitleFontFamily",
	"libraryBookSubtitleFontWeight",
	"libraryBookSubtitleSmallCaps",
	"libraryHeaderDividerBelow",
	"libraryItemsFontSize",
	"libraryItemsOverrideFont",
	"libraryItemsFontFamily",
	"libraryItemsFontWeight",
	"libraryItemsColor",
	"libraryItemsMuted",
	"unplacedHighlightColor",
	"unplacedHighlightTextColor",
	"codexHighlightColor",
	"codexHighlightTextColor",
	"unplacedMuted",
	"unplacedSmallCaps",
	"unplacedColor",
	"unplacedFontSize",
	"unplacedOverrideFont",
	"unplacedFontFamily",
	"unplacedFontWeight",
	"unplacedItemsFontSize",
	"unplacedItemsOverrideFont",
	"unplacedItemsFontFamily",
	"unplacedItemsFontWeight",
	"unplacedItemsColor",
	"unplacedItemsMuted",
	"unplacedUseHeaderColorForAll",
	"codexMuted",
	"codexSmallCaps",
	"codexColor",
	"codexFontSize",
	"codexOverrideFont",
	"codexFontFamily",
	"codexFontWeight",
	"codexFolderFontSize",
	"codexFolderOverrideFont",
	"codexFolderFontFamily",
	"codexFolderFontWeight",
	"codexFolderColor",
	"codexFolderIndicatorThickness",
	"codexNoteLabelFontSize",
	"codexNoteLabelOverrideFont",
	"codexNoteLabelFontFamily",
	"codexNoteLabelFontWeight",
	"codexNoteLabelColor",
	"codexNoteLabelUseDefaultColor",
	"codexNoteLabelUseFolderColor",
	"codexUseHeaderColorForAll",
	"hideSeriesPane",
	"bodyTextOverrideSize",
	"bodyTextSize",
	"heading1OverrideSize",
	"heading1Size",
	"heading2OverrideSize",
	"heading2Size",
	"heading3OverrideSize",
	"heading3Size",
	"heading4OverrideSize",
	"heading4Size",
	"heading5OverrideSize",
	"heading5Size",
	"heading6OverrideSize",
	"heading6Size",
	"cyclingGuideEnabled",
	"cyclingGuideThickness",
	"cyclingGuideColor",
	"cyclingGuideFlagSize",
	"cyclingGuideRoundedLines",
	"cyclingGuideInterval",
	"editorScrollbarThumbColor",
	"editorScrollbarTrackColor",
	"editorScrollbarThickness",
];

export function createHostApi(plugin: StoryForgePlugin): StoryForgeHostApi {
	const writeExceptions: CodexWriteException[] = [];

	const formatting: StoryForgeFormattingApi = {
		version: STORYFORGE_API_VERSION,

		isCompanionActive() {
			return plugin.getFormatCompanion() != null;
		},

		getCompanion() {
			return plugin.getFormatCompanion();
		},

		registerCompanion(reg: FormatCompanionRegistration) {
			return plugin.registerFormatCompanion(reg);
		},

		getLinkedSettings() {
			const s = plugin.getSettings() as unknown as Record<string, unknown>;
			const out = {} as Record<SfLinkedFormattingKey, unknown>;
			for (const key of LINKED_FORMATTING_KEYS) {
				out[key] = s[key];
			}
			return out;
		},

		getLinkedSetting(key) {
			return (plugin.getSettings() as unknown as Record<string, unknown>)[key];
		},

		async updateLinkedSetting(key, value) {
			if (!LINKED_FORMATTING_KEYS.includes(key)) {
				throw new Error(`updateLinkedSetting: ${key} is not an SF-linked formatting key`);
			}
			await plugin.updateSetting(key as keyof ReturnType<StoryForgePlugin["getSettings"]>, value as never);
			plugin.applyLinkedFormattingStyles();
		},

		applyLinkedStyles() {
			plugin.applyLinkedFormattingStyles();
		},

		setStyleVars(vars) {
			plugin.applyHostStyleVars(vars);
		},

		getStyleDocuments() {
			return plugin.getStyleDocuments();
		},

		getPalette() {
			const s = plugin.getSettings();
			return {
				name: s.colorPaletteName,
				variant: s.colorPaletteVariant,
				customColors: s.customPaletteColors,
			};
		},

		async updatePalette(partial) {
			if (partial.name !== undefined) {
				await plugin.updateSetting("colorPaletteName", partial.name as PaletteName);
			}
			if (partial.variant !== undefined) {
				await plugin.updateSetting("colorPaletteVariant", partial.variant);
			}
			if (partial.customColors !== undefined) {
				await plugin.updateSetting("customPaletteColors", partial.customColors as PaletteColor[]);
			}
		},

		registerViewContribution(opt) {
			return plugin.registerViewContribution({
				slot: opt.slot,
				orderHint: opt.orderHint ?? 100,
				render: opt.render,
			});
		},
	};

	const api: StoryForgeHostApi = {
		version: STORYFORGE_API_VERSION,
		paths: {
			CODEX_ROOT,
			LIBRARY_ROOT,
			BACKSTAGE_ROOT,
			isCodexNotePath,
			isLibraryChapterPath,
		},
		formatting,

		registerCodexWriteException(opt) {
			const id = opt.pluginId.trim();
			if (!id) throw new Error("registerCodexWriteException: pluginId is required");
			const types = opt.types.map((t) => t.trim()).filter(Boolean);
			if (types.length === 0) throw new Error("registerCodexWriteException: types must be non-empty");
			const existing = writeExceptions.findIndex((e) => e.pluginId === id);
			const entry: CodexWriteException = {
				pluginId: id,
				types,
				allowFrontmatter: opt.allowFrontmatter,
				allowBody: opt.allowBody === true,
			};
			if (existing >= 0) writeExceptions[existing] = entry;
			else writeExceptions.push(entry);
		},

		mayEditCodexFrontmatter(pluginId, type) {
			return writeExceptions.some(
				(e) => e.pluginId === pluginId && e.allowFrontmatter && e.types.includes(type),
			);
		},

		mayEditCodexBody(pluginId, type) {
			return writeExceptions.some(
				(e) => e.pluginId === pluginId && e.allowBody && e.types.includes(type),
			);
		},

		registerCodexType(opt) {
			registerCodexTypeInternal(opt);
			const sections = { ...plugin.getSettings().codexFactSectionByType };
			if (!sections[opt.type]) {
				sections[opt.type] = "Facts";
				void plugin.updateSetting("codexFactSectionByType", sections);
			}
		},

		ensureVirtualFolder(opt) {
			return ensureVirtualFolder(plugin.app, opt);
		},

		async createNote(opt) {
			const filename = uniqueCodexFilename(plugin.app, opt.name);
			let content = opt.content ?? "";
			if (opt.bookId && !/^---\r?\n/.test(content)) {
				content = `---\nbook: ${opt.bookId}\n---\n\n${content}`;
			}
			const file = await createCodexNote(plugin.app, opt.parentFolderId ?? null, {
				filename,
				content,
			});
			if (opt.type) {
				await setCodexEntryType(plugin.app, file.path, opt.type);
			}
			return { path: file.path };
		},

		setType(path, type) {
			return setCodexEntryType(plugin.app, path, type);
		},

		async listByType(type, bookId = null) {
			const { types } = readCodexFrontmatter(plugin.app);
			const notes = collectCodexNotes(plugin.app);
			const { codex } = partitionCodexNotes(notes, bookId ?? null);
			return codex
				.filter((n) => types[n.path] === type)
				.map((n) => ({
					path: n.path,
					name: n.path.replace(/^Codex\//, "").replace(/\.md$/i, ""),
					bookIds: [...n.bookIds],
				}));
		},

		getCodexView(bookId) {
			return getCodexView(plugin.app, bookId ?? null, "codex");
		},

		getActiveBook() {
			const folderName = plugin.getSettings().selectedNovel;
			if (!folderName) return null;
			const bookId = getBookId(plugin.app, folderName);
			if (!bookId) return null;
			return { folderName, bookId };
		},

		onActiveBookChange(cb) {
			return plugin.addActiveBookListener(cb);
		},

		registerRightRailView(opt) {
			plugin.registerHostedRightRailView({
				viewType: opt.viewType,
				orderHint: opt.orderHint,
				displayName: opt.displayName,
				icon: opt.icon,
				factory: opt.factory,
			});
		},
	};

	return api;
}
