import { collectReferencedPaths } from "./codexTree";
import { readCodexFrontmatter } from "./codex";
import type { CodexLinkEntry, LinkWorld } from "./codexLinks";
import { CODEX_ROOT } from "./paths";
import type { Project } from "./project";

/** What the project gives a Codex link: every Codex note (archived ones flagged, never offered), with its `aliases:` as written. Read only. */
export function collectCodexLinkEntries(project: Project): CodexLinkEntry[] {
	if (!project.isFolder(CODEX_ROOT)) return [];
	const { folders, archive } = readCodexFrontmatter(project);
	const archived = new Set([...collectReferencedPaths(folders, archive)].map((p) => p.toLowerCase()));
	const out: CodexLinkEntry[] = [];
	for (const child of project.list(CODEX_ROOT)) {
		if (child.kind !== "file" || child.extension !== "md") continue;
		let aliases: string[] = [];
		try {
			const raw = project.frontmatter(child.path)?.aliases;
			aliases = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
		} catch {
			/* unreadable frontmatter: the title still counts, the aliases don't */
		}
		out.push({ path: child.path, name: child.basename, aliases, archived: archived.has(child.path.toLowerCase()) });
	}
	return out;
}

/** How a link's target is looked up in the project, and whether an entry is archived. */
export function linkWorldOf(project: Project): LinkWorld {
	return {
		file: (path) => {
			const e = project.entry(path);
			return e && e.kind === "file" ? e.path : null;
		},
		isArchived: (path) => {
			const { folders, archive } = readCodexFrontmatter(project);
			return [...collectReferencedPaths(folders, archive)].some((p) => p.toLowerCase() === path.toLowerCase());
		},
	};
}
