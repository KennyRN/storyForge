import { clampLeft, clampLore, type AppModel } from "./model";
import { EditorHost } from "./editor/editorHost";
import { el, fill } from "./kit/dom";
import { mountStorytellingFace } from "./faces/storytelling";

/** A vertical splitter: drag, or use ← → when focused; reports the new width of the panel it sizes. */
function splitter(label: string, side: "left" | "right", get: () => number, set: (w: number) => void): HTMLElement {
	const bar = el("div", { class: `sf-splitter sf-splitter--${side}`, attrs: { role: "separator", "aria-orientation": "vertical", "aria-label": label, tabindex: "0" } });
	const sign = side === "left" ? 1 : -1; // the left panel grows rightwards, the right panel leftwards
	bar.addEventListener("pointerdown", (down) => {
		down.preventDefault();
		bar.setPointerCapture(down.pointerId);
		const startX = down.clientX;
		const startWidth = get();
		const move = (e: PointerEvent) => set(startWidth + sign * (e.clientX - startX));
		const up = () => {
			bar.removeEventListener("pointermove", move);
			bar.removeEventListener("pointerup", up);
			bar.removeEventListener("pointercancel", up);
		};
		bar.addEventListener("pointermove", move);
		bar.addEventListener("pointerup", up);
		bar.addEventListener("pointercancel", up);
	});
	bar.addEventListener("keydown", (e) => {
		const step = e.shiftKey ? 48 : 16;
		if (e.key === "ArrowLeft") set(get() - sign * step);
		else if (e.key === "ArrowRight") set(get() + sign * step);
		else return;
		e.preventDefault();
	});
	return bar;
}

/** The frame: the left panel (a face), the centre chapter editor and the lore slot, with splitters. */
export function mountShell(host: HTMLElement, model: AppModel): { dispose(): void } {
	const left = el("nav", { class: "sf-left", attrs: { "aria-label": "Library" } });
	const centre = el("section", { class: "sf-slot sf-slot--centre", attrs: { "aria-label": "Chapter" } });
	const lore = el("aside", { class: "sf-slot sf-slot--lore", attrs: { "aria-label": "Lore" } });
	const apply = (): void => {
		left.style.width = `${model.nav.leftWidth}px`;
		lore.style.width = `${model.nav.loreWidth}px`;
	};
	const leftBar = splitter("Resize the library panel", "left", () => model.nav.leftWidth, (w) => (model.setWidths(clampLeft(w)), apply()));
	const loreBar = splitter("Resize the lore panel", "right", () => model.nav.loreWidth, (w) => (model.setWidths(undefined, clampLore(w)), apply()));
	const name = model.running?.root.slice((model.running?.root.lastIndexOf("/") ?? -1) + 1) ?? "storyForge";
	fill(host, el("h1", { class: "sf-visually-hidden", text: name }), el("div", { class: "sf-frame" }, left, leftBar, centre, loreBar, lore));

	model.editors = new EditorHost(model, { centre, lore });
	model.editors.onChange = () => {
		apply();
		model.touch("nav");
	};
	apply();

	let disposeFace: (() => void) | null = null;
	const drawFace = (): void => {
		disposeFace?.();
		fill(left);
		left.className = "sf-left";
		disposeFace = mountStorytellingFace(left, model);
	};
	drawFace();
	void model.ensureCentre();
	return {
		dispose() {
			disposeFace?.();
		},
	};
}
