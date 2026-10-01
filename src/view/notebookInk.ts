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

export class NotebookInkIndicator {
	private rail: HTMLElement | null = null;
	private track: HTMLElement | null = null;
	private bar: HTMLElement | null = null;

	/** Adds the track and bar to a freshly built Notebook source rail and places the bar beside
	 * its `.is-active` button. */
	mount(rail: HTMLElement): void {
		rail.addClass("sf-notebook-source-rail--ink");
		this.rail = rail;
		this.track = rail.createDiv({ cls: "sf-notebook-ink-track", attr: { "aria-hidden": "true" } });
		this.bar = rail.createDiv({ cls: "sf-notebook-ink-bar", attr: { "aria-hidden": "true" } });
		const geometry = this.measure();
		if (geometry) this.apply(geometry);
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

	private apply(geometry: InkGeometry): void {
		if (!this.track || !this.bar) return;
		this.track.style.top = `${geometry.trackTop}px`;
		this.track.style.height = `${geometry.trackHeight}px`;
		this.bar.style.height = `${geometry.barHeight}px`;
		this.bar.style.transform = `translateY(${geometry.barTop}px)`;
	}
}
