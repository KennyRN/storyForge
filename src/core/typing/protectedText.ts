import type { Tree } from "@lezer/common";
import { markdownParser } from "../markdownTree";

/**
 * Text no typing aid may act inside (docs/typing-aids.md §3; Brief 20, decision 157): inline and fenced code, link
 * targets and titles, bare URLs and autolinks, HTML tags and comments, footnote labels, link-reference definitions and a
 * table's alignment row. **Read from the markdown parse tree** (`core/markdownTree.ts`), nothing else: in the editor it is
 * the editor's own incremental tree, and a caller with no tree gets one parsed from the text. Pure and DOM-free.
 *
 * Indented lines are not code (decision 22: fiction is often indented; the parser has indented code switched off).
 * An unclosed construct the parser doesn't read as one (a lone backtick, a half-typed link target, a `<!--` in the
 * middle of a line) is not protected until it is closed; an unclosed fence, and a `<!--` starting a line, run to the end.
 */

export type Range = readonly [from: number, to: number];

const WHOLE = new Set(["InlineCode", "FencedCode", "CodeBlock", "URL", "Autolink", "HTMLTag", "HTMLBlock", "Comment", "CommentBlock", "FootnoteReference", "LinkReference", "LinkTitle"]);
const ALIGNMENT_ROW = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

/** The protected ranges in the document, in order, as `[from, to)`. */
export function protectedRangesFromTree(tree: Tree, slice: (from: number, to: number) => string): Range[] {
	const out: Range[] = [];
	tree.iterate({
		enter(node) {
			if (WHOLE.has(node.name)) {
				out.push([node.from, node.to]);
				return false;
			}
			if (node.name === "TableDelimiter" && node.to - node.from > 1 && ALIGNMENT_ROW.test(slice(node.from, node.to))) out.push([node.from, node.to]);
			return undefined;
		},
	});
	return merge(out);
}

/**
 * The unclosed-line rule (Kenny's ruling, Brief 20): beside the tree, never in place of it, and only ever adding protection. On the caret's own line, text from an
 * **unclosed opener to the caret** is protected, so the first characters of a construct the parser can't read until it is closed are left as typed. The openers
 * are a closed list (adding to it needs a ruling): a backtick, a link target (`](`), `<!--`, and a bare web address being typed (`http://`, `https://` or `www.`
 * to the caret with no space). `lineText` is the caret's line up to the caret; `lineFrom` its offset in the document. It stops at the line's end: an opener on
 * an earlier line protects nothing here.
 */
export function unclosedOnLine(lineText: string, lineFrom: number): Range[] {
	const out: Range[] = [];
	const n = lineText.length;
	// A backtick run that has no closing run of the same length before the caret.
	let open: { at: number; len: number } | null = null;
	for (let i = 0; i < n; ) {
		if (lineText[i] !== "`") {
			i++;
			continue;
		}
		let len = 1;
		while (lineText[i + len] === "`") len++;
		if (open && open.len === len) open = null;
		else if (!open) open = { at: i, len };
		i += len;
	}
	if (open) out.push([lineFrom + open.at, lineFrom + n]);
	// A link target opened with `](` and not yet closed with `)`.
	for (let i = lineText.indexOf("]("); i !== -1; i = lineText.indexOf("](", i + 2)) if (lineText.indexOf(")", i + 2) === -1) out.push([lineFrom + i, lineFrom + n]);
	// An HTML comment opened with `<!--` and not yet closed with `-->`.
	for (let i = lineText.indexOf("<!--"); i !== -1; i = lineText.indexOf("<!--", i + 4)) if (lineText.indexOf("-->", i + 4) === -1) out.push([lineFrom + i, lineFrom + n]);
	// A bare web address being typed: from its start to the caret, with no space between.
	const url = /(?:^|[^\p{L}\p{N}])((?:https?:\/\/|www\.)\S*)$/iu.exec(lineText);
	if (url) out.push([lineFrom + n - url[1].length, lineFrom + n]);
	return out;
}

/** The protected ranges of `text`, from `tree` when the caller has one (the editor's), else from a parse of the text; the caret is at the end of `text`, so the unclosed-line rule applies to its last line. */
export function protectedRanges(text: string, tree?: Tree): Range[] {
	const lineFrom = text.lastIndexOf("\n") + 1;
	return merge([...protectedRangesFromTree(tree ?? markdownParser.parse(text), (a, b) => text.slice(a, b)), ...unclosedOnLine(text.slice(lineFrom), lineFrom)]);
}

function merge(ranges: Range[]): Range[] {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const out: [number, number][] = [];
	for (const [from, to] of sorted) {
		const last = out[out.length - 1];
		if (last && from <= last[1]) last[1] = Math.max(last[1], to);
		else out.push([from, to]);
	}
	return out;
}

/** True if any character in `[from, to)` is protected. For a single character, `to` is `from + 1`. */
export function touchesProtected(ranges: readonly Range[], from: number, to: number = from + 1): boolean {
	return ranges.some(([a, b]) => a < to && from < b);
}
