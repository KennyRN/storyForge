import { App, TFile } from "obsidian";
import { collectCodexNotes, readCodexFrontmatter } from "../codex";
import { codexBasename } from "../codexTree";
import { emptyFacts, parseFactsFromNote } from "./facts";
import type { CodexEntryInput } from "./types";

/** Async hydrated Codex inventory for the recommend engine (all non-archived notes). */
export async function loadHydratedCodexInventory(
	app: App,
	factSectionByType: Record<string, string>,
): Promise<CodexEntryInput[]> {
	const { types } = readCodexFrontmatter(app);
	const entries: CodexEntryInput[] = [];

	for (const path of collectCodexNotes(app)) {
		const type = types[path] ?? "untagged";
		const heading = factSectionByType[type] ?? "Facts";
		const file = app.vault.getAbstractFileByPath(path);
		let facts = emptyFacts(heading);
		let aliases: string[] = [];
		if (file instanceof TFile) {
			const raw = await app.vault.cachedRead(file);
			facts = parseFactsFromNote(raw, heading);
			const cache = app.metadataCache.getCache(path);
			const aliasesRaw: unknown = cache?.frontmatter?.aliases;
			aliases = Array.isArray(aliasesRaw)
				? aliasesRaw.filter((v): v is string => typeof v === "string")
				: typeof aliasesRaw === "string"
					? [aliasesRaw]
					: [];
		}
		entries.push({
			path,
			name: codexBasename(path),
			aliases,
			type,
			facts,
		});
	}
	return entries;
}
