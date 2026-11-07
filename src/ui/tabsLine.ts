import type { AppModel } from "./model";

/**
 * The library tabs' drawn rounded squares, measured once (Tweaks 2, §1.1): the visible top and bottom edges of the five shapes (archive, codex, series, novel,
 * storytelling), not the icon element's box, which includes the icon's inner margin. Everything that lines up with the tabs uses these two lines: the titles'
 * baseline sits on `bottom` (the novel and series pages, and the series context panel's title), and the Codex and Archive pages start at `top`.
 * Null when the tabs are not on the page (the storytelling side).
 */
export function tabSquares(): { top: number; bottom: number } | null {
	const shapes = Array.from(document.querySelectorAll<SVGGraphicsElement>(".sf-rail .sf-tab svg > path"));
	if (shapes.length === 0) return null;
	// The median of the five: the storytelling icon's path is drawn larger than its visible square (a mask cuts it back), so its box would pull a minimum or maximum off the line.
	const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
	const rects = shapes.map((s) => s.getBoundingClientRect());
	return { top: median(rects.map((r) => r.top)), bottom: median(rects.map((r) => r.bottom)) };
}

/** Publishes the squares' top as `--tabs-top` on the page, recalculated when the layout changes (a resize, a face or tab change, the fonts loading), as the resting grid is. */
export function mountTabsLine(model: AppModel): () => void {
	let frame = 0;
	const apply = (): void => {
		frame = 0;
		const squares = tabSquares();
		if (squares) document.documentElement.style.setProperty("--tabs-top", `${Math.round(squares.top * 100) / 100}px`);
	};
	const soon = (): void => {
		if (!frame) frame = requestAnimationFrame(apply);
	};
	window.addEventListener("resize", soon);
	const off = model.subscribe(["nav", "face", "settings"], soon);
	const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(soon) : null;
	watch?.observe(document.body);
	void document.fonts?.ready.then(soon);
	soon();
	return () => {
		window.removeEventListener("resize", soon);
		off();
		watch?.disconnect();
		if (frame) cancelAnimationFrame(frame);
	};
}
