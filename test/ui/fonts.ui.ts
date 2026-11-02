import { expect, test } from "@playwright/test";
import { openPreview } from "./helpers";
import { FAMILY_INFO, FONT_FAMILIES } from "../../src/core/fontFamilies";

// Brief 13, commit 2: each embedded family really loads from the app (a fallback would measure the same as Arial), draws
// differently at different weights, and Fraunces' Softness and Wonk change its drawing. Nothing in the interface uses them yet.

const probe = (page: import("@playwright/test").Page, css: string, text = "Wynn ƿ ȝ — Harbour illumination") =>
	page.evaluate(
		([css, text]) => {
			const s = document.createElement("span");
			s.className = "sf-faced";
			s.style.cssText = `position:absolute;white-space:nowrap;font-size:40px;${css}`;
			s.textContent = text;
			document.body.append(s);
			const w = s.getBoundingClientRect().width;
			const synth = getComputedStyle(s).fontSynthesis;
			s.remove();
			return { w, synth };
		},
		[css, text] as const,
	);

test.describe("the embedded font families", () => {
	test("each family loads its own files, upright and italic, from the app only", async ({ page }) => {
		const requests: string[] = [];
		page.on("request", (r) => requests.push(r.url()));
		await openPreview(page);
		const loaded = await page.evaluate(async (fams) => {
			const out: Record<string, boolean> = {};
			for (const f of fams) {
				const up = await document.fonts.load(`40px "${f}"`);
				const it = await document.fonts.load(`italic 40px "${f}"`);
				out[f] = up.length > 0 && it.length > 0;
			}
			return out;
		}, [...FONT_FAMILIES]);
		for (const f of FONT_FAMILIES) expect(loaded[f], f).toBe(true);
		const base = new URL(page.url()).origin;
		for (const u of requests.filter((u) => /\.(ttf|woff2)(\?|$)/.test(u))) expect(u.startsWith(base), u).toBe(true);
	});

	test("each family is the one drawn: its line differs from the plain fallback's and from every other family's", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(async (fams) => void (await Promise.all(fams.map((f) => document.fonts.load(`40px "${f}"`)))), [...FONT_FAMILIES]);
		const fallback = (await probe(page, "font-family: Arial;")).w;
		expect((await probe(page, "font-family: \"Not A Font\", Arial;")).w, "control: a family that isn't there draws as Arial").toBeCloseTo(fallback, 1);
		const widths: number[] = [];
		for (const f of FONT_FAMILIES) {
			const { w, synth } = await probe(page, `font-family: ${FAMILY_INFO[f].css};`);
			expect(w, f).not.toBeCloseTo(fallback, 0);
			expect(synth, f).toBe("none");
			widths.push(w);
		}
		expect(new Set(widths.map((w) => Math.round(w))).size).toBe(FONT_FAMILIES.length);
	});

	test("a variable family's weight changes the drawing (and a static one's two weights do)", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(async (fams) => void (await Promise.all(fams.flatMap((f) => [`40px "${f}"`, `700 40px "${f}"`].map((s) => document.fonts.load(s))))), [...FONT_FAMILIES]);
		for (const f of FONT_FAMILIES) {
			const ws = FAMILY_INFO[f].weights;
			const light = await probe(page, `font-family: ${FAMILY_INFO[f].css}; font-weight: ${ws[0]};`);
			const heavy = await probe(page, `font-family: ${FAMILY_INFO[f].css}; font-weight: ${ws[ws.length - 1]};`);
			expect(heavy.w, f).toBeGreaterThan(light.w + 1);
		}
	});

	test("Fraunces' Softness and Wonk change its drawing", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => document.fonts.load('40px "Fraunces"'));
		const css = (v: string) => `font-family: ${FAMILY_INFO.Fraunces.css}; font-weight: 400; font-variation-settings: ${v};`;
		const text = "Wynn wonky hawk, the harbour wharf";
		const plain = (await probe(page, css('"SOFT" 0, "WONK" 0'), text)).w;
		const soft = (await probe(page, css('"SOFT" 100, "WONK" 0'), text)).w;
		const wonk = (await probe(page, css('"SOFT" 0, "WONK" 1'), text)).w;
		expect(soft).not.toBeCloseTo(plain, 1);
		expect(wonk).not.toBeCloseTo(plain, 1);
	});

	test("optical size follows the text size where the font has it (Fraunces, Inter)", async ({ page }) => {
		await openPreview(page);
		await page.evaluate(() => Promise.all(["Fraunces", "Inter"].map((f) => document.fonts.load(`40px "${f}"`))));
		for (const f of ["Fraunces", "Inter"] as const) {
			const per = async (px: number, auto: boolean) =>
				(await probe(page, `font-family: ${FAMILY_INFO[f].css}; font-size: ${px}px; font-optical-sizing: ${auto ? "auto" : "none"};`)).w / px;
			expect(await per(40, true), f).not.toBeCloseTo(await per(40, false), 3);
		}
	});
});
