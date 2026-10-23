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
import { readFrontmatter, splitFrontmatterSection } from "./frontmatter";
import { sha256Text } from "./hash";
import { type RawLink, scanLinks } from "./linkScan";
import { CODEX_ROOT, LIBRARY_ROOT, NOTES_ROOT, isCodexNotePath } from "./paths";
import { baseName, foldKey, parentOf, resolvePath } from "./pathRules";
import type { Project } from "./project";
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

interface FileScan {
	spans: LinkSpan[];
	ambiguous: AmbiguousLink[];
	frontmatterSkipped: boolean;
}

/** Finds the links in one file's text that point at the note. */
function scanFile(path: string, text: string, note: NoteIdentity): FileScan {
	const spans: LinkSpan[] = [];
	const ambiguous: AmbiguousLink[] = [];
	let frontmatterSkipped = false;
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
		} else if (fm.state === "unreadable" && /\[\[|\]\(/.test(section.frontmatter)) {
			frontmatterSkipped = true;
		}
	}
	const body = text.slice(bodyStart);
	for (const link of scanLinks(body)) take(link, body, bodyStart, "body");
	return { spans, ambiguous, frontmatterSkipped };
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
	const bad = stem.match(UNLINKABLE);
	if (bad) throw new UnlinkableNameError(stem, [...new Set(bad)]);
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
