/**
 * Versioned host API for xForge siblings (timelineForge, …).
 * Access: `app.plugins.getPlugin("storyforge")?.api` — guard `version >= 1`.
 *
 * Codex frontmatter create/edit is only for plugins that call
 * `registerCodexWriteException`, and only for essential owned fields.
 * nameForge should not register. languageForge: deferred — do not pre-grant.
 * See docs/xforge-sibling-writes.md.
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

export const STORYFORGE_API_VERSION = 1 as const;

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

export interface StoryForgeHostApi {
	version: typeof STORYFORGE_API_VERSION;
	paths: {
		CODEX_ROOT: typeof CODEX_ROOT;
		LIBRARY_ROOT: typeof LIBRARY_ROOT;
		BACKSTAGE_ROOT: typeof BACKSTAGE_ROOT;
		isCodexNotePath: (path: string) => boolean;
		isLibraryChapterPath: (path: string) => boolean;
	};
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

export function createHostApi(plugin: StoryForgePlugin): StoryForgeHostApi {
	const writeExceptions: CodexWriteException[] = [];

	const api: StoryForgeHostApi = {
		version: STORYFORGE_API_VERSION,
		paths: {
			CODEX_ROOT,
			LIBRARY_ROOT,
			BACKSTAGE_ROOT,
			isCodexNotePath,
			isLibraryChapterPath,
		},

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
