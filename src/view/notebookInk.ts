/**
 * Notebook source rail's sliding ink indicator: a vertical track in the gutter between the rail's
 * icons and the Notebook page, with a bar the length of one icon sitting beside the active
 * source. Adapted from CodeFronts' "Ink Slider" tab pattern (MIT; see Code Attributions.md),
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

/** Track spans the first icon's top to the last icon's bottom; the bar matches the active icon.
 * All offsets are relative to `rail`'s top edge. Null when there's nothing measurable (no icons,
 * no active icon, or a pane that isn't laid out yet). */
export function computeInkGeometry(rail: InkRect, icons: InkRect[], activeIndex: number): InkGeometry | null {
	const first = icons[0];
	const last = icons[icons.length - 1];
	const active = icons[activeIndex];
	if (!first || !last || !active) return null;
	const barHeight = active.bottom - active.top;
	if (barHeight <= 0) return null;
	return {
		trackTop: first.top - rail.top,
		trackHeight: last.bottom - first.top,
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

/**
 * Owns the track and bar for whichever Notebook source rail is currently rendered. The view
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
	private carriedBarTop: number | null = null;
	private observer: ResizeObserver | null = null;

	/** Adds the track and bar to a freshly built Notebook source rail and moves the bar to its
	 * `.is-active` button. `layoutEl` (the Notebook split) is observed alongside the rail so the
	 * bar re-aligns when the pane resizes - Obsidian panes resize without the window doing so. */
	mount(rail: HTMLElement, layoutEl: HTMLElement): void {
		const from = this.carriedBarTop;
		this.carriedBarTop = null;
		this.observer?.disconnect();
		rail.addClass("sf-notebook-source-rail--ink");
		this.rail = rail;
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
		this.observer.observe(layoutEl);
	}

	/** Call before the rail's DOM is destroyed (every render, and on view close): remembers the
	 * bar's drawn position for the next mount() and stops observing. Only a rail live at this
	 * moment is carried, so a render that leaves the Notebook (another tab, Focus Mode) clears it
	 * on the following render and the Notebook reopens without a slide. Safe to call repeatedly. */
	release(): void {
		this.observer?.disconnect();
		this.carriedBarTop =
			this.rail?.isConnected && this.bar && this.applied
				? // Rects, not the transform property, so an in-flight slide is caught where it is drawn.
					this.bar.getBoundingClientRect().top - this.rail.getBoundingClientRect().top
				: null;
		this.rail = null;
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
		if (!this.rail) return null;
		const buttons = Array.from(this.rail.querySelectorAll<HTMLElement>(".sf-notebook-source-btn"));
		const icons = buttons.map((btn) => {
			const rect = (btn.querySelector("svg") ?? btn).getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom };
		});
		const activeIndex = buttons.findIndex((btn) => btn.hasClass("is-active"));
		const railRect = this.rail.getBoundingClientRect();
		return computeInkGeometry({ top: railRect.top, bottom: railRect.bottom }, icons, activeIndex);
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
