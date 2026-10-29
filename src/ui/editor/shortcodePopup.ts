import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import { protectedRanges, touchesProtected } from "../../core/typing/protectedText";
import { shortcodeEntries, shortcodeTrigger, type ShortcodeEntry } from "../../core/typing/shortcodes";
import type { TypingEditorOptions } from "./typingAids";

/** What the popup needs from the aids' extension: the options, the typed-run field, and how to make an edit as an aid. */
export interface ShortcodePopupHooks {
	options: () => TypingEditorOptions;
	run: StateField<number | null>;
	/** Puts `insert` in place of `[from, to)` as the aid's own history step. */
	apply: (view: EditorView, replacement: { from: number; to: number; insert: string }) => void;
}

interface Popup {
	/** Offset of the `~` in the document. */
	tilde: number;
	head: number;
	entries: ShortcodeEntry[];
	selected: number;
}

const move = StateEffect.define<1 | -1>();
const dismiss = StateEffect.define<null>();
let counter = 0;

/**
 * The shortcode popup (docs/typing-aids.md §6): `~` and some letters, typed right now outside protected text, offer
 * the author's codes (and, if asked, Codex names) in a small list at the caret. Tab accepts the highlighted entry,
 * Escape dismisses, the arrows move, and every other key carries on typing; Return is never taken (it makes a new
 * paragraph). It is a plain `@codemirror/view` tooltip, with the list announced to a screen reader through
 * `aria-activedescendant` on the text box.
 */
export function shortcodePopup(hooks: ShortcodePopupHooks): Extension {
	const idBase = `sf-shortcode-${++counter}`;
	const listId = `${idBase}-list`;

	/** Which entry is highlighted: moved by the arrows, back to the first whenever the text changes. */
	const selection = StateField.define<number>({
		create: () => 0,
		update(value, tr) {
			if (tr.docChanged) return 0;
			for (const e of tr.effects) if (e.is(move)) return value + e.value;
			return value;
		},
	});
	/** Where the `~` of a dismissed popup is: it stays closed until a new `~` starts one. */
	const dismissed = StateField.define<number | null>({
		create: () => null,
		update(value, tr) {
			let next = value === null ? null : tr.changes.mapPos(value, -1);
			if (next !== null && tr.docChanged && tr.newDoc.sliceString(next, next + 1) !== "~") next = null;
			for (const e of tr.effects) if (e.is(dismiss)) next = currentTilde(tr.startState);
			return next;
		},
	});

	/** The `~` of the shortcode in progress at the caret, if there is one (before any dismissal is considered). */
	function trigger(state: EditorState): { tilde: number; head: number; query: string } | null {
		const o = hooks.options();
		if (!o.shortcodes) return null;
		const sel = state.selection.main;
		if (!sel.empty || state.selection.ranges.length !== 1) return null;
		const line = state.doc.lineAt(sel.head);
		const t = shortcodeTrigger(state.sliceDoc(line.from, sel.head));
		if (!t) return null;
		const tilde = line.from + t.tilde;
		const runStart = state.field(hooks.run);
		if (runStart === null || tilde < runStart) return null; // only text typed right now
		if (touchesProtected(protectedRanges(state.sliceDoc(0, sel.head)), tilde)) return null;
		return { tilde, head: sel.head, query: t.query };
	}
	const currentTilde = (state: EditorState): number | null => trigger(state)?.tilde ?? null;

	function popupFor(state: EditorState): Popup | null {
		const t = trigger(state);
		if (!t || state.field(dismissed) === t.tilde) return null;
		const o = hooks.options();
		const entries = shortcodeEntries(t.query, o.shortcodeList, o.names, o.shortcodeNames);
		if (entries.length === 0) return null;
		const n = entries.length;
		const selected = ((state.field(selection) % n) + n) % n;
		return { tilde: t.tilde, head: t.head, entries, selected };
	}

	const accept = (view: EditorView, index?: number): boolean => {
		const p = popupFor(view.state);
		if (!p) return false;
		const entry = p.entries[index ?? p.selected];
		if (!entry) return false;
		hooks.apply(view, { from: p.tilde, to: p.head, insert: entry.text });
		return true;
	};

	const tooltip = (state: EditorState): Tooltip | null => {
		const p = popupFor(state);
		if (!p) return null;
		return {
			pos: p.tilde,
			above: false,
			strictSide: true,
			create: (view) => {
				const dom = document.createElement("div");
				dom.className = "sf-shortcode-popup";
				dom.id = listId;
				dom.setAttribute("role", "listbox");
				dom.setAttribute("aria-label", "Shortcodes");
				p.entries.forEach((entry, i) => {
					const option = document.createElement("div");
					option.id = `${idBase}-${i}`;
					option.className = `sf-shortcode-option${i === p.selected ? " is-selected" : ""}`;
					option.setAttribute("role", "option");
					option.setAttribute("aria-selected", String(i === p.selected));
					const label = document.createElement("span");
					label.className = "sf-shortcode-label";
					label.textContent = entry.label;
					option.append(label);
					if (entry.kind === "code") {
						const text = document.createElement("span");
						text.className = "sf-shortcode-text";
						text.textContent = entry.text;
						option.append(text);
					} else {
						const hint = document.createElement("span");
						hint.className = "sf-shortcode-text";
						hint.textContent = "Codex";
						option.append(hint);
					}
					// Pressing it must not take focus from the writing.
					option.addEventListener("mousedown", (e) => e.preventDefault());
					option.addEventListener("click", () => accept(view, i));
					dom.append(option);
				});
				return { dom };
			},
		};
	};

	return [
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
	];
}
