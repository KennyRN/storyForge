/**
 * The developer check (Brief 2 §5.4): opens a COPY of a project folder through the node-fs backend,
 * runs the read operations, and reports what it finds as text. It never writes to the source folder:
 * the folder is copied to a temporary directory first and everything runs against the copy.
 *
 * Node only. Run with `npm run check -- <folder>`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFsBackend } from "../backends/node-fs";
import { getArchivedChapters, getBookChapters, getChapterEntry, numberedChapterTitle, readBookFrontmatter } from "../core/book";
import { getArchivedCodexItems, getCodexEntries, readCodexFrontmatter } from "../core/codex";
import { UnreadableFrontmatterError } from "../core/frontmatter";
import { LegacyLayoutError, Project } from "../core/project";
import { CODEX_ROOT, LIBRARY_ROOT, libraryBookPath, bookFilePath } from "../core/paths";
import { EAGER_ROOTS } from "../core/projectIndex";
import { getSeriesBooks, numberedBookTitle, readSeriesFrontmatter } from "../core/series";

export interface CheckResult {
	/** 0: read fine, 1: read fine but problems were found, 2: refused (pre-0.17 layout or unreadable). */
	exitCode: 0 | 1 | 2;
	report: string;
}

export interface CheckOptions {
	/** Where to copy to; default: a fresh temp directory (removed afterwards). */
	workDir?: string;
	/** Skip these top-level names when copying (default: .git, node_modules). */
	skip?: string[];
	now?: () => number;
}

const DEFAULT_SKIP = [".git", "node_modules"];

function copyTree(src: string, dst: string, skip: Set<string>): { files: number; bytes: number } {
	let files = 0;
	let bytes = 0;
	const walk = (from: string, to: string, top: boolean) => {
		fs.mkdirSync(to, { recursive: true });
		for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
			if (top && skip.has(entry.name)) continue;
			const s = path.join(from, entry.name);
			const d = path.join(to, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) walk(s, d, false);
			else if (entry.isFile()) {
				fs.copyFileSync(s, d);
				files++;
				bytes += fs.statSync(s).size;
			}
		}
	};
	walk(src, dst, true);
	return { files, bytes };
}

const n = (x: number) => x.toLocaleString("en-US");

export async function checkProject(sourceFolder: string, options: CheckOptions = {}): Promise<CheckResult> {
	const now = options.now ?? (() => performance.now());
	const lines: string[] = [];
	const problems: string[] = [];
	const out = (s = "") => lines.push(s);

	const source = path.resolve(sourceFolder);
	if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
		return { exitCode: 2, report: `Not a folder: ${source}\n` };
	}
	const work = options.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sf-check-"));
	const cleanup = !options.workDir;
	try {
		out(`storyForge project check`);
		out(`source: ${source} (never written to)`);
		const t0 = now();
		const copied = copyTree(source, work, new Set(options.skip ?? DEFAULT_SKIP));
		out(`copied ${n(copied.files)} files (${n(Math.round(copied.bytes / 1024))} KB) to a temporary folder in ${Math.round(now() - t0)} ms`);

		const t1 = now();
		let project: Project;
		try {
			project = await Project.open(new NodeFsBackend(work));
		} catch (err) {
			if (err instanceof LegacyLayoutError) {
				out("");
				out("REFUSED: " + err.message);
				return { exitCode: 2, report: lines.join("\n") + "\n" };
			}
			throw err;
		}
		const scanMs = Math.round(now() - t1);
		const all = project.index.all();
		const eagerFiles = all.filter((e) => e.frontmatterState !== undefined);
		out(`indexed ${n(all.filter((e) => e.kind === "file").length)} files and ${n(all.filter((e) => e.kind === "folder").length)} folders in ${scanMs} ms`);
		out(`read ${n(eagerFiles.length)} markdown files in ${EAGER_ROOTS.join(", ")} (everything else: path and size only)`);

		// ---- series
		out("");
		let series;
		let seriesBooks;
		try {
			series = readSeriesFrontmatter(project);
			seriesBooks = getSeriesBooks(project);
		} catch (err) {
			if (!(err instanceof UnreadableFrontmatterError)) throw err;
			out(`SERIES  unavailable: series.md cannot be read (${err.reason})`);
			series = null;
			seriesBooks = { seriesTitle: "", ordered: [], unplaced: [] };
		}
		const { ordered, unplaced } = seriesBooks;
		if (series) out(`SERIES  "${series.seriesTitle}"${series.seriesId ? ` (${series.seriesId})` : ""}  placed: ${ordered.length}, unplaced: ${unplaced.length}`);
		let totalWords = 0;
		for (const [group, books] of [["placed", ordered], ["unplaced", unplaced]] as const) {
			books.forEach((folder, i) => {
				const code = folder.name;
				let fm;
				try {
					fm = readBookFrontmatter(project, code);
				} catch (err) {
					if (!(err instanceof UnreadableFrontmatterError)) throw err;
					out("");
					out(`  ${group === "placed" ? i + 1 + "." : "-"} [${code}]  UNAVAILABLE: ${bookFilePath(code)} cannot be read (${err.reason})`);
					return;
				}
				const { ordered: placed, unplaced: loose } = getBookChapters(project, code);
				const archived = getArchivedChapters(project, code);
				const words = (files: { path: string }[]) => files.reduce((sum, f) => sum + project.wordCount(f.path), 0);
				const bookWords = words(placed) + words(loose);
				totalWords += bookWords;
				const planned = fm?.plannedNovelLength ? ` of ${n(fm.plannedNovelLength)} planned` : "";
				out("");
				out(`  ${group === "placed" ? i + 1 + "." : "-"} ${numberedBookTitle(project, code, { ordered, unplaced })}  [${code}]`);
				out(`     chapters: ${placed.length} placed, ${loose.length} unplaced, ${archived.length} archived   words: ${n(bookWords)}${planned}`);
				if (!fm) {
					problems.push(`${code}: no ${bookFilePath(code)}`);
					out(`     ! no novel file`);
				}
				for (const file of placed) {
					out(`       ${String(placed.indexOf(file) + 1).padStart(2)}. ${numberedChapterTitle(project, code, file.name)}  (${file.name}, ${n(project.wordCount(file.path))} words)`);
				}
				for (const file of loose) out(`        ~ ${numberedChapterTitle(project, code, file.name)}  (${file.name}, ${n(project.wordCount(file.path))} words, unplaced)`);
				for (const a of archived) out(`        x ${a.chapterTitle}  (${a.filename}, archived)`);
				// consistency
				const folderFiles = project.list(libraryBookPath(code)).filter((e) => e.kind === "file" && e.extension === "md");
				for (const f of folderFiles) if (fm && !getChapterEntry(project, code, f.name)) problems.push(`${code}/${f.name}: chapter file has no entry in ${bookFilePath(code)}`);
				for (const key of Object.keys(fm?.chapters ?? {})) {
					if (!project.isFile(`${libraryBookPath(code)}/${key}`)) problems.push(`${code}: ${bookFilePath(code)} lists ${key} but the file is missing`);
				}
			});
		}
		out("");
		out(`TOTAL WORDS (all novels, not archived): ${n(totalWords)}`);

		// ---- codex
		out("");
		const codex = readCodexFrontmatter(project);
		const notes = getCodexEntries(project);
		const archivedItems = getArchivedCodexItems(project);
		const byType = new Map<string, number>();
		for (const e of notes) byType.set(codex.types[e.path] ?? "(no type)", (byType.get(codex.types[e.path] ?? "(no type)") ?? 0) + 1);
		const aliasCount = notes.reduce((sum, e) => {
			const a = project.frontmatter(e.path)?.aliases;
			return sum + (Array.isArray(a) ? a.length : typeof a === "string" ? 1 : 0);
		}, 0);
		out(`CODEX   ${notes.length} notes, ${Object.keys(codex.folders).length} virtual folders, ${archivedItems.length} archived, ${aliasCount} aliases`);
		if (byType.size) out(`        types: ${[...byType].map(([t, c]) => `${t} ${c}`).join(", ")}`);
		for (const e of project.list(CODEX_ROOT)) {
			if (e.kind === "folder") problems.push(`${e.path}: a real folder inside Codex/ (Codex folders are virtual)`);
		}

		// ---- problems
		for (const c of project.index.collisions()) problems.push(`name collision: ${c.paths.join("  <->  ")}`);
		for (const e of project.index.unreadable()) problems.push(`unreadable frontmatter in ${e.path}: ${e.frontmatterError} (the app treats this file as unavailable and refuses to write it)`);
		for (const e of project.list(LIBRARY_ROOT)) {
			if (e.kind === "file" && e.name !== "series.md" && !/^novel-.+\.md$/.test(e.name)) problems.push(`${e.path}: unexpected file at the library root`);
			if (e.kind === "folder" && !project.isFile(bookFilePath(e.name))) problems.push(`${e.path}: book folder with no ${bookFilePath(e.name)}`);
			if (/^novel-(.+)\.md$/.test(e.name) && !project.isFolder(libraryBookPath(e.name.slice(6, -3)))) problems.push(`${e.path}: novel file with no book folder`);
		}
		for (const e of all) {
			if (e.kind === "file" && /^_story-library\/[^/]+\/.+\/.+/.test(e.path)) problems.push(`${e.path}: nested deeper than a chapter file`);
		}

		// ---- residue (informational)
		const residue = ["_backstage/titleforge", "_backstage/storyforge/plot-threads.md", "_backstage/storyforge/vault-tags.md", "_backstage/storyforge/notes.md", "notes", "_export"].filter((p) => project.exists(p));
		const storyDetails = all.filter((e) => /\/story-details\//.test(e.path) && e.kind === "file").length;
		out("");
		out(`RESIDUE of removed features (left untouched): ${residue.length || storyDetails ? [...residue, storyDetails ? `story-details/ (${storyDetails} files)` : ""].filter(Boolean).join(", ") : "none"}`);

		out("");
		if (problems.length === 0) out("PROBLEMS: none");
		else {
			out(`PROBLEMS (${problems.length}):`);
			for (const p of problems) out(`  - ${p}`);
		}
		out("");
		out(`scan time ${scanMs} ms  |  source folder was not modified`);
		return { exitCode: problems.length ? 1 : 0, report: lines.join("\n") + "\n" };
	} finally {
		if (cleanup) fs.rmSync(work, { recursive: true, force: true });
	}
}
