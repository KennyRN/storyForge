import { App, TFile } from "obsidian";
import { coerceStringList, collectCodexNotes, partitionCodexNotes, readCodexFrontmatter } from "../codex";
import { codexBasename } from "../codexTree";
import { emptyFacts, parseFactsFromNote } from "./facts";
import type { CodexEntryInput } from "./types";

/** Async book-scoped Codex inventory for the recommend engine. */
export async function loadHydratedCodexInventory(
	app: App,
	currentBookId: string | null,
	factSectionByType: Record<string, string>,
): Promise<CodexEntryInput[]> {
	const { types } = readCodexFrontmatter(app);
	const { codex } = partitionCodexNotes(collectCodexNotes(app), currentBookId);
	const entries: CodexEntryInput[] = [];

	for (const note of codex) {
		const type = types[note.path] ?? "untagged";
		const heading = factSectionByType[type] ?? "Facts";
		const file = app.vault.getAbstractFileByPath(note.path);
		let facts = emptyFacts(heading);
		let aliases: string[] = [];
		if (file instanceof TFile) {
			const raw = await app.vault.cachedRead(file);
			facts = parseFactsFromNote(raw, heading);
			const cache = app.metadataCache.getCache(note.path);
			aliases = coerceStringList(cache?.frontmatter?.aliases);
		}
		entries.push({
			path: note.path,
			name: codexBasename(note.path),
			aliases,
			type,
			facts,
		});
	}
	return entries;
}
