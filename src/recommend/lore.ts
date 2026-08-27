import { App, TFile } from "obsidian";
import { createCodexNote, setCodexEntryType, uniqueCodexFilename } from "../codex";
import { yamlQuotedScalar } from "../yamlQuote";

export interface CreateLoreOptions {
	name: string;
	type: string;
	/** Optional book id to scope the note. */
	bookId?: string | null;
}

/** Creates a typed Codex lore entry as a blank note (frontmatter only, no seeded headings). */
export async function createCodexLore(app: App, options: CreateLoreOptions): Promise<TFile> {
	const filename = uniqueCodexFilename(app, options.name);
	if (filename === "New Note.md" && !options.name.trim().replace(/[/\\?%*:|"<>]/g, "")) {
		throw new Error("Name is empty");
	}

	const content = options.bookId ? `---\nbook: ${yamlQuotedScalar(options.bookId)}\n---\n` : "";

	const file = await createCodexNote(app, null, {
		filename,
		content,
	});
	await setCodexEntryType(app, file.path, options.type);
	return file;
}
