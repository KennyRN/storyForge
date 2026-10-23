/**
 * The project handle: what `app` (Obsidian's vault, metadataCache and fileManager) was to the data
 * layer. Synchronous reads come from the index; every write goes through the guarded backend and the
 * index is updated before the write's promise resolves (docs/project-handle.md §2).
 */
import type { Backend, Stat } from "./backend/types";
import { BackendError } from "./backend/types";
import { ForbiddenWriteError } from "./backend/guard";
import { GuardedBackend } from "./backend/guarded";
import { type FrontmatterRecord, changedTopLevelKeys, editFrontmatter } from "./frontmatter";
import { BACKSTAGE_ROOT, isCodexNotePath } from "./paths";
import { isHiddenPath, resolvePath } from "./pathRules";
import { type IndexEntry, ProjectIndex, isEagerPath } from "./projectIndex";

/** The folder is in a layout older than 0.17. It is refused untouched. */
export class LegacyLayoutError extends Error {
	constructor(public readonly reasons: string[]) {
		super(
			`This folder is in a layout older than storyForge 0.17 (${reasons.join("; ")}). ` +
				`Open it once with the final plugin release (storytellingForge 0.17.1) so it can be brought up to date, then open it here.`,
		);
		this.name = "LegacyLayoutError";
	}
}

/** What marks a pre-0.14 layout (the structural migration the plugin used to run on load). */
export function legacyLayoutReasons(index: ProjectIndex): string[] {
	const reasons: string[] = [];
	if (index.exists("_sf-storylibrary")) reasons.push("found the old _sf-storylibrary/ folder");
	if (index.exists("_sf-backstage")) reasons.push("found the old _sf-backstage/ folder");
	if (index.exists(`${BACKSTAGE_ROOT}/series.md`)) reasons.push("series.md is still inside _backstage/");
	for (const e of index.list(BACKSTAGE_ROOT)) {
		if (e.kind === "folder" && index.exists(`${e.path}/novel.md`)) reasons.push(`a book's novel.md is still inside _backstage/ (${e.path})`);
	}
	return reasons;
}

/** The file is an iCloud placeholder: it exists but has not been downloaded, so it can't be read or edited yet. */
export class PlaceholderNotDownloadedError extends Error {
	constructor(public readonly path: string) {
		super(`"${path}" is stored in iCloud and has not been downloaded to this Mac yet.`);
		this.name = "PlaceholderNotDownloadedError";
	}
}

export class Project {
	private constructor(
		readonly index: ProjectIndex,
		readonly fs: GuardedBackend,
	) {}

	/** Scans the folder and returns a handle. Throws LegacyLayoutError (before anything is written) for a pre-0.17 layout. */
	static async open(backend: Backend): Promise<Project> {
		const fs = new GuardedBackend(backend);
		const index = await ProjectIndex.build(fs);
		const reasons = legacyLayoutReasons(index);
		if (reasons.length > 0) throw new LegacyLayoutError(reasons);
		return new Project(index, fs);
	}

	// ------------------------------------------------------------------- synchronous reads

	entry(path: string): IndexEntry | undefined {
		return this.index.get(path);
	}
	exists(path: string): boolean {
		return this.index.exists(path);
	}
	isFile(path: string): boolean {
		return this.index.get(path)?.kind === "file";
	}
	isFolder(path: string): boolean {
		return this.index.get(path)?.kind === "folder";
	}
	list(folder: string): IndexEntry[] {
		return this.index.list(folder);
	}
	/** Frontmatter of a markdown file in storyForge's folders; null if none. Throws UnreadableFrontmatterError if unreadable. */
	frontmatter(path: string): FrontmatterRecord | null {
		return this.index.frontmatter(path);
	}
	wordCount(path: string): number {
		return this.index.wordCount(path);
	}

	// ------------------------------------------------------------------------ async reads

	async readText(path: string): Promise<string> {
		this.assertDownloaded(path);
		return this.fs.readText(path);
	}
	async readBinary(path: string): Promise<Uint8Array> {
		this.assertDownloaded(path);
		return this.fs.readBinary(path);
	}

	/** True when the file exists only as an iCloud placeholder: present, not downloaded. */
	isPlaceholder(path: string): boolean {
		return this.index.isPlaceholder(path);
	}

	private assertDownloaded(path: string): void {
		if (this.index.isPlaceholder(path)) throw new PlaceholderNotDownloadedError(path);
	}

	// ----------------------------------------------------------------------------- writes

	async writeText(path: string, text: string): Promise<void> {
		await this.fs.writeText(path, text);
		await this.refresh(path);
	}

	async writeBinary(path: string, data: Uint8Array): Promise<void> {
		await this.fs.writeBinary(path, data);
		await this.refresh(path);
	}

	/** Creates a new file; rejects with BackendError EEXIST if it exists. */
	async createFile(path: string, content: string | Uint8Array): Promise<void> {
		await this.fs.createFile(path, content);
		await this.refresh(path);
	}

	/** Creates the folder (and any missing parents); a no-op if it exists. */
	async createFolder(path: string): Promise<void> {
		if (this.isFolder(path)) return;
		await this.fs.createFolder(path);
		const st = await this.fs.stat(path);
		this.index.setFolder(path, st?.mtimeMs ?? 0);
	}

	async rename(from: string, to: string): Promise<void> {
		await this.fs.rename(from, to);
		this.index.moveEntry(from, to);
	}

	/** Moves a backstage file into `.trash/`. Returns the new path. */
	async retire(path: string): Promise<string> {
		const moved = await this.fs.retire(path);
		this.index.removeEntry(path);
		return moved;
	}

	/**
	 * Read-modify-write of a file's whole text under one lock. `compute` gets the current text (null
	 * if the file doesn't exist) and returns the new text, or null for "leave it". Used for
	 * backstage files that are whole-file YAML or generated text (word-count history, sidecars).
	 */
	async updateText(path: string, compute: (current: string | null) => string | null): Promise<void> {
		await this.fs.transaction(path, async (tx) => {
			const st = await tx.stat();
			const current = st && st.kind === "file" ? await tx.readText() : null;
			const next = compute(current);
			if (next === null || next === current) return;
			if (current === null) await tx.createFile(next);
			else await tx.writeText(next);
		});
		await this.refresh(path);
	}

	/**
	 * Applies `mutate` to a file's frontmatter, changing only what the mutation changes. If the file
	 * doesn't exist it is created from `defaultContent` first. Nothing is written when nothing changes.
	 * Unreadable frontmatter rejects with UnreadableFrontmatterError and leaves the disk untouched.
	 */
	async modifyFrontmatter<T extends FrontmatterRecord = FrontmatterRecord>(path: string, defaultContent: string, mutate: (fm: T) => void): Promise<void> {
		const apply = mutate as (fm: FrontmatterRecord) => void;
		await this.fs.transaction(path, async (tx) => {
			const st = await tx.stat();
			if (!st || st.kind !== "file") {
				await tx.createFile(editFrontmatter(defaultContent, apply, path));
				return;
			}
			const text = await tx.readText();
			const next = editFrontmatter(text, apply, path);
			if (next === text) return;
			await tx.writeText(next, { op: "frontmatter-edit", keys: changedTopLevelKeys(text, next) });
		});
		await this.refresh(path);
	}

	/**
	 * The one Codex write: rewrite only the note's `aliases` key. Refuses any path that is not a
	 * flat `Codex/*.md` note that exists. `mutate` sees and returns the alias list only.
	 */
	async modifyCodexNoteAliases(path: string, mutate: (aliases: string[]) => string[]): Promise<void> {
		const canonical = resolvePath(path);
		if (canonical === null || !isCodexNotePath(canonical)) throw new ForbiddenWriteError(path, "not a flat Codex note", "edit aliases of");
		if (!this.isFile(canonical)) throw new ForbiddenWriteError(path, "no such Codex note", "edit aliases of");
		await this.fs.transaction(canonical, async (tx) => {
			const text = await tx.readText();
			const next = editFrontmatter(
				text,
				(fm) => {
					const updated = mutate(readAliasList(fm.aliases));
					if (updated.length === 0) delete fm.aliases;
					else fm.aliases = updated;
				},
				canonical,
			);
			if (next === text) return;
			await tx.writeText(next, { op: "frontmatter-edit", keys: changedTopLevelKeys(text, next) });
		});
		await this.refresh(canonical);
	}

	/**
	 * Re-reads one path from the backend into the index. Used after a write made through this handle,
	 * and by the safety-core modules after they write through `fs` directly (the prose writer, the
	 * link rewriter, backups, recovery). Index only; never writes.
	 */
	async refresh(path: string): Promise<void> {
		const st: Stat | null = await this.fs.stat(path);
		if (!st) {
			this.index.removeEntry(path);
			return;
		}
		if (st.kind === "folder") {
			this.index.setFolder(path, st.mtimeMs);
			return;
		}
		const canonical = resolvePath(path) ?? path;
		const text = isEagerPath(canonical) && !isHiddenPath(canonical) ? await this.fs.readText(canonical) : undefined;
		this.index.setFile(path, { size: st.size, mtimeMs: st.mtimeMs, text });
	}
}

function readAliasList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === "string")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (typeof raw === "string" && raw.trim()) return [raw.trim()];
	return [];
}

export { BackendError, ForbiddenWriteError };
