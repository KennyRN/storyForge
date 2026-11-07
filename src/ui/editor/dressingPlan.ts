import type { Tree } from "@lezer/common";
import { alerts, type AlertKind } from "../../core/markdownTree";

/**
 * What the dressing draws, as a plain list (Brief 20, decisions 149 and 157), worked out from the parse tree
 * and nothing else: DOM-free, so it is tested without a browser. It describes decorations only (a class on a
 * line, a class on a span, a span hidden, a glyph drawn in place of a marker) and so cannot change a byte
 * of the text; the view turns each item into a CodeMirror decoration and dispatches no change.
 *
 * Markers are hidden except on a line holding the caret or a selection (`isActive`), where they show muted so
 * they can be edited.
 */
export type PlanItem =
	| { t: "line"; at: number; cls: string }
	| { t: "mark"; from: number; to: number; cls: string }
	| { t: "hide"; from: number; to: number }
	| { t: "widget"; from: number; to: number; kind: "bullet" | "task-open" | "task-done" }
	| { t: "alert"; from: number; to: number; alert: AlertKind };

export const ALERT_NAMES: Record<AlertKind, string> = { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" };

export function dressingPlan(tree: Tree, text: string, isActive: (pos: number) => boolean, range?: { from: number; to: number }): PlanItem[] {
	const out: PlanItem[] = [];
	const lineStart = (pos: number): number => text.lastIndexOf("\n", pos - 1) + 1;
	const lineEnd = (pos: number): number => {
		const i = text.indexOf("\n", pos);
		return i === -1 ? text.length : i;
	};
	/** A class on every line from `from` to `to`. */
	const lines = (from: number, to: number, cls: string): void => {
		for (let at = lineStart(from); at <= Math.max(from, to - 1) && at <= text.length; at = lineEnd(at) + 1) {
			out.push({ t: "line", at, cls });
			if (lineEnd(at) >= text.length) break;
		}
	};
	/** A marker: hidden away from the caret's line, muted on it. */
	const marker = (from: number, to: number, extra = ""): void => {
		if (to <= from) return;
		if (isActive(from)) out.push({ t: "mark", from, to, cls: `sf-marker${extra ? ` ${extra}` : ""}` });
		else out.push({ t: "hide", from, to });
	};
	const muted = (from: number, to: number): void => void (to > from && out.push({ t: "mark", from, to, cls: "sf-marker" }));

	const alertAt = new Map<number, AlertKind>();
	for (const a of alerts(tree, text)) alertAt.set(a.from, a.kind);

	tree.iterate({
		from: range?.from,
		to: range?.to,
		enter(node) {
			const { name, from, to } = node;
			let m: RegExpExecArray | null;
			if ((m = /^ATXHeading([1-6])$/.exec(name))) {
				const level = Number(m[1]);
				lines(from, to, `sf-heading sf-heading-${level}`);
				const open = node.node.firstChild;
				let start = from;
				if (open?.name === "HeaderMark") {
					start = text[open.to] === " " || text[open.to] === "\t" ? open.to + 1 : open.to;
					marker(open.from, start, `sf-heading-text sf-heading-${level}`);
				}
				const close = node.node.lastChild;
				let end = to;
				if (close && close.name === "HeaderMark" && close.from !== open?.from) {
					end = close.from;
					while (end > start && /[ \t]/.test(text[end - 1])) end--;
					marker(end, close.to, `sf-heading-text sf-heading-${level}`);
				}
				if (end > start) out.push({ t: "mark", from: start, to: end, cls: `sf-heading-text sf-heading-${level}` });
			} else if ((m = /^SetextHeading([12])$/.exec(name))) {
				lines(from, to, `sf-heading sf-heading-${m[1]}`);
				out.push({ t: "mark", from, to: lineEnd(from), cls: `sf-heading-text sf-heading-${m[1]}` });
				const mark = node.node.lastChild;
				if (mark?.name === "HeaderMark") muted(mark.from, mark.to);
			} else if (name === "Emphasis" || name === "StrongEmphasis") {
				const cls = name === "Emphasis" ? "sf-em" : "sf-strong";
				const other = name === "Emphasis" ? "StrongEmphasis" : "Emphasis";
				const marks: { from: number; to: number }[] = [];
				for (let c = node.node.firstChild; c; c = c.nextSibling) if (c.name === "EmphasisMark") marks.push(c);
				if (marks.length >= 2) {
					const open = marks[0];
					const close = marks[marks.length - 1];
					// Bold italic: one of the kinds wrapping exactly the other (`***x***`, `_**x**_`) is a single bold-italic span, drawn once on the inner text.
					const wraps = ((): boolean => {
						const only = node.node.firstChild && node.node.getChild(other);
						return !!only && only.from === open.to && only.to === close.from;
					})();
					const inside = ((): boolean => {
						const p = node.node.parent;
						if (!p || p.name !== other) return false;
						const pm: { from: number; to: number }[] = [];
						for (let c = p.firstChild; c; c = c.nextSibling) if (c.name === "EmphasisMark") pm.push(c);
						return pm.length >= 2 && node.from === pm[0].to && node.to === pm[pm.length - 1].from;
					})();
					const both = wraps || inside;
					if (inside) out.push({ t: "mark", from: open.to, to: close.from, cls: "sf-strong sf-em" });
					else if (!wraps && close.from > open.to) out.push({ t: "mark", from: open.to, to: close.from, cls });
					const markerCls = both ? "sf-strong sf-em" : cls;
					marker(open.from, open.to, markerCls);
					marker(close.from, close.to, markerCls);
				}
			} else if (name === "Strikethrough") {
				const marks: { from: number; to: number }[] = [];
				for (let c = node.node.firstChild; c; c = c.nextSibling) if (c.name === "StrikethroughMark") marks.push(c);
				if (marks.length >= 2) {
					const open = marks[0];
					const close = marks[marks.length - 1];
					if (close.from > open.to) out.push({ t: "mark", from: open.to, to: close.from, cls: "sf-strike" });
					marker(open.from, open.to);
					marker(close.from, close.to);
				}
			} else if (name === "InlineCode") {
				const marks: { from: number; to: number }[] = [];
				for (let c = node.node.firstChild; c; c = c.nextSibling) if (c.name === "CodeMark") marks.push(c);
				if (marks.length >= 2) {
					out.push({ t: "mark", from: marks[0].to, to: marks[marks.length - 1].from, cls: "sf-code" });
					marker(marks[0].from, marks[0].to);
					marker(marks[marks.length - 1].from, marks[marks.length - 1].to);
				}
			} else if (name === "FencedCode") {
				lines(from, to, "sf-codeblock");
				for (let c = node.node.firstChild; c; c = c.nextSibling) if (c.name === "CodeMark" || c.name === "CodeInfo") muted(c.from, c.to);
			} else if (name === "Blockquote") {
				const alert = alertAt.get(from);
				lines(from, to, "sf-quote");
				if (alert) {
					lines(from, to, `sf-alert sf-alert-${alert}`);
					out.push({ t: "line", at: lineStart(from), cls: "sf-alert-first" });
					out.push({ t: "line", at: lineStart(Math.max(from, to - 1)), cls: "sf-alert-last" });
					const markerFrom = text.indexOf("[", from);
					const markerTo = text.indexOf("]", markerFrom) + 1;
					if (isActive(markerFrom)) muted(markerFrom, markerTo);
					else out.push({ t: "alert", from: markerFrom, to: markerTo, alert });
				}
			} else if (name === "QuoteMark") {
				marker(from, text[to] === " " ? to + 1 : to);
			} else if (name === "ListMark") {
				const list = node.node.parent?.parent?.name;
				if (list === "BulletList") {
					const task = node.node.nextSibling?.name === "Task";
					// A task item's own box stands in for the bullet.
					if (isActive(from)) muted(from, to);
					else if (task) out.push({ t: "hide", from, to });
					else out.push({ t: "widget", from, to, kind: "bullet" });
				} else muted(from, to);
			} else if (name === "TaskMarker") {
				const done = /\[[xX]\]/.test(text.slice(from, to));
				if (isActive(from)) muted(from, to);
				else out.push({ t: "widget", from, to, kind: done ? "task-done" : "task-open" });
				if (done) {
					const end = node.node.parent ? node.node.parent.to : to;
					out.push({ t: "mark", from: to, to: end, cls: "sf-task-done" });
				}
			} else if (name === "TableHeader") {
				out.push({ t: "mark", from, to, cls: "sf-table-head" });
			} else if (name === "TableDelimiter") {
				muted(from, to);
			} else if (name === "HorizontalRule") {
				lines(from, to, "sf-hr");
				muted(from, to);
			} else if (name === "FootnoteReference") {
				out.push({ t: "mark", from, to, cls: "sf-footnote-ref" });
			} else if (name === "FootnoteDefinition") {
				lines(from, to, "sf-footnote-def");
				const mark = node.node.firstChild;
				if (mark?.name === "FootnoteMark") muted(mark.from, mark.to);
			} else if (name === "Comment" || name === "CommentBlock") {
				out.push({ t: "mark", from, to, cls: "sf-comment" });
				return false;
			} else if (name === "Link" && node.node.parent?.name !== "Image") {
				const marks: { from: number; to: number }[] = [];
				let hasUrl = false;
				for (let c = node.node.firstChild; c; c = c.nextSibling) {
					if (c.name === "LinkMark") marks.push(c);
					if (c.name === "URL") hasUrl = true;
				}
				// Only a link with a target is dressed; `[text]` alone (a reference, an alert's marker) stays plain.
				if (hasUrl && marks.length >= 3) {
					const [open, close] = marks;
					if (close.from > open.to) out.push({ t: "mark", from: open.to, to: close.from, cls: "sf-link" });
					marker(open.from, open.to);
					// From `]` to the end of the link: the brackets, the path and any title, away from the caret.
					if (isActive(close.from)) muted(close.from, to);
					else out.push({ t: "hide", from: close.from, to });
				}
			} else if (name === "URL" && node.node.parent?.name !== "Link" && node.node.parent?.name !== "Image") {
				out.push({ t: "mark", from, to, cls: "sf-weblink" });
			} else if (name === "Autolink") {
				out.push({ t: "mark", from, to, cls: "sf-weblink" });
			} else if (name === "Image") {
				return false; // shown as plain source in 1.12.0 (images move to their own brief)
			}
		},
	});
	return out;
}
