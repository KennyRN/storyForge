import { el, fill } from "./dom";
import { button } from "./button";

export interface NoticeAction {
	label: string;
	onClick: () => void | Promise<void>;
	/** Dismiss the notice after the action runs. Default true. */
	dismiss?: boolean;
}

export interface NoticeInput {
	text: string;
	/** Sticky notices are for anything about the author's words: they stay until dismissed. */
	sticky?: boolean;
	actions?: NoticeAction[];
	/** A notice with the same key replaces the earlier one instead of stacking. */
	key?: string;
	/** A sticky notice that cannot be dismissed yet (recovery failed: the text is still only in the editor). */
	pinned?: boolean;
}

export interface Notice extends NoticeInput {
	id: number;
}

export interface Timers {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const TRANSIENT_MS = 4000;
export const MAX_VISIBLE = 5;

/** The notices on screen, with no DOM: the interface draws them. */
export class NoticeCenter {
	private notices: Notice[] = [];
	private timers = new Map<number, unknown>();
	private listeners = new Set<() => void>();
	private nextId = 1;

	constructor(private readonly clock: Timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }) {}

	notify(input: NoticeInput): number {
		if (input.key) for (const n of this.notices.filter((x) => x.key === input.key)) this.remove(n.id);
		const notice: Notice = { ...input, id: this.nextId++ };
		this.notices.push(notice);
		if (!input.sticky) this.startTimer(notice.id);
		this.emit();
		return notice.id;
	}

	dismiss(id: number): void {
		const n = this.notices.find((x) => x.id === id);
		if (!n || n.pinned) return;
		this.remove(id);
		this.emit();
	}

	/** Releases a pinned notice (the text it was about has been saved). */
	unpin(key: string): void {
		for (const n of this.notices.filter((x) => x.key === key)) n.pinned = false;
		this.emit();
	}

	/** Pauses a transient notice's timer (the pointer is over it). */
	hold(id: number): void {
		const h = this.timers.get(id);
		if (h !== undefined) this.clock.clearTimeout(h);
		this.timers.delete(id);
	}

	release(id: number): void {
		if (this.notices.some((n) => n.id === id && !n.sticky)) this.startTimer(id);
	}

	/** The newest notices that fit, and how many older sticky ones are folded into "n more". Transient ones beyond the limit are dropped first. */
	view(): { shown: Notice[]; hiddenSticky: number } {
		const all = [...this.notices];
		let overflow = all.length - MAX_VISIBLE;
		for (let i = 0; i < all.length && overflow > 0; ) {
			if (!all[i].sticky) {
				all.splice(i, 1);
				overflow--;
			} else i++;
		}
		const hiddenSticky = Math.max(0, all.length - MAX_VISIBLE);
		return { shown: all.slice(hiddenSticky), hiddenSticky };
	}

	all(): readonly Notice[] {
		return this.notices;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private startTimer(id: number): void {
		this.timers.set(
			id,
			this.clock.setTimeout(() => {
				this.timers.delete(id);
				this.remove(id);
				this.emit();
			}, TRANSIENT_MS),
		);
	}

	private remove(id: number): void {
		this.hold(id);
		this.notices = this.notices.filter((n) => n.id !== id);
	}

	private emit(): void {
		for (const l of [...this.listeners]) l();
	}
}

/** Draws the center's notices into `host` (a fixed region), and redraws on every change. */
export function mountNotices(host: HTMLElement, center: NoticeCenter): void {
	host.classList.add("sf-notices");
	host.setAttribute("role", "region");
	host.setAttribute("aria-label", "Notices");
	const draw = (): void => {
		const { shown, hiddenSticky } = center.view();
		fill(
			host,
			hiddenSticky > 0 ? el("div", { class: "sf-notice sf-notice--more sf-muted", text: `${hiddenSticky} more notice${hiddenSticky === 1 ? "" : "s"}` }) : null,
			...shown.map((n) =>
				el(
					"div",
					{
						class: `sf-notice${n.sticky ? " sf-notice--sticky" : ""}`,
						attrs: { role: n.sticky ? "alert" : "status" },
						on: { pointerenter: () => center.hold(n.id), pointerleave: () => center.release(n.id) },
					},
					el("div", { class: "sf-notice-text", text: n.text }),
					el(
						"div",
						{ class: "sf-notice-actions" },
						...(n.actions ?? []).map((a) =>
							button({
								label: a.label,
								kind: "quiet",
								onClick: () => {
									void Promise.resolve(a.onClick()).then(() => {
										if (a.dismiss !== false) center.dismiss(n.id);
									});
								},
							}),
						),
						n.sticky && !n.pinned ? button({ label: "Dismiss", kind: "quiet", onClick: () => center.dismiss(n.id) }) : null,
					),
				),
			),
		);
	};
	center.subscribe(draw);
	draw();
}
