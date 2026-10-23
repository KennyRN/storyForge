import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PURPOSES } from "../theme/tokens";

const uiRoot = path.join(fileURLToPath(new URL("../", import.meta.url)));

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return name === "__tests__" ? [] : files(full);
		return /\.(css|ts|html)$/.test(name) ? [full] : [];
	});
}

const all = files(uiRoot);
const inTheme = (f: string): boolean => f.includes(`${path.sep}theme${path.sep}`);
const rel = (f: string): string => path.relative(uiRoot, f);

describe("colours come from named purposes only", () => {
	it("finds the interface's files", () => {
		expect(all.length).toBeGreaterThan(5);
	});

	it("no hex, rgb or hsl colour outside theme/", () => {
		const hex = /(?<![\w&-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
		const bad: string[] = [];
		for (const f of all.filter((x) => !inTheme(x))) {
			const text = readFileSync(f, "utf8");
			if (hex.test(text) || /\b(?:rgba?|hsla?|oklch|lab|color)\(/.test(text)) bad.push(rel(f));
		}
		expect(bad).toEqual([]);
	});

	it("no palette variable outside theme/", () => {
		const bad = all.filter((f) => !inTheme(f) && /--ef-/.test(readFileSync(f, "utf8"))).map(rel);
		expect(bad).toEqual([]);
	});

	it("every purpose used is a defined purpose", () => {
		const defined = new Set<string>(PURPOSES);
		const css = readFileSync(path.join(uiRoot, "theme/purposes.css"), "utf8");
		for (const p of PURPOSES) expect(css, `purposes.css defines --purpose-${p}`).toContain(`--purpose-${p}:`);
		const unknown: string[] = [];
		for (const f of all) {
			for (const m of readFileSync(f, "utf8").matchAll(/--purpose-([a-z-]+)/g)) if (!defined.has(m[1])) unknown.push(`${rel(f)}: ${m[1]}`);
		}
		expect(unknown).toEqual([]);
	});

	it("muted text is grey2, never grey0 or grey1 (decoration only)", () => {
		const css = readFileSync(path.join(uiRoot, "theme/purposes.css"), "utf8");
		expect(css).toMatch(/--purpose-text-muted:\s*var\(--ef-grey2\)/);
		expect(css).toMatch(/--purpose-decoration:\s*var\(--ef-grey0\)/);
	});
});
