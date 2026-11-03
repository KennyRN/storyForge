import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 1: the chapter bars return to the plugin's look (docs/novel-2.md): one colour, 34 px, the name drawn once over the bar
// (dark text with a 4px outer stroke in the data colour), dots for overrun flush with the fill, the marker in the bar's colour, no notch.

async function openNovel(page: Page): Promise<void> {
	await openPreview(page);
	await page.locator("[data-recent='0']").click();
	await page.waitForFunction(() => !!window.__app?.editors);
	await flipFace(page);
	await page.getByRole("tab", { name: "novel" }).click();
	await expect(overview(page)).toBeVisible();
}
const overview = (page: Page) => page.getByRole("region", { name: "Novel overview" });
const setChapterLength = async (page: Page, n: number) => {
	await overview(page).getByRole("button", { name: /^[\d,]+$|Not set/ }).first().click();
	await page.keyboard.type(String(n));
	await page.keyboard.press("Enter");
};

/** WCAG contrast of two computed `rgb(...)` colours. */
const contrast = (a: string, b: string): number => {
	const lum = (c: string): number => {
		const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

test.describe("the chapter bars", () => {
	test.beforeEach(async ({ page }) => openNovel(page));

	test("34 px high with the name drawn once over the bar, one line, bottom-pinned; the series overview's bars stay 12 px", async ({ page }) => {
		const bars = overview(page).locator(".sf-card .sf-bar");
		expect(await bars.count()).toBeGreaterThan(1);
		for (let i = 0; i < (await bars.count()); i++) {
			const bar = bars.nth(i);
			expect((await bar.boundingBox())!.height).toBeCloseTo(34, 0);
			await expect(bar.locator(".sf-bar-name")).toHaveCount(1); // one layer: the two-layer split is retired
			await expect(bar.locator(".sf-bar-name")).toHaveAttribute("aria-hidden", "true");
		}
		await expect(overview(page).locator(".sf-card-head .sf-overview-name")).toHaveCount(0); // the name is no longer above the bar
		await page.getByRole("tab", { name: "series" }).click();
		const plain = page.getByRole("region", { name: "Series overview" }).locator(".sf-bar").first();
		expect((await plain.boundingBox())!.height).toBeCloseTo(12, 0);
		await expect(plain.locator(".sf-bar-name")).toHaveCount(0);
	});

	test("the name's dark text on its data-blue backing is at least 4.5:1, by measurement", async ({ page }) => {
		const m = await overview(page).locator(".sf-card .sf-bar").first().evaluate((b) => {
			const t = getComputedStyle(b.querySelector(".sf-bar-name-text")!);
			return { text: t.color, stroke: t.webkitTextStrokeColor, strokeWidth: t.webkitTextStrokeWidth, weight: t.fontWeight, size: t.fontSize, fill: getComputedStyle(b.querySelector(".sf-bar-fill")!).backgroundColor };
		});
		expect(contrast(m.text, m.stroke), "dark text on the stroke").toBeGreaterThanOrEqual(4.5);
		expect(m.stroke).toBe(m.fill); // the backing is the data colour
		expect(m).toMatchObject({ strokeWidth: "8px", weight: "600", size: "15px" }); // 4px beyond the letters; the plugin's weight; 15px is an assumption (docs/novel-2.md)
	});

	test("the stroke is never clipped: its box leaves 4px round the text, inside the bar, whatever the name", async ({ page }) => {
		const long = "A very long chapter name that cannot possibly fit across one bar however wide the window is made, so it must be cut short ".repeat(3);
		const bar = overview(page).locator(".sf-card .sf-bar").first();
		await bar.evaluate((b, text) => (b.querySelector(".sf-bar-name-text")!.textContent = text), long);
		for (const [i, name] of [[0, "long"], [1, "short"]] as const) {
			const bars = overview(page).locator(".sf-card .sf-bar");
			const m = await bars.nth(i).evaluate((b) => {
				const el = b.querySelector<HTMLElement>(".sf-bar-name-text")!;
				const cs = getComputedStyle(el);
				const range = document.createRange();
				range.selectNodeContents(el.firstChild!);
				const glyphs = range.getBoundingClientRect(); // the text's own box (ascent to descent)
				const box = el.getBoundingClientRect();
				const bb = b.getBoundingClientRect();
				// the visible part of the text is clipped to the element's padding box (overflow: hidden)
				return { pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat), room: { top: glyphs.top - box.top, bottom: box.bottom - Math.min(glyphs.bottom, box.bottom), left: Math.max(0, Math.min(glyphs.left, box.right) - box.left) }, inBar: { top: glyphs.top - 4 - bb.top, bottom: bb.bottom - (glyphs.bottom + 4), left: glyphs.left - 4 - bb.left }, overflowing: el.scrollWidth > el.clientWidth, ellipsis: cs.textOverflow };
			});
			expect(m.pad, `${name}: 4px of padding all round the text`).toEqual([4, 4, 4, 4]);
			expect(m.room.top, `${name}: room above the glyphs`).toBeGreaterThanOrEqual(3.5);
			expect(m.room.bottom, `${name}: room below the glyphs`).toBeGreaterThanOrEqual(3.5);
			expect(m.room.left, `${name}: room left of the glyphs`).toBeGreaterThanOrEqual(3.5);
			expect(m.inBar.top, `${name}: the stroke is inside the bar's top edge`).toBeGreaterThanOrEqual(0);
			expect(m.inBar.bottom, `${name}: the stroke is inside the bar's bottom edge`).toBeGreaterThanOrEqual(0);
			expect(m.inBar.left, `${name}: the stroke is inside the bar's left edge`).toBeGreaterThanOrEqual(0);
			expect(m.ellipsis).toBe("ellipsis");
			if (i === 0) expect(m.overflowing, "the long name is cut short").toBe(true);
		}
	});

	test("over the dots no dot touches a letter: a solid data-colour ring of at least 3px surrounds every letter, by pixels", async ({ page }) => {
		await setChapterLength(page, 3); // "The Storm: Part Two" runs from the fill into the dots
		// Measured with the track in pure magenta and the text in pure black, so no colour is ambiguous (the real dark text is near the track's grey); the geometry is unchanged.
		await page.addStyleTag({ content: ":root { --purpose-bar-track: #ff00ff !important; --purpose-text-on-data: #000000 !important; }" });
		const bar = overview(page).locator(".sf-card .sf-bar--over").nth(1);
		await page.mouse.move(2, 2);
		const png = (await bar.screenshot()).toString("base64");
		const r = await page.evaluate(async (png) => {
			const img = new Image();
			img.src = "data:image/png;base64," + png;
			await img.decode();
			const c = document.createElement("canvas");
			c.width = img.width;
			c.height = img.height;
			const x = c.getContext("2d")!;
			x.drawImage(img, 0, 0);
			const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height);
			const dpr = img.height / 34;
			const isLetter = (i: number) => data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40;
			const isTrack = (i: number) => data[i] > 200 && data[i + 1] < 60 && data[i + 2] > 200;
			const ring = Math.round(3 * dpr);
			let letters = 0;
			let bad = 0;
			// the crop's own outer pixel rows and columns are the bar's edge, not letters
			for (let y = 4; y < H - 4; y++) {
				for (let px = 4; px < W - 4; px++) {
					if (!isLetter((y * W + px) * 4)) continue;
					letters++;
					for (let dy = -ring; dy <= ring; dy++) {
						for (let dx = -ring; dx <= ring; dx++) {
							if (dx * dx + dy * dy > ring * ring) continue; // a round neighbourhood: the stroke is round
							const yy = y + dy;
							const xx = px + dx;
							if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
							if (isTrack((yy * W + xx) * 4)) bad++; // a gap in the ring: the track (and so a dot's edge) shows beside a letter
						}
					}
				}
			}
			return { letters, bad };
		}, png);
		expect(r.letters, "letters were found in the picture").toBeGreaterThan(100);
		expect(r.bad, "no track pixel within 3px of a letter pixel").toBe(0);
	});

	test("past its plan: dots in the bar's own colour flush with the fill, no notch, no orange; short of it: the dashed marker in the bar's colour", async ({ page }) => {
		await setChapterLength(page, 4);
		const over = overview(page).locator(".sf-bar--over").first();
		await expect(over.locator(".sf-bar-dots")).toBeAttached();
		await expect(overview(page).locator(".sf-bar-notch, .sf-bar-over, .sf-bar-marker")).toHaveCount(0);
		const m = await over.evaluate((b) => {
			const fill = b.querySelector<HTMLElement>(".sf-bar-fill")!.getBoundingClientRect();
			const dots = b.querySelector<HTMLElement>(".sf-bar-dots")!;
			const r = dots.getBoundingClientRect();
			const cs = getComputedStyle(dots);
			return { gap: r.left - fill.right, width: r.width, bg: cs.backgroundImage, fillColour: getComputedStyle(b.querySelector(".sf-bar-fill")!).backgroundColor };
		});
		expect(Math.abs(m.gap), "no gap between the fill and the dots").toBeLessThan(0.6);
		expect(((m.width - 1) / 4) % 1, "whole dots only: the width is 4n+1").toBeCloseTo(0, 1);
		const probe = await page.evaluate(() => { const i = document.createElement("i"); i.style.color = "var(--purpose-data-fill)"; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
		expect(m.fillColour).toBe(probe);
		expect(m.bg).toContain(probe.replace("rgb(", "rgb(")); // the dots are drawn in the data colour
		await setChapterLength(page, 15);
		await expect(overview(page).locator(".sf-bar--under .sf-bar-marker").first()).toBeAttached();
		const stroke = await overview(page).locator(".sf-bar-marker").first().evaluate((e) => getComputedStyle(e).stroke);
		expect(stroke).toBe(probe);
	});

	test("a long name is one line, cut short with an ellipsis; the tooltip has the full name", async ({ page }) => {
		const bar = overview(page).locator(".sf-card .sf-bar").first();
		const css = await bar.locator(".sf-bar-name-text").evaluate((e) => { const s = getComputedStyle(e); return { ws: s.whiteSpace, to: s.textOverflow, ov: s.overflow }; });
		expect(css).toEqual({ ws: "nowrap", to: "ellipsis", ov: "hidden" });
		await overview(page).locator(".sf-card .sf-bar").nth(1).hover();
		await expect(page.getByRole("tooltip")).toContainText("The Storm: Part Two");
	});
});
