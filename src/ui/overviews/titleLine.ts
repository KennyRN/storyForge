import type { AppModel } from "../model";

/**
 * The title sits on the tabs' line (Tweaks 1, §1.1): the series or novel title's baseline is level with the bottom edge of the library tabs' rounded icon
 * boxes (archive, codex, series, novel, storytelling), so it looks level, with the descenders hanging below. It is worked out live from the tabs' own
 * geometry (never a fixed figure), so it holds when the title's style, size or font changes: a bigger title grows upwards from the line.
 * The baseline is read from a zero-size probe set on it; the title's top margin then puts that baseline where the tabs end.
 */
export function trackTitleLine(host: HTMLElement, model: AppModel): { apply(): void; dispose(): void } {
	const apply = (): void => {
		const title = host.querySelector<HTMLElement>(".sf-overview-title");
		const tab = document.querySelector<HTMLElement>(".sf-rail .sf-tab");
		if (!title || !tab) return;
		title.style.marginTop = "0px";
		const probe = document.createElement("span");
		probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
		(title.querySelector<HTMLElement>(".sf-select-current-title") ?? title).append(probe);
		const baseline = probe.getBoundingClientRect().bottom;
		probe.remove();
		const delta = tab.getBoundingClientRect().bottom - baseline;
		title.style.marginTop = `${Math.max(-24, Math.round(delta * 100) / 100)}px`;
	};
	const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => apply()) : null;
	watch?.observe(host);
	window.addEventListener("resize", apply);
	const offSettings = model.subscribe(["settings", "face"], apply);
	void document.fonts?.ready.then(apply);
	return {
		apply: () => {
			const title = host.querySelector(".sf-overview-title");
			if (title) watch?.observe(title);
			apply();
		},
		dispose: () => (watch?.disconnect(), window.removeEventListener("resize", apply), offSettings()),
	};
}
