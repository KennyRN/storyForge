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

/** The protected ranges of `text`, from `tree` when the caller has one (the editor's), else from a parse of the text. */
export function protectedRanges(text: string, tree?: Tree): Range[] {
	return protectedRangesFromTree(tree ?? markdownParser.parse(text), (a, b) => text.slice(a, b));
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
