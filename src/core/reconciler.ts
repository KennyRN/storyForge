/**
 * The reconciler (docs/safety-core.md §7): keeps backstage files true when chapters, Codex notes and
 * book folders are renamed, moved or deleted outside the app, including while the app was closed.
 *
 * 0.17.1 learned about changes as Obsidian made them and pruned whatever was missing at load. The app
 * learns about them from the watcher (Brief 4) or by comparing the scan with what it last knew, and
 * both feed `reconcileChanges`. Order: **match, then recover, then prune**.
 *
 * - A change set is paths that vanished plus paths that appeared. A rename is always one of each.
 * - Matching is categorical: tier 1 the same body hash, tier 2 (chapters) the same opening
 *   fingerprint, with the closing fingerprint breaking a tie. A match counts only when it is
 *   one-to-one in both directions; empty bodies and empty fingerprints are never evidence.
 * - What can't be matched is **recovered, then pruned**: the entry's full contents go to a `_pruned`
 *   recovery file first, and only if that succeeds is the entry removed and its sidecars retired.
 * - Gates: a book whose folder is missing or empty while its novel file lists chapters, a missing
 *   `Codex/` while `codex.md` lists entries, unreadable backstage files, and any area holding iCloud
 *   placeholders are reported and left alone: nothing is matched, pruned or added there.
 *
 * Nothing here writes a chapter or a Codex note body (the prose tenet); it edits backstage files only.
 */
import {
	ensureAllChapterEntries,
	getBookChapterFiles,
	readBookFrontmatter,
} from "./book";
import { readChapterFingerprint } from "./chapterSidecar";
import { collectReferencedPaths } from "./codexTree";
import { readCodexFrontmatter } from "./codex";
import {
	CODEX_ROOT,
	LIBRARY_ROOT,
	bookFilePath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	chapterSidecarPath,
	codexFilePath,
	isCodexNotePath,
	isLibraryChapterPath,
	libraryBookPath,
	libraryChapterPath,
	storyContextSidecarPath,
} from "./paths";
import { foldKey, resolvePath } from "./pathRules";
import { type Project } from "./project";
import { handleBookFolderRename, handleChapterDelete, handleChapterRename, handleCodexNoteRename, reconcileDelete } from "./reconciliation";
import { recoverPrunedEntry } from "./recovery";
import { readSeriesFrontmatter } from "./series";
import type { Snapshot } from "./snapshot";

export interface Evidence {
	/** Body hash of the vanished file as it was last known. */
	hash?: string;
	opening?: string;
	closing?: string;
}

export interface ChangeSet {
	/** Chapter and Codex note paths that were there and are gone. */
	vanished: string[];
	/** Chapter and Codex note paths that were not known and are now on disk. */
	appeared: string[];
	/** What was known about the vanished files, by path (case-insensitive). */
	evidence?: ReadonlyMap<string, Evidence>;
}

export type GateReason = "folder-missing" | "folder-empty" | "not-downloaded" | "unreadable" | "codex-missing";

export interface Gate {
	/** `book:<folder name>` or `codex`. */
	area: string;
	reason: GateReason;
	detail: string;
}

export interface ReconcileSummary {
	matched: { kind: "chapter" | "codex" | "book"; tier: 1 | 2 | "folder"; from: string; to: string; crossBook?: boolean }[];
	pruned: { kind: "chapter" | "codex"; path: string; recoveryPath: string }[];
	ambiguous: { kind: "chapter" | "codex"; path: string; candidates: string[] }[];
	added: string[];
	gated: Gate[];
	skipped: { path: string; reason: string }[];
	/** Whether tier 1 evidence was available at open. */
	snapshot: "used" | "missing" | "unreadable" | "not-applicable";
}

export function emptySummary(snapshot: ReconcileSummary["snapshot"] = "not-applicable"): ReconcileSummary {
	return { matched: [], pruned: [], ambiguous: [], added: [], gated: [], skipped: [], snapshot };
}

export function summaryIsEmpty(s: ReconcileSummary): boolean {
	return !s.matched.length && !s.pruned.length && !s.ambiguous.length && !s.added.length && !s.gated.length && !s.skipped.length;
}

const normFp = (s: string | undefined): string => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------- knowledge

/** Books the project knows about: library folders, novel files, and series.md entries. */
export function knownBooks(project: Project): string[] {
	const names = new Set<string>();
	for (const e of project.list(LIBRARY_ROOT)) {
		if (e.kind === "folder") names.add(e.name);
		const m = /^novel-(.+)\.md$/i.exec(e.name);
		if (e.kind === "file" && m) names.add(m[1]);
	}
	try {
		for (const key of Object.keys(readSeriesFrontmatter(project).books)) names.add(key);
	} catch {
		/* an unreadable series.md adds nothing; the books it would name are found by their other files */
	}
	return [...names].sort();
}

/** Books registered in backstage before now: a novel file or a series.md entry. A library folder alone does not register a book. */
function registeredBooks(project: Project): Set<string> {
	const names = new Set<string>();
	for (const e of project.list(LIBRARY_ROOT)) {
		const m = /^novel-(.+)\.md$/i.exec(e.name);
		if (e.kind === "file" && m) names.add(m[1]);
	}
	try {
		for (const key of Object.keys(readSeriesFrontmatter(project).books)) names.add(key);
	} catch {
		/* unreadable series.md registers nothing */
	}
	return names;
}

/** Filenames the novel file lists for a book (order, unplaced, archive, chapters map). Throws if the novel file is unreadable. */
function listedChapters(project: Project, book: string): Set<string> {
	const fm = readBookFrontmatter(project, book);
	if (!fm) return new Set();
	return new Set([...fm.chapterOrder, ...fm.unplaced, ...fm.archive, ...Object.keys(fm.chapters)]);
}

/** Codex note paths named anywhere in backstage: `codex.md`, and the PoV and location references in novel files. */
function referencedCodexPaths(project: Project, skipBooks: ReadonlySet<string> = new Set()): { paths: Set<string>; codexUnreadable: boolean } {
	const paths = new Set<string>();
	let codexUnreadable = false;
	if (project.exists(codexFilePath())) {
		try {
			const c = readCodexFrontmatter(project);
			for (const p of collectReferencedPaths(c.folders, c.order)) paths.add(p);
			for (const p of collectReferencedPaths(c.folders, c.archive)) paths.add(p);
			for (const p of Object.keys(c.types)) paths.add(p);
			for (const f of Object.values(c.folders)) if (f.linkedNotePath) paths.add(f.linkedNotePath);
		} catch {
			codexUnreadable = true;
		}
	}
	for (const book of knownBooks(project)) {
		if (skipBooks.has(book)) continue;
		try {
			const fm = readBookFrontmatter(project, book);
			if (!fm) continue;
			if (fm.defaultPovPath) paths.add(fm.defaultPovPath);
			for (const entry of Object.values(fm.chapters)) {
				for (const r of entry.pov) paths.add(r.path);
				for (const r of entry.location) paths.add(r.path);
			}
		} catch {
			/* gated separately */
		}
	}
	for (const p of [...paths]) if (!isCodexNotePath(p)) paths.delete(p);
	return { paths, codexUnreadable };
}

/** The areas where nothing may be matched, pruned or added right now. */
export function computeGates(project: Project, exempt: ReadonlySet<string> = new Set()): Gate[] {
	const gates: Gate[] = [];
	for (const book of knownBooks(project)) {
		if (exempt.has(book)) continue;
		const area = `book:${book}`;
		const folder = libraryBookPath(book);
		let listed: Set<string>;
		try {
			listed = listedChapters(project, book);
		} catch {
			gates.push({ area, reason: "unreadable", detail: `the details of book "${book}" can't be read` });
			continue;
		}
		const stubs = project.index.placeholdersIn(folder);
		const folderIsStub = project.index.isPlaceholder(folder);
		if (stubs.length > 0 || folderIsStub) {
			gates.push({ area, reason: "not-downloaded", detail: `${folderIsStub ? "the folder" : `${stubs.length} file(s)`} of book "${book}" ${folderIsStub ? "is" : "are"} stored in iCloud and not downloaded yet` });
			continue;
		}
		if (!project.isFolder(folder)) {
			if (listed.size > 0) gates.push({ area, reason: "folder-missing", detail: `the folder of book "${book}" is missing but its details list ${listed.size} chapter(s)` });
			continue;
		}
		if (listed.size > 0 && getBookChapterFiles(project, book).length === 0) {
			gates.push({ area, reason: "folder-empty", detail: `the folder of book "${book}" holds no chapters but its details list ${listed.size}` });
		}
	}
	const refs = referencedCodexPaths(project);
	if (refs.codexUnreadable) {
		gates.push({ area: "codex", reason: "unreadable", detail: "codex.md can't be read" });
	} else if (project.index.placeholdersIn(CODEX_ROOT).length > 0 || project.index.isPlaceholder(CODEX_ROOT)) {
		gates.push({ area: "codex", reason: "not-downloaded", detail: "some Codex notes are stored in iCloud and not downloaded yet" });
	} else if (!project.isFolder(CODEX_ROOT) && refs.paths.size > 0) {
		gates.push({ area: "codex", reason: "codex-missing", detail: `the Codex folder is missing but ${refs.paths.size} note(s) are listed in codex.md` });
	}
	return gates;
}

// ------------------------------------------------------------------------------ evidence

/** What the index knows about `paths` right now: call this before applying a change to the index. */
export function evidenceFromIndex(project: Project, paths: readonly string[]): Map<string, Evidence> {
	const out = new Map<string, Evidence>();
	for (const p of paths) {
		const e = project.entry(p);
		if (!e) continue;
		out.set(foldKey(p), { hash: e.bodyHash, opening: e.fingerprint?.opening, closing: e.fingerprint?.closing });
	}
	return out;
}

export function evidenceFromSnapshot(snapshot: Snapshot): Map<string, Evidence> {
	const out = new Map<string, Evidence>();
	for (const f of snapshot.files) out.set(foldKey(f.path), { hash: f.hash, opening: f.opening, closing: f.closing });
	return out;
}

/** The change set at open: what was known last time (snapshot and backstage details) against what is on disk now. */
export function changeSetAtOpen(project: Project, snapshot: Snapshot | null): ChangeSet {
	const knownChapters = new Map<string, string>();
	const knownCodex = new Map<string, string>();
	const add = (m: Map<string, string>, p: string) => m.set(foldKey(p), p);
	if (snapshot) {
		for (const f of snapshot.files) {
			if (f.kind === "chapter") add(knownChapters, f.path);
			else if (f.kind === "codex") add(knownCodex, f.path);
		}
	}
	for (const book of knownBooks(project)) {
		try {
			for (const name of listedChapters(project, book)) add(knownChapters, libraryChapterPath(book, name));
		} catch {
			/* gated */
		}
	}
	for (const p of referencedCodexPaths(project).paths) add(knownCodex, p);

	const present = (p: string) => project.isFile(p) || project.isPlaceholder(p);
	const vanished = [...knownChapters.values(), ...knownCodex.values()].filter((p) => !present(p));
	const appeared: string[] = [];
	for (const e of project.index.all()) {
		if (e.kind !== "file") continue;
		if (isLibraryChapterPath(e.path) && !knownChapters.has(foldKey(e.path))) appeared.push(e.path);
		else if (isCodexNotePath(e.path) && !knownCodex.has(foldKey(e.path))) appeared.push(e.path);
	}
	return { vanished: vanished.sort(), appeared: appeared.sort(), evidence: snapshot ? evidenceFromSnapshot(snapshot) : undefined };
}

// ------------------------------------------------------------------------------- matching

interface Pairing {
	pairs: [string, string][];
	/** vanished path -> the appeared paths it could be (more than one, or contested). */
	ambiguous: Map<string, string[]>;
	/** Vanished paths with no candidate at all. */
	none: string[];
}

/**
 * Accepts a vanished/appeared pair only when each is the other's one and only candidate.
 * Everything contested is ambiguous; nothing is guessed.
 */
function pairUp(vanished: readonly string[], candidates: ReadonlyMap<string, string[]>): Pairing {
	const reverse = new Map<string, string[]>();
	for (const [v, list] of candidates) for (const a of list) reverse.set(a, [...(reverse.get(a) ?? []), v]);
	const pairs: [string, string][] = [];
	const ambiguous = new Map<string, string[]>();
	const none: string[] = [];
	for (const v of vanished) {
		const list = candidates.get(v) ?? [];
		if (list.length === 0) none.push(v);
		else if (list.length === 1 && (reverse.get(list[0]) ?? []).length === 1) pairs.push([v, list[0]]);
		else ambiguous.set(v, list);
	}
	return { pairs, ambiguous, none };
}

// -------------------------------------------------------------------------- the main entry

export interface ReconcileOptions {
	now?: Date;
	snapshot?: ReconcileSummary["snapshot"];
}

export async function reconcileChanges(project: Project, change: ChangeSet, options: ReconcileOptions = {}): Promise<ReconcileSummary> {
	const summary = emptySummary(options.snapshot);
	const now = options.now ?? new Date();
	const evidenceOf = (p: string) => change.evidence?.get(foldKey(p));

	// Normalise the input: canonical paths, only chapters and Codex notes, only what is really so now.
	const canon = (p: string) => resolvePath(p) ?? p;
	let vanished = [...new Set(change.vanished.map(canon))].filter((p) => (isLibraryChapterPath(p) || isCodexNotePath(p)) && !project.isFile(p) && !project.isPlaceholder(p));
	let appeared = [...new Set(change.appeared.map(canon))].filter((p) => (isLibraryChapterPath(p) || isCodexNotePath(p)) && project.isFile(p));

	// 1. Book folders renamed: a vanished book and an appeared folder holding the same chapter filenames.
	const renamedBooks = await reconcileBookRenames(project, summary);
	const exempt = new Set(renamedBooks.flatMap((r) => [r.from, r.to]));
	const bookOf = (p: string) => bookFolderNameFromChapterPath(p);
	vanished = vanished.filter((p) => !(isLibraryChapterPath(p) && exempt.has(bookOf(p) as string)));
	appeared = appeared.filter((p) => !(isLibraryChapterPath(p) && exempt.has(bookOf(p) as string)));

	// 2. Gates.
	const gates = computeGates(project);
	summary.gated.push(...gates);
	const gatedAreas = new Set(gates.map((g) => g.area));
	const gatedPath = (p: string) => (isLibraryChapterPath(p) ? gatedAreas.has(`book:${bookOf(p)}`) : gatedAreas.has("codex"));
	for (const p of vanished.filter(gatedPath)) summary.skipped.push({ path: p, reason: "its area is gated, so nothing was matched or pruned" });
	vanished = vanished.filter((p) => !gatedPath(p));
	appeared = appeared.filter((p) => !gatedPath(p));

	// 3. Match.
	const vanishedChapters = vanished.filter(isLibraryChapterPath);
	const vanishedCodex = vanished.filter(isCodexNotePath);
	const appearedChapters = appeared.filter(isLibraryChapterPath);
	const appearedCodex = appeared.filter(isCodexNotePath);

	const matchedAppeared = new Set<string>();
	const unmatched: { path: string; kind: "chapter" | "codex"; candidates?: string[] }[] = [];

	// Chapters. Evidence: the hash from `evidence`; the fingerprint from the chapter's sidecar (else from `evidence`).
	const chapterEvidence = new Map<string, Evidence>();
	for (const v of vanishedChapters) {
		const ev = evidenceOf(v);
		let fp: { opening: string; closing: string } | null = null;
		try {
			fp = await readChapterFingerprint(project, bookOf(v) as string, chapterFilenameFromPath(v) as string);
		} catch {
			fp = null;
		}
		chapterEvidence.set(v, { hash: ev?.hash, opening: fp?.opening || ev?.opening, closing: fp?.closing || ev?.closing });
	}
	const chapterPairs: { from: string; to: string; tier: 1 | 2 }[] = [];
	const tier1Candidates = new Map<string, string[]>();
	for (const v of vanishedChapters) {
		const h = chapterEvidence.get(v)?.hash;
		tier1Candidates.set(v, h ? appearedChapters.filter((a) => project.entry(a)?.bodyHash === h) : []);
	}
	const t1 = pairUp(vanishedChapters, tier1Candidates);
	for (const [v, a] of t1.pairs) chapterPairs.push({ from: v, to: a, tier: 1 });
	const claimed = new Set<string>([...t1.pairs.map(([, a]) => a), ...[...t1.ambiguous.values()].flat()]);
	const ambiguousChapters = new Map(t1.ambiguous);

	const remainingA = appearedChapters.filter((a) => !claimed.has(a));
	const tier2Candidates = new Map<string, string[]>();
	for (const v of t1.none) {
		const ev = chapterEvidence.get(v);
		const opening = normFp(ev?.opening);
		let cands = opening ? remainingA.filter((a) => normFp(project.entry(a)?.fingerprint?.opening) === opening) : [];
		if (cands.length > 1) {
			const closing = normFp(ev?.closing);
			cands = closing ? cands.filter((a) => normFp(project.entry(a)?.fingerprint?.closing) === closing) : [];
		}
		tier2Candidates.set(v, cands);
	}
	const t2 = pairUp(t1.none, tier2Candidates);
	for (const [v, a] of t2.pairs) chapterPairs.push({ from: v, to: a, tier: 2 });
	for (const [v, list] of t2.ambiguous) ambiguousChapters.set(v, list);
	for (const [v, list] of ambiguousChapters) summary.ambiguous.push({ kind: "chapter", path: v, candidates: list });
	for (const p of chapterPairs) matchedAppeared.add(p.to);
	const pairedFrom = new Set(chapterPairs.map((p) => p.from));
	for (const v of vanishedChapters) if (!pairedFrom.has(v)) unmatched.push({ path: v, kind: "chapter", candidates: ambiguousChapters.get(v) });

	// Codex notes: tier 1 only.
	const codexCandidates = new Map<string, string[]>();
	for (const v of vanishedCodex) {
		const h = evidenceOf(v)?.hash;
		codexCandidates.set(v, h ? appearedCodex.filter((a) => project.entry(a)?.bodyHash === h) : []);
	}
	const cx = pairUp(vanishedCodex, codexCandidates);
	for (const [v, list] of cx.ambiguous) summary.ambiguous.push({ kind: "codex", path: v, candidates: list });
	for (const [, a] of cx.pairs) matchedAppeared.add(a);
	const codexPaired = new Set(cx.pairs.map(([v]) => v));
	for (const v of vanishedCodex) if (!codexPaired.has(v)) unmatched.push({ path: v, kind: "codex", candidates: cx.ambiguous.get(v) });

	// 4. Apply the matches.
	for (const m of chapterPairs.sort((a, b) => (a.from < b.from ? -1 : 1))) {
		try {
			await handleChapterRename(project, m.from, m.to);
			summary.matched.push({ kind: "chapter", tier: m.tier, from: m.from, to: m.to, ...(bookOf(m.from) !== bookOf(m.to) ? { crossBook: true } : {}) });
		} catch (err) {
			summary.skipped.push({ path: m.from, reason: `matched to ${m.to} but couldn't re-key its details: ${(err as Error).message}` });
		}
	}
	for (const [v, a] of cx.pairs.sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
		try {
			await handleCodexNoteRename(project, v, a);
			summary.matched.push({ kind: "codex", tier: 1, from: v, to: a });
		} catch (err) {
			summary.skipped.push({ path: v, reason: `matched to ${a} but couldn't re-key its references: ${(err as Error).message}` });
		}
	}

	// 5. Recover, then prune what could not be matched.
	for (const u of unmatched.sort((a, b) => (a.path < b.path ? -1 : 1))) {
		if (u.kind === "chapter") await pruneChapter(project, u.path, now, summary, chapterEvidence.get(u.path));
		else await pruneCodexNote(project, u.path, now, summary);
	}

	// 6. New chapters that were not matched get an unplaced entry (after matching, never before).
	const newByBook = new Map<string, string[]>();
	for (const a of appearedChapters.filter((x) => !matchedAppeared.has(x))) {
		const book = bookOf(a) as string;
		newByBook.set(book, [...(newByBook.get(book) ?? []), a]);
	}
	for (const [book, files] of [...newByBook].sort()) {
		try {
			const before = readBookFrontmatter(project, book)?.chapters ?? {};
			await ensureAllChapterEntries(project, book);
			for (const f of files) if (!before[chapterFilenameFromPath(f) as string]) summary.added.push(f);
		} catch (err) {
			summary.skipped.push({ path: libraryBookPath(book), reason: `couldn't add entries for new chapters: ${(err as Error).message}` });
		}
	}
	return summary;
}

/** Reconciles at open: loads nothing itself, the caller passes the snapshot (or null). */
export async function reconcileAtOpen(
	project: Project,
	snapshot: Snapshot | null,
	status: ReconcileSummary["snapshot"],
	options: { now?: Date } = {},
): Promise<ReconcileSummary> {
	const change = changeSetAtOpen(project, snapshot);
	return reconcileChanges(project, change, { ...options, snapshot: status });
}

// ------------------------------------------------------------------------- book folder renames

async function reconcileBookRenames(project: Project, summary: ReconcileSummary): Promise<{ from: string; to: string }[]> {
	const books = [...registeredBooks(project)].sort();
	const vanishedBooks: { name: string; files: Set<string> }[] = [];
	for (const b of books) {
		if (project.isFolder(libraryBookPath(b)) || project.index.isPlaceholder(libraryBookPath(b))) continue;
		try {
			const listed = listedChapters(project, b);
			if (listed.size > 0) vanishedBooks.push({ name: b, files: listed });
		} catch {
			/* gated */
		}
	}
	if (vanishedBooks.length === 0) return [];
	const knownSet = new Set(books.map((b) => b.toLowerCase()));
	const appearedBooks = project
		.list(LIBRARY_ROOT)
		.filter((e) => e.kind === "folder" && !knownSet.has(e.name.toLowerCase()))
		.map((e) => ({ name: e.name, files: new Set(getBookChapterFiles(project, e.name).map((f) => f.name)) }))
		.filter((b) => b.files.size > 0 && project.index.placeholdersIn(libraryBookPath(b.name)).length === 0);
	const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
	const candidates = new Map<string, string[]>();
	for (const v of vanishedBooks) candidates.set(v.name, appearedBooks.filter((a) => same(v.files, a.files)).map((a) => a.name));
	const { pairs } = pairUp(vanishedBooks.map((v) => v.name), candidates);
	const done: { from: string; to: string }[] = [];
	for (const [from, to] of pairs) {
		try {
			await handleBookFolderRename(project, libraryBookPath(from), libraryBookPath(to));
			const oldNovel = bookFilePath(from);
			const newNovel = bookFilePath(to);
			if (project.isFile(oldNovel) && !project.exists(newNovel)) await project.rename(oldNovel, newNovel);
			summary.matched.push({ kind: "book", tier: "folder", from: libraryBookPath(from), to: libraryBookPath(to) });
			done.push({ from, to });
		} catch (err) {
			summary.skipped.push({ path: libraryBookPath(from), reason: `looks renamed to "${to}" but couldn't re-key its details: ${(err as Error).message}` });
		}
	}
	return done;
}

// ----------------------------------------------------------------------- recover, then prune

function plain(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value ?? null));
}

async function pruneChapter(project: Project, path: string, now: Date, summary: ReconcileSummary, ev?: Evidence): Promise<void> {
	const book = bookFolderNameFromChapterPath(path) as string;
	const filename = chapterFilenameFromPath(path) as string;
	let listedIn: string[] = [];
	let rawEntry: unknown = undefined;
	try {
		const fm = project.frontmatter(bookFilePath(book));
		for (const key of ["chapter-order", "unplaced", "archive"]) if (Array.isArray(fm?.[key]) && (fm?.[key] as unknown[]).includes(filename)) listedIn.push(key);
		const chapters = fm?.chapters as Record<string, unknown> | undefined;
		rawEntry = chapters && Object.prototype.hasOwnProperty.call(chapters, filename) ? chapters[filename] : undefined;
	} catch {
		listedIn = [];
	}
	const sidecars = [chapterSidecarPath(book, filename), storyContextSidecarPath(book, filename)].filter((p) => project.isFile(p));
	if (listedIn.length === 0 && rawEntry === undefined && sidecars.length === 0) {
		summary.skipped.push({ path, reason: "nothing was recorded for it, so there is nothing to prune" });
		return;
	}
	const data: Record<string, unknown> = { chapter: filename, book };
	if (rawEntry !== undefined) data["chapter-entry"] = plain(rawEntry);
	if (listedIn.length) data["listed-in"] = listedIn;
	if (ev?.opening || ev?.closing) data.fingerprint = { opening: ev?.opening ?? "", closing: ev?.closing ?? "" };
	if (sidecars.length) data["sidecars-retired"] = sidecars;
	const rec = await recoverPrunedEntry(
		project,
		{ scope: book, name: filename, source: bookFilePath(book), reason: "the chapter file is gone and no matching file was found", data: data as Record<string, never> },
		now,
	);
	if (!rec.ok) {
		summary.skipped.push({ path, reason: `couldn't write its recovery file, so it was not pruned: ${rec.error.message}` });
		return;
	}
	try {
		await handleChapterDelete(project, path);
		summary.pruned.push({ kind: "chapter", path, recoveryPath: rec.path });
	} catch (err) {
		summary.skipped.push({ path, reason: `recovered to ${rec.path} but pruning failed: ${(err as Error).message}` });
	}
}

async function pruneCodexNote(project: Project, path: string, now: Date, summary: ReconcileSummary): Promise<void> {
	const data: Record<string, unknown> = { "codex-note": path };
	let anything = false;
	try {
		if (project.exists(codexFilePath())) {
			const c = readCodexFrontmatter(project);
			if (c.types[path]) {
				data.type = c.types[path];
				anything = true;
			}
			if (c.order.includes(path)) data["in-order"] = true;
			if (collectReferencedPaths(c.folders, c.order).has(path)) anything = true;
			if (c.archive.includes(path)) {
				data.archived = true;
				anything = true;
			}
			const inFolders = Object.entries(c.folders).filter(([, f]) => f.order.includes(path)).map(([id, f]) => ({ id, name: f.name }));
			if (inFolders.length) {
				data.folders = inFolders;
				anything = true;
			}
			const linked = Object.entries(c.folders).filter(([, f]) => f.linkedNotePath === path).map(([id]) => id);
			if (linked.length) {
				data["linked-folders"] = linked;
				anything = true;
			}
		}
		const refs: { book: string; chapter?: string; field: string }[] = [];
		for (const book of knownBooks(project)) {
			const fm = readBookFrontmatter(project, book);
			if (!fm) continue;
			if (fm.defaultPovPath === path) refs.push({ book, field: "default-pov" });
			for (const [chapter, entry] of Object.entries(fm.chapters)) {
				if (entry.pov.some((r) => r.path === path)) refs.push({ book, chapter, field: "pov" });
				if (entry.location.some((r) => r.path === path)) refs.push({ book, chapter, field: "location" });
			}
		}
		if (refs.length) {
			data.references = refs;
			anything = true;
		}
	} catch (err) {
		summary.skipped.push({ path, reason: `couldn't read what refers to it, so it was not pruned: ${(err as Error).message}` });
		return;
	}
	if (!anything) {
		summary.skipped.push({ path, reason: "nothing was recorded for it, so there is nothing to prune" });
		return;
	}
	const name = path.slice(CODEX_ROOT.length + 1).replace(/\.md$/i, "");
	const rec = await recoverPrunedEntry(
		project,
		{ scope: "_codex", name, source: `${codexFilePath()} and the novel files`, reason: "the note is gone and no matching file was found", data: data as Record<string, never> },
		now,
	);
	if (!rec.ok) {
		summary.skipped.push({ path, reason: `couldn't write its recovery file, so it was not pruned: ${rec.error.message}` });
		return;
	}
	try {
		await reconcileDelete(project, path);
		summary.pruned.push({ kind: "codex", path, recoveryPath: rec.path });
	} catch (err) {
		summary.skipped.push({ path, reason: `recovered to ${rec.path} but pruning failed: ${(err as Error).message}` });
	}
}
