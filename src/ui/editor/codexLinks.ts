import { syntaxTree } from "@codemirror/language";
import { Facet, Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap, showTooltip, tooltips, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { classifyLinkTarget, codexLinkMarkdown, suggestCodexEntries, type CodexLinkEntry, type LinkTarget, type LinkWorld, type Suggestion } from "../../core/codexLinks";
import { touchesProtected } from "../../core/typing/protectedText";
import { protectedAt } from "./protection";

/**
 * Codex links in an editor (Brief 20, decisions 151 and 157): typing `[[` offers the Codex entries; choosing one writes a complete
 * GFM link (`[Jane Harbour](../../Codex/Jane%20Harbour.md)`); a link whose target is a Codex entry is live (⌘-click, or ⌘-Return with
 * the caret in it, opens it) and every other link is muted with a tooltip saying why. A plain click only places the caret.
 */
export interface EditorLinks {
	/** The project-relative file this text is stored in: a link is relative to it. */
	fromFile: string;
	entries(): readonly CodexLinkEntry[];
	world(): LinkWorld;
	/** Opens a Codex entry: in the context panel on the storytelling side, in the Codex tab on the library side. */
	open(path: string): void;
	/** False where no Codex entry may be opened (Tweaks 1 part 2, §2: the novel, series and archive pages): links are dressed as links but inert. */
	live?: boolean;
}

export const linksFacet = Facet.define<EditorLinks, EditorLinks | null>({ combine: (v) => v[0] ?? null });

/** What a link's target is in this editor, or undefined when the editor has no links hooks (a plain link is then just drawn as a link). */
export const classifierOf = (state: EditorState): ((target: string) => LinkTarget) | undefined => {
	const links = state.facet(linksFacet);
	return links && links.live !== false ? (target) => classifyLinkTarget(links.fromFile, target, links.world()) : undefined;
};

interface Popup {
	/** Offset of the first `[` of `[[`. */
	start: number;
	head: number;
	suggestions: Suggestion[];
	selected: number;
}

const move = StateEffect.define<1 | -1>();
const dismiss = StateEffect.define<null>();
let counter = 0;

const QUERY = /\[\[([^\[\]\n]{0,60})$/;

/** The link at the caret (the Link node holding `pos`), with its target text, if there is one. */
function linkAt(state: EditorState, pos: number): { target: string; from: number; to: number } | null {
	for (let n: import("@lezer/common").SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
		if (n.name === "Link") {
			const url = n.getChild("URL");
			if (!url) return null;
			return { target: state.sliceDoc(url.from, url.to), from: n.from, to: n.to };
		}
		if (n.name === "Image") return null;
	}
	return null;
}

export interface CodexLinkHooks {
	/** Puts `insert` in place of `[from, to)` as the aid's own history step (the typing aids' route). */
	apply: (view: EditorView, replacement: { from: number; to: number; insert: string }) => void;
	/** The typed-run field of the aids: the `[[` must have been typed right now. */
	run: StateField<number | null>;
	field?: boolean;
}

/** The whole extension for an editor with links: the facet, the popup, ⌘-click and ⌘-Return. */
export function codexLinks(links: EditorLinks, hooks: CodexLinkHooks | null): Extension {
	const idBase = `sf-codexlink-${++counter}`;
	const listId = `${idBase}-list`;

	const selection = StateField.define<number>({
		create: () => 0,
		update(value, tr) {
			if (tr.docChanged) return 0;
			for (const e of tr.effects) if (e.is(move)) return value + e.value;
			return value;
		},
	});
	const dismissed = StateField.define<number | null>({
		create: () => null,
		update(value, tr) {
			let next = value === null ? null : tr.changes.mapPos(value, -1);
			if (next !== null && tr.docChanged && tr.newDoc.sliceString(next, next + 2) !== "[[") next = null;
			for (const e of tr.effects) if (e.is(dismiss)) next = triggerOf(tr.startState)?.start ?? next;
			return next;
		},
	});

	function triggerOf(state: EditorState): { start: number; head: number; query: string } | null {
		if (!hooks) return null;
		const sel = state.selection.main;
		if (!sel.empty || state.selection.ranges.length !== 1 || state.readOnly) return null;
		const line = state.doc.lineAt(sel.head);
		const m = QUERY.exec(state.sliceDoc(line.from, sel.head));
		if (!m) return null;
		const start = line.from + m.index;
		const runStart = state.field(hooks.run);
		if (runStart === null || start < runStart) return null; // only text typed right now
		const protect = protectedAt(state, sel.head);
		if (!protect || touchesProtected(protect, start)) return null; // no parse yet, or inside code or a comment
		return { start, head: sel.head, query: m[1] };
	}

	function popupFor(state: EditorState): Popup | null {
		const t = triggerOf(state);
		if (!t || state.field(dismissed) === t.start) return null;
		const suggestions = suggestCodexEntries(links.entries(), t.query);
		if (suggestions.length === 0) return null;
		const n = suggestions.length;
		return { start: t.start, head: t.head, suggestions, selected: ((state.field(selection) % n) + n) % n };
	}

	const accept = (view: EditorView, index?: number): boolean => {
		const p = popupFor(view.state);
		if (!p || !hooks) return false;
		const s = p.suggestions[index ?? p.selected];
		if (!s) return false;
		hooks.apply(view, { from: p.start, to: p.head, insert: codexLinkMarkdown(links.fromFile, s.entry.path, s.text) });
		return true;
	};

	const tooltip = (state: EditorState): Tooltip | null => {
		const p = popupFor(state);
		if (!p) return null;
		return {
			pos: p.start,
			above: false,
			strictSide: !hooks?.field,
			create: (view) => {
				const dom = document.createElement("div");
				dom.className = "sf-shortcode-popup sf-codexlink-popup";
				dom.id = listId;
				dom.setAttribute("role", "listbox");
				dom.setAttribute("aria-label", "Codex entries");
				p.suggestions.forEach((s, i) => {
					const option = document.createElement("div");
					option.id = `${idBase}-${i}`;
					option.className = `sf-shortcode-option${i === p.selected ? " is-selected" : ""}`;
					option.setAttribute("role", "option");
					option.setAttribute("aria-selected", String(i === p.selected));
					const label = document.createElement("span");
					label.className = "sf-shortcode-label";
					label.textContent = s.entry.name;
					option.append(label);
					const hint = document.createElement("span");
					hint.className = "sf-shortcode-text";
					hint.textContent = s.alias ? `alias: ${s.alias}` : "Codex";
					option.append(hint);
					option.addEventListener("mousedown", (e) => e.preventDefault());
					option.addEventListener("click", () => accept(view, i));
					dom.append(option);
				});
				return { dom };
			},
		};
	};

	const leaving = ViewPlugin.fromClass(
		class {
			update(u: ViewUpdate): void {
				if (!u.focusChanged || u.view.hasFocus || !popupFor(u.state)) return;
				const view = u.view;
				queueMicrotask(() => {
					try {
						if (view.dom.isConnected && !view.hasFocus) view.dispatch({ effects: dismiss.of(null) });
					} catch {
						/* redrawn or destroyed first */
					}
				});
			}
		},
	);

	/** ⌘-click opens a live link; a plain click is left to the editor, so a link's text can still be edited. */
	const click = EditorView.domEventHandlers({
		mousedown(event, view) {
			if (!event.metaKey) return false;
			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos === null) return false;
			const link = linkAt(view.state, pos);
			if (!link) return false;
			event.preventDefault();
			const target = classifyLinkTarget(links.fromFile, link.target, links.world());
			if (target.kind === "codex" && links.live !== false) links.open(target.path);
			return true;
		},
	});

	/** ⌘-Return on a link opens it if it is live and does nothing if it is muted; anywhere else it keeps its own meaning (a blank line). */
	const openAtCaret = (view: EditorView): boolean => {
		const sel = view.state.selection.main;
		const link = linkAt(view.state, sel.head);
		if (!link) return false;
		const target = classifyLinkTarget(links.fromFile, link.target, links.world());
		if (target.kind === "codex" && links.live !== false) links.open(target.path);
		return true;
	};

	return [
		linksFacet.of(links),
		click,
		Prec.highest(keymap.of([{ key: "Mod-Enter", run: openAtCaret }])),
		...(hooks
			? [
					...(hooks.field ? [tooltips({ parent: document.body, position: "fixed" }), leaving] : []),
					selection,
					dismissed,
					showTooltip.compute([selection, dismissed, hooks.run, "doc", "selection"], tooltip),
					EditorView.contentAttributes.compute([selection, dismissed, hooks.run, "doc", "selection"], (state): Record<string, string> => {
						const p = popupFor(state);
						return p ? { "aria-autocomplete": "list", "aria-haspopup": "listbox", "aria-expanded": "true", "aria-controls": listId, "aria-activedescendant": `${idBase}-${p.selected}` } : {};
					}),
					Prec.highest(
						keymap.of([
							{ key: "Tab", run: (view) => accept(view) },
							{ key: "Escape", run: (view) => (popupFor(view.state) ? (view.dispatch({ effects: dismiss.of(null) }), true) : false) },
							{ key: "ArrowDown", run: (view) => (popupFor(view.state) ? (view.dispatch({ effects: move.of(1) }), true) : false) },
							{ key: "ArrowUp", run: (view) => (popupFor(view.state) ? (view.dispatch({ effects: move.of(-1) }), true) : false) },
						]),
					),
				]
			: []),
	];
}
