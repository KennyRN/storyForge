/**
 * The resting grid (Tweaks 1 part 2, §1; Kenny's standing rule): a context panel lines up with the central pane's lines as they sit at rest, with the
 * central pane scrolled to its top. The central pane scrolls and the panel does not move with it: the figure is taken from the pane's layout with its
 * `scrollTop` taken off, and it is worked out again only when the layout changes (the window's size, a panel's width, the fonts and type styles, what the pane
 * holds), never when the pane scrolls: there is no scroll listener here.
 *
 * `anchor` is the panel's own element that has to sit level with `target`, an element of the central pane. The panel's top padding moves it there; if the
 * anchor would have to rise above the panel's top it stays at the top and `data-align-short-by` says by how much.
 */
export function trackRestingGrid(host: HTMLElement, find: () => { anchor: HTMLElement; target: HTMLElement } | null): { align(): void; dispose(): void } {
	let frame = 0;
	let watched: HTMLElement | null = null;
	const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => soon()) : null;
	const mutation = typeof MutationObserver !== "undefined" ? new MutationObserver(() => soon()) : null;
	const watch = (overview: HTMLElement | null): void => {
		if (overview === watched) return;
		if (watched) (resize?.unobserve(watched), mutation?.disconnect());
		watched = overview;
		if (overview) (resize?.observe(overview), mutation?.observe(overview, { childList: true, subtree: true }));
	};
	const align = (): void => {
		frame = 0;
		const overview = document.querySelector<HTMLElement>(".sf-overview");
		watch(overview);
		if (host.hidden) return;
		const found = overview ? find() : null;
		if (!overview || !found) return;
		host.style.paddingTop = "0px";
		const need = found.target.getBoundingClientRect().top + overview.scrollTop - found.anchor.getBoundingClientRect().top;
		host.style.paddingTop = `${Math.max(0, Math.round(need * 100) / 100)}px`;
		host.dataset.alignShortBy = need < 0 ? String(Math.round(-need)) : "0";
	};
	const soon = (): void => {
		if (!frame) frame = requestAnimationFrame(align);
	};
	resize?.observe(host);
	window.addEventListener("resize", soon);
	soon();
	return {
		align: soon,
		dispose: () => {
			resize?.disconnect();
			mutation?.disconnect();
			window.removeEventListener("resize", soon);
			if (frame) cancelAnimationFrame(frame);
		},
	};
}
