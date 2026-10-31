import { mountOverviewLayer } from "./overviews/layer";
import { mountCharactersButton } from "./context/charactersButton";
import { clampLeft, clampLore, type AppModel } from "./model";
import { EditorHost } from "./editor/editorHost";
import { el, fill } from "./kit/dom";
import { mountStorytellingFace } from "./faces/storytelling";
import { mountStoryForgeFace } from "./faces/storyforge";
import { button } from "./kit/button";
import { icon } from "./kit/icons";

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
	const name = model.running?.root.slice((model.running?.root.lastIndexOf("/") ?? -1) + 1) ?? "storyForge";
	const left = el("nav", { class: "sf-left", attrs: { "aria-label": "Library" } });
	const faceHost = el("div", { class: "sf-left-body" });
	const flip = button({ icon: "switch", name: "Flip side", tooltip: "Flip side", onClick: () => model.flipFace() });
	const header = el("div", { class: "sf-left-header" }, el("span", { class: "sf-left-name", text: name }), flip);
	const centre = el("section", { class: "sf-slot sf-slot--centre", attrs: { "aria-label": "Workspace" } });
	const overview = el("div", { class: "sf-overview", attrs: { role: "region" } });
	const centreWrap = el("div", { class: "sf-centre-wrap" }, centre, overview);
	const lore = el("aside", { class: "sf-slot sf-slot--lore", attrs: { "aria-label": "Context" } });
	// The editor host fills and empties its element; the bottom row (the special-characters button) lives below it, not inside it.
	// A note, when there is one, sits on a card inside the host; the host's padding is the card's margin (10% of the panel's width).
	const loreHost = el("div", { class: "sf-lore-host" });
	const loreRow = el("div", { class: "sf-context-row" });
	lore.append(loreHost, loreRow);
	const apply = (): void => {
		left.style.width = `${model.nav.leftWidth}px`;
		lore.style.width = `${model.nav.loreWidth}px`;
		lore.hidden = model.nav.loreHidden;
		loreBar.hidden = model.nav.loreHidden;
	};
	const leftBar = splitter("Resize the left panel", "left", () => model.nav.leftWidth, (w) => (model.setWidths(clampLeft(w)), apply()));
	const loreBar = splitter("Resize the context panel", "right", () => model.nav.loreWidth, (w) => (model.setWidths(undefined, clampLore(w)), apply()));
	fill(host, el("h1", { class: "sf-visually-hidden", text: name }), el("div", { class: "sf-frame" }, left, leftBar, centreWrap, loreBar, lore));

	model.editors = new EditorHost(model, { centre, lore: loreHost });
	model.editors.onChange = () => {
		apply();
		model.touch("nav");
	};
	apply();
	const offNav = model.subscribe("nav", apply);
	const overviews = mountOverviewLayer(overview, centre, model);
	const offCharacters = mountCharactersButton(loreRow, model);

	fill(left, header, faceHost);
	let disposeFace: (() => void) | null = null;
	let shownFace: string | null = null;
	const drawFace = (): void => {
		const face = model.nav.face;
		if (face === shownFace) return;
		shownFace = face;
		left.dataset.face = face;
		disposeFace?.();
		fill(faceHost);
		faceHost.className = "sf-left-body";
		flip.setAttribute("aria-pressed", String(face === "storyforge"));
		left.setAttribute("aria-label", face === "storytelling" ? "Storytelling" : "Library");
		disposeFace = face === "storytelling" ? mountStorytellingFace(faceHost, model) : mountStoryForgeFace(faceHost, model);
	};
	drawFace();
	const offFace = model.subscribe("face", drawFace);
	void model.ensureCentre();
	return {
		dispose() {
			offNav();
			offCharacters();
			overviews();
			offFace();
			disposeFace?.();
		},
	};
}
