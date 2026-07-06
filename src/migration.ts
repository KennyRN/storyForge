import { App } from "obsidian";
import { bookFilePath, seriesFilePath } from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { getLibraryBookFolders, getSeriesBookEntry, upsertSeriesBookEntry } from "./series";

const DEFAULT_SERIES_CONTENT = `---\nseries-title: Untitled Series\norder:\nbooks:\n---\n`;

/**
 * Migrates the old plain `title`/`id` schema (series.md's `title`, each
 * book.md's `id`/`title`) to the series-centralized schema. Every step only
 * acts when the legacy field is still present, so this is safe to run
 * unconditionally on every load — a second run is a true no-op — and it
 * never re-mints an id for a folder that already had one.
 */
export async function migrateVaultSchema(app: App): Promise<void> {
	await migrateSeriesTitleField(app);
	for (const folder of getLibraryBookFolders(app)) {
		await migrateLegacyBookEntry(app, folder.name);
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
