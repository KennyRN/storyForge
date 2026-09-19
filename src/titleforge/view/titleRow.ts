import { setIcon, setTooltip, type App } from "obsidian";
import { ICON_ARROW_INSERT, ICON_INFO_CIRCLE, ICON_STAR_FILL, ICON_STAR_OUTLINE } from "../../icons.js";
import type { GeneratorSpec, HistoryEntry } from "../engine/types.js";
import { TitleShapeInfoModal } from "./TitleShapeInfoModal.js";

/** `renderTitleRow`'s callbacks/config — pulled out so both TitleForgePanel's own lists (current
 * batch, kept titles) and TitleForgeHistoryModal render the exact same row markup rather than each
 * keeping their own copy. `useTooltip`, when supplied alongside `onUse`, is the caller's own
 * pre-resolved wording ("use this series name" vs "use this title") — this module has no opinion
 * on tab/section semantics, just the row itself. */
export interface TitleRowOptions {
	app: App;
	onToggleKept: (spec: GeneratorSpec, entry: HistoryEntry) => void;
	onUse?: (title: string) => void;
	useTooltip?: string;
}

/** One row — used by every titleForge list (the current-batch box, the kept-titles tab, and the
 * previous-generations history modal). The row shows exactly two things: the title on its own
 * line, nothing else beside it, and the action icons on the line beneath — an info icon (opens
 * TitleShapeInfoModal) and a short-list star; a "use this title" arrow joins them only when
 * `opts.onUse` is supplied. */
export function renderTitleRow(list: HTMLElement, spec: GeneratorSpec, entry: HistoryEntry, opts: TitleRowOptions): void {
	const item = list.createEl("li", { cls: "titleforge-row-item" });

	const head = item.createDiv({ cls: "titleforge-row-head" });
	head.createSpan({ cls: "titleforge-row-title", text: entry.title });

	// The row's actions sit on their own line beneath the title, as plain hover-icons (a
	// coloured glyph that brightens on hover/focus) rather than button chips.
	const actions = item.createDiv({ cls: "titleforge-row-actions" });

	addRowIcon(actions, ICON_INFO_CIRCLE, "about this title", () => {
		new TitleShapeInfoModal(opts.app, spec, entry).open();
	});

	addRowIcon(
		actions,
		entry.kept ? ICON_STAR_FILL : ICON_STAR_OUTLINE,
		entry.kept ? "remove from short list" : "short list title",
		() => opts.onToggleKept(spec, entry),
		entry.kept ? "is-kept" : undefined,
	);

	if (opts.onUse) {
		addRowIcon(actions, ICON_ARROW_INSERT, opts.useTooltip ?? "use this title", () => opts.onUse!(entry.title));
	}
}

/** One hover-icon in a row's action line — a `<span>` (not a `<button>`), made
 * keyboard-activatable the same way the section-switcher menu's own items are. */
export function addRowIcon(
	container: HTMLElement,
	icon: string,
	label: string,
	onActivate: () => void,
	extraClass?: string,
): void {
	const el = container.createSpan({
		cls: "titleforge-row-icon" + (extraClass ? ` ${extraClass}` : ""),
		attr: { role: "button", tabindex: "0", "aria-label": label },
	});
	setIcon(el, icon);
	setTooltip(el, label);
	el.addEventListener("click", onActivate);
	el.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" || evt.key === " ") {
			evt.preventDefault();
			onActivate();
		}
	});
}
