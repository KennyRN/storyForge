import { Language, defineLanguageFacet, syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { markdownParser } from "../../core/markdownTree";
import { alertIcon, type AlertKind } from "../kit/noticeIcons";
import { ALERT_NAMES, dressingPlan, type PlanItem } from "./dressingPlan";
import { toggleEmphasis } from "./dressing";

/**
 * The prose dressing (decisions 25, 149 and 157; Brief 20): GitHub Flavored Markdown, read from the parse tree
 * (`@lezer/markdown`, `core/markdownTree.ts`) and drawn as decorations. Markers are hidden except on any line
 * holding the caret or a selection, where they show so they can be edited. **Display only**: the plan is a list
 * of decorations and this file dispatches no change, so what is saved is what was typed.
 *
 * The classes are storyForge's own (`sf-em`, `sf-strong`, `sf-marker`, `sf-heading`, `sf-quote`, `sf-alert-*` and the
 * rest), styled from the purposes in editor.css.
 */

const markdownLanguage = new Language(defineLanguageFacet(), markdownParser, [], "storyforge-markdown");

const HIDE = Decoration.replace({});
const markCache = new Map<string, Decoration>();
const mark = (cls: string): Decoration => {
	let d = markCache.get(cls);
	if (!d) markCache.set(cls, (d = Decoration.mark({ class: cls })));
	return d;
};
const lineCache = new Map<string, Decoration>();
const line = (cls: string): Decoration => {
	let d = lineCache.get(cls);
	if (!d) lineCache.set(cls, (d = Decoration.line({ class: cls })));
	return d;
};

/** A glyph drawn in place of a bullet or a task box. It takes the place of the marker's characters and never joins the text. */
class GlyphWidget extends WidgetType {
	constructor(private readonly kind: "bullet" | "task-open" | "task-done") {
		super();
	}
	eq(other: GlyphWidget): boolean {
		return other.kind === this.kind;
	}
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = `sf-glyph sf-glyph-${this.kind}`;
		if (this.kind === "bullet") span.textContent = "•";
		else {
			span.setAttribute("role", "img");
			span.setAttribute("aria-label", this.kind === "task-done" ? "Done" : "Not done");
		}
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}
const GLYPHS = { bullet: Decoration.replace({ widget: new GlyphWidget("bullet") }), "task-open": Decoration.replace({ widget: new GlyphWidget("task-open") }), "task-done": Decoration.replace({ widget: new GlyphWidget("task-done") }) };

/** An alert's first line, `[!NOTE]`, drawn as its icon and name. */
class AlertLabelWidget extends WidgetType {
	constructor(private readonly alert: AlertKind) {
		super();
	}
	eq(other: AlertLabelWidget): boolean {
		return other.alert === this.alert;
	}
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "sf-alert-label";
		span.append(alertIcon(this.alert, 18), document.createTextNode(ALERT_NAMES[this.alert]));
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

function toDecoration(item: PlanItem): Range<Decoration> | null {
	switch (item.t) {
		case "line":
			return line(item.cls).range(item.at);
		case "mark":
			return item.to > item.from ? mark(item.cls).range(item.from, item.to) : null;
		case "hide":
			return item.to > item.from ? HIDE.range(item.from, item.to) : null;
		case "widget":
			return GLYPHS[item.kind].range(item.from, item.to);
		case "alert":
			return Decoration.replace({ widget: new AlertLabelWidget(item.alert) }).range(item.from, item.to);
	}
}

class DressingPlugin {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.build(view);
	}

	update(update: ViewUpdate): void {
		const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
		if (update.docChanged || update.viewportChanged || update.selectionSet || treeChanged) this.decorations = this.build(update.view);
	}

	private build(view: EditorView): DecorationSet {
		const { state } = view;
		const { doc } = state;
		const selected = state.selection.ranges.map((r) => ({ from: doc.lineAt(r.from).number, to: doc.lineAt(r.to).number }));
		const isActive = (pos: number): boolean => {
			const n = doc.lineAt(Math.min(pos, doc.length)).number;
			return selected.some((s) => n >= s.from && n <= s.to);
		};
		const decos: Range<Decoration>[] = [];
		const text = doc.toString();
		const tree = syntaxTree(state);
		for (const visible of view.visibleRanges) {
			// A construct that starts above the viewport still has to be drawn, so the plan covers whole lines.
			const from = doc.lineAt(visible.from).from;
			const to = doc.lineAt(visible.to).to;
			for (const item of dressingPlan(tree, text, isActive, { from, to })) {
				const d = toDecoration(item);
				if (d) decos.push(d);
			}
		}
		return Decoration.set(decos, true);
	}
}

/** ⌘B / ⌘I: toggles `**` / `*` around the selection; never in a read-only editor. */
function toggleCommand(marker: "**" | "*") {
	return (view: EditorView): boolean => {
		if (view.state.readOnly) return false;
		view.dispatch({ ...toggleEmphasis(view.state, marker), userEvent: "input.format", scrollIntoView: true });
		return true;
	};
}

export const emphasisKeymap = [
	{ key: "Mod-b", run: toggleCommand("**") },
	{ key: "Mod-i", run: toggleCommand("*") },
];

export function prose(): Extension {
	return [markdownLanguage.extension, ViewPlugin.fromClass(DressingPlugin, { decorations: (v) => v.decorations })];
}
