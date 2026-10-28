/**
 * Shortcodes (docs/typing-aids.md §6): `~` and some letters offer the author's own codes, and optionally Codex names,
 * on demand. Pure: no editor, no DOM. The popup itself is in `ui/editor/shortcodePopup.ts`.
 */
import { foldForms, type NameIndex } from "./names";

/** The most entries the popup lists. */
export const POPUP_LIMIT = 8;

export interface ShortcodeEntry {
	/** What the popup shows on the left: `~th` for a code, the name for a Codex name. */
	label: string;
	/** What Tab puts in. */
	text: string;
	kind: "code" | "name";
}

/**
 * Where a shortcode in progress begins: `lineBefore` is the text of the line up to the caret. A `~` opens it when it
 * starts a word (the start of the line, a space or an opening mark before it), at least one letter follows it, nothing
 * else does, it is not part of `~~`, and it is not inside `~~strikethrough~~`. Returns the offset of the `~` in the
 * line and the letters typed after it.
 */
export function shortcodeTrigger(lineBefore: string): { tilde: number; query: string } | null {
	const m = /(?:^|[\s(\[{"“‘'—–])~(\p{L}+)$/u.exec(lineBefore);
	if (!m) return null;
	const tilde = lineBefore.length - m[1].length - 1;
	// An open `~~` earlier on the line makes this `~` the start of its closing marker (or a tilde inside struck text).
	const earlier = lineBefore.slice(0, tilde);
	if ((earlier.match(/~~/g) ?? []).length % 2 === 1) return null;
	if (lineBefore[tilde - 1] === "~") return null;
	return { tilde, query: m[1] };
}

/**
 * What the popup offers for `query`: the author's codes whose letters begin with it (ignoring case, alphabetical),
 * then, if asked, Codex names whose first word folds to something that begins with it. At most `POPUP_LIMIT`.
 */
export function shortcodeEntries(query: string, codes: Readonly<Record<string, string>>, names: NameIndex, withNames: boolean): ShortcodeEntry[] {
	const q = query.toLowerCase();
	const entries: ShortcodeEntry[] = Object.entries(codes)
		.filter(([code]) => code.toLowerCase().startsWith(q))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([code, text]) => ({ label: `~${code}`, text, kind: "code" as const }));
	if (withNames) {
		const wanted = foldForms(q);
		const seen = new Set<string>();
		for (const n of names.all) {
			if (seen.has(n.spelling) || !n.forms[0].some((f) => wanted.some((w) => f.startsWith(w)))) continue;
			seen.add(n.spelling);
			entries.push({ label: n.spelling, text: n.spelling, kind: "name" });
		}
	}
	return entries.slice(0, POPUP_LIMIT);
}
