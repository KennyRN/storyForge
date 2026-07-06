import { App, Plugin, TFile, TFolder } from "obsidian";
import { extractFingerprint } from "./fingerprint";
import {
	BACKSTAGE_ROOT,
	LIBRARY_ROOT,
	bookBackstagePath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	isLibraryChapterPath,
} from "./paths";
import { readBookFrontmatter, writeBookOrder, getBookChapters, renameChapterEntry } from "./book";
import { getLibraryBookFolders, renameSeriesBookEntry } from "./series";
import { renameChapterSidecar, readStoredFingerprint, listSidecarFilenames } from "./chapterSidecar";
import { renameBackstagePath } from "./writeGuard";
import { matchOrphansExact, matchOrphansByFingerprint, type OrphanCandidate } from "./orphanMatching";

export { matchOrphansExact, matchOrphansByFingerprint, type OrphanCandidate };

/**
 * On load, auto-resolves only unambiguous exact-name orphans (tier 1).
 * Everything else stays a visible orphan until the user confirms a
 * fingerprint suggestion (tier 2, computed separately by `suggestOrphanMatches`).
 */
export async function reconcileBookOnLoad(app: App, bookFolderName: string): Promise<void> {
	const { orphans, unplaced } = getBookChapters(app, bookFolderName);
	if (orphans.length === 0) return;

	const unplacedNames = unplaced.map((f) => f.name);
	const exact = matchOrphansExact(orphans, unplacedNames);
	if (exact.size === 0) return;

	const fm = readBookFrontmatter(app, bookFolderName);
	if (!fm) return;
	const newOrder = fm.order.map((entry) => exact.get(entry) ?? entry);
	await writeBookOrder(app, bookFolderName, newOrder);
}

/** Computes tier-2 fingerprint suggestions for a book's remaining orphans, for the UI to offer as confirmable candidates. */
export async function suggestOrphanMatches(app: App, bookFolderName: string): Promise<OrphanCandidate[]> {
	const { orphans, unplaced } = getBookChapters(app, bookFolderName);
	if (orphans.length === 0) return [];

	const orphanFingerprints = await Promise.all(
		orphans.map(async (name) => ({
			name,
			fingerprint: (await readStoredFingerprint(app, bookFolderName, name)) ?? { opening: "", closing: "" },
		})),
	);
	const unplacedFingerprints = await Promise.all(
		unplaced.map(async (file) => ({
			name: file.name,
			fingerprint: extractFingerprint(await app.vault.read(file)),
		})),
	);

	return matchOrphansByFingerprint(orphanFingerprints, unplacedFingerprints);
}

/** Reconciles library book folders against backstage folders by name on load: never deletes, only surfaces mismatches. */
export interface BookReconciliationState {
	newBooks: string[]; // library folder, no backstage match
	detachedBackstage: string[]; // backstage folder, no library match
}

export function reconcileBookFolders(app: App): BookReconciliationState {
	const libraryNames = new Set(getLibraryBookFolders(app).map((f) => f.name));
	const backstageRoot = app.vault.getAbstractFileByPath(BACKSTAGE_ROOT);
	const backstageNames = new Set<string>();
	if (backstageRoot instanceof TFolder) {
		for (const child of backstageRoot.children) {
			if (child instanceof TFolder) backstageNames.add(child.name);
		}
	}

	const newBooks = [...libraryNames].filter((name) => !backstageNames.has(name));
	const detachedBackstage = [...backstageNames].filter((name) => !libraryNames.has(name));
	return { newBooks, detachedBackstage };
}

/** Live rename handling: chapters and book folders. Registered once at plugin load. */
export function registerReconciliationEvents(app: App, plugin: Plugin): void {
	plugin.registerEvent(
		app.vault.on("rename", async (file, oldPath) => {
			if (file instanceof TFile && isLibraryChapterPath(oldPath) && isLibraryChapterPath(file.path)) {
				await handleChapterRename(app, oldPath, file.path);
				return;
			}
			if (file instanceof TFolder) {
				await handleBookFolderRename(app, oldPath, file.path);
			}
		}),
	);
}

async function handleChapterRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const oldBook = bookFolderNameFromChapterPath(oldPath);
	const newBook = bookFolderNameFromChapterPath(newPath);
	const oldFilename = chapterFilenameFromPath(oldPath);
	const newFilename = chapterFilenameFromPath(newPath);
	if (!oldBook || !newBook || oldBook !== newBook || !oldFilename || !newFilename) return;

	const fm = readBookFrontmatter(app, oldBook);
	if (fm) {
		const newOrder = fm.order.map((entry) => (entry === oldFilename ? newFilename : entry));
		await writeBookOrder(app, oldBook, newOrder);
	}
	await renameChapterEntry(app, oldBook, oldFilename, newFilename);
	await renameChapterSidecar(app, oldBook, oldFilename, newFilename);
}

async function handleBookFolderRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const libraryPrefix = `${LIBRARY_ROOT}/`;
	if (!oldPath.startsWith(libraryPrefix) || !newPath.startsWith(libraryPrefix)) return;
	const oldName = oldPath.slice(libraryPrefix.length);
	const newName = newPath.slice(libraryPrefix.length);
	if (oldName.includes("/") || newName.includes("/")) return; // only top-level book folders

	const oldBackstage = bookBackstagePath(oldName);
	const newBackstage = bookBackstagePath(newName);
	if (app.vault.getAbstractFileByPath(oldBackstage)) {
		await renameBackstagePath(app.vault, oldBackstage, newBackstage);
	}
	await renameSeriesBookEntry(app, oldName, newName);
}

export function listUnusedSidecars(app: App, bookFolderName: string, chapterFilenames: string[]): string[] {
	const known = new Set(chapterFilenames);
	return listSidecarFilenames(app, bookFolderName).filter((name) => !known.has(name));
}
