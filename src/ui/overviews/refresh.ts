/** The overviews and the history view redraw at most once per quiet quarter-second: typing saves every two seconds at most, and a watcher batch arrives as several touches. */
export const REFRESH_DELAY_MS = 250;

export interface Debounced {
	(): void;
	cancel(): void;
}

export function debounced(fn: () => void, delay = REFRESH_DELAY_MS): Debounced {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const run = (() => {
		clearTimeout(timer);
		timer = setTimeout(fn, delay);
	}) as Debounced;
	run.cancel = () => clearTimeout(timer);
	return run;
}

function keyOf(node: Element): string {
	return `${node.tagName}|${node.getAttribute("aria-label") ?? ""}|${node.textContent ?? ""}`;
}

/**
 * Runs a redraw of `host` and puts focus back on the equivalent element if it was inside, so a refresh
 * never steals focus and never loses the keyboard's place. Nothing outside `host` is touched.
 */
export function redrawKeepingFocus(host: HTMLElement, redraw: () => void): void {
	const active = document.activeElement;
	const inside = active instanceof HTMLElement && host.contains(active) && active !== host ? active : null;
	const key = inside ? keyOf(inside) : null;
	const tag = inside?.tagName ?? "";
	redraw();
	if (key === null) return;
	for (const candidate of host.querySelectorAll<HTMLElement>(tag)) {
		if (keyOf(candidate) === key) {
			candidate.focus({ preventScroll: true });
			return;
		}
	}
}
