import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Two default rules (Kenny, 3 November 2026; docs/interface.md and AGENTS.md). New lists and menus follow them unless an exception is named here.
//   Rule 1: a selected text row is highlighted as in the Codex list: an accent fill, the surface's own colour on it, hover the same, and
//           highlighted rows touch (no gap between rows: each row's own padding carries what the gap was).
//   Rule 2: every floating surface has the one shared shadow (`--floating-shadow`, or `--floating-shadow-filter` for a joined silhouette).

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = (dir: string): string[] =>
	readdirSync(dir).flatMap((n) => {
		const full = path.join(dir, n);
		return statSync(full).isDirectory() ? (n === "fonts" ? [] : css(full)) : n.endsWith(".css") ? [full] : [];
	});
const rules = (file: string): { selector: string; body: string }[] =>
	[...readFileSync(file, "utf8").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " "), body: m[2] }));
const all = css(root).flatMap((f) => rules(f).map((r) => ({ ...r, file: path.relative(root, f) })));

// Rule 2: the only shadows written out in full are the named exceptions.
const SHADOW_EXCEPTIONS: Record<string, string> = {
	".sf-dialog": "the modal dialog's own, deeper shadow (it is not a menu or popover)",
	".sf-codex-drop-above": "a drop marker: a 2px accent line, not a shadow",
	".sf-codex-drop-below": "a drop marker: a 2px accent line, not a shadow",
};
describe("rule 2: every floating surface has the one shared shadow", () => {
	it("no box-shadow is written out in full unless it is a named exception", () => {
		const bad: string[] = [];
		for (const r of all) {
			for (const m of r.body.matchAll(/box-shadow:\s*([^;]+);/g)) {
				const value = m[1].trim();
				if (value === "var(--floating-shadow)" || value === "none") continue;
				if (SHADOW_EXCEPTIONS[r.selector]) continue;
				bad.push(`${r.file}: ${r.selector} { box-shadow: ${value} }`);
			}
			if (/drop-shadow\(/.test(r.body) && !/--floating-shadow-filter\s*:/.test(r.body)) bad.push(`${r.file}: ${r.selector} writes a drop-shadow out in full`);
		}
		expect(bad).toEqual([]);
	});

	it("the shared shadow is defined once, in the theme, with its joined-silhouette twin beside it", () => {
		const defs = all.filter((r) => /--floating-shadow\s*:/.test(r.body));
		expect(defs.map((d) => d.file)).toEqual(["theme/purposes.css"]);
		expect(defs[0].body).toMatch(/--floating-shadow-filter\s*:/);
	});

	it("the chapter selector and its dropdown are drawn round as one piece, with no shadow of their own", () => {
		const joined = all.find((r) => r.selector.includes(".sf-nav-select:has(") && /filter:\s*var\(--floating-shadow-filter\)/.test(r.body));
		expect(joined).toBeTruthy();
		for (const sel of [".sf-nav-list", ".sf-nav-current"]) expect(all.filter((r) => r.selector === sel).some((r) => /box-shadow:\s*(?!none)/.test(r.body))).toBe(false);
	});
});

// Rule 1: a selected-state style that colours text with the accent must also fill the row with it. The exceptions are not text rows.
const SELECTED = /is-here|is-active|is-chosen|is-selected|aria-selected="true"|aria-current|aria-checked="true"/;
const SELECTION_EXCEPTIONS: Record<string, string> = {
	".sf-button.is-active": "an icon button, not a text row",
	".sf-swatch.is-chosen": "a colour swatch in a group, not a text row",
	'.sf-size-option[aria-checked="true"]': "a card-size button in the overview, not a text row",
	".sf-tab:hover, .sf-tab.is-active": "the library's tab icons (icons stay hover icons)",
};
describe("rule 1: a selected text row is highlighted as in the Codex list", () => {
	it("a selected state that colours text with the accent also fills the row with it, unless it is a named exception", () => {
		const bad = all
			.filter((r) => SELECTED.test(r.selector) && /(^|[;\s])color:\s*var\(--purpose-accent\)/.test(r.body) && !/background:\s*var\(--purpose-accent\)/.test(r.body) && !SELECTION_EXCEPTIONS[r.selector])
			.map((r) => `${r.file}: ${r.selector}`);
		expect(bad).toEqual([]);
	});

	it("the rows that follow the rule put the surface's colour on the accent fill", () => {
		const SURFACE = "--purpose-raised-bg";
		for (const [sel, surface] of [
			[".sf-navmenu-row.is-here, .sf-navmenu-row:hover:not(:disabled)", SURFACE],
			[".sf-nav-row.is-active", SURFACE],
			[".sf-settings-tab:hover, .sf-settings-tab.is-active", SURFACE],
			[".sf-filter-row:hover, .sf-filter-row:focus-visible, .sf-filter-row.is-chosen", SURFACE],
			[".sf-shortcode-option.is-selected", SURFACE],
			[".sf-row:hover, .sf-row.is-selected", "--purpose-panel-bg"], // the library panes sit on the panel
		] as const) {
			const r = all.find((x) => x.selector === sel);
			expect(r, sel).toBeTruthy();
			expect(r!.body, sel).toMatch(/background:\s*var\(--purpose-accent\)/);
			expect(r!.body, sel).toMatch(new RegExp(`color:\\s*var\\(${surface}\\)`));
		}
	});

	it("highlighted rows touch: no list under the rule has a gap between its rows", () => {
		const LISTS = [".sf-navmenu", ".sf-filter-popover", ".sf-nav-list", ".sf-settings-tabs", ".sf-list"];
		for (const sel of LISTS) {
			const r = all.filter((x) => x.selector === sel);
			expect(r.length, sel).toBeGreaterThan(0);
			for (const x of r) expect(x.body, `${sel}: rows touch`).not.toMatch(/(^|[;\s])gap:(?!\s*0\s*;)/);
		}
	});
});
