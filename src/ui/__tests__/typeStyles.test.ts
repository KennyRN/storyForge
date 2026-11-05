import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APPEARANCE_DEFAULTS } from "../../app/settings";
import { FAMILY_INFO } from "../../core/fontFamilies";
import { BASE_DEFAULTS, TYPE_STYLES } from "../../core/typeStyles";
import { APPEARANCE_BASE_PX } from "../../app/settings";

/** Brief 18 (decision 123): every piece of text is drawn by a named type style; no rule names a font, a size or a weight of its own. */
const uiRoot = path.join(fileURLToPath(new URL("../", import.meta.url)));
const css = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return name === "__tests__" || name === "fonts" ? [] : css(full);
		return name.endsWith(".css") ? [full] : [];
	});
const files = css(uiRoot).filter((f) => !/theme[\\/](typeStyles|fonts)\.css$/.test(f));
const kebab = (id: string): string => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The named exceptions, each with its reason (Kenny's rulings, 1.10.0): the prose headings are in em of the Prose style and the dressing's emphasis weights are real
 * bold and the marker's regular; the special-characters button and its characters draw a glyph, not words; the navigator's note is 0.8 of the line it sits in, so it
 * scales with the Navigator style.
 */
const EXCEPTIONS: Record<string, string[]> = {
	".sf-chars-button": ["font-size"],
	".sf-char": ["font-size"],
	".sf-nav-note": ["font-size"],
	".sf-heading-text": ["font-weight"],
	".sf-heading-1": ["font-size"],
	".sf-heading-2": ["font-size"],
	".sf-heading-3": ["font-size"],
	".sf-heading-4": ["font-size"],
	".sf-heading-5": ["font-size"],
	".sf-heading-6": ["font-size"],
	".sf-strong": ["font-weight"],
	".sf-marker": ["font-weight"],
	".sf-marker.sf-em": ["font-weight"],
	".sf-marker.sf-strong": ["font-weight"],
	".sf-marker.sf-strong.sf-em": ["font-weight"],
};
const allowedValue = /^(var\(--(?:ts|ap)-[a-z-]+\)|var\(--font-(?:interface|writing)\)|inherit|normal)$/;

interface Decl {
	file: string;
	selectors: string[];
	prop: string;
	value: string;
}
function declarations(file: string): Decl[] {
	const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	const out: Decl[] = [];
	for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = m[1].split(",").map((s) => s.trim());
		for (const d of m[2].split(";")) {
			const i = d.indexOf(":");
			if (i < 0) continue;
			const prop = d.slice(0, i).trim();
			if (/^(font|font-size|font-weight|font-family)$/.test(prop)) out.push({ file: path.relative(uiRoot, file), selectors, prop, value: d.slice(i + 1).trim() });
		}
	}
	return out;
}

describe("the type styles", () => {
	it("finds the interface's style sheets", () => {
		expect(files.length).toBeGreaterThan(5);
		expect(files.flatMap(declarations).length).toBeGreaterThan(40);
	});

	it("no rule names a font, a size or a weight of its own (the named exceptions aside)", () => {
		const bad: string[] = [];
		for (const f of files) {
			for (const d of declarations(f)) {
				if (d.prop === "font") {
					if (d.value !== "inherit") bad.push(`${d.file}: ${d.selectors.join(", ")} { font: ${d.value} }`);
					continue;
				}
				if (allowedValue.test(d.value)) continue;
				if (d.selectors.every((s) => EXCEPTIONS[s]?.includes(d.prop))) continue;
				bad.push(`${d.file}: ${d.selectors.join(", ")} { ${d.prop}: ${d.value} }`);
			}
		}
		expect(bad).toEqual([]);
	});

	it("no text rule names a system font", () => {
		const bad = files.filter((f) => /system-ui|-apple-system|BlinkMacSystemFont|ui-sans-serif/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
		expect(bad.map((f) => path.relative(uiRoot, f))).toEqual([]);
	});

	it("every exception is still needed (a rule that no longer exists is removed from the list)", () => {
		const used = new Set(files.flatMap(declarations).flatMap((d) => d.selectors.filter((s) => EXCEPTIONS[s]?.includes(d.prop) && !allowedValue.test(d.value))));
		for (const s of Object.keys(EXCEPTIONS)) expect(used.has(s), s).toBe(true);
	});

	it("the default custom properties equal the table", () => {
		const text = readFileSync(path.join(uiRoot, "theme", "typeStyles.css"), "utf8");
		const prop = (name: string): string => (new RegExp(`--${name}:\\s*([^;]+);`).exec(text)?.[1] ?? "").trim();
		expect(prop("font-interface")).toBe(FAMILY_INFO[BASE_DEFAULTS.interface].css);
		expect(prop("font-writing")).toBe(FAMILY_INFO[BASE_DEFAULTS.writing].css);
		for (const s of TYPE_STYLES) {
			expect(prop(`ts-${kebab(s.id)}-weight`), s.id).toBe(String(s.weight));
			expect(prop(`ts-${kebab(s.id)}-size`), s.id).toBe(`${s.size}px`);
			expect(prop(`ts-${kebab(s.id)}-family`), s.id).toBe(`var(--font-${s.base === "interface" ? "interface" : "writing"})`);
		}
		for (const [part, d] of Object.entries(APPEARANCE_DEFAULTS)) {
			expect(prop(`ap-${part}-weight`), part).toBe(String(d.weight));
			expect(prop(`ap-${part}-size`), part).toBe(`${d.size * APPEARANCE_BASE_PX}px`);
			expect(prop(`ap-${part}-family`), part).toBe(FAMILY_INFO[d.font].css);
		}
	});

	it("no interface style is below 11 px, and the ranges hold their defaults", () => {
		for (const s of TYPE_STYLES) {
			expect(s.range[0], s.id).toBeGreaterThanOrEqual(11);
			expect(s.size, s.id).toBeGreaterThanOrEqual(s.range[0]);
			expect(s.size, s.id).toBeLessThanOrEqual(s.range[1]);
		}
	});
});
