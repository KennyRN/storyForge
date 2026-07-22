import { App, TFile } from "obsidian";
import { createCodexNote, setCodexEntryType } from "../codex";
import { CODEX_ROOT } from "../paths";
import { emptyFacts, serializeFactsSection, setFactValue } from "./facts";
import type { ParsedFacts } from "./types";

export interface CreateStubOptions {
	name: string;
	type: string;
	/** Facts section heading for this type. */
	factsHeading: string;
	/** Optional attribute seeds from chapter descriptions. */
	factSeeds?: Array<{ key: string; value: string }>;
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

/** Creates a typed Codex note stub and optionally seeds its Facts section. */
export async function createCodexStub(app: App, options: CreateStubOptions): Promise<TFile> {
	const safeName = options.name.trim().replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, " ");
	if (!safeName) throw new Error("Name is empty");

	let facts: ParsedFacts = emptyFacts(options.factsHeading);
	for (const seed of options.factSeeds ?? []) {
		if (seed.key === "description") continue;
		facts = setFactValue(facts, seed.key, seed.value, false);
	}

	const parts: string[] = [];
	if (options.bookId) {
		parts.push(`---\nbook: ${options.bookId}\n---\n`);
	}
	const factsBody = serializeFactsSection(facts);
	if (factsBody.trim()) {
		parts.push(`## ${options.factsHeading}\n${factsBody}\n`);
	} else {
		parts.push(`## ${options.factsHeading}\n`);
	}

	const file = await createCodexNote(app, null, {
		filename: uniqueCodexFilename(app, safeName),
		content: parts.join("\n"),
	});
	await setCodexEntryType(app, file.path, options.type);
	return file;
}
