/**
 * Sliding ink indicator for storyForge's icon rails: a vertical track beside a column of icons,
 * with a bar the length of one icon sitting beside the selected one. Adapted from CodeFronts'
 * "Ink Slider" tab pattern (MIT; see Code Attributions.md), turned from horizontal to vertical. As
 * in the original, the geometry is measured from the rendered icons rather than assumed.
 *
 * Used on the Notebook and Archive source rails, every codex index's #tag rail, and the
 * storyTelling sidebar's continuous-mode toggle. Horizontal placement and colours live in
 * styles.css, per `.sf-ink-track--<variant>`.
 */

/** Must match the bar's `transition` duration in styles.css (`.sf-ink-bar`). */
export const INK_DURATION_MS = 450;

export interface InkRect {
	top: number;
	bottom: number;
}

export interface InkGeometry {
	/** Track offsets relative to the element the track is appended to. */
	trackTop: number;
	trackHeight: number;
	/** Bar offset relative to the track. */
	barTop: number;
	barHeight: number;
}

/**
 * The track covers `span` (the page beside a source rail, or the icons themselves); the bar
 * matches the active icon, or with none selected is parked just above the track, which clips it
 * out of sight, so selecting slides it down from the top. Null when there's nothing measurable (no icons, or a pane that isn't
 * laid out yet).
 */
export function computeInkGeometry(
	container: InkRect,
	span: InkRect,
	icons: InkRect[],
	activeIndex: number,
): InkGeometry | null {
	const active = icons[activeIndex];
	const reference = active ?? icons[0];
	if (!reference) return null;
	const barHeight = reference.bottom - reference.top;
	if (barHeight <= 0) return null;
	return {
		trackTop: span.top - container.top,
		trackHeight: Math.max(0, span.bottom - span.top),
		barTop: active ? active.top - span.top : -barHeight,
		barHeight,
	};
}

/** How far into the slide a re-rendered bar should start, given when the click that began it
 * was captured; null once the slide would have finished (or the clock went backwards). */
export function resumeDelayMs(capturedAt: number, now: number, durationMs = INK_DURATION_MS): number | null {
	const elapsed = now - capturedAt;
	return elapsed >= 0 && elapsed < durationMs ? elapsed : null;
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

export interface InkMountOptions {
	/** Where the track is appended; must be the track's containing block (positioned). */
	container: HTMLElement;
	/** Selects the rail's icons within `container`, in order; the active one carries `.is-active`. */
	buttons: string;
	/** What the track spans; the icons themselves when omitted. */
	span?: HTMLElement;
	/** `.sf-ink-track--<variant>` in styles.css: horizontal position and colours. */
	variant: string;
	/** Extra elements whose resizing should re-align the bar (the pane or page). */
	observe?: HTMLElement[];
}

interface InkCarry {
	barTop: number;
	at: number;
}

/**
 * Owns the track and bar for one rail slot. The hosts destroy and rebuild a rail on every
 * selection, so a bar made fresh each time would have nothing to slide from. Instead the rail's
 * own click handler calls capture() before the host acts, recording where the live bar is drawn
 * (mid-slide included) and when. Any mount() within the slide's duration starts its new bar there,
 * with transitions off, then slides to the target with a negative transition-delay of the time
 * already elapsed, so the slide resumes mid-curve however many times the host re-renders during
 * it (the dossier load renders twice; opening the continuous read view re-renders the sidebar).
 * With no recent capture (a rail first opening) the bar simply appears in place.
 *
 * One ResizeObserver per slot, re-pointed at each new rail and disconnected on dispose(), so
 * repeated switching never accumulates observers.
 */
export class InkSlider {
	private options: InkMountOptions | null = null;
	private track: HTMLElement | null = null;
	private bar: HTMLElement | null = null;
	private applied: InkGeometry | null = null;
	private carry: InkCarry | null = null;
	private observer: ResizeObserver | null = null;

	/** Call from the rail's own selection handler, before the host re-renders. */
	capture(): void {
		if (!this.track?.isConnected || !this.bar || !this.applied) return;
		this.carry = {
			// Rects, not the transform property, so an in-flight slide is caught where it is drawn.
			barTop: this.bar.getBoundingClientRect().top - this.track.getBoundingClientRect().top,
			at: performance.now(),
		};
	}

	/** Adds the track and bar to a freshly built rail and moves the bar to its `.is-active` icon.
	 * Call once everything `span` depends on is laid out. */
	mount(options: InkMountOptions): void {
		this.observer?.disconnect();
		this.options = options;
		this.applied = null;
		this.track = options.container.createDiv({
			cls: `sf-ink-track sf-ink-track--${options.variant}`,
			attr: { "aria-hidden": "true" },
		});
		this.bar = this.track.createDiv({ cls: "sf-ink-bar" });
		const geometry = this.measure();
		const delay = this.carry ? resumeDelayMs(this.carry.at, performance.now()) : null;
		if (geometry) {
			if (this.carry && delay !== null) {
				this.applyInstantly({ ...geometry, barTop: this.carry.barTop });
				this.bar.style.transitionDelay = `-${delay}ms`;
				this.apply(geometry);
			} else {
				this.carry = null;
				this.applyInstantly(geometry);
			}
		}
		this.observer ??= new ResizeObserver(() => this.realign());
		this.observer.observe(options.container);
		for (const el of options.observe ?? []) this.observer.observe(el);
	}

	/** View closing: stop observing and forget the rail. */
	dispose(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.options = null;
		this.track = null;
		this.bar = null;
		this.applied = null;
		this.carry = null;
	}

	/** ResizeObserver also fires once on observe(), mid-slide; only snap when the target itself
	 * has moved, so that first call leaves an in-flight slide alone. */
	private realign(): void {
		if (!this.track?.isConnected) return;
		const geometry = this.measure();
		if (geometry && !sameGeometry(geometry, this.applied)) this.applyInstantly(geometry);
	}

	/** Measures the icons' SVGs rather than the buttons, so the bar is the icon's rendered height
	 * (not including the button's padding) and follows any future change to icon size. */
	private measure(): InkGeometry | null {
		const options = this.options;
		if (!options) return null;
		const buttons = Array.from(options.container.querySelectorAll<HTMLElement>(options.buttons));
		const icons = buttons.map((btn) => {
			const rect = (btn.querySelector("svg") ?? btn).getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom };
		});
		const first = icons[0];
		const last = icons[icons.length - 1];
		if (!first || !last) return null;
		const spanRect = options.span?.getBoundingClientRect();
		const span = spanRect ? { top: spanRect.top, bottom: spanRect.bottom } : { top: first.top, bottom: last.bottom };
		const containerRect = options.container.getBoundingClientRect();
		const activeIndex = buttons.findIndex((btn) => btn.hasClass("is-active"));
		return computeInkGeometry(
			{ top: containerRect.top, bottom: containerRect.bottom },
			span,
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

const sliders = new Map<string, InkSlider>();

/** The persistent slider for one rail slot (e.g. `notebook-source`); one per key, ever. */
export function inkSlider(key: string): InkSlider {
	let slider = sliders.get(key);
	if (!slider) {
		slider = new InkSlider();
		sliders.set(key, slider);
	}
	return slider;
}

export function disposeInkSliders(keys: string[]): void {
	for (const key of keys) sliders.get(key)?.dispose();
}
