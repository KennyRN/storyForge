/**
 * Obsidian installs its DOM helpers (`createEl`, `createDiv`, `createSpan`) on every window it runs
 * in, main and popout alike, each building on that window's own `document` (`enhance.js`, verified
 * against Obsidian 1.13.7). obsidian.d.ts (1.13.1) declares them only as globals and on `Node`, so
 * this declares them on `Window` too, letting `el.doc.win.createDiv()` type-check. Drop it once the
 * official typings declare them.
 */
export {};

declare global {
	interface Window {
		createEl: typeof createEl;
		createDiv: typeof createDiv;
		createSpan: typeof createSpan;
	}
}
