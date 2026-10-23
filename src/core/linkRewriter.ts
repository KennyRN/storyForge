/**
 * Link rewriting on Codex rename: the one named exception to the prose tenet (decision 10, shape
 * confirmed in decision 19). Two halves so the interface can announce the plan before anything
 * happens: `planCodexRename` (reads only) and `applyCodexRename` (backup, rename, rewrite, re-key).
 * This module is the only caller of `linkRewrite` and `codexRename` (test/architecture.test.ts).
 *
 * Which links count as pointing at the note:
 * - **Path-qualified links always count**: `[[Codex/X]]`, `[[Codex/X.md]]`, `[text](Codex/X.md)`.
 * - A **bare** `[[X]]` counts only if `Codex/X.md` is the only markdown file in the whole project with
 *   that basename (case-insensitive, Unicode-normalised). Otherwise it is **ambiguous**: left alone
 *   and listed. This is stricter than Obsidian's own resolution on purpose: categorical, never wrong.
 * - Links inside code blocks, inline code and `%% comments %%` never count (see linkScan.ts).
 * - Links in other markdown files outside storyForge's folders are counted, read-only, so the
 *   interface can say they will not be updated.
 */
import type { BackupService } from "./backup";
import { editFrontmatter, readFrontmatter, splitFrontmatterSection } from "./frontmatter";
import { sha256Text } from "./hash";
import { type RawLink, scanLinks } from "./linkScan";
import { CODEX_ROOT, LIBRARY_ROOT, NOTES_ROOT, isCodexNotePath } from "./paths";
import { baseName, foldKey, parentOf, resolvePath } from "./pathRules";
import type { Project } from "./project";
import type { ProseSession, SaveResult } from "./proseWriter";
import { handleCodexNoteRename } from "./reconciliation";
import { sanitizeCodexBasename, uniqueCodexFilename } from "./codex";

export class NotACodexNoteError extends Error {
	constructor(public readonly path: string, reason: string) {
		super(`Can't rename "${path}": ${reason}`);
		this.name = "NotACodexNoteError";
	}
}

/** The new name contains characters a link can't carry (`[[Janet #2]]` would mean a heading in "Janet "). Nothing was changed. */
export class UnlinkableNameError extends Error {
	constructor(public readonly name: string, public readonly chars: string[]) {
		super(`The name "${name}" contains ${chars.map((c) => `"${c}"`).join(" ")}, which links can't carry, so the note can't be renamed to it. Choose a name without them.`);
		this.name = "UnlinkableNameError";
	}
}

export type PlannedLinkForm = RawLink["form"];

/** One replacement. Body spans are offsets into the whole file's text; frontmatter spans are offsets into the string at `keyPath`. */
export interface LinkSpan {
	region: "body" | "frontmatter";
	start: number;
	end: number;
	old: string;
	new: string;
	form: PlannedLinkForm;
	/** Frontmatter only: where the string value sits in the parsed frontmatter. */
	keyPath?: (string | number)[];
}

export interface PlannedFile {
	path: string;
	/** SHA-256 of the file's text as it was read for the plan. */
	hash: string;
	spans: LinkSpan[];
	linkCount: number;
}

export interface AmbiguousLink {
	path: string;
	/** The link as written. */
	text: string;
	region: "body" | "frontmatter";
	start: number;
	end: number;
	/** The other markdown files sharing the note's basename. */
	otherFiles: string[];
}

export interface LinkRewritePlan {
	/** Nothing to do: the new name resolves to the note's own. */
	unchanged: boolean;
	notePath: string;
	newPath: string;
	oldName: string;
	newName: string;
	files: PlannedFile[];
	totalLinks: number;
	ambiguous: AmbiguousLink[];
	/** Links in other markdown files (outside `_story-library/`, `Codex/`, `notes/`); counted, never updated. */
	outside: { linkCount: number; files: { path: string; count: number }[] };
	/** Files in storyForge's folders that are iCloud placeholders: their links could not be seen. */
	notDownloaded: string[];
	/** Files that could not be read, so their links could not be seen. */
	unreadable: { path: string; reason: string }[];
	/** Frontmatter values written unquoted as `[[X]]` (YAML reads them as a nested list, not a link) that name this note. Not rewritten; listed so the announcement isn't silent about them. */
	unquotedFrontmatter: { path: string; keyPath: (string | number)[]; text: string }[];
	/** Files whose frontmatter can't be read safely: links in the body are planned, links in the frontmatter are not. */
	frontmatterSkipped: string[];
}

const PROSE_ROOTS = [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT];
const UNLINKABLE = /[\[\]#^|]/g;

interface NoteIdentity {
	path: string;
	pathKey: string;
	/** Folded basename without extension. */
	nameKey: string;
	unique: boolean;
	otherFiles: string[];
	newFilename: string;
	newStem: string;
}

type Resolution = { kind: "match"; segStart: number; segEnd: number; oldSeg: string; newSeg: string } | { kind: "ambiguous" } | null;

const stripMd = (s: string) => s.replace(/\.md$/i, "");

function encodeMarkdownSegment(stem: string, ext: string, angle: boolean): string {
	if (angle) return stem + ext;
	return stem.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29") + ext;
}

/** Decides whether `link` (found in `fromFile`) points at the note, and which part of it to replace. */
function resolveLink(link: RawLink, fromFile: string, note: NoteIdentity, allowRelative: boolean): Resolution {
	const raw = link.target;
	if (link.form === "wikilink" || link.form === "embed") {
		const lead = raw.length - raw.trimStart().length;
		const t = raw.trim();
		const hasExt = /\.md$/i.test(t);
		const noExt = hasExt ? t.slice(0, -3) : t;
		const slash = noExt.lastIndexOf("/");
		const nameStart = slash + 1;
		const stem = noExt.slice(nameStart);
		const segStart = lead + nameStart;
		const segEnd = lead + t.length;
		const ext = hasExt ? t.slice(-3) : "";
		const make = (): Resolution => ({ kind: "match", segStart, segEnd, oldSeg: t.slice(nameStart), newSeg: note.newStem + ext });
		if (slash !== -1) {
			const resolved = resolvePath(`${noExt}.md`);
			return resolved !== null && foldKey(resolved) === note.pathKey ? make() : null;
		}
		if (foldKey(stem) !== note.nameKey) return null;
		return note.unique ? make() : { kind: "ambiguous" };
	}
	// markdown links: always path-qualified
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // a URL
	const cut = raw.search(/[#?]/);
	const pathPart = cut === -1 ? raw : raw.slice(0, cut);
	if (pathPart === "") return null;
	let decoded = pathPart;
	try {
		decoded = decodeURIComponent(pathPart);
	} catch {
		/* keep the raw text */
	}
	const withMd = /\.md$/i.test(decoded) ? decoded : `${decoded}.md`;
	const candidates = [resolvePath(withMd.replace(/^\/+/, ""))];
	if (allowRelative) candidates.push(resolvePath(`${parentOf(fromFile)}/${withMd}`));
	if (!candidates.some((c) => c !== null && foldKey(c) === note.pathKey)) return null;
	const segFrom = pathPart.lastIndexOf("/") + 1;
	const oldSeg = pathPart.slice(segFrom);
	const hasExt = /\.md$/i.test(oldSeg);
	return {
		kind: "match",
		segStart: segFrom,
		segEnd: pathPart.length,
		oldSeg,
		newSeg: encodeMarkdownSegment(note.newStem, hasExt ? oldSeg.slice(-3) : "", link.angle === true),
	};
}

function collectStrings(value: unknown, keyPath: (string | number)[], out: { keyPath: (string | number)[]; text: string }[]): void {
	if (typeof value === "string") out.push({ keyPath, text: value });
	else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, [...keyPath, i], out));
	else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collectStrings(v, [...keyPath, k], out);
}

/** Finds `[[name]]` as YAML reads it when unquoted: a list holding a list holding one string. */
function collectNested(value: unknown, keyPath: (string | number)[], found: (keyPath: (string | number)[], name: string) => void): void {
	if (Array.isArray(value)) {
		if (value.length === 1 && Array.isArray(value[0]) && value[0].length === 1 && typeof value[0][0] === "string") found(keyPath, value[0][0]);
		else value.forEach((v, i) => collectNested(v, [...keyPath, i], found));
	} else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collectNested(v, [...keyPath, k], found);
}

interface FileScan {
	spans: LinkSpan[];
	ambiguous: AmbiguousLink[];
	frontmatterSkipped: boolean;
	unquoted: { keyPath: (string | number)[]; text: string }[];
}

/** Finds the links in one file's text that point at the note. */
function scanFile(path: string, text: string, note: NoteIdentity): FileScan {
	const spans: LinkSpan[] = [];
	const ambiguous: AmbiguousLink[] = [];
	let frontmatterSkipped = false;
	const unquoted: FileScan["unquoted"] = [];
	const section = splitFrontmatterSection(text);
	const bodyStart = section ? section.frontmatter.length : 0;

	const take = (link: RawLink, source: string, offset: number, region: LinkSpan["region"], keyPath?: (string | number)[]) => {
		const res = resolveLink(link, path, note, true);
		if (!res) return;
		if (res.kind === "ambiguous") {
			ambiguous.push({ path, text: source.slice(link.start, link.end), region, start: offset + link.start, end: offset + link.end, otherFiles: note.otherFiles });
			return;
		}
		spans.push({
			region,
			start: offset + link.targetStart + res.segStart,
			end: offset + link.targetStart + res.segEnd,
			old: res.oldSeg,
			new: res.newSeg,
			form: link.form,
			...(keyPath ? { keyPath } : {}),
		});
	};

	if (section) {
		const fm = readFrontmatter(text);
		if (fm.state === "ok") {
			const strings: { keyPath: (string | number)[]; text: string }[] = [];
			collectStrings(fm.data, [], strings);
			for (const s of strings) for (const link of scanLinks(s.text, { protect: false })) take(link, s.text, 0, "frontmatter", s.keyPath);
			collectNested(fm.data, [], (keyPath, name) => {
				const link: RawLink = { form: "wikilink", start: 0, end: 0, target: name, targetStart: 0, targetEnd: name.length };
				if (resolveLink(link, path, note, true)) unquoted.push({ keyPath, text: `[[${name}]]` });
			});
		} else if (fm.state === "unreadable" && /\[\[|\]\(/.test(section.frontmatter)) {
			frontmatterSkipped = true;
		}
	}
	const body = text.slice(bodyStart);
	for (const link of scanLinks(body)) take(link, body, bodyStart, "body");
	return { spans, ambiguous, frontmatterSkipped, unquoted };
}

/**
 * Plans the rename of a Codex note to `newName` (reads only). The name goes through the existing
 * sanitising and uniqueness rules; a name a link can't carry throws `UnlinkableNameError`.
 */
export async function planCodexRename(project: Project, notePath: string, newName: string): Promise<LinkRewritePlan> {
	const entry = project.entry(notePath);
	if (!entry || entry.kind !== "file") throw new NotACodexNoteError(notePath, "the note doesn't exist");
	if (!isCodexNotePath(entry.path)) throw new NotACodexNoteError(notePath, "it isn't a note directly in the Codex folder");
	if (entry.collision) throw new NotACodexNoteError(notePath, "another file has the same name apart from capitalisation");
	if (project.isPlaceholder(entry.path)) throw new NotACodexNoteError(notePath, "it is stored in iCloud and has not been downloaded");

	const stem = sanitizeCodexBasename(newName);
	// Checked on the name as typed: the sanitiser would silently drop a `|`, but the author should be told.
	const typed = newName.trim().replace(/\.md$/i, "");
	const bad = typed.match(UNLINKABLE);
	if (bad) throw new UnlinkableNameError(typed, [...new Set(bad)]);
	const oldName = entry.basename;
	const base: LinkRewritePlan = {
		unchanged: false,
		notePath: entry.path,
		newPath: entry.path,
		oldName,
		newName: oldName,
		files: [],
		totalLinks: 0,
		ambiguous: [],
		outside: { linkCount: 0, files: [] },
		notDownloaded: [],
		unreadable: [],
		frontmatterSkipped: [],
		unquotedFrontmatter: [],
	};
	if (!stem || stem === oldName) return { ...base, unchanged: true };
	const newFilename = await uniqueCodexFilename(project, stem, entry.path);
	const newPath = `${CODEX_ROOT}/${newFilename}`;
	if (foldKey(newPath) === foldKey(entry.path) && newFilename === entry.name) return { ...base, unchanged: true };
	const newStem = stripMd(newFilename);
	const badUnique = newStem.match(UNLINKABLE);
	if (badUnique) throw new UnlinkableNameError(newStem, [...new Set(badUnique)]);

	// Who else is called "<old name>.md"?
	const key = foldKey(oldName);
	const sameName = project.index
		.all()
		.filter((e) => e.kind === "file" && e.extension === "md" && foldKey(stripMd(baseName(e.path))) === key && e.path !== entry.path)
		.map((e) => e.path);
	for (const stub of project.index.placeholders()) if (/\.md$/i.test(stub) && foldKey(stripMd(baseName(stub))) === key && stub !== entry.path) sameName.push(stub);
	const note: NoteIdentity = { path: entry.path, pathKey: foldKey(entry.path), nameKey: key, unique: sameName.length === 0, otherFiles: sameName.sort(), newFilename, newStem };

	const plan: LinkRewritePlan = { ...base, newPath, newName: newStem };
	const isProse = (p: string) => PROSE_ROOTS.some((r) => foldKey(p).startsWith(`${r.toLowerCase()}/`));
	const skipOutside = (p: string) => {
		const k = foldKey(p);
		return k.startsWith("_backstage/") || k.startsWith("_sf-backup/");
	};
	const files = project.index
		.all()
		.filter((e) => e.kind === "file" && e.extension === "md")
		.sort((a, b) => (a.path < b.path ? -1 : 1));
	for (const e of files) {
		const inProse = isProse(e.path);
		if (!inProse && skipOutside(e.path)) continue;
		let text: string;
		try {
			text = await project.readText(e.path);
		} catch (err) {
			plan.unreadable.push({ path: e.path, reason: (err as Error).message });
			continue;
		}
		const found = scanFile(e.path, text, note);
		plan.ambiguous.push(...found.ambiguous.filter(() => inProse));
		if (found.frontmatterSkipped && inProse) plan.frontmatterSkipped.push(e.path);
		if (inProse) for (const u of found.unquoted) plan.unquotedFrontmatter.push({ path: e.path, ...u });
		if (inProse) {
			if (found.spans.length > 0) plan.files.push({ path: e.path, hash: sha256Text(text), spans: found.spans, linkCount: found.spans.length });
		} else if (found.spans.length > 0) {
			plan.outside.files.push({ path: e.path, count: found.spans.length });
			plan.outside.linkCount += found.spans.length;
		}
	}
	for (const stub of project.index.placeholders()) if (isProse(stub) && /\.md$/i.test(stub)) plan.notDownloaded.push(stub);
	plan.totalLinks = plan.files.reduce((n, f) => n + f.linkCount, 0);
	return plan;
}

// ------------------------------------------------------------------------------------ apply

/** The parts of the prose writer the rewrite needs, so open editors are flushed first and told afterwards. */
export interface RewriteWriter {
	flushAll(): Promise<SaveResult[]>;
	session(path: string): ProseSession | undefined;
	onDiskChanged(path: string, diskText: string): Promise<unknown>;
}

export interface ApplyRenameOptions {
	backups: BackupService;
	/** Open editors. Flushed before anything else; reloaded from disk for files that were rewritten. */
	writer?: RewriteWriter;
}

export type RewriteStop = "unchanged" | "flush" | "backup" | "rename";

export interface LinkRewriteResult {
	/** `done`: renamed and re-keyed (some links may have been skipped, see below). `stopped`: nothing was changed. */
	status: "done" | "unchanged" | "stopped";
	stoppedAt?: RewriteStop;
	error?: Error;
	/** Where unsaved editor text went during the flush, if anywhere (recovery files). */
	flushed: SaveResult[];
	backupPath?: string;
	oldPath: string;
	newPath: string;
	filesUpdated: string[];
	linksUpdated: number;
	/** Files that changed between the plan and the apply: left untouched. */
	skippedChanged: string[];
	/** Files whose rewrite could not be proven minimal or could not be made: left untouched. */
	skippedUnsafe: { path: string; reason: string }[];
	/** Bare links left alone because another file has the same name. */
	ambiguousLeft: AmbiguousLink[];
	/** Links in markdown files outside storyForge's folders: not updated. */
	outsideLinks: number;
	/** Set if `codex.md` or the novel files could not be re-keyed after the rename. */
	rekeyError?: Error;
	/** Files that were rewritten but could not be reloaded into an open editor. */
	notifyErrors: { path: string; error: Error }[];
}

function stopped(plan: LinkRewritePlan, at: RewriteStop, error: Error | undefined, flushed: SaveResult[], backupPath?: string): LinkRewriteResult {
	return {
		status: at === "unchanged" ? "unchanged" : "stopped",
		stoppedAt: at,
		...(error ? { error } : {}),
		flushed,
		...(backupPath ? { backupPath } : {}),
		oldPath: plan.notePath,
		newPath: plan.newPath,
		filesUpdated: [],
		linksUpdated: 0,
		skippedChanged: [],
		skippedUnsafe: [],
		ambiguousLeft: plan.ambiguous,
		outsideLinks: plan.outside.linkCount,
		notifyErrors: [],
	};
}

function applyBodySpans(text: string, spans: readonly LinkSpan[]): string {
	let out = text;
	for (const s of [...spans].filter((x) => x.region === "body").sort((a, b) => b.start - a.start)) {
		if (out.slice(s.start, s.end) !== s.old) throw new Error(`the text at ${s.start} is no longer "${s.old}"`);
		out = out.slice(0, s.start) + s.new + out.slice(s.end);
	}
	return out;
}

function getAt(root: unknown, keyPath: readonly (string | number)[]): unknown {
	let cur = root;
	for (const k of keyPath) cur = (cur as Record<string | number, unknown> | undefined)?.[k];
	return cur;
}

function replaceStrings(root: unknown, spans: readonly LinkSpan[]): void {
	const groups = new Map<string, LinkSpan[]>();
	for (const s of spans) if (s.region === "frontmatter") groups.set(JSON.stringify(s.keyPath), [...(groups.get(JSON.stringify(s.keyPath)) ?? []), s]);
	for (const group of groups.values()) {
		const keyPath = group[0].keyPath as (string | number)[];
		const found = getAt(root, keyPath);
		if (typeof found !== "string") throw new Error(`the frontmatter value at ${keyPath.join(".")} is no longer text`);
		let value: string = found;
		for (const s of [...group].sort((a, b) => b.start - a.start)) {
			if (value.slice(s.start, s.end) !== s.old) throw new Error(`the frontmatter text at ${keyPath.join(".")} is no longer "${s.old}"`);
			value = value.slice(0, s.start) + s.new + value.slice(s.end);
		}
		const parent = getAt(root, keyPath.slice(0, -1)) as Record<string | number, unknown>;
		parent[keyPath[keyPath.length - 1]] = value;
	}
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Builds the rewritten text of one file and proves it minimal: the body equals the original body with
 * exactly the planned spans replaced, the frontmatter parses to the original data with exactly the
 * planned strings replaced, and only lines that held a link differ. Throws if any of that fails.
 */
export function rewriteFileText(path: string, original: string, spans: readonly LinkSpan[]): string {
	const origSection = splitFrontmatterSection(original);
	const origFm = origSection?.frontmatter ?? "";
	let next = applyBodySpans(original, spans);
	const expectedBody = next.slice(origFm.length);
	if (!next.startsWith(origFm)) throw new Error("a body span fell inside the frontmatter");
	const fmSpans = spans.filter((s) => s.region === "frontmatter");
	if (fmSpans.length > 0) {
		next = editFrontmatter(
			next,
			(fm) => {
				replaceStrings(fm, fmSpans);
			},
			path,
		);
	}

	// The proof.
	const section = splitFrontmatterSection(next);
	const nextFm = section?.frontmatter ?? "";
	if ((section ? section.rest : next) !== expectedBody) throw new Error("the body would change outside the planned links");
	if (fmSpans.length === 0) {
		if (nextFm !== origFm) throw new Error("the frontmatter would change");
	} else {
		const before = readFrontmatter(original);
		const after = readFrontmatter(next);
		if (before.state !== "ok" || after.state !== "ok") throw new Error("the frontmatter can't be read back");
		const expected = JSON.parse(JSON.stringify(before.data));
		replaceStrings(expected, fmSpans);
		if (!sameJson(after.data, expected)) throw new Error("the frontmatter would change outside the planned links");
		const a = origFm.split(/\r?\n/);
		const b = nextFm.split(/\r?\n/);
		if (a.length !== b.length) throw new Error("the frontmatter would change shape");
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !/\[\[|\]\(/.test(a[i])) throw new Error(`the frontmatter line "${a[i]}" would change`);
		if (!/\r\n/.test(origFm) !== !/\r\n/.test(nextFm)) throw new Error("the frontmatter line endings would change");
	}
	return next;
}

/**
 * Carries out a plan: flush open editors, take the pre-rewrite backup (if that fails, stop with
 * nothing changed), rename the note, rewrite the planned links in files that are still as planned,
 * re-key `codex.md` and the PoV/location references, and report. Unlike typing, a rewrite is optional,
 * so it never runs without its backup.
 */
export async function applyCodexRename(project: Project, plan: LinkRewritePlan, options: ApplyRenameOptions): Promise<LinkRewriteResult> {
	if (plan.unchanged) return stopped(plan, "unchanged", undefined, []);
	const { writer, backups } = options;

	// 1. Flush every open editor. Text that can't be saved or recovered stops the rename.
	let flushed: SaveResult[] = [];
	if (writer) {
		try {
			flushed = await writer.flushAll();
		} catch (err) {
			return stopped(plan, "flush", err instanceof Error ? err : new Error(String(err)), flushed);
		}
		const failed = flushed.find((r) => r.kind === "recovery-failed");
		if (failed) return stopped(plan, "flush", new Error(`unsaved text in "${failed.path}" could not be saved or recovered`), flushed);
	}

	// 2. The pre-rewrite backup: exactly the files that will change, plus the note.
	const planned = new Set([plan.notePath, ...plan.files.map((f) => f.path)]);
	let backupPath: string;
	try {
		backupPath = (await backups.runPreRewrite([...planned].sort())).path;
	} catch (err) {
		return stopped(plan, "backup", err instanceof Error ? err : new Error(String(err)), flushed);
	}

	// 3. Rename the note. Its editor, if any, was flushed; close it so it doesn't point at the old path.
	try {
		await writer?.session(plan.notePath)?.close();
		await project.fs.codexRename(plan.notePath, plan.newPath);
		project.index.moveEntry(plan.notePath, plan.newPath);
		await project.refresh(plan.newPath);
	} catch (err) {
		return stopped(plan, "rename", err instanceof Error ? err : new Error(String(err)), flushed, backupPath);
	}

	// 4. Rewrite the planned spans, file by file, only where the file is still as planned.
	const result: LinkRewriteResult = {
		status: "done",
		flushed,
		backupPath,
		oldPath: plan.notePath,
		newPath: plan.newPath,
		filesUpdated: [],
		linksUpdated: 0,
		skippedChanged: [],
		skippedUnsafe: [],
		ambiguousLeft: plan.ambiguous,
		outsideLinks: plan.outside.linkCount,
		notifyErrors: [],
	};
	for (const file of plan.files) {
		const path = file.path === plan.notePath ? plan.newPath : file.path;
		let original: string;
		try {
			original = await project.readText(path);
		} catch (err) {
			result.skippedUnsafe.push({ path, reason: `couldn't be read: ${(err as Error).message}` });
			continue;
		}
		if (sha256Text(original) !== file.hash) {
			result.skippedChanged.push(path);
			continue;
		}
		let next: string;
		try {
			next = rewriteFileText(path, original, file.spans);
		} catch (err) {
			result.skippedUnsafe.push({ path, reason: (err as Error).message });
			continue;
		}
		if (next === original) continue;
		try {
			const outcome = await project.fs.linkRewrite(path, original, next);
			if (outcome === "conflict") {
				result.skippedChanged.push(path);
				continue;
			}
		} catch (err) {
			result.skippedUnsafe.push({ path, reason: `couldn't be written: ${(err as Error).message}` });
			continue;
		}
		result.filesUpdated.push(path);
		result.linksUpdated += file.linkCount;
		try {
			await writer?.onDiskChanged(path, next);
		} catch (err) {
			result.notifyErrors.push({ path, error: err instanceof Error ? err : new Error(String(err)) });
		}
		await project.refresh(path);
	}

	// 5. Re-key the backstage files: codex.md, and the PoV and location references in the novel files.
	try {
		await handleCodexNoteRename(project, plan.notePath, plan.newPath);
	} catch (err) {
		result.rekeyError = err instanceof Error ? err : new Error(String(err));
	}
	return result;
}

/** Plans and applies a Codex note rename in one step (the interface shows the plan first when it wants to). */
export async function renameCodexNote(project: Project, notePath: string, newName: string, options: ApplyRenameOptions): Promise<LinkRewriteResult> {
	// Flush first, so the plan is made from what is really on disk (apply flushes again, harmlessly).
	const flushedFirst = (await options.writer?.flushAll()) ?? [];
	const result = await applyCodexRename(project, await planCodexRename(project, notePath, newName), options);
	return { ...result, flushed: [...flushedFirst, ...result.flushed] };
}
