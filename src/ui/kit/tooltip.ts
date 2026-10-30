import { el } from "./dom";

const SHOW_DELAY_MS = 500;
let tip: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function hide(): void {
	clearTimeout(timer);
	tip?.remove();
	tip = null;
}

function show(target: HTMLElement, text: string): void {
	hide();
	tip = el("div", { class: "sf-tooltip", text, attrs: { role: "tooltip" } });
	document.body.append(tip);
	const r = target.getBoundingClientRect();
	const t = tip.getBoundingClientRect();
	const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
	const below = r.bottom + 6 + t.height < window.innerHeight;
	tip.style.left = `${left}px`;
	tip.style.top = `${below ? r.bottom + 6 : r.top - t.height - 6}px`;
}

/** A styled tooltip: after a short pause under the pointer, at once on keyboard focus. The text is also the accessible name when the control has none. */
export function attachTooltip(target: HTMLElement, source: string | (() => string), options: { hover?: boolean } = {}): void {
	const text = (): string => (typeof source === "function" ? source() : source);
	if (!target.hasAttribute("aria-label") && !target.textContent?.trim()) target.setAttribute("aria-label", text());
	if (options.hover !== false)
		target.addEventListener("pointerenter", () => {
			clearTimeout(timer);
			timer = setTimeout(() => show(target, text()), SHOW_DELAY_MS);
		});
	target.addEventListener("pointerleave", hide);
	target.addEventListener("pointerdown", hide);
	target.addEventListener("focus", () => {
		if (target.matches(":focus-visible")) show(target, text());
	});
	target.addEventListener("blur", hide);
	target.addEventListener("keydown", (e) => {
		if (e.key === "Escape") hide();
	});
}
