import { CODEX_ROOT, LIBRARY_ROOT } from "./paths";
import { foldKey, resolvePath } from "./pathRules";

/**
 * Codex links in GFM's own form (Brief 20, decisions 151 and 157): a standard link whose path is relative to the file
 * that holds it, spaces as `%20`, such as `[Jane Harbour](../../Codex/Jane%20Harbour.md)` (confirmed against GitHub's
 * rendering on 7 November 2026, `docs/gfm.md` § 8.1). Pure: no I/O, so the suggestions, the dressing and the tests share it.
 *
 * A link in a field is relative to the file the field is **stored in**: a chapter or Codex note is its own file, the plot note
 * and synopsis live in the novel file (`_story-library/novel-<book>.md`) and the series description in `series.md`.
 */

export interface CodexLinkEntry {
	/** `Codex/<name>.md`. */
	path: string;
	/** The note's title, without `.md`. */
	name: string;
	/** The note's `aliases:`, as written. */
	aliases: readonly string[];
	archived: boolean;
}

/** The path from the folder holding `fromFile` to `toPath`, with `../` for each folder climbed, unencoded. Both are project-relative. */
export function relativeLinkPath(fromFile: string, toPath: string): string {
	const from = fromFile.split("/").slice(0, -1);
	const to = toPath.split("/");
	let common = 0;
	while (common < from.length && common < to.length - 1 && foldKey(from[common]) === foldKey(to[common])) common++;
	return [...Array(from.length - common).fill(".."), ...to.slice(common)].join("/");
}

/** Encodes a path for a link: each segment's space, brackets, parentheses, `#`, `?` and `%` (the slashes stay). */
export function encodeLinkPath(path: string): string {
	return path
		.split("/")
		.map((seg) => (seg === ".." || seg === "." ? seg : seg.replace(/[ \[\]()#?%]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)))
		.join("/");
}

/** The complete link for an entry, as written from `fromFile`: `[text](relative%20path.md)`. */
export function codexLinkMarkdown(fromFile: string, entryPath: string, text: string): string {
	return `[${text.replace(/[\[\]\\]/g, (c) => `\\${c}`)}](${encodeLinkPath(relativeLinkPath(fromFile, entryPath))})`;
}

export interface Suggestion {
	entry: CodexLinkEntry;
	/** What the link's text will be: the entry's name, or the alias that matched. */
	text: string;
	/** The alias that matched, when the name didn't. */
	alias: string | null;
}

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The entries `[[query` offers: every Codex entry that isn't archived, of any type, matched on its name or an alias (accents and case
 * ignored): names that start with the query first, then aliases that start with it, then names and aliases that contain it. With an empty
 * query, every entry in name order. At most `limit`.
 */
export function suggestCodexEntries(entries: readonly CodexLinkEntry[], query: string, limit = 8): Suggestion[] {
	const q = fold(query.trim());
	const out: { s: Suggestion; rank: number }[] = [];
	for (const entry of entries) {
		if (entry.archived) continue;
		const name = fold(entry.name);
		if (q === "" || name.startsWith(q)) {
			out.push({ s: { entry, text: entry.name, alias: null }, rank: 0 });
			continue;
		}
		const aliasStart = entry.aliases.find((a) => fold(a).startsWith(q));
		if (aliasStart) {
			out.push({ s: { entry, text: aliasStart, alias: aliasStart }, rank: 1 });
			continue;
		}
		if (name.includes(q)) {
			out.push({ s: { entry, text: entry.name, alias: null }, rank: 2 });
			continue;
		}
		const aliasIn = entry.aliases.find((a) => fold(a).includes(q));
		if (aliasIn) out.push({ s: { entry, text: aliasIn, alias: aliasIn }, rank: 3 });
	}
	return out
		.sort((a, b) => a.rank - b.rank || a.s.entry.name.localeCompare(b.s.entry.name, undefined, { sensitivity: "base" }))
		.slice(0, limit)
		.map((x) => x.s);
}

/** What a link's target is, for how it is drawn and whether it opens (decision 151). */
export type LinkTarget =
	| { kind: "codex"; path: string; archived: boolean }
	| { kind: "chapter" }
	| { kind: "note" }
	| { kind: "missing" }
	| { kind: "web" };

/** The tooltip each kind that isn't a live Codex link carries. */
export const LINK_TOOLTIPS: Record<Exclude<LinkTarget["kind"], "codex">, string> = {
	chapter: "a chapter, not a Codex entry",
	note: "not a Codex entry",
	missing: "no such entry",
	web: "the app doesn't open web links",
};

export interface LinkWorld {
	/** The project-relative path of a file that exists (any case), or null. */
	file(path: string): string | null;
	isArchived(codexPath: string): boolean;
}

/** Works out what `target` (as written in a link in `fromFile`) points at. Anchors and queries are dropped; `%` escapes are decoded. */
export function classifyLinkTarget(fromFile: string, rawTarget: string, world: LinkWorld): LinkTarget {
	const raw = rawTarget.trim().replace(/^<|>$/g, "");
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return { kind: "web" };
	const cut = raw.search(/[#?]/);
	let pathPart = cut === -1 ? raw : raw.slice(0, cut);
	if (pathPart === "") return { kind: "missing" };
	try {
		pathPart = decodeURIComponent(pathPart);
	} catch {
		/* keep the raw text */
	}
	const folder = fromFile.split("/").slice(0, -1).join("/");
	const resolved = resolvePath(pathPart.startsWith("/") ? pathPart.slice(1) : folder ? `${folder}/${pathPart}` : pathPart);
	if (resolved === null) return { kind: "missing" };
	const found = world.file(resolved) ?? world.file(`${resolved}.md`);
	if (found === null) return { kind: "missing" };
	const key = foldKey(found);
	if (key.startsWith(`${CODEX_ROOT.toLowerCase()}/`) && key.split("/").length === 2 && /\.md$/.test(key)) return { kind: "codex", path: found, archived: world.isArchived(found) };
	if (key.startsWith(`${LIBRARY_ROOT.toLowerCase()}/`) && key.split("/").length === 3 && /\.md$/.test(key)) return { kind: "chapter" };
	return { kind: "note" };
}
