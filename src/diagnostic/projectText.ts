/** The project as plain text, for the diagnostic window: series, novels, chapters with word counts, the Codex tree, the archive. */
import { getArchivedChapters, getBookChapters, readBookFrontmatter } from "../core/book";
import { getArchivedCodexItems, getCodexEntryType, getCodexView } from "../core/codex";
import type { CodexTreeItem } from "../core/codexTree";
import type { Project } from "../core/project";
import { getSeriesBooks } from "../core/series";
import { bookDisplayTitle } from "../core/series";
import { chapterDisplayTitle } from "../core/book";

const fmt = (n: number) => n.toLocaleString("en-US");

function codexLines(items: CodexTreeItem[], project: Project, depth: number, out: string[]): void {
	for (const item of items) {
		const pad = "  ".repeat(depth);
		if (item.type === "folder") {
			out.push(`${pad}[${item.name}]${item.path ? ` → ${item.path}` : ""}`);
			codexLines(item.children, project, depth + 1, out);
		} else {
			const type = getCodexEntryType(project, item.path);
			out.push(`${pad}${item.name}${type ? ` (${type})` : ""}  ${fmt(project.wordCount(item.path))} words`);
		}
	}
}

export function projectAsText(project: Project): string {
	const out: string[] = [];
	const { seriesTitle, ordered, unplaced } = getSeriesBooks(project);
	out.push(`SERIES: ${seriesTitle}`);
	let total = 0;
	const book = (label: string, folder: string) => {
		const fm = readBookFrontmatter(project, folder);
		out.push(`${label} ${folder} — ${bookDisplayTitle(project, folder)}${fm ? "" : "  (no novel file)"}`);
		const chapters = getBookChapters(project, folder);
		const line = (mark: string, name: string, path: string) => {
			const words = project.wordCount(path);
			total += words;
			out.push(`    ${mark} ${chapterDisplayTitle(project, folder, name)}  (${name}, ${fmt(words)} words)`);
		};
		chapters.ordered.forEach((c, i) => line(`${i + 1}.`, c.name, c.path));
		for (const c of chapters.unplaced) line("·", c.name, c.path);
		for (const a of getArchivedChapters(project, folder)) out.push(`    archived: ${a.chapterTitle}  (${a.filename})`);
	};
	ordered.forEach((b, i) => book(`  ${i + 1}.`, b.name));
	for (const b of unplaced) book("  · unplaced", b.name);
	out.push(`  total in chapters: ${fmt(total)} words`);
	out.push("");
	out.push("CODEX:");
	const tree = getCodexView(project, "codex");
	if (!tree) out.push("  (no Codex folder)");
	else codexLines(tree.children, project, 1, out);
	const archived = getArchivedCodexItems(project);
	if (archived.length) {
		out.push("  archived:");
		for (const a of archived) out.push(`    ${a.name} (${a.type})`);
	}
	const unreadable = project.index.unreadable();
	if (unreadable.length) {
		out.push("");
		out.push("UNREADABLE FRONTMATTER (treated as unavailable, never as empty):");
		for (const e of unreadable) out.push(`  ${e.path}: ${e.frontmatterError ?? "unreadable"}`);
	}
	const collisions = project.index.collisions();
	if (collisions.length) {
		out.push("");
		out.push("NAME COLLISIONS:");
		for (const c of collisions) out.push(`  ${c.paths.join("  ≡  ")}`);
	}
	const stubs = project.index.placeholders();
	if (stubs.length) {
		out.push("");
		out.push("ICLOUD (present, not downloaded):");
		for (const s of stubs) out.push(`  ${s}`);
	}
	return out.join("\n");
}
