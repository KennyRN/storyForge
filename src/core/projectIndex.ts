/**
 * The project index: a synchronous, in-memory picture of the project folder that replaces
 * Obsidian's `metadataCache` and `getAbstractFileByPath` (docs/project-handle.md §3, §10).
 *
 * - Built by one full scan. Hidden entries (any dot-segment) are skipped.
 * - Markdown files inside storyForge's own folders (EAGER_ROOTS) are read once: frontmatter, word
 *   count and content hash are held. Everywhere else only path, kind and size are held; no body or
 *   attachment is read.
 * - Lookups are case-insensitive and NFC-normalised; the on-disk spelling is kept. Entries that
 *   collide under those rules are all kept and reported, never merged.
 * - Write-through: `Project` calls setFile/setFolder/removeEntry/moveEntry after a successful
 *   backend write, so the index is current before the write's promise resolves.
 * - External changes arrive through `applyChange` (index only, never writes).
 */
import type { Backend, EntryKind } from "./backend/types";
import { type FrontmatterRecord, type ParsedFrontmatter, UnreadableFrontmatterError, bodyOf, readFrontmatter } from "./frontmatter";
import { type Fingerprint, extractFingerprint } from "./fingerprint";
import { isCodexNotePath, isLibraryChapterPath } from "./paths";
import { sha256Text } from "./hash";
import { baseName, foldKey, isHiddenPath, parentOf, resolvePath } from "./pathRules";
import { countWords } from "./wordCount";

/** Folders whose markdown files are read, hashed and counted. Matched case-insensitively. */
export const EAGER_ROOTS = ["_story-library", "Codex", "notes", "_backstage/storyforge"] as const;

export interface IndexEntry {
	/** Project-relative path, on-disk spelling. */
	path: string;
	/** Last path segment, e.g. "Jane.md" (what a TFile/TFolder called `name`). */
	name: string;
	/** `name` without its extension for files; `name` for folders. */
	basename: string;
	/** Lower-cased extension without the dot; "" for folders and extensionless files. */
	extension: string;
	kind: EntryKind;
	size: number;
	mtimeMs: number;
	/** True when another entry folds to the same lookup key. */
	collision: boolean;
	/** Markdown files in EAGER_ROOTS only. */
	frontmatterState?: ParsedFrontmatter["state"];
	frontmatter?: FrontmatterRecord | null;
	frontmatterError?: string;
	wordCount?: number;
	hash?: string;
	/**
	 * Chapters and Codex notes: SHA-256 of the text after the frontmatter. Absent when that text is
	 * empty or only whitespace: an empty body is never evidence that two files are the same file.
	 */
	bodyHash?: string;
	/** Chapters: the opening and closing fingerprint of the text, as the fingerprint sidecar stores it. */
	fingerprint?: Fingerprint;
}

export interface Collision {
	key: string;
	paths: string[];
}

export type Change =
	| { type: "created"; path: string }
	| { type: "modified"; path: string }
	| { type: "deleted"; path: string }
	| { type: "renamed"; from: string; to: string };

function names(path: string, kind: EntryKind): Pick<IndexEntry, "name" | "basename" | "extension"> {
	const name = baseName(path);
	if (kind === "folder") return { name, basename: name, extension: "" };
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return { name, basename: name, extension: "" };
	return { name, basename: name.slice(0, dot), extension: name.slice(dot + 1).toLowerCase() };
}

export function isEagerPath(path: string): boolean {
	const key = foldKey(path);
	if (!key.endsWith(".md")) return false;
	return EAGER_ROOTS.some((root) => key.startsWith(root.toLowerCase() + "/"));
}

export class ProjectIndex {
	private byExact = new Map<string, IndexEntry>();
	private byFold = new Map<string, Set<string>>();
	private children = new Map<string, Set<string>>();

	private constructor(private readonly backend: Pick<Backend, "scan" | "stat" | "readText">) {}

	static async build(backend: Pick<Backend, "scan" | "stat" | "readText">): Promise<ProjectIndex> {
		const index = new ProjectIndex(backend);
		await index.scanInto("");
		return index;
	}

	// --------------------------------------------------------------------- reads (synchronous)

	get(path: string): IndexEntry | undefined {
		const canonical = resolvePath(path);
		if (canonical === null || canonical === "") return undefined;
		const group = this.byFold.get(canonical.toLowerCase());
		if (!group || group.size === 0) return undefined;
		const raw = path.replace(/\\/g, "/");
		for (const candidate of [raw, canonical]) {
			if (group.has(candidate)) return this.byExact.get(candidate);
		}
		return this.byExact.get([...group].sort()[0]);
	}

	exists(path: string): boolean {
		return this.get(path) !== undefined;
	}

	/** Direct children of `folder` ("" for the project root), sorted by name (case-insensitive, then exact). */
	list(folder: string): IndexEntry[] {
		const canonical = resolvePath(folder);
		if (canonical === null) return [];
		const set = this.children.get(canonical.toLowerCase());
		if (!set) return [];
		return [...set]
			.map((p) => this.byExact.get(p) as IndexEntry)
			.sort((a, b) => {
				const an = baseName(a.path).toLowerCase();
				const bn = baseName(b.path).toLowerCase();
				return an < bn ? -1 : an > bn ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
			});
	}

	/** Every entry, in no particular order. */
	all(): IndexEntry[] {
		return [...this.byExact.values()];
	}

	/** The parsed frontmatter state of a markdown file in EAGER_ROOTS (undefined elsewhere). */
	frontmatterState(path: string): ParsedFrontmatter | undefined {
		const e = this.get(path);
		if (!e || e.frontmatterState === undefined) return undefined;
		if (e.frontmatterState === "ok") return { state: "ok", data: e.frontmatter as FrontmatterRecord };
		if (e.frontmatterState === "none") return { state: "none", data: null };
		return { state: "unreadable", data: null, error: e.frontmatterError ?? "unreadable" };
	}

	/**
	 * Frontmatter as a plain object: the data for a readable file, null when there is none (or the
	 * file isn't indexed). **Throws UnreadableFrontmatterError** for a block that can't be read
	 * safely — unreadable is "unavailable", never "empty" (docs/project-handle.md §10.3).
	 */
	frontmatter(path: string): FrontmatterRecord | null {
		const s = this.frontmatterState(path);
		if (!s) return null;
		if (s.state === "unreadable") throw new UnreadableFrontmatterError(s.error, path);
		return s.data;
	}

	wordCount(path: string): number {
		return this.get(path)?.wordCount ?? 0;
	}

	hash(path: string): string | undefined {
		return this.get(path)?.hash;
	}

	collisions(): Collision[] {
		const out: Collision[] = [];
		for (const [key, set] of this.byFold) if (set.size > 1) out.push({ key, paths: [...set].sort() });
		return out.sort((a, b) => (a.key < b.key ? -1 : 1));
	}

	/** Markdown files whose frontmatter could not be read. */
	unreadable(): IndexEntry[] {
		return this.all().filter((e) => e.frontmatterState === "unreadable");
	}

	// ------------------------------------------------- write-through (called by Project only)

	setFile(path: string, info: { size: number; mtimeMs: number; text?: string }): IndexEntry {
		const canonical = this.canonical(path);
		this.ensureParents(canonical);
		const entry: IndexEntry = { ...names(canonical, "file"), path: canonical, kind: "file", size: info.size, mtimeMs: info.mtimeMs, collision: false };
		if (isEagerPath(canonical) && info.text !== undefined) {
			const fm = readFrontmatter(info.text);
			entry.frontmatterState = fm.state;
			entry.frontmatter = fm.state === "ok" ? fm.data : null;
			if (fm.state === "unreadable") entry.frontmatterError = fm.error;
			entry.wordCount = countWords(info.text);
			entry.hash = sha256Text(info.text);
			if (isLibraryChapterPath(canonical) || isCodexNotePath(canonical)) {
				const body = bodyOf(info.text);
				if (body.trim() !== "") entry.bodyHash = sha256Text(body);
				if (isLibraryChapterPath(canonical)) entry.fingerprint = extractFingerprint(info.text);
			}
		}
		this.insert(entry);
		return entry;
	}

	setFolder(path: string, mtimeMs = 0, spelling?: string): IndexEntry {
		const canonical = this.canonical(spelling ?? path);
		this.ensureParents(canonical);
		const existing = this.byExact.get(canonical);
		if (existing && existing.kind === "folder") return existing;
		const entry: IndexEntry = { ...names(canonical, "folder"), path: canonical, kind: "folder", size: 0, mtimeMs, collision: false };
		this.insert(entry);
		return entry;
	}

	/** Removes `path` and everything inside it. */
	removeEntry(path: string): void {
		const canonical = this.canonical(path);
		const key = foldKey(canonical);
		for (const e of [...this.byExact.values()]) {
			const k = foldKey(e.path);
			if (k === key || k.startsWith(key + "/")) this.drop(e);
		}
	}

	/** Moves `from` (and everything inside it) to `to`, keeping each entry's data. */
	moveEntry(from: string, to: string): void {
		const f = this.canonical(from);
		const t = this.canonical(to);
		const key = foldKey(f);
		const depth = f.split("/").length;
		const moved: IndexEntry[] = [];
		for (const e of [...this.byExact.values()]) {
			const k = foldKey(e.path);
			if (k === key || k.startsWith(key + "/")) {
				moved.push(e);
				this.drop(e);
			}
		}
		this.ensureParents(t);
		for (const e of moved) {
			const rest = e.path.split("/").slice(depth);
			const moved_ = [t, ...rest].join("/");
			this.insert({ ...e, ...names(moved_, e.kind), path: moved_, collision: false });
		}
	}

	// ----------------------------------------------------------------- external changes

	/** Refreshes the index from the backend after a change made outside the handle. Never writes. */
	async applyChange(change: Change): Promise<void> {
		switch (change.type) {
			case "deleted":
				this.removeEntry(change.path);
				return;
			case "renamed":
				this.removeEntry(change.from);
				await this.refresh(change.to);
				return;
			default:
				await this.refresh(change.path);
		}
	}

	// -------------------------------------------------------------------------- internals

	/** Validates `path` and returns it with "/" separators and the spelling it was given (no case or Unicode folding). */
	private canonical(path: string): string {
		const c = resolvePath(path);
		if (c === null || c === "") throw new Error(`Invalid project path: "${path}"`);
		const segments = path.replace(/\\/g, "/").split("/").filter((x) => x !== "" && x !== ".");
		return segments.includes("..") ? c : segments.join("/");
	}

	private async refresh(path: string): Promise<void> {
		const canonical = resolvePath(path);
		if (canonical === null || canonical === "" || isHiddenPath(canonical)) return;
		const stat = await this.backend.stat(canonical);
		if (!stat) {
			this.removeEntry(canonical);
			return;
		}
		if (stat.kind === "folder") {
			this.removeEntry(canonical);
			this.setFolder(canonical, stat.mtimeMs);
			await this.scanInto(canonical);
			return;
		}
		await this.loadFile(canonical, stat.size, stat.mtimeMs);
	}

	private async scanInto(dir: string): Promise<void> {
		for await (const e of this.backend.scan(dir || undefined)) {
			const canonical = e.path.replace(/\\/g, "/");
			if (isHiddenPath(canonical)) continue;
			if (e.kind === "folder") this.setFolder(canonical, e.mtimeMs, e.path);
			else await this.loadFile(canonical, e.size, e.mtimeMs, e.path);
		}
	}

	private async loadFile(path: string, size: number, mtimeMs: number, spelling = path): Promise<void> {
		let text: string | undefined;
		if (isEagerPath(path)) {
			try {
				text = await this.backend.readText(path);
			} catch {
				text = undefined;
			}
		}
		this.setFile(spelling, { size, mtimeMs, text });
	}

	private ensureParents(canonical: string): void {
		let dir = parentOf(canonical);
		const missing: string[] = [];
		while (dir !== "" && !this.hasFolderFold(dir)) {
			missing.push(dir);
			dir = parentOf(dir);
		}
		for (const d of missing.reverse()) {
			this.insert({ ...names(d, "folder"), path: d, kind: "folder", size: 0, mtimeMs: 0, collision: false });
		}
	}

	private hasFolderFold(dir: string): boolean {
		const g = this.byFold.get(foldKey(dir));
		if (!g) return false;
		return [...g].some((p) => this.byExact.get(p)?.kind === "folder");
	}

	private insert(entry: IndexEntry): void {
		const previous = this.byExact.get(entry.path);
		if (previous) this.drop(previous);
		this.byExact.set(entry.path, entry);
		const fold = foldKey(entry.path);
		let group = this.byFold.get(fold);
		if (!group) this.byFold.set(fold, (group = new Set()));
		group.add(entry.path);
		const parent = foldKey(parentOf(entry.path));
		let kids = this.children.get(parent);
		if (!kids) this.children.set(parent, (kids = new Set()));
		kids.add(entry.path);
		this.flagCollisions(fold);
	}

	private drop(entry: IndexEntry): void {
		this.byExact.delete(entry.path);
		const fold = foldKey(entry.path);
		const group = this.byFold.get(fold);
		if (group) {
			group.delete(entry.path);
			if (group.size === 0) this.byFold.delete(fold);
		}
		const parent = foldKey(parentOf(entry.path));
		const kids = this.children.get(parent);
		if (kids) {
			kids.delete(entry.path);
			if (kids.size === 0) this.children.delete(parent);
		}
		this.flagCollisions(fold);
	}

	private flagCollisions(fold: string): void {
		const group = this.byFold.get(fold);
		if (!group) return;
		const collided = group.size > 1;
		for (const p of group) {
			const e = this.byExact.get(p);
			if (e) e.collision = collided;
		}
	}
}
