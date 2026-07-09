import { App, TFile, TFolder } from "obsidian";
import { bookFilePath, seriesFilePath, codexFilePath, CODEX_ROOT } from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { getLibraryBookFolders, getSeriesBookEntry, upsertSeriesBookEntry } from "./series";
import { mintId } from "./slug";
import { mintFolderId, type CodexFolders } from "./codexTree";

const DEFAULT_SERIES_CONTENT = `---\nseries-title: Untitled Series\norder:\nbooks:\n---\n`;
const DEFAULT_CODEX_CONTENT = `---\nfolders:\norder:\narchive:\n---\n`;

/**
 * Migrates the old plain `title`/`id` schema (series.md's `title`, each
 * book.md's `id`/`title`) to the series-centralized schema. Also renames
 * legacy `order` to `chapter-order` in each book.md. Every step only acts
 * when the legacy field is still present, so this is safe to run
 * unconditionally on every load — a second run is a true no-op — and it
 * never re-mints an id for a folder that already had one.
 */
export async function migrateVaultSchema(app: App): Promise<void> {
	await migrateSeriesTitleField(app);
	await migrateSeriesIdField(app);
	await migrateCodexSchema(app);
	for (const folder of getLibraryBookFolders(app)) {
		await migrateLegacyBookEntry(app, folder.name);
	}
	for (const folder of getLibraryBookFolders(app)) {
		await migrateChapterOrderField(app, folder.name);
	}
}

async function migrateSeriesTitleField(app: App): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		if (typeof fm.title === "string" && typeof fm["series-title"] !== "string") {
			fm["series-title"] = fm.title;
		}
		delete fm.title;
		if (!fm.books || typeof fm.books !== "object") fm.books = {};
	});
}

/**
 * Mints a `series-id` if none is present yet. Vaults have no folder of their
 * own to derive a stable id from (unlike books), so the vault name stands in
 * as the structural analog — deliberately not `series-title`, since the id
 * must never move when the title is renamed. Safe to re-run: a second pass
 * finds `series-id` already set and no-ops.
 */
async function migrateSeriesIdField(app: App): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const hasId = typeof fm["series-id"] === "string" && fm["series-id"].trim() !== "";
		if (!hasId) {
			fm["series-id"] = mintId(app.vault.getName(), []);
		}
	});
}

function uniqueFlatCodexPath(baseName: string, taken: ReadonlySet<string>): string {
	let candidate = `${CODEX_ROOT}/${baseName}.md`;
	if (!taken.has(candidate)) return candidate;
	let n = 2;
	while (taken.has(`${CODEX_ROOT}/${baseName} ${n}.md`)) n++;
	return `${CODEX_ROOT}/${baseName} ${n}.md`;
}

/**
 * One-time: flattens any real nested Codex folders into the new virtual-folder
 * scheme (`_sf-backstage/codex.md`). Real files that were nested get moved up to
 * sit flat directly under `Codex/` via the link-safe rename API (preserving
 * existing wikilinks); files already flat are registered in place, no rename.
 * Guarded on `codex.md` not existing yet, so this only ever runs once per vault.
 */
async function migrateCodexSchema(app: App): Promise<void> {
	if (app.vault.getAbstractFileByPath(codexFilePath())) return;

	const root = app.vault.getAbstractFileByPath(CODEX_ROOT);
	if (!(root instanceof TFolder)) {
		await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, () => {
			/* nothing to seed — Codex/ doesn't exist yet */
		});
		return;
	}

	const folders: CodexFolders = {};
	const rootOrder: string[] = [];
	const takenPaths = new Set<string>();
	for (const child of root.children) {
		if (child instanceof TFile && child.extension === "md") takenPaths.add(child.path);
	}

	async function walk(folder: TFolder, parentOrder: string[]): Promise<void> {
		const children = [...folder.children];
		for (const child of children) {
			if (child instanceof TFolder) {
				const id = mintFolderId(child.name, folders);
				folders[id] = { name: child.name, order: [] };
				parentOrder.push(id);
				await walk(child, folders[id].order);
			} else if (child instanceof TFile && child.extension === "md") {
				if (folder.path === CODEX_ROOT) {
					parentOrder.push(child.path);
					continue;
				}
				const newPath = uniqueFlatCodexPath(child.basename, takenPaths);
				takenPaths.add(newPath);
				await app.fileManager.renameFile(child, newPath);
				parentOrder.push(newPath);
			}
		}
	}

	await walk(root, rootOrder);

	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		fm.folders = folders;
		fm.order = rootOrder;
		fm.archive = [];
	});
}

async function migrateLegacyBookEntry(app: App, folderName: string): Promise<void> {
	const path = bookFilePath(folderName);
	if (!app.vault.getAbstractFileByPath(path)) return;

	const fm = app.metadataCache.getCache(path)?.frontmatter;
	const legacyId = typeof fm?.id === "string" ? fm.id : null;
	const legacyTitle = typeof fm?.title === "string" ? fm.title : null;
	if (!legacyId && !legacyTitle) return;

	if (legacyId && !getSeriesBookEntry(app, folderName)) {
		await upsertSeriesBookEntry(app, folderName, legacyId, legacyTitle ?? folderName, { appendToOrder: false });
	}

	await modifyBackstageFrontmatter(app, app.vault, path, `---\norder:\n---\n`, (bookFm) => {
		delete bookFm.id;
		delete bookFm.title;
	});
}

/**
 * Renames the legacy `order` YAML key to `chapter-order` if `order` is present
 * and `chapter-order` is not. Safe no-op on re-run.
 */
async function migrateChapterOrderField(app: App, folderName: string): Promise<void> {
	const path = bookFilePath(folderName);
	if (!app.vault.getAbstractFileByPath(path)) return;

	const fm = app.metadataCache.getCache(path)?.frontmatter;
	const hasLegacyOrder = Array.isArray(fm?.order);
	const hasNewOrder = Array.isArray(fm?.["chapter-order"]);
	if (!hasLegacyOrder || hasNewOrder) return;

	await modifyBackstageFrontmatter(app, app.vault, path, `---\norder:\n---\n`, (bookFm) => {
		bookFm["chapter-order"] = bookFm.order;
		delete bookFm.order;
	});
}
