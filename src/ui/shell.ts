import { mountLibraryLayer, mountOverviewLayer } from "./overviews/layer";
import { mountCharactersButton } from "./context/charactersButton";
import { mountTabsLine } from "./tabsLine";
import { mountChapterContext } from "./context/chapterContext";
import { mountChapterLengthBar } from "./faces/chapterLengthBar";
import { mountNovelContext } from "./context/novelContext";
import { contextMode } from "./context/contextMode";
import type { AppModel } from "./model";
import { EditorHost } from "./editor/editorHost";
import { el, fill } from "./kit/dom";
import { mountStorytellingFace } from "./faces/storytelling";
import { mountStoryForgeFace } from "./faces/storyforge";
import { mountNavMenu } from "./faces/navMenu";

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
	const navMenu = mountNavMenu(left, model);
	const titlebar = el("div", { class: "sf-titlebar", attrs: { "data-tauri-drag-region": "" } });
	const centre = el("section", { class: "sf-slot sf-slot--centre", attrs: { "aria-label": "Workspace" } });
	const overview = el("div", { class: "sf-overview", attrs: { role: "region" } });
	// The library side's Codex and Archive tabs show their selected entry (or nothing) in a layer over the chapter, which stays open underneath.
	const library = el("div", { class: "sf-library-layer" });
	const libraryHosts = {
		codex: el("div", { class: "sf-slot sf-slot--library", attrs: { "aria-label": "Codex entry" } }),
		archive: el("div", { class: "sf-slot sf-slot--library", attrs: { "aria-label": "Archived item" } }),
	};
	library.append(libraryHosts.codex, libraryHosts.archive);
	const lengthBar = el("div", {});
	const centreWrap = el("div", { class: "sf-centre-wrap" }, centre, overview, library, lengthBar);
	const lore = el("aside", { class: "sf-slot sf-slot--lore", attrs: { "aria-label": "Context" } });
	// The editor host fills and empties its element; the bottom row (the special-characters button) lives below it, not inside it.
	// A note, when there is one, sits on a card inside the host; the host's padding is the card's margin (the one gap, `--gap`).
	const loreHost = el("div", { class: "sf-lore-host" });
	const loreRow = el("div", { class: "sf-context-row" });
	// On the library side's novel tab the chosen chapter replaces the note here (Brief 14 §1.6); on every other tab the panel is unchanged.
	const chapterHost = el("div", { class: "sf-chapter-context" });
	const novelHost = el("div", { class: "sf-novel-context" }); // the series tab's chosen novel (Brief 19 §1.3)
	lore.append(loreHost, chapterHost, novelHost, loreRow);
	const apply = (): void => {
		const shown = model.displayWidths();
		left.style.width = `${shown.left}px`;
		lore.style.width = `${shown.lore}px`;
		lore.hidden = model.nav.loreHidden;
		// The note belongs to the storytelling side: on the library side it stays open, hidden and inert, so flipping back finds it as it was (Brief 19 §4).
		const noteShows = contextMode(model) === "note";
		loreHost.hidden = !noteShows;
		loreHost.inert = !noteShows;
		loreBar.hidden = model.nav.loreHidden;
	};
	const leftBar = splitter("Resize the left panel", "left", () => model.displayWidths().left, (w) => (model.setPanelWidthPx("left", w), apply()));
	const loreBar = splitter("Resize the context panel", "right", () => model.displayWidths().lore, (w) => (model.setPanelWidthPx("lore", w), apply()));
	fill(host, el("h1", { class: "sf-visually-hidden", text: name }), titlebar, el("div", { class: "sf-frame" }, left, leftBar, centreWrap, loreBar, lore));

	model.editors = new EditorHost(model, { centre, lore: loreHost, ...libraryHosts });
	model.editors.onChange = () => {
		apply();
		model.touch("nav");
	};
	apply();
	const offNav = model.subscribe("nav", apply);
	const offWidthsOnFlip = model.subscribe("face", apply); // the left panel's width is per side
	window.addEventListener("resize", apply);
	const overviews = mountOverviewLayer(overview, centre, model);
	const libraryLayer = mountLibraryLayer(library, libraryHosts, model);
	const offTabsLine = mountTabsLine(model);
	const offCharacters = mountCharactersButton(loreRow, model);
	const offLengthBar = mountChapterLengthBar(lengthBar, model);
	const offChapterContext = mountChapterContext(chapterHost, model);
	const offNovelContext = mountNovelContext(novelHost, model);

	fill(left, navMenu.button, faceHost);
	let disposeFace: (() => void) | null = null;
	let shownFace: string | null = null;
	const drawFace = (): void => {
		const face = model.nav.face;
		if (face === shownFace) return;
		shownFace = face;
		left.dataset.face = face;
		// Neither side has a header: the top band holds the traffic lights and the menu's chevron, and the project's name is in the menu.
		fill(left, navMenu.button, faceHost);
		disposeFace?.();
		fill(faceHost);
		faceHost.className = "sf-left-body";
		left.setAttribute("aria-label", face === "storytelling" ? "Storytelling" : "Library");
		disposeFace = face === "storytelling" ? mountStorytellingFace(faceHost, model) : mountStoryForgeFace(faceHost, model);
	};
	drawFace();
	const offFace = model.subscribe("face", drawFace);
	void model.ensureCentre();
	return {
		dispose() {
			offNav();
			offWidthsOnFlip();
			window.removeEventListener("resize", apply);
			offCharacters();
			offTabsLine();
			offChapterContext();
			offLengthBar();
			offNovelContext();
			overviews();
			libraryLayer();
			offFace();
			navMenu.dispose();
			disposeFace?.();
		},
	};
}
