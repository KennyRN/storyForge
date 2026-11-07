import { GFM, parser, type MarkdownConfig } from "@lezer/markdown";
import type { SyntaxNode, Tree } from "@lezer/common";

/**
 * The one markdown parse (Brief 20, decisions 149 and 157): `@lezer/markdown` with GitHub Flavored
 * Markdown's extensions (tables, task lists, strikethrough, autolinks) and a small footnote extension,
 * DOM-free. Everything that needs to know what a piece of text *is* (the dressing, protected text, the
 * alerts) asks the tree; nothing here changes a byte of text.
 */

const FOOTNOTE_LABEL = /^\[\^[^\s\]]+\]/;

/** GFM footnotes, which the parser's GFM set leaves out: `[^id]` in a line and `[^id]: text` as a block. */
const Footnote: MarkdownConfig = {
	defineNodes: [{ name: "FootnoteDefinition", block: true }, "FootnoteReference", "FootnoteMark"],
	parseBlock: [
		{
			name: "FootnoteDefinition",
			before: "LinkReference",
			parse(cx, line) {
				const m = /^\[\^[^\s\]]+\]:[ \t]*/.exec(line.text.slice(line.pos));
				if (!m) return false;
				const from = cx.lineStart + line.pos;
				const label = m[0].indexOf("]") + 1;
				const children = [cx.elt("FootnoteMark", from, from + label + 1)];
				// The definition is its first line plus any lines indented by four spaces or a tab.
				let to = cx.lineStart + line.text.length;
				while (cx.nextLine() && /^( {4}|\t)\S/.test(line.text)) to = cx.lineStart + line.text.length;
				cx.addElement(cx.elt("FootnoteDefinition", from, to, children));
				return true;
			},
		},
	],
	parseInline: [
		{
			name: "FootnoteReference",
			before: "Link",
			parse(cx, next, pos) {
				if (next !== 91 /* [ */ || cx.char(pos + 1) !== 94 /* ^ */) return -1;
				const m = FOOTNOTE_LABEL.exec(cx.slice(pos, Math.min(cx.end, pos + 80)));
				if (!m) return -1;
				return cx.addElement(cx.elt("FootnoteReference", pos, pos + m[0].length));
			},
		},
	],
};

export const markdownParser = parser.configure([GFM, Footnote]);

export function parseMarkdown(text: string): Tree {
	return markdownParser.parse(text);
}

export type Span = { from: number; to: number };

/** `<!-- … -->` as the parser reads it: inline within a paragraph, or a block starting a line (an unclosed block runs to the end). Never inside code. */
export function commentSpans(tree: Tree): Span[] {
	const out: Span[] = [];
	tree.iterate({
		enter(n) {
			if (n.name === "Comment" || n.name === "CommentBlock") out.push({ from: n.from, to: n.to });
		},
	});
	return out;
}

export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";

export interface Alert {
	kind: AlertKind;
	/** The whole block quote. */
	from: number;
	to: number;
	/** The marker line, `[!TYPE]`, without the `>` before it. */
	marker: Span;
}

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

/**
 * GitHub's rule, as probed on 7 November 2026 (`docs/gfm.md` §8.1): a **top-level** block quote whose first
 * line is exactly `[!TYPE]` (any case, nothing else on the line) with at least one more line of content in
 * the quote. Anything else (text after the marker, an unknown type, no body, inside a list or another
 * quote) is an ordinary quote.
 */
export function alerts(tree: Tree, text: string): Alert[] {
	const out: Alert[] = [];
	for (let n: SyntaxNode | null = tree.topNode.firstChild; n; n = n.nextSibling) {
		if (n.name !== "Blockquote") continue;
		const lines = text.slice(n.from, n.to).split("\n").map((l) => l.replace(/^ {0,3}>[ \t]?/, ""));
		const kind = ALERT_MARKER.exec(lines[0]);
		if (!kind || !lines.slice(1).some((l) => l.trim() !== "")) continue;
		const lineStartOffset = text.slice(n.from, n.to).indexOf(lines[0]);
		const from = n.from + Math.max(lineStartOffset, 0);
		out.push({ kind: kind[1].toLowerCase() as AlertKind, from: n.from, to: n.to, marker: { from, to: from + lines[0].replace(/[ \t]+$/, "").length } });
	}
	return out;
}
