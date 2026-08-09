import { App, TFile } from "obsidian";
import { createCodexNote, setCodexEntryType } from "../codex";
import { CODEX_ROOT } from "../paths";

export interface CreateLoreOptions {
	name: string;
	type: string;
	/** Optional book id to scope the note. */
	bookId?: string | null;
}

function uniqueCodexFilename(app: App, baseName: string): string {
	let candidate = `${baseName}.md`;
	if (!app.vault.getAbstractFileByPath(`${CODEX_ROOT}/${candidate}`)) return candidate;
	let n = 2;
	while (app.vault.getAbstractFileByPath(`${CODEX_ROOT}/${baseName} ${n}.md`)) n++;
	return `${baseName} ${n}.md`;
}

/** Creates a typed Codex lore entry as a blank note (frontmatter only, no seeded headings). */
export async function createCodexLore(app: App, options: CreateLoreOptions): Promise<TFile> {
	const safeName = options.name.trim().replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, " ");
	if (!safeName) throw new Error("Name is empty");

	const content = options.bookId ? `---\nbook: ${options.bookId}\n---\n` : "";

	const file = await createCodexNote(app, null, {
		filename: uniqueCodexFilename(app, safeName),
		content,
	});
	await setCodexEntryType(app, file.path, options.type);
	return file;
}
