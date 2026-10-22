import { App, TFile, setIcon, setTooltip } from "obsidian";
import { readBookFrontmatter, writeDefaultPov } from "../book";
import { getCodexEntriesByType } from "../codex";
import { readChapterWordCount } from "../history";
import { ICON_PERSON_FILL, ICON_PERSON_FILL_ADD, ICON_X, setNumberFillIcon } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { formatWordCount } from "../wordCount";

/** Exported for TopPanel.ts's Novel-tab chapter list, which shows this same row above its Novel
 * Length/Chapter Length fields — all three share one .sf-story-context-meta wrapper there (equal
 * spacing between all three rows), so this takes that wrapper directly rather than creating its
 * own nested one. */
export function renderDefaultPovRow(app: App, meta: HTMLElement, bookFolderName: string, onChanged: () => void): void {
	const fm = readBookFrontmatter(app, bookFolderName);
	const path = fm?.defaultPovPath ?? null;
	const name = fm?.defaultPovName ?? null;
	const row = meta.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: "Default PoV:" });
	renderMetaControl(row, {
		iconId: path ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
		value: path ? (name ?? path) : null,
		tooltip: path ? "change pov character" : "set pov character",
		onOpen: () => void openDefaultPovPicker(app, bookFolderName, !!path, onChanged),
	});
}

async function openDefaultPovPicker(app: App, bookFolderName: string, hasValue: boolean, onChanged: () => void): Promise<void> {
	const entries = getCodexEntriesByType(app, "person");
	new CodexEntryPickerModal(app, {
		title: "Set PoV",
		emptyMessage: "No person entries in the Codex yet.",
		entries,
		hasValue,
		onPick: async (entry) => {
			await writeDefaultPov(app, bookFolderName, entry.path, entry.name);
			onChanged();
		},
		onClear: async () => {
			await writeDefaultPov(app, bookFolderName, null, null);
			onChanged();
		},
	}).open();
}

/** Which of the Novel tab's two planned-length rows (if either) currently has its inline "push
 * down" number editor open — see renderPlannedLengthMetaRow. At most one at a time. Also reused
 * by NovelTitleModal, which shows the same two rows (its own local open/closed state, not a
 * shared one — TopPanel.ts's own editor closes independently of the modal's). */
export type PlannedLengthField = "novel" | "chapter";

/** Digits before the caret, ignoring any comma separators already in the value — used to
 * re-place the caret after reformatting adds/removes commas around it. */
function countDigitsBeforeCaret(input: HTMLInputElement): number {
	const pos = input.selectionStart ?? input.value.length;
	return (input.value.slice(0, pos).match(/\d/g) ?? []).length;
}

/** Inverse of countDigitsBeforeCaret: places the caret right after the Nth digit in the
 * (already reformatted) value, so typing/deleting in the middle of a grouped number doesn't
 * bounce the caret to the end every keystroke. */
function setCaretAfterDigitCount(input: HTMLInputElement, digitCount: number): void {
	if (digitCount <= 0) {
		input.setSelectionRange(0, 0);
		return;
	}
	let seen = 0;
	for (let i = 0; i < input.value.length; i++) {
		if (/\d/.test(input.value[i])) {
			seen++;
			if (seen === digitCount) {
				input.setSelectionRange(i + 1, i + 1);
				return;
			}
		}
	}
	input.setSelectionRange(input.value.length, input.value.length);
}

/** Shared comma-formatting/keyboard wiring for a planned-length numeric input — used by both
 * renderPlannedLengthEditorRow's "push down" editor and renderPlannedLengthAlwaysOpenRow's
 * permanently-visible field. Enter blurs (committing), Escape reverts to `value`, blur commits
 * whatever's left; `onDone` fires at most once (a fresh input from the next render carries its
 * own guard, so this only ever needs to protect a single element's own lifetime) — including when
 * a caller invokes the returned `finish` directly (the "x" clear button, which needs to commit
 * `null` regardless of whatever's currently typed, rather than blur's own read of the live value).
 * Does not focus the input — callers that want that (the "push down" editor, on open) do it
 * themselves. */
function bindPlannedLengthInput(input: HTMLInputElement, value: number | null, onDone: (next: number | null) => void): (next: number | null) => void {
	input.addEventListener("pointerdown", (e) => e.stopPropagation());
	input.addEventListener("input", () => {
		const caretDigits = countDigitsBeforeCaret(input);
		const digits = input.value.replace(/\D/g, "");
		input.value = digits ? Number(digits).toLocaleString("en-US") : "";
		setCaretAfterDigitCount(input, caretDigits);
	});
	let settled = false;
	const finish = (next: number | null) => {
		if (settled) return;
		settled = true;
		onDone(next);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			finish(value);
		}
	});
	input.addEventListener("blur", () => {
		const digits = input.value.replace(/\D/g, "");
		finish(digits ? Number(digits) : null);
	});
	return finish;
}

/** The inline "push down" number editor a planned-length row opens beneath itself — same idea as
 * the storytelling panel's chapter selector expanding its 5-row list below the current-chapter row
 * (CodexFocusNavigator.ts) rather than a modal. A `--ghost` label (identical text, hidden but still
 * taking up space) reserves the same width the real label above occupies, so the input's left edge
 * lands exactly where that row's own value/icon sits — visually aligned with the label's colon.
 * Comma-grouped as you type; Enter blurs (committing), Escape reverts to the original value, the
 * "x" (renderMetaClearButton) clears outright — all three close the editor via `onDone`, called at
 * most once per open (the "x" beside the box is the only place this row shows one; the collapsed
 * meta-control above never does). */
function renderPlannedLengthEditorRow(meta: HTMLElement, label: string, value: number | null, onDone: (value: number | null) => void): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-editor-row" });
	row.createSpan({
		cls: "sf-story-context-meta-label sf-story-context-meta-label--ghost",
		text: `${label}:`,
		attr: { "aria-hidden": "true" },
	});
	const input = row.createEl("input", {
		cls: "sf-planned-length-editor-input",
		attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": label },
	});
	input.value = value !== null ? value.toLocaleString("en-US") : "";
	const finish = bindPlannedLengthInput(input, value, onDone);
	renderMetaClearButton(row, `clear ${label.toLowerCase()}`, () => finish(null));
	window.setTimeout(() => {
		input.focus();
		input.select();
	}, 0);
}

/** A planned-length row with no collapsed state at all — the real (non-ghost) label sits directly
 * beside its own always-visible input, rather than a separate clickable meta-control toggling
 * renderPlannedLengthEditorRow open/closed beneath it. NovelTitleModal's Novel Length/Chapter
 * Length rows use this: those two fields stay expanded permanently with no way to collapse them. */
export function renderPlannedLengthAlwaysOpenRow(meta: HTMLElement, label: string, value: number | null, onCommit: (value: number | null) => void): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-editor-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: `${label}:` });
	const input = row.createEl("input", {
		cls: "sf-planned-length-editor-input",
		attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": label },
	});
	input.value = value !== null ? value.toLocaleString("en-US") : "";
	const finish = bindPlannedLengthInput(input, value, onCommit);
	renderMetaClearButton(row, `clear ${label.toLowerCase()}`, () => finish(null));
}

/** Reads every ordered chapter's live word count in parallel — the source for both the Novel
 * Length row's "current of target" figure and the Chapter Length editor's average/median stats. */
export async function readOrderedChapterWordCounts(app: App, bookFolderName: string, ordered: TFile[]): Promise<number[]> {
	return Promise.all(ordered.map((file) => readChapterWordCount(app, bookFolderName, file.name)));
}

/** One of the two plain (non-interactive) stat rows shown beneath the open Chapter Length editor —
 * "average:"/"median:", comma-grouped like the length fields themselves. `ghostLabelText` is the
 * real "Chapter Length" label text: an invisible copy of it reserves a label column exactly as
 * wide as that row's own label, and the real (much shorter) "average"/"median" text is right-
 * aligned within that same reserved width — same font, so this lines their own colon up with
 * Chapter Length's, matching a fixed number column rather than a fixed label-start column (compare
 * renderPlannedLengthEditorRow's ghost, which instead reserves space *before* its input). Returns
 * the value span so the caller can patch in the live figure once its async word-count read resolves.
 */
export function renderPlannedLengthStatRow(meta: HTMLElement, ghostLabelText: string, label: string): HTMLElement {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-stat-row" });
	const labelSlot = row.createSpan({ cls: "sf-story-context-meta-label sf-planned-length-stat-label" });
	labelSlot.createSpan({
		cls: "sf-planned-length-stat-label-ghost",
		text: `${ghostLabelText}:`,
		attr: { "aria-hidden": "true" },
	});
	labelSlot.createSpan({ cls: "sf-planned-length-stat-label-text", text: `${label}:` });
	return row.createSpan({ cls: "sf-story-context-meta-value" });
}

/** A planned novel/chapter length row, styled identically to Default PoV's own meta row (same
 * label + icon-control pieces, renderMetaControl above) rather than a persistent text box:
 * clicking the control (setNumberFillIcon when unset — a stroke-drawn glyph, so it can't go
 * through Obsidian's fill-only `setIcon` — or just the number itself once set, `hideIconWhenValue`
 * dropping the icon then) opens the inline editor below (renderPlannedLengthEditorRow) instead of a
 * modal. Clearing (the "x") lives only in that editor, not on this collapsed row. Returns the
 * created value span (or null if `value` is unset) — Novel Length's row uses this to patch in the
 * live "current of target" text once that async total resolves (see TopPanel.ts's renderBookList
 * and NovelTitleModal, both of which call this). */
export function renderPlannedLengthMetaRow(
	meta: HTMLElement,
	field: PlannedLengthField,
	label: string,
	value: number | null,
	isEditorOpen: boolean,
	onSetEditor: (field: PlannedLengthField | null) => void,
	onCommit: (value: number | null) => void,
): HTMLElement | null {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: `${label}:` });
	const valueEl = renderMetaControl(row, {
		paintIcon: setNumberFillIcon,
		value: value !== null ? value.toLocaleString("en-US") : null,
		hideIconWhenValue: true,
		tooltip: isEditorOpen ? `close ${label.toLowerCase()}` : value !== null ? `change ${label.toLowerCase()}` : `set ${label.toLowerCase()}`,
		onOpen: () => onSetEditor(isEditorOpen ? null : field),
	});
	if (isEditorOpen) {
		renderPlannedLengthEditorRow(meta, label, value, onCommit);
	}
	return valueEl;
}

/** Returns the created value span (or null if `opts.value` was falsy and none was created) — so a
 * caller with a live async figure to layer in later (TopPanel.ts's Novel Length row prefixing the
 * current word count) can patch its text in place once that resolves, without a full re-render. */
export function renderMetaControl(
	row: HTMLElement,
	opts: {
		iconId?: string;
		paintIcon?: (el: HTMLElement) => void;
		value: string | null;
		tooltip: string;
		onOpen: () => void;
		hideIconWhenValue?: boolean;
	},
): HTMLElement | null {
	const control = row.createSpan({
		cls: "sf-story-context-meta-control",
		attr: { role: "button", tabindex: "0", "aria-label": opts.tooltip },
	});
	setTooltip(control, opts.tooltip);
	if (!(opts.hideIconWhenValue && opts.value)) {
		const iconEl = control.createSpan({ cls: "sf-story-context-meta-icon" });
		if (opts.paintIcon) opts.paintIcon(iconEl);
		else if (opts.iconId) setIcon(iconEl, opts.iconId);
	}
	let valueEl: HTMLElement | null = null;
	if (opts.value) {
		valueEl = control.createSpan({ cls: "sf-story-context-meta-value", text: opts.value });
	}
	control.addEventListener("click", (e) => {
		e.stopPropagation();
		opts.onOpen();
	});
	makeAccessibleActivatable(control, opts.onOpen);
	return valueEl;
}

/** A small "x" button beside a meta control's value — clears it directly, no picker/modal needed.
 * Used by TopPanel.ts's planned novel/chapter length rows (unlike Default PoV/PoV/location, whose
 * clearing lives inside their own picker modal instead — see CodexEntryPickerModal's "— Clear —"
 * row). */
export function renderMetaClearButton(row: HTMLElement, tooltip: string, onClear: () => void): void {
	const btn = row.createSpan({
		cls: "sf-story-context-meta-clear",
		attr: { role: "button", tabindex: "0", "aria-label": tooltip },
	});
	setTooltip(btn, tooltip);
	setIcon(btn, ICON_X);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onClear();
	});
	makeAccessibleActivatable(btn, onClear);
}

