import { expect, test, type Page } from "@playwright/test";
import { flipFace, openPreview } from "./helpers";

// Brief 14, commit 1: the chapter bars return to the plugin's look (docs/novel-2.md): one colour, the name over the bar in two layers
// (dark over the fill, light over the track), dots for overrun flush with the fill, the marker in the bar's colour, no notch, 24 px.

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

	test("24 px high with the name drawn over the bar, one line; the series overview's bars stay 12 px", async ({ page }) => {
		const bars = overview(page).locator(".sf-card .sf-bar");
		expect(await bars.count()).toBeGreaterThan(1);
		for (let i = 0; i < (await bars.count()); i++) {
			const bar = bars.nth(i);
			expect((await bar.boundingBox())!.height).toBeCloseTo(24, 0);
			const names = bar.locator(".sf-bar-name");
			await expect(names).toHaveCount(2);
			expect(await names.nth(0).textContent()).toBe(await names.nth(1).textContent());
			await expect(names.nth(0)).toHaveAttribute("aria-hidden", "true");
		}
		await expect(overview(page).locator(".sf-card-head .sf-overview-name")).toHaveCount(0); // the name is no longer above the bar
		await page.getByRole("tab", { name: "series" }).click();
		const plain = page.getByRole("region", { name: "Series overview" }).locator(".sf-bar").first();
		expect((await plain.boundingBox())!.height).toBeCloseTo(12, 0);
		await expect(plain.locator(".sf-bar-name")).toHaveCount(0);
	});

	test("the name reads over the fill (dark) and over the track (light): both at least 4.5:1, by measurement", async ({ page }) => {
		const bar = overview(page).locator(".sf-bar--under").first();
		const m = await bar.evaluate((b) => {
			const q = (s: string) => getComputedStyle(b.querySelector(s)!);
			return { track: getComputedStyle(b).backgroundColor, fill: q(".sf-bar-fill").backgroundColor, light: q(".sf-bar-name:not(.sf-bar-name--on-fill)").color, dark: q(".sf-bar-name--on-fill").color };
		});
		expect(contrast(m.dark, m.fill), "dark text on the blue fill").toBeGreaterThanOrEqual(4.5);
		expect(contrast(m.light, m.track), "light text on the track").toBeGreaterThanOrEqual(4.5);
		// The dark layer is clipped to the fill's width, the light layer is the whole bar.
		const clip = await bar.locator(".sf-bar-name--on-fill").evaluate((e) => e.style.clipPath);
		const fillPct = await bar.locator(".sf-bar-fill").evaluate((e) => parseFloat(e.style.width));
		expect(parseFloat(clip.match(/inset\(0(?:px)? ([\d.]+)%/)![1])).toBeCloseTo(100 - fillPct, 1);
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

	test("a long name is one line, cut short with an ellipsis at the bar's full width; the tooltip has the full name", async ({ page }) => {
		const bar = overview(page).locator(".sf-card .sf-bar").first();
		const long = "A very long chapter name that cannot possibly fit across one bar however wide the window is made, so it must be cut short".repeat(3);
		await bar.evaluate((b, text) => b.querySelectorAll(".sf-bar-name").forEach((n) => (n.textContent = text)), long);
		const css = await bar.locator(".sf-bar-name").first().evaluate((e) => { const s = getComputedStyle(e); return { ws: s.whiteSpace, to: s.textOverflow, ov: s.overflow, over: e.scrollWidth > e.clientWidth, w: e.getBoundingClientRect().width }; });
		expect(css).toMatchObject({ ws: "nowrap", to: "ellipsis", ov: "hidden", over: true });
		expect(css.w).toBeCloseTo((await bar.boundingBox())!.width, 0);
		await overview(page).locator(".sf-card .sf-bar").nth(1).hover();
		await expect(page.getByRole("tooltip")).toContainText("The Storm: Part Two");
	});
});
