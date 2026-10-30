import { spokenName } from "../../core/typing/characterNames";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

/**
 * The special-characters button (docs/typing-aids.md §7): at the right of the context panel's bottom row, only while
 * the panel is blank and the context panel is showing. It opens a small palette of the project's characters; choosing
 * one puts it in at the chapter's cursor (replacing a selection) as if typed, and the author's place is never lost:
 * the button and the palette take no focus from the writing when the mouse is used, and the editor keeps its
 * selection whatever has focus.
 */
export function mountCharactersButton(row: HTMLElement, model: AppModel): () => void {
	const corner = el("div", { class: "sf-context-corner" });
	row.append(corner);
	let open = false;

	const close = (focusButton = false): void => {
		if (!open) return;
		open = false;
		draw();
		if (focusButton) toggle.focus();
	};

	// The button itself is made once, so it keeps focus across redraws.
	const toggle = el("button", {
		class: "sf-chars-button",
		text: "æ",
		attrs: { type: "button", "aria-label": "Special characters", "aria-haspopup": "true", "aria-expanded": "false", title: "Special characters" },
	});
	// Pressing it must not take the editor's focus: the chapter keeps its selection and its place.
	toggle.addEventListener("mousedown", (e) => e.preventDefault());
	toggle.addEventListener("click", (e) => {
		open = !open;
		draw();
		// From the keyboard there is no pointer to leave the writing alone: move into the palette.
		if (open && e.detail === 0) corner.querySelector<HTMLButtonElement>(".sf-char:not([disabled])")?.focus();
	});

	function draw(): void {
		const running = model.running;
		const blank = !!running && model.editors?.pathIn("lore") === null;
		const shown = blank && running.settings.values.typingSpecialCharactersButton && !model.nav.loreHidden;
		corner.hidden = !shown;
		if (!shown) {
			open = false;
			corner.replaceChildren();
			return;
		}
		// Keep the palette as it is while the keyboard is inside it.
		if (open && corner.contains(document.activeElement) && document.activeElement !== toggle) return;
		const state = model.editors?.insertState() ?? { ok: false as const, reason: "Open a chapter to put a character in." };
		const characters = running!.settings.values.typingSpecialCharacters;
		toggle.setAttribute("aria-expanded", String(open));

		const parts: HTMLElement[] = [];
		if (open) {
			const palette = el("div", { class: "sf-chars-palette", attrs: { role: "group", "aria-label": "Special characters" } });
			if (!state.ok) palette.append(el("p", { class: "sf-chars-reason sf-muted", text: state.reason }));
			const grid = el("div", { class: "sf-chars-grid" });
			if (characters.length === 0) grid.append(el("span", { class: "sf-muted", text: "None: add some in settings." }));
			for (const ch of characters) {
				const b = el("button", { class: "sf-char", text: ch, attrs: { type: "button", "aria-label": spokenName(ch), title: spokenName(ch) } });
				b.disabled = !state.ok;
				b.addEventListener("mousedown", (e) => e.preventDefault());
				b.addEventListener("click", () => {
					if (model.editors?.insertAtCursor(ch)) close();
				});
				b.addEventListener("keydown", (e) => {
					const all = [...grid.querySelectorAll<HTMLButtonElement>(".sf-char:not([disabled])")];
					const i = all.indexOf(b);
					const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? all[(i + 1) % all.length] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? all[(i - 1 + all.length) % all.length] : null;
					if (to) {
						e.preventDefault();
						to.focus();
					}
				});
				grid.append(b);
			}
			palette.append(grid);
			palette.addEventListener("keydown", (e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					close(true);
				}
			});
			parts.push(palette);
		}
		// Only the palette changes; the button is never taken out and put back, which would drop its focus.
		corner.querySelector(".sf-chars-palette")?.remove();
		if (parts[0]) corner.insertBefore(parts[0], toggle.parentNode === corner ? toggle : null);
		if (toggle.parentNode !== corner) corner.append(toggle);
	}

	const outside = (e: PointerEvent): void => {
		if (open && e.target instanceof Node && !corner.contains(e.target)) close();
	};
	document.addEventListener("pointerdown", outside, true);
	const off = model.subscribe(["nav", "settings", "project"], draw);
	draw();
	return () => {
		off();
		document.removeEventListener("pointerdown", outside, true);
		corner.remove();
	};
}
