/**
 * Notebook and Archive source rails' sliding ink indicator: a vertical track flush against the
 * page's left edge, the page's full height, with a bar the length of one icon sitting beside the
 * active source. Adapted from CodeFronts' "Ink Slider" tab pattern (MIT; see Code Attributions.md),
 * turned from horizontal to vertical. As in the original, the geometry is measured from the
 * rendered icons rather than assumed. Horizontal placement and colours live in styles.css
 * (`.sf-notebook-source-rail--ink`).
 */

export interface InkRect {
	top: number;
	bottom: number;
}

export interface InkGeometry {
	trackTop: number;
	trackHeight: number;
	barTop: number;
	barHeight: number;
}

/** Track spans the page's top to its bottom; the bar matches the active icon. All offsets are
 * relative to `rail`'s top edge. Null when there's nothing measurable (no active icon, or a pane
 * that isn't laid out yet). */
export function computeInkGeometry(
	rail: InkRect,
	page: InkRect,
	icons: InkRect[],
	activeIndex: number,
): InkGeometry | null {
	const active = icons[activeIndex];
	if (!active) return null;
	const barHeight = active.bottom - active.top;
	if (barHeight <= 0) return null;
	return {
		trackTop: page.top - rail.top,
		trackHeight: Math.max(0, page.bottom - page.top),
		barTop: active.top - rail.top,
		barHeight,
	};
}

function sameGeometry(a: InkGeometry | null, b: InkGeometry | null): boolean {
	return (
		!!a &&
		!!b &&
		a.trackTop === b.trackTop &&
		a.trackHeight === b.trackHeight &&
		a.barTop === b.barTop &&
		a.barHeight === b.barHeight
	);
}

/** Which tab's rail a carried position belongs to: Notebook and Archive never slide into each other. */
export type InkRailKey = "notebook" | "archive";

/**
 * Owns the track and bar for whichever source rail (Notebook or Archive) is currently rendered. The view
 * destroys and rebuilds the rail on every source switch (render(true)), so a bar made fresh each
 * time would have nothing to slide from. Instead, release() records where the live bar is drawn
 * (mid-slide included) just before the old rail is torn down, and the next mount() starts the
 * new bar there, with transitions off, before sliding it to the active icon. With nothing carried
 * over (the Notebook opening, or the first render) the bar simply appears in place.
 *
 * One ResizeObserver per indicator (so one per view), re-pointed at each new rail and
 * disconnected on release(), so repeated switching never accumulates observers.
 */
export class NotebookInkIndicator {
	private rail: HTMLElement | null = null;
	private track: HTMLElement | null = null;
	private bar: HTMLElement | null = null;
	private applied: InkGeometry | null = null;
	private page: HTMLElement | null = null;
	private key: InkRailKey | null = null;
	private carried: { key: InkRailKey; barTop: number } | null = null;
	private observer: ResizeObserver | null = null;

	/** Adds the track and bar to a freshly built source rail and moves the bar to its `.is-active`
	 * button. Call once the page beside it exists, since the track takes the page's height. The
	 * split and page are observed alongside the rail so the bar and track re-align when the pane
	 * resizes (Obsidian panes resize without the window doing so) or the page's height changes. */
	mount(key: InkRailKey, rail: HTMLElement, page: HTMLElement): void {
		const from = this.carried?.key === key ? this.carried.barTop : null;
		this.carried = null;
		this.observer?.disconnect();
		rail.addClass("sf-notebook-source-rail--ink");
		this.key = key;
		this.rail = rail;
		this.page = page;
		this.track = rail.createDiv({ cls: "sf-notebook-ink-track", attr: { "aria-hidden": "true" } });
		this.bar = rail.createDiv({ cls: "sf-notebook-ink-bar", attr: { "aria-hidden": "true" } });
		const geometry = this.measure();
		if (geometry) {
			if (from === null) this.applyInstantly(geometry);
			else {
				this.applyInstantly({ ...geometry, barTop: from });
				this.apply(geometry);
			}
		}
		this.observer ??= new ResizeObserver(() => this.realign());
		this.observer.observe(rail);
		this.observer.observe(page);
		if (rail.parentElement) this.observer.observe(rail.parentElement);
	}

	/** Call before the rail's DOM is destroyed (every render, and on view close): remembers the
	 * bar's drawn position for the next mount() and stops observing. Only a rail live at this
	 * moment is carried, so a render that leaves the Notebook (another tab, Focus Mode) clears it
	 * on the following render and the Notebook reopens without a slide. Safe to call repeatedly. */
	release(): void {
		this.observer?.disconnect();
		this.carried =
			this.key && this.rail?.isConnected && this.bar && this.applied
				? {
						key: this.key,
						// Rects, not the transform property, so an in-flight slide is caught where it is drawn.
						barTop: this.bar.getBoundingClientRect().top - this.rail.getBoundingClientRect().top,
					}
				: null;
		this.key = null;
		this.rail = null;
		this.page = null;
		this.track = null;
		this.bar = null;
		this.applied = null;
	}

	/** ResizeObserver also fires once on observe(), mid-slide; only snap when the target itself
	 * has moved, so that first call leaves an in-flight slide alone. */
	private realign(): void {
		const geometry = this.measure();
		if (geometry && !sameGeometry(geometry, this.applied)) this.applyInstantly(geometry);
	}

	/** Measures the icons' SVGs rather than the buttons, so the bar is the icon's rendered height
	 * (not including the button's padding) and follows any future change to icon size. */
	private measure(): InkGeometry | null {
		if (!this.rail || !this.page) return null;
		const buttons = Array.from(this.rail.querySelectorAll<HTMLElement>(".sf-notebook-source-btn"));
		const icons = buttons.map((btn) => {
			const rect = (btn.querySelector("svg") ?? btn).getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom };
		});
		const activeIndex = buttons.findIndex((btn) => btn.hasClass("is-active"));
		const railRect = this.rail.getBoundingClientRect();
		const pageRect = this.page.getBoundingClientRect();
		return computeInkGeometry(
			{ top: railRect.top, bottom: railRect.bottom },
			{ top: pageRect.top, bottom: pageRect.bottom },
			icons,
			activeIndex,
		);
	}

	/** Positions without a transition: transitions off, apply, force a reflow so the browser
	 * commits that position, then transitions back on for the next apply(). */
	private applyInstantly(geometry: InkGeometry): void {
		if (!this.bar) return;
		this.bar.addClass("is-instant");
		this.apply(geometry);
		void this.bar.offsetHeight;
		this.bar.removeClass("is-instant");
	}

	private apply(geometry: InkGeometry): void {
		if (!this.track || !this.bar) return;
		this.track.style.top = `${geometry.trackTop}px`;
		this.track.style.height = `${geometry.trackHeight}px`;
		this.bar.style.height = `${geometry.barHeight}px`;
		this.bar.style.transform = `translateY(${geometry.barTop}px)`;
		this.applied = geometry;
	}
}
