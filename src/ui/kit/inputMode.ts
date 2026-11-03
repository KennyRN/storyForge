/**
 * Focus rings are for the keyboard (Fix 7 polish). The browser's own :focus-visible guess isn't enough: a control the app focuses
 * itself after a click (the chapter selector after a chapter is chosen) can still show a ring. So the last input is recorded on the
 * root (`data-input`), and while it is the pointer's, no ring is drawn on anything but a text box; any key puts the rings back, so
 * reaching a control by keyboard (and focus returning to the selector after Escape) always shows one.
 */
export function installInputMode(doc: Document = document): () => void {
	const root = doc.documentElement;
	const set = (mode: "pointer" | "keyboard"): void => {
		if (root.dataset.input !== mode) root.dataset.input = mode;
	};
	const key = (e: KeyboardEvent): void => {
		if (e.key !== "Shift" && e.key !== "Meta" && e.key !== "Control" && e.key !== "Alt") set("keyboard");
	};
	const pointer = (): void => set("pointer");
	doc.addEventListener("keydown", key, true);
	doc.addEventListener("pointerdown", pointer, true);
	return () => (doc.removeEventListener("keydown", key, true), doc.removeEventListener("pointerdown", pointer, true));
}
