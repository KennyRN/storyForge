import { CODEX_ROOT } from "../paths";
import type { Project } from "../project";
import type { NameSource } from "./names";

/** One word of a name: letters, marks and digits, with an apostrophe or hyphen only between them. */
const TOKEN = /^[\p{L}\p{M}\p{Nd}]+(?:['’-][\p{L}\p{M}\p{Nd}]+)*$/u;

/** A name the autocorrect can use: every word is a plain word (so a title like `Zoë Åberg — 日本語` is left out). */
export const isUsableName = (spelling: string): boolean => spelling.split(/\s+/).filter(Boolean).every((t) => TOKEN.test(t));

function aliasesOf(project: Project, path: string): string[] {
	try {
		const raw = project.frontmatter(path)?.aliases;
		const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
		return list.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
	} catch {
		return []; // unreadable frontmatter: its title still counts, its aliases don't
	}
}

/**
 * Every name the autocorrect knows (docs/typing-aids.md §5): each Codex note's title (archived notes too: they are
 * still the author's names), the spellings in each note's `aliases:` (only ever read), and the project's word list.
 */
export function collectNameSources(project: Project, wordList: readonly string[]): NameSource[] {
	const out: NameSource[] = [];
	if (project.isFolder(CODEX_ROOT)) {
		for (const child of project.list(CODEX_ROOT)) {
			if (child.kind !== "file" || child.extension !== "md") continue;
			if (isUsableName(child.basename)) out.push({ spelling: child.basename, origin: child.path, title: true });
			for (const alias of aliasesOf(project, child.path)) if (isUsableName(alias)) out.push({ spelling: alias, origin: child.path, title: false });
		}
	}
	for (const name of wordList) if (isUsableName(name)) out.push({ spelling: name, origin: "word list", title: true });
	return out;
}
